// The car: a top-down arcade drift model. We keep our own velocity/heading and
// drive a Matter body by setting its velocity each frame, so Matter handles
// collision detection with obstacles/pickups while the *feel* stays hand-tuned.

import Phaser from 'phaser';
import { TUNING } from '../config/gameplay.js';
import { UPGRADES } from '../config/upgrades.js';
import { makeCarTexture, addGlow, makeSoftCircle } from '../core/neon.js';

// Matter expresses velocity in pixels-per-step. At ~60fps that's px/sec ÷ 60.
const STEP = 1 / 60;

const TWO_PI = Math.PI * 2;
function normAngle(a) {
  // Modulo (not a while-loop) + a finite guard: a NaN/Infinity here used to hang
  // the old `while` loops forever, freezing the whole game.
  if (!Number.isFinite(a)) return 0;
  a %= TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a < -Math.PI) a += TWO_PI;
  return a;
}

export class Car {
  constructor(scene, x, y, angle, carDef, upgradeLevels) {
    this.scene = scene;
    this.def = carDef;
    this.heading = angle;
    this.vx = 0;
    this.vy = 0;

    // Resolve upgrades into effective physics.
    const eng = UPGRADES.engine.levels[upgradeLevels.engine || 0].value;
    const tireBonus = UPGRADES.tires.levels[upgradeLevels.tires || 0].value;
    const p = carDef.phys;
    this.phys = {
      power: p.power * eng,
      maxSpeed: p.maxSpeed * (1 + (eng - 1) * 0.55),
      grip: p.grip + tireBonus,
      turn: p.turn,
      mass: p.mass,
      tireBonus,
    };
    this.fuelTank = UPGRADES.fuel.levels[upgradeLevels.fuel || 0].value;

    const texKey = makeCarTexture(scene, carDef);
    this.sprite = scene.matter.add.sprite(x, y, texKey, null, {
      shape: {
        type: 'rectangle',
        width: carDef.gfxLength * 0.72,
        height: carDef.gfxWidth * 0.74,
      },
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      restitution: 0,
      label: 'car',
    });
    this.sprite.setFixedRotation();
    this.sprite.setRotation(angle);
    this.sprite.setMass(p.mass * 40);
    this.sprite.body.gameObjectRef = this;
    this.sprite.setVisible(false); // the matter sprite is the physics body only

    // Separate visual sprite so we can lean/tilt it during drifts (to show the
    // car's flank) without disturbing the collision body.
    this.visual = scene.add.image(x, y, texKey).setDepth(20).setRotation(angle);
    addGlow(this.visual, carDef.color, 4, 0);

    // Drop shadow + airborne state for jumps/ramps.
    makeSoftCircle(scene, 'carshadow', 96, 0x05040b);
    this.shadowBase = (carDef.gfxLength / 96) * 1.25;
    this.shadow = scene.add.image(x, y, 'carshadow').setDepth(18).setAlpha(0).setScale(this.shadowBase);
    this.airborne = 0;
    this.airMax = 0;
    this.justLanded = false;

    // Live read-outs for HUD / scorer / fx.
    this.speed = 0;
    this.forwardSpeed = 0;
    this.driftAngle = 0;
    this.slip = 0;
    this.isDrifting = false;
    this.isSpinning = false;
    this.offTrack = false;
    this.crashCooldown = 0;
    this.effDrift = 0;
    this._spunOut = false; // tracks a spin so we can give a recovery nudge
    this.recoverFired = false;
    this.driftWind = 0; // winds up the drift-angle cap while pinning full throttle
    this.driftCharge = 0; // builds while sliding with the handbrake
    this.boost = 0; // current mini-turbo boost level (decays)
    this.boostFired = 0; // >0 on the frame a boost releases (for fx)
    this.driftLift = 0; // eased top-speed cap lift from drifting (carries pace out of a slide)
    this.flickEnergy = 0; // built by pumping the steer mid-drift (Scandinavian flick)
    this.flickFired = false; // true on the frame a fast reversal lands (for fx)
    this._steerSign = 0; // last significant steer direction (for flick detection)
    this._sinceFlick = 0; // seconds since the last steer reversal
    this._prevHandbrake = false;
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  // Rear-axle world position (for skid marks / smoke).
  rearAxle() {
    const back = -this.def.gfxLength * 0.34;
    return {
      x: this.x + Math.cos(this.heading) * back,
      y: this.y + Math.sin(this.heading) * back,
    };
  }

  // input: { throttle 0..1, brake 0..1, steer -1..1, handbrake bool }
  // hasFuel: if false, engine produces no power.
  update(dt, input, hasFuel) {
    if (dt <= 0) return;
    if (this.crashCooldown > 0) this.crashCooldown -= dt;

    this.justLanded = false;
    if (this.airborne > 0) {
      this.airborne -= dt;
      if (this.airborne <= 0) {
        this.airborne = 0;
        this.justLanded = true;
      }
    }

    const throttle = hasFuel ? input.throttle : 0;
    const brake = input.brake;
    const steer = input.steer;
    const handbrake = input.handbrake;

    let cos = Math.cos(this.heading);
    let sin = Math.sin(this.heading);
    this.forwardSpeed = this.vx * cos + this.vy * sin;
    this.speed = Math.hypot(this.vx, this.vy);

    // --- Steering: grippy normally; on the handbrake it sets the DRIFT ANGLE ---
    let speedFactor = Math.min(1, 0.35 + this.speed / 230);
    const hs = (this.speed - this.phys.maxSpeed * 0.7) / (this.phys.maxSpeed * 0.5);
    speedFactor *= 1 - 0.3 * Phaser.Math.Clamp(hs, 0, 1);
    const dirSign = this.forwardSpeed < -12 ? -1 : 1;

    const travelAng = Math.atan2(this.vy, this.vx);
    const drifting = handbrake && this.speed > TUNING.minDriftSpeed;

    // --- Flick / pump: rapid LEFT<->RIGHT steer reversals MID-DRIFT stack energy
    // that adds extra drive (the Scandinavian flick — pump a,d,a,d for more speed). ---
    const steerSign = Math.abs(steer) > TUNING.flickSteerMin ? Math.sign(steer) : 0;
    this._sinceFlick += dt;
    this.flickFired = false;
    if (steerSign !== 0 && this._steerSign !== 0 && steerSign !== this._steerSign) {
      // a real reversal — reward it only if it came FAST and we're sliding
      if (drifting && this._sinceFlick < TUNING.flickWindow) {
        this.flickEnergy = Math.min(TUNING.flickEnergyMax, this.flickEnergy + TUNING.flickGain);
        this.flickFired = true;
      }
      this._sinceFlick = 0;
    }
    if (steerSign !== 0) this._steerSign = steerSign;
    this.flickEnergy = Math.max(0, this.flickEnergy - TUNING.flickDecay * dt);

    if (drifting) {
      // DRIFT: steer picks the SIDE the tail hangs; throttle sets the ANGLE.
      // Holding full throttle winds the angle up past control into a spin.
      if (throttle > TUNING.driftWindThrottle && this.driftAngle > 0.3 && this.speed > 110) {
        this.driftWind = Math.min(TUNING.driftWindMax, this.driftWind + TUNING.driftWindRate * dt);
      } else {
        this.driftWind = Math.max(0, this.driftWind - TUNING.driftWindDecay * dt);
      }
      const mag = TUNING.driftCapLow + throttle * (TUNING.driftCapHigh - TUNING.driftCapLow) + this.driftWind;
      // Steer sets the angle ANALOG: hold A toward the balance point, RELEASE and
      // the target goes to 0 so the car straightens out (and the engine pulls speed
      // back). A (steer -1) -> left drift (+slip = nose left of travel, tail out right).
      const targetSlip = -steer * mag;
      const desiredHeading = normAngle(travelAng - targetSlip);
      // Ease the nose toward the target slip. Flip the steer and the tail swings
      // THROUGH centre to the other side — a smooth feint, never an instant snap.
      const diff = normAngle(desiredHeading - this.heading);
      this.heading = normAngle(this.heading + diff * Math.min(1, TUNING.driftTurnRate * dt));
    } else {
      // NORMAL grippy steering.
      const hbBoost = handbrake ? TUNING.handbrakeSteerBoost : 1;
      this.heading += steer * TUNING.steerRate * this.phys.turn * speedFactor * dirSign * hbBoost * dt;
      this.heading = normAngle(this.heading);
      // Light clamp so grippy driving never accidentally slides out.
      const slip = normAngle(travelAng - this.heading);
      if (this.speed > 55 && Math.abs(slip) > TUNING.gripDriftCap) {
        const target = normAngle(travelAng - Math.sign(slip) * TUNING.gripDriftCap);
        this.heading = normAngle(this.heading + normAngle(target - this.heading) * TUNING.antiSpinEase);
      }
      this.driftWind = Math.max(0, this.driftWind - TUNING.driftWindDecay * dt);
    }
    cos = Math.cos(this.heading);
    sin = Math.sin(this.heading);

    // --- Engine / brake along the forward axis ---
    if (throttle > 0) {
      const a = TUNING.engineAccel * this.phys.power * throttle;
      this.vx += cos * a * dt;
      this.vy += sin * a * dt;
    }
    if (brake > 0) {
      if (this.forwardSpeed > 20) {
        // Braking: decelerate against current motion.
        const dec = TUNING.brakeDecel * brake * dt;
        const sp = Math.hypot(this.vx, this.vy) || 1;
        const k = Math.max(0, sp - dec) / sp;
        this.vx *= k;
        this.vy *= k;
      } else if (hasFuel) {
        // Reverse.
        const a = TUNING.reverseAccel * brake;
        this.vx -= cos * a * dt;
        this.vy -= sin * a * dt;
      }
    }

    // --- Rolling + off-track drag (+ engine braking off the throttle) ---
    let drag = TUNING.rollDrag + (this.offTrack ? TUNING.offTrackDrag : 0);
    if (throttle < 0.1 && this.forwardSpeed > 0) drag += TUNING.coastDrag; // lift W = slow down
    const dragK = Math.max(0, 1 - drag * dt);
    this.vx *= dragK;
    this.vy *= dragK;

    // --- Grip: rotate velocity toward heading (keeps momentum), don't scrub it ---
    // Grip ROTATES the velocity toward where the car points (carving) rather than
    // killing the sideways component — so a drift carries its speed instead of
    // bleeding it. A small scrub proportional to the slide keeps it honest.
    const gripMul = handbrake ? TUNING.handbrakeGripMul : 1;
    const gripKill = TUNING.gripKill * this.phys.grip * gripMul;
    const speed0 = Math.hypot(this.vx, this.vy);
    if (speed0 > 1) {
      const velAng = Math.atan2(this.vy, this.vx);
      const toward = normAngle(this.heading - velAng); // how far velocity is off the nose
      const rot = toward * Math.min(1, gripKill * dt);
      const newSpeed = speed0 * Math.max(0, 1 - Math.abs(toward) * TUNING.driftScrub * dt);
      const na = velAng + rot;
      this.vx = Math.cos(na) * newSpeed;
      this.vy = Math.sin(na) * newSpeed;
    }
    this.forwardSpeed = this.vx * cos + this.vy * sin;

    // --- Drift state for scoring / fx (computed BEFORE the speed work so the
    // boost charge + drift thrust react to THIS frame's slide) ---
    if (this.speed > 8) {
      const velAng = Math.atan2(this.vy, this.vx);
      this.slip = normAngle(velAng - this.heading); // signed slip angle
      this.driftAngle = Math.abs(this.slip);
    } else {
      this.slip = 0;
      this.driftAngle = 0;
    }
    // Drift angle near PI means we're sliding backwards — treat as the rear stepping out.
    const effDrift = this.driftAngle > Math.PI / 2 ? Math.PI - this.driftAngle : this.driftAngle;
    this.isSpinning = this.driftAngle > TUNING.spinDriftAngle && this.driftAngle < Math.PI - TUNING.spinDriftAngle;
    this.isDrifting =
      this.speed > TUNING.minDriftSpeed &&
      effDrift > TUNING.driftAngleForSlide &&
      !this.isSpinning &&
      this.crashCooldown <= 0;
    this.effDrift = effDrift;

    // --- Drift = speed: a clean slide on the gas PULLS you forward and lifts the
    // top-speed cap, so chaining drifts is how you build pace (and score). Deeper
    // angle = more drive, up to a peak; over-rotate into a spin and you lose it. ---
    if (this.isDrifting && !this.offTrack && throttle > 0.1) {
      const q = Math.min(1, this.effDrift / TUNING.driftThrustPeak);
      const a = TUNING.driftThrust * q;
      this.vx += cos * a * dt;
      this.vy += sin * a * dt;
    }
    // Pumping the steer (flick energy) adds drive on top — works as long as you're
    // on the handbrake + gas, even through the brief angle wobble of a flick.
    if (drifting && !this.offTrack && throttle > 0.1 && this.flickEnergy > 0) {
      const fa = TUNING.flickThrust * this.flickEnergy;
      this.vx += cos * fa * dt;
      this.vy += sin * fa * dt;
    }

    // --- Drift-charge → boost (mini-turbo on release) ---
    if (handbrake && this.isDrifting && this.speed > 100) {
      this.driftCharge = Math.min(TUNING.driftBoostChargeMax, this.driftCharge + dt);
    } else if (!handbrake) {
      this.driftCharge = Math.max(0, this.driftCharge - dt * 1.5);
    }
    this.boostFired = 0;
    if (this._prevHandbrake && !handbrake && this.driftCharge > TUNING.driftBoostMin) {
      const amt = this.driftCharge;
      const blast = TUNING.driftBoostPower * amt;
      this.vx += cos * blast;
      this.vy += sin * blast;
      this.boost = Math.min(1, amt / TUNING.driftBoostChargeMax);
      this.boostFired = this.boost;
      this.driftCharge = 0;
    }
    this._prevHandbrake = handbrake;
    if (this.boost > 0) this.boost = Math.max(0, this.boost - TUNING.driftBoostDecay * dt);

    // --- Clamp top speed. Drifting + boost lift the cap; the drift lift EASES in
    // and bleeds off slowly so the speed you build carries out of the slide. ---
    const targetLift = this.isDrifting && !this.offTrack ? TUNING.driftSpeedBonus : 0;
    const liftRate = targetLift > this.driftLift ? TUNING.driftLiftRise : TUNING.driftLiftFall;
    this.driftLift += (targetLift - this.driftLift) * Math.min(1, liftRate * dt);
    this.speed = Math.hypot(this.vx, this.vy);
    const baseMax = this.forwardSpeed < -5 ? this.phys.maxSpeed * 0.4 : this.phys.maxSpeed;
    const max =
      baseMax * (1 + this.boost * TUNING.driftBoostSpeedBonus + this.driftLift + this.flickEnergy * TUNING.flickSpeedBonus);
    if (this.speed > max) {
      const k = max / this.speed;
      this.vx *= k;
      this.vy *= k;
      this.speed = max;
    }

    // --- Spin recovery: after a spin-out, once you straighten + slow down, a small
    // nudge to get going again (deliberately less than holding a clean drift). ---
    this.recoverFired = false;
    if (this.isSpinning) this._spunOut = true;
    if (this._spunOut && this.driftAngle < 0.35 && this.speed < 110) {
      this.vx += Math.cos(this.heading) * TUNING.spinRecoverBoost;
      this.vy += Math.sin(this.heading) * TUNING.spinRecoverBoost;
      this._spunOut = false;
      this.recoverFired = true;
    }

    // --- Safety: never let a NaN/Infinity reach Matter (it can hang the solver) ---
    if (!Number.isFinite(this.vx) || !Number.isFinite(this.vy)) {
      this.vx = 0;
      this.vy = 0;
    }
    if (!Number.isFinite(this.heading)) this.heading = 0;

    // --- Push to the Matter body ---
    this.scene.matter.body.setVelocity(this.sprite.body, {
      x: this.vx * STEP,
      y: this.vy * STEP,
    });
    this.sprite.setRotation(this.heading);

    // --- Sync the visual, leaning into the slide so the flank shows ---
    const perpX = -Math.sin(this.heading);
    const perpY = Math.cos(this.heading);
    const lean = Phaser.Math.Clamp(this.slip * 9, -11, 11); // weight shifts outward
    // Jump arc: lift the sprite off its shadow while airborne.
    let jumpH = 0;
    let jumpScale = 1;
    if (this.airborne > 0 && this.airMax > 0) {
      const arc = Math.sin((1 - this.airborne / this.airMax) * Math.PI); // 0 → 1 → 0
      jumpH = arc * 82;
      jumpScale = 1 + arc * 0.45;
    }
    this.visual.setPosition(this.x + perpX * lean, this.y + perpY * lean - jumpH);
    this.visual.setRotation(this.heading);
    const stretch = 1 + Math.min(0.1, this.effDrift * 0.12);
    this.visual.setScale(stretch * jumpScale, (1 - Math.min(0.06, this.effDrift * 0.08)) * jumpScale);
    const h01 = jumpH / 82;
    this.shadow.setPosition(this.x, this.y);
    this.shadow.setAlpha(this.airborne > 0 ? 0.5 - 0.35 * h01 : 0);
    this.shadow.setScale(this.shadowBase * (1 - 0.25 * h01));
  }

  // Launch off a ramp. duration (seconds airborne) is decided by the caller from
  // how fast you hit it.
  jump(duration) {
    if (this.airborne > 0) return;
    this.airborne = duration;
    this.airMax = duration;
  }

  // 0..1 engine load for the audio engine note.
  rev() {
    return Math.min(1, this.speed / this.phys.maxSpeed);
  }

  destroy() {
    if (this.sprite) this.sprite.destroy();
    if (this.visual) this.visual.destroy();
    if (this.shadow) this.shadow.destroy();
    this.sprite = null;
    this.visual = null;
    this.shadow = null;
  }
}
