// The car: a top-down arcade drift model. We keep our own velocity/heading and
// drive a Matter body by setting its velocity each frame, so Matter handles
// collision detection with obstacles/pickups while the *feel* stays hand-tuned.

import Phaser from 'phaser';
import { TUNING } from '../config/gameplay.js';
import { UPGRADES } from '../config/upgrades.js';
import { makeCarTexture, addGlow, makeSoftCircle } from '../core/neon.js';

// Matter expresses velocity in pixels-per-step. At ~60fps that's px/sec ÷ 60.
const STEP = 1 / 60;

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
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
    this.driftCharge = 0; // builds while sliding with the handbrake
    this.boost = 0; // current mini-turbo boost level (decays)
    this.boostFired = 0; // >0 on the frame a boost releases (for fx)
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

    // --- Steering (needs some speed; inverts in reverse) ---
    // Authority ramps in with speed, then tapers at very high speed so the car
    // doesn't snap-spin flat out — keeps the handling approachable.
    let speedFactor = Math.min(1, 0.35 + this.speed / 230);
    const hs = (this.speed - this.phys.maxSpeed * 0.7) / (this.phys.maxSpeed * 0.5);
    speedFactor *= 1 - 0.3 * Phaser.Math.Clamp(hs, 0, 1);
    const dirSign = this.forwardSpeed < -12 ? -1 : 1;
    // Handbrake sharpens the yaw so the tail visibly kicks out.
    const hbBoost = handbrake ? TUNING.handbrakeSteerBoost : 1;
    // Extra steering authority while already sliding — swing wide around obstacles
    // and pull the car right through a corner.
    const driftSteer = 1 + Math.min(0.95, this.effDrift * TUNING.driftSteerGain);
    this.heading += steer * TUNING.steerRate * this.phys.turn * speedFactor * dirSign * hbBoost * driftSteer * dt;
    this.heading = normAngle(this.heading);
    cos = Math.cos(this.heading);
    sin = Math.sin(this.heading);

    // --- Counter-steer assist (catchable slides) ---
    // Gently aligns the nose toward the travel direction so the car naturally
    // catches a slide when you ease off the input. Scaled down by how hard you're
    // steering (player keeps control) and by the handbrake (so big drifts hold).
    if (this.speed > 55) {
      const travelAng = Math.atan2(this.vy, this.vx);
      const slip = normAngle(travelAng - this.heading);
      // Gentle counter-steer catch — helps settle the car when you ease off.
      let assist = TUNING.counterSteerAssist * (1 - Math.abs(steer)) * (0.35 + 0.65 * throttle);
      if (handbrake) assist *= TUNING.counterSteerHandbrakeMul;
      this.heading += Phaser.Math.Clamp(slip, -0.7, 0.7) * assist * dt;

      // Anti-spin LOCK: hard-clamp the slip angle to the cap (eased so it doesn't
      // snap). You can drift right up to the cap and hold it, but the car simply
      // cannot rotate past it — no more instant spin-outs.
      const cap = handbrake ? TUNING.maxDriftAngleHandbrake : TUNING.maxDriftAngle;
      const slip2 = normAngle(travelAng - this.heading);
      if (Math.abs(slip2) > cap) {
        const target = normAngle(travelAng - Math.sign(slip2) * cap);
        this.heading = normAngle(this.heading + normAngle(target - this.heading) * 0.55);
      }
      this.heading = normAngle(this.heading);
      cos = Math.cos(this.heading);
      sin = Math.sin(this.heading);
    }

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

    // --- Rolling + off-track drag ---
    const drag = TUNING.rollDrag + (this.offTrack ? TUNING.offTrackDrag : 0);
    const dragK = Math.max(0, 1 - drag * dt);
    this.vx *= dragK;
    this.vy *= dragK;

    // --- Lateral grip (the heart of the drift) ---
    this.forwardSpeed = this.vx * cos + this.vy * sin;
    const latX = this.vx - cos * this.forwardSpeed;
    const latY = this.vy - sin * this.forwardSpeed;
    let gripMul = 1;
    if (handbrake) gripMul *= TUNING.handbrakeGripMul;
    if (throttle > 0.15) gripMul *= TUNING.throttleGripMul;
    else if (throttle < 0.1) gripMul *= TUNING.offThrottleGripMul; // lift-off = slidier
    const gripKill = TUNING.gripKill * this.phys.grip * gripMul;
    const keep = Math.max(0, 1 - gripKill * dt);
    this.vx = cos * this.forwardSpeed + latX * keep;
    this.vy = sin * this.forwardSpeed + latY * keep;

    // --- Drift-charge → boost (mini-turbo) ---
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

    // --- Clamp top speed (boost temporarily lifts the cap) ---
    this.speed = Math.hypot(this.vx, this.vy);
    const baseMax = this.forwardSpeed < -5 ? this.phys.maxSpeed * 0.4 : this.phys.maxSpeed;
    const max = baseMax * (1 + this.boost * TUNING.driftBoostSpeedBonus);
    if (this.speed > max) {
      const k = max / this.speed;
      this.vx *= k;
      this.vy *= k;
      this.speed = max;
    }

    // --- Drift state for scoring / fx ---
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

  // Bounce off an obstacle at (ox, oy): shove outward and bleed speed.
  crashInto(ox, oy) {
    if (this.crashCooldown > 0) return false;
    const ax = this.x - ox;
    const ay = this.y - oy;
    const d = Math.hypot(ax, ay) || 1;
    const nx = ax / d;
    const ny = ay / d;
    const newSpeed = this.speed * (1 - TUNING.crashSpeedLoss);
    this.vx = nx * newSpeed * 0.85 + this.vx * 0.1;
    this.vy = ny * newSpeed * 0.85 + this.vy * 0.1;
    this.crashCooldown = 0.35;
    return true;
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
