import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS } from '../config/cars.js';
import { getLevelById } from '../config/levels.js';
import { TUNING } from '../config/gameplay.js';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { Track } from '../game/Track.js';
import { Car } from '../game/Car.js';
import { DriftScorer } from '../game/DriftScorer.js';
import { InputController, resetTouch } from '../game/Input.js';
import { SkidMarks } from '../game/SkidMarks.js';
import { neonButton } from '../ui/widgets.js';
import { makeSoftCircle } from '../core/neon.js';
import { applyGameplayFX, setSpeedFX, pulseBloom } from '../core/fx.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.levelId = data.levelId;
  }

  create() {
    resetTouch();
    this.cameras.main.fadeIn(260, 0, 0, 0);
    const level = getLevelById(this.levelId);
    this.level = level;
    const carDef = CARS[Save.selectedCar] || CARS.ae86;
    this.carDef = carDef;
    const ups = Save.getUpgrades(carDef.id);

    this.cameras.main.setBackgroundColor(hex(COLORS.bg));

    // World
    this.track = new Track(this, level);
    const b = this.track.bounds;
    this.cameras.main.setBounds(b.x, b.y, b.w, b.h);

    const sp = this.track.spawn();
    this.car = new Car(this, sp.x, sp.y, sp.angle, carDef, ups);

    // Persistent tire decals + a soft neon underglow that swells while drifting.
    this.skids = new SkidMarks(this, { carWidth: carDef.gfxWidth });
    const glowKey = makeSoftCircle(this, 'uglow_' + carDef.id, 128, carDef.color);
    this.underglow = this.add
      .image(sp.x, sp.y, glowKey)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(19)
      .setScale((carDef.gfxLength / 128) * 1.7)
      .setAlpha(0.2);

    this.scorer = new DriftScorer();
    this.input2 = new InputController(this);

    // Fuel
    this.fuelMax = this.car.fuelTank;
    this.fuel = this.fuelMax * level.fuelStart;
    this.cashCollected = 0;
    this.strandTimer = 0;
    // Pickups touched during a physics step are queued and processed AFTER the
    // step — destroying a Matter body mid-step corrupts the engine.
    this._pendingPickups = [];

    // Particles
    this._particles();

    // Camera follow + neon post-processing (bloom / vignette / colour grade)
    this.cameras.main.startFollow(this.car.sprite, true, 0.09, 0.09);
    this.cameras.main.setZoom(0.95);
    this.targetZoom = 0.95;
    this.fx = Save.settings.postfx
      ? applyGameplayFX(this.cameras.main, { saturation: 1.18 })
      : { bloom: null, vignette: null, grade: null };
    this._camOffX = 0;
    this._camOffY = 0;

    // Time-scale for hit-stop / slow-mo juice (1 = normal).
    this.timeScale = 1;
    this._tsRecover = TUNING.hitStopRecover;

    // Collisions
    this.matter.world.on('collisionstart', this._onCollide, this);

    // HUD scene
    this.hud = this._blankHud();
    this.scene.launch('HUDScene', { gameScene: this });

    // State machine: intro -> play -> over
    this.state = 'intro';
    this.paused = false;
    this._startEngineSoon();
    this._countdown();

    this.events.once('shutdown', () => {
      Audio.stopEngine();
      Audio.setIntensity(0);
      if (this.skids) this.skids.destroy();
      this.matter.world.off('collisionstart', this._onCollide, this);
    });
  }

  _blankHud() {
    return {
      score: 0, multiplier: 1, chain: 0, driftActive: false,
      fuel: this.fuel / this.fuelMax, fuelLow: false, outOfFuel: false,
      speed: 0, progress: 0, cash: 0, level: this.level,
      paused: false, state: 'intro',
    };
  }

  _startEngineSoon() {
    Audio.resume();
    Audio.startEngine();
  }

  _particles() {
    this.smoke = this.add.particles(0, 0, 'spark', {
      lifespan: 520, speed: { min: 10, max: 70 }, angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 3.4 }, alpha: { start: 0.45, end: 0 },
      tint: 0xece6ff, blendMode: 'ADD', emitting: false,
    }).setDepth(28);
    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: 460, speed: { min: 120, max: 360 }, angle: { min: 0, max: 360 },
      scale: { start: 1.5, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xffd23f, 0xff7a18, 0xffffff], blendMode: 'ADD', emitting: false,
    }).setDepth(30);
    this.collectFx = this.add.particles(0, 0, 'spark', {
      lifespan: 520, speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0 }, alpha: { start: 1, end: 0 },
      tint: 0xffffff, blendMode: 'ADD', emitting: false,
    }).setDepth(30);
  }

  _countdown() {
    const cam = this.cameras.main;
    const mk = (txt, color, delay) =>
      this.time.delayedCall(delay, () => {
        if (!this.scene.isActive()) return;
        const t = this.add.text(cam.midPoint.x, cam.midPoint.y - 40, txt, { ...titleStyle(120), color: hex(color) })
          .setOrigin(0.5).setDepth(60).setScrollFactor(0).setShadow(0, 0, hex(color), 24, false, true);
        t.setPosition(this.scale.width / 2, this.scale.height / 2 - 30);
        Audio.sfx('combo');
        this.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, alpha: { from: 1, to: 0 }, duration: 760, onComplete: () => t.destroy() });
      });
    mk('3', COLORS.cyan, 300);
    mk('2', COLORS.amber, 1000);
    mk('1', COLORS.pink, 1700);
    this.time.delayedCall(2400, () => {
      if (!this.scene.isActive()) return;
      this.state = 'play';
      const t = this.add.text(this.scale.width / 2, this.scale.height / 2 - 30, 'DRIFT!', { ...titleStyle(96), color: hex(COLORS.lime) })
        .setOrigin(0.5).setDepth(60).setScrollFactor(0).setShadow(0, 0, hex(COLORS.lime), 24, false, true);
      Audio.sfx('win');
      this.tweens.add({ targets: t, scale: { from: 1, to: 1.8 }, alpha: { from: 1, to: 0 }, duration: 700, onComplete: () => t.destroy() });
    });
  }

  // ---- Collisions --------------------------------------------------------
  _onCollide(event) {
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const bb = pair.bodyB;
      let other = null;
      if (a.label === 'car') other = bb;
      else if (bb.label === 'car') other = a;
      else continue;
      if (other.label === 'fuel' || other.label === 'cash') {
        // Defer: don't destroy the pickup body inside the physics step.
        if (other.gameObject && other.gameObject.body) this._pendingPickups.push(other.gameObject);
      } else if (other.label === 'obstacle') {
        // Safe mid-step: only mutates our own velocity + camera, no body removal.
        this._crash(other.position.x, other.position.y);
      }
    }
  }

  _collect(sprite) {
    // Guard: a destroyed pickup has no Matter body, and its .x/.y getters would
    // throw (taking down the whole loop) if a duplicate collision fires.
    if (!sprite || !sprite.body) return;
    // Capture the position BEFORE collect() destroys the sprite.
    const x = sprite.x;
    const y = sprite.y;
    const res = this.track.collect(sprite);
    if (!res) return;
    if (res.type === 'fuel') {
      this.fuel = Math.min(this.fuelMax, this.fuel + res.value);
      Audio.sfx('fuel');
      this.collectFx.setParticleTint(COLORS.amber);
      this.collectFx.emitParticleAt(x, y, 14);
      this._popup(x, y, `+${res.value} FUEL`, COLORS.amber);
    } else {
      this.cashCollected += res.value;
      Audio.sfx('cash');
      this.collectFx.setParticleTint(COLORS.lime);
      this.collectFx.emitParticleAt(x, y, 14);
      this._popup(x, y, `+$${res.value}`, COLORS.lime);
    }
  }

  _crash(ox, oy) {
    if (this.state !== 'play') return;
    if (this.car.crashInto(ox, oy)) {
      this.scorer.crash();
      Audio.sfx('crash');
      this.sparks.emitParticleAt(this.car.x, this.car.y, 18);
      if (Save.settings.shake) this.cameras.main.shake(TUNING.crashShakeMs, 0.016);
      if (!Save.settings.reduceMotion) this._hitStop(TUNING.hitStopScale, TUNING.hitStopRecover);
    }
  }

  _popup(x, y, text, color) {
    const t = this.add.text(x, y - 20, text, { ...titleStyle(22), color: hex(color) })
      .setOrigin(0.5).setDepth(40).setShadow(0, 0, hex(color), 10, false, true);
    this.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  // ---- Main loop ---------------------------------------------------------
  update(time, delta) {
    const realDt = Math.min(0.05, delta / 1000);

    if (this.input2.pausePressed() && this.state === 'play') {
      this._togglePause();
    }
    if (this.paused) return;

    // Recover the time-scale toward normal (hit-stop / slow-mo juice).
    if (this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + realDt * this._tsRecover);
    if (this.matter.world.engine) this.matter.world.engine.timing.timeScale = this.timeScale;
    const dt = realDt * this.timeScale;

    if (this.state === 'intro') {
      Audio.updateEngine(0.08, 0);
      this._syncHud();
      return;
    }
    if (this.state === 'over') return;

    const input = this.input2.read(realDt);
    const hasFuel = this.fuel > 0;

    this.car.offTrack = this.track.isOffTrack(this.car.x, this.car.y);
    this.car.update(dt, input, hasFuel);

    // Process pickups touched during the just-finished physics step (safe now).
    if (this._pendingPickups.length) {
      for (const s of this._pendingPickups) this._collect(s);
      this._pendingPickups.length = 0;
    }

    // Bounce off the track-edge walls.
    this._wallBounce();

    // Fuel burn (real time, so slow-mo doesn't refund fuel)
    if (hasFuel) {
      const burn = (TUNING.fuelIdleBurn + input.throttle * TUNING.fuelThrottleBurn) * this.carDef.phys.baseFuelBurn;
      this.fuel = Math.max(0, this.fuel - burn * realDt);
    }

    // Scoring
    this.scorer.update(dt, this.car);
    const banked = this.scorer.consumeBanked();
    if (banked > 200) this._popup(this.car.x, this.car.y, `+${Math.round(banked)}`, COLORS.cyan);
    if (banked > 2500) this._bankSlowmo();

    // FX
    this._effects(realDt);

    // Audio — engine + slip-driven squeal, and swell the music with the combo.
    Audio.updateEngine(this.car.rev() * (hasFuel ? 1 : 0.2), this.car.isDrifting ? Math.min(1, this.car.effDrift / 1.4) : 0);
    Audio.setIntensity(Math.min(1, (this.scorer.multiplier - 1) / 6));

    this._updateCamera();

    // End conditions (timers use real time)
    if (this.track.isFinished(this.car.x, this.car.y)) {
      this._win();
    } else if (!hasFuel) {
      if (this.car.speed < 26) this.strandTimer += realDt;
      else this.strandTimer = 0;
      if (this.strandTimer > 1.1) this._lose();
    } else {
      this.strandTimer = 0;
    }

    this._syncHud();
  }

  _updateCamera() {
    const cam = this.cameras.main;
    // Zoom out a little with speed for a sense of pace.
    this.targetZoom = 0.95 - 0.2 * Math.min(1, this.car.speed / this.car.phys.maxSpeed);
    cam.setZoom(cam.zoom + (this.targetZoom - cam.zoom) * 0.05);
    // Lookahead toward the direction of travel (drift framing).
    const look = Math.min(150, this.car.speed * 0.4);
    const ang = Math.atan2(this.car.vy, this.car.vx);
    const tx = -Math.cos(ang) * look;
    const ty = -Math.sin(ang) * look;
    this._camOffX += (tx - this._camOffX) * 0.05;
    this._camOffY += (ty - this._camOffY) * 0.05;
    cam.setFollowOffset(this._camOffX, this._camOffY);
    setSpeedFX(this.fx, Math.min(1, this.car.speed / this.car.phys.maxSpeed));
  }

  _hitStop(scale, recover) {
    this.timeScale = scale;
    this._tsRecover = recover;
  }

  _bankSlowmo() {
    if (this.timeScale < 0.99) return; // don't stack on an active hit-stop
    this.timeScale = TUNING.bankSlowmoScale;
    this._tsRecover = TUNING.bankSlowmoRecover;
  }

  _effects() {
    const rear = this.car.rearAxle();
    const slip01 = Math.min(1, this.car.effDrift / 1.0);
    if (this.car.isDrifting) {
      this.smoke.emitParticleAt(rear.x, rear.y, 1);
      this.skids.emit(rear.x, rear.y, this.car.heading, slip01);
    }
    if (this.car.offTrack && this.car.speed > 60 && Math.random() < 0.4) {
      this.smoke.setParticleTint(0x5a4a30);
      this.smoke.emitParticleAt(rear.x, rear.y, 1);
      this.smoke.setParticleTint(0xece6ff);
    }
    // Underglow follows the car and brightens with speed + drift.
    this.underglow.setPosition(this.car.x, this.car.y);
    const speed01 = Math.min(1, this.car.speed / this.car.phys.maxSpeed);
    this.underglow.setAlpha(0.16 + 0.45 * (this.car.isDrifting ? slip01 : 0) + 0.14 * speed01);
  }

  // Keep the car inside the track by bouncing it off the edge walls.
  _wallBounce() {
    const limit = this.track.half - this.carDef.gfxWidth * 0.42;
    const info = this.track.edgeInfo(this.car.x, this.car.y);
    if (info.dist <= limit) return;
    const over = info.dist - limit;
    // Shove the car back inside.
    this.matter.body.setPosition(this.car.sprite.body, {
      x: this.car.x + info.nx * over,
      y: this.car.y + info.ny * over,
    });
    // Reflect the outward velocity component (bounce) + scrub a little speed.
    const vn = this.car.vx * info.nx + this.car.vy * info.ny; // >0 = toward centre
    if (vn < 0) {
      const r = 0.35;
      this.car.vx -= (1 + r) * vn * info.nx;
      this.car.vy -= (1 + r) * vn * info.ny;
    }
    this.car.vx *= 0.88;
    this.car.vy *= 0.88;
    if (this.car.speed > 150) this.smoke.emitParticleAt(this.car.x, this.car.y, 2);
  }

  _syncHud() {
    const h = this.hud;
    h.score = this.scorer.score;
    h.multiplier = this.scorer.multiplier;
    h.chain = this.scorer.chain;
    h.driftActive = this.scorer.driftActive;
    h.fuel = this.fuel / this.fuelMax;
    h.fuelLow = h.fuel <= TUNING.lowFuelWarn;
    h.outOfFuel = this.fuel <= 0;
    h.speed = Math.round(this.car.speed * 0.36);
    h.progress = this.track.progressFrac();
    h.cash = this.cashCollected;
    h.paused = this.paused;
    h.state = this.state;
  }

  // ---- Pause -------------------------------------------------------------
  _togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.matter.world.pause();
      Audio.updateEngine(0, 0);
      this._showPauseUI();
    } else {
      this.matter.world.resume();
      this._hidePauseUI();
    }
  }

  _showPauseUI() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.pauseUI = [];
    const dim = this.add.rectangle(0, 0, w, h, 0x05040b, 0.78).setOrigin(0, 0).setScrollFactor(0).setDepth(80);
    const title = this.add.text(w / 2, h / 2 - 130, 'PAUSED', { ...titleStyle(64), color: hex(COLORS.cyan) })
      .setOrigin(0.5).setScrollFactor(0).setDepth(81).setLetterSpacing(8);
    this.pauseUI.push(dim, title);
    const mkBtn = (y, label, color, cb) => {
      const b = neonButton(this, w / 2, y, 300, 58, label, { color }, cb);
      b.setScrollFactor(0).setDepth(81);
      this.pauseUI.push(b);
    };
    mkBtn(h / 2 - 30, '▶ RESUME', COLORS.lime, () => this._togglePause());
    mkBtn(h / 2 + 44, '↻ RESTART', COLORS.amber, () => { this._hidePauseUI(); this.scene.stop('HUDScene'); this.scene.restart({ levelId: this.levelId }); });
    mkBtn(h / 2 + 118, '✕ QUIT TO STAGES', COLORS.red, () => { this._exitTo('LevelSelectScene'); });
  }

  _hidePauseUI() {
    if (this.pauseUI) this.pauseUI.forEach((o) => o.destroy());
    this.pauseUI = null;
  }

  // ---- End ---------------------------------------------------------------
  _win() {
    if (this.state === 'over') return;
    this.state = 'over';
    pulseBloom(this.fx, 2.4);
    Audio.stopEngine();
    Audio.sfx('win');
    const score = this.scorer.score;
    let stars = 1;
    if (score >= this.level.scoreBronze) stars++;
    if (score >= this.level.scoreGold) stars++;
    const cashFromScore = Math.round(score * TUNING.cashPerScore);
    const cash = this.cashCollected + cashFromScore + TUNING.finishBonus + stars * TUNING.starBonus;
    this._finish({
      cleared: true, stars, score, cash, progress: 1,
      breakdown: { tokens: this.cashCollected, drift: cashFromScore, finish: TUNING.finishBonus, stars: stars * TUNING.starBonus },
      bestMultiplier: this.scorer.bestMultiplier,
    });
  }

  _lose() {
    if (this.state === 'over') return;
    this.state = 'over';
    Audio.stopEngine();
    Audio.sfx('lose');
    const score = this.scorer.score;
    const cashFromScore = Math.round(score * TUNING.cashPerScore * 0.5);
    const cash = this.cashCollected + cashFromScore;
    this._finish({
      cleared: false, stars: 0, score, cash, progress: this.track.progressFrac(),
      breakdown: { tokens: this.cashCollected, drift: cashFromScore, finish: 0, stars: 0 },
      bestMultiplier: this.scorer.bestMultiplier,
    });
  }

  _finish(result) {
    Save.addCash(result.cash);
    Save.recordLevel(this.levelId, { cleared: result.cleared, stars: result.stars, score: result.score });
    if (Save.settings.shake) {
      this.cameras.main.flash(result.cleared ? 220 : 120, result.cleared ? 60 : 255, result.cleared ? 255 : 60, 120);
    }
    this.cameras.main.fadeOut(620, 0, 0, 0);
    // Transition on a fixed timer, NOT the camerafadeoutcomplete event — that
    // event can stall when a post-FX pipeline is on the camera and leave the
    // player stuck on a black screen.
    this.time.delayedCall(760, () => {
      this.scene.stop('HUDScene');
      this.scene.start('ResultScene', { levelId: this.levelId, result });
    });
  }

  _exitTo(scene) {
    this._hidePauseUI();
    this.matter.world.resume();
    Audio.stopEngine();
    this.scene.stop('HUDScene');
    this.scene.start(scene);
  }
}
