// The car: a top-down arcade drift model. We keep our own velocity/heading and
// drive a Matter body by setting its velocity each frame, so Matter handles
// collision detection with obstacles/pickups while the *feel* stays hand-tuned.

import Phaser from 'phaser';
import { TUNING } from '../config/gameplay.js';
import { UPGRADES } from '../config/upgrades.js';
import { makeCarTexture, addGlow } from '../core/neon.js';

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
    this.sprite.setDepth(20);
    this.sprite.body.gameObjectRef = this;
    addGlow(this.sprite, carDef.color, 4, 0);

    // Live read-outs for HUD / scorer / fx.
    this.speed = 0;
    this.forwardSpeed = 0;
    this.driftAngle = 0;
    this.slip = 0;
    this.isDrifting = false;
    this.isSpinning = false;
    this.offTrack = false;
    this.crashCooldown = 0;
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
    this.heading += steer * TUNING.steerRate * this.phys.turn * speedFactor * dirSign * dt;
    this.heading = normAngle(this.heading);
    cos = Math.cos(this.heading);
    sin = Math.sin(this.heading);

    // --- Counter-steer assist (catchable slides) ---
    // Gently aligns the nose toward the travel direction so the car naturally
    // catches a slide when you ease off the input. Scaled down by how hard you're
    // steering (player keeps control) and by the handbrake (so big drifts hold).
    if (this.speed > 60 && this.forwardSpeed > 0) {
      const travelAng = Math.atan2(this.vy, this.vx);
      const slip = normAngle(travelAng - this.heading);
      if (Math.abs(slip) < 1.4) {
        let assist = TUNING.counterSteerAssist * (1 - Math.abs(steer));
        if (handbrake) assist *= TUNING.counterSteerHandbrakeMul;
        this.heading += Phaser.Math.Clamp(slip, -0.7, 0.7) * assist * dt;
        this.heading = normAngle(this.heading);
        cos = Math.cos(this.heading);
        sin = Math.sin(this.heading);
      }
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
    const gripKill = TUNING.gripKill * this.phys.grip * gripMul;
    const keep = Math.max(0, 1 - gripKill * dt);
    this.vx = cos * this.forwardSpeed + latX * keep;
    this.vy = sin * this.forwardSpeed + latY * keep;

    // --- Clamp top speed ---
    this.speed = Math.hypot(this.vx, this.vy);
    const max = this.forwardSpeed < -5 ? this.phys.maxSpeed * 0.4 : this.phys.maxSpeed;
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
    this.sprite = null;
  }
}
