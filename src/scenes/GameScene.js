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
import { makeSoftCircle } from '../core/neon.js';
import { applyGameplayFX, setSpeedFX, pulseBloom } from '../core/fx.js';
import { fmt } from '../ui/widgets.js';
import { xpForRun } from '../core/leveling.js';

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
    this.freeMode = !!level.loop; // closed-circuit free run (laps + score)
    this.laps = 0;
    this._lapFrac = 0;
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
    // Keyboard pause is edge-triggered (keydown events), not JustDown polling, so a
    // key-up missed while paused can't swallow the next pause press.
    const tryPause = () => { if (this.state === 'play' && !this.paused) this._togglePause(); };
    this.input.keyboard.on('keydown-ESC', tryPause);
    this.input.keyboard.on('keydown-P', tryPause);
    // PauseScene resumes us via scene.resume() -> 'resume' event; unfreeze physics.
    this.events.on('resume', () => this._onResumed());
    this._startEngineSoon();
    this._countdown();

    this.events.once('shutdown', () => {
      // Guard everything: by shutdown the matter world may already be torn down,
      // and a throw here aborts the scene stop and leaves NO scene active (black
      // screen). This was the real cause of the win/lose end-screen never showing.
      try { Audio.stopEngine(); } catch (_) {}
      try { Audio.setIntensity(0); } catch (_) {}
      try { if (this.skids) this.skids.destroy(); } catch (_) {}
      try {
        if (this.matter && this.matter.world) {
          this.matter.world.off('collisionstart', this._onCollide, this);
        }
      } catch (_) {}
    });
  }

  _blankHud() {
    return {
      score: 0, multiplier: 1, driftMult: 1, speedMult: 1, chain: 0, driftActive: false,
      fuel: this.fuel / this.fuelMax, fuelLow: false, outOfFuel: false, boostCharge: 0,
      freeMode: !!this.freeMode, laps: 0,
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
      } else if (other.label === 'booster') {
        this._boostPad();
      } else if (other.label === 'ramp') {
        this._hitRamp();
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

  _boostPad() {
    const c = this.car;
    c.vx += Math.cos(c.heading) * TUNING.boostPadPower;
    c.vy += Math.sin(c.heading) * TUNING.boostPadPower;
    c.boost = Math.max(c.boost, 0.6);
    Audio.sfx('combo');
    this.smoke.emitParticleAt(c.x, c.y, 6);
    pulseBloom(this.fx, 1.4);
  }

  _hitRamp() {
    const c = this.car;
    if (c.airborne > 0 || c.speed < TUNING.rampMinSpeed) return;
    // Air time scales with approach speed; a forward launch carries you across the
    // gap. Aim wide (drifting) at speed and you can cut a horseshoe; too slow and
    // you fall short, back into the bend.
    c.jump(Phaser.Math.Clamp(c.speed / 460, 0.5, TUNING.rampAirMax));
    c.vx += Math.cos(c.heading) * TUNING.rampLaunch;
    c.vy += Math.sin(c.heading) * TUNING.rampLaunch;
    c.boost = Math.max(c.boost, 0.5);
    this._jumpFromIdx = this.track._lastIdx; // record take-off spot for shortcut detection
    Audio.sfx('combo');
    pulseBloom(this.fx, 1.5);
  }

  _onLand() {
    this.car.boost = Math.max(this.car.boost, 0.45);
    Audio.sfx('combo');
    this.smoke.emitParticleAt(this.car.x, this.car.y, 10);
    if (Save.settings.shake) this.cameras.main.shake(120, 0.006);

    // SHORTCUT: a jump that skips a big chunk of track (e.g. leaping the hairpins)
    // pays a bonus scaled by the current drift multiplier.
    if (this._jumpFromIdx != null) {
      const landed = this.track._nearest(this.car.x, this.car.y).index;
      const skipped = landed - this._jumpFromIdx;
      this._jumpFromIdx = null;
      if (skipped > TUNING.shortcutMinSkip && this.state === 'play') {
        const m = this.scorer.multiplier;
        const bonus = Math.round(Phaser.Math.Clamp(TUNING.shortcutBase * m, TUNING.shortcutMin, TUNING.shortcutMax));
        this.scorer.addBonus(bonus);
        this._popup(this.car.x, this.car.y - 34, 'SHORTCUT  +' + fmt(bonus), COLORS.lime);
        pulseBloom(this.fx, 2.4);
        Audio.sfx('win');
        if (Save.settings.shake) this.cameras.main.shake(180, 0.01);
      }
    }
  }

  _popup(x, y, text, color) {
    const t = this.add.text(x, y - 20, text, { ...titleStyle(22), color: hex(color) })
      .setOrigin(0.5).setDepth(40).setShadow(0, 0, hex(color), 10, false, true);
    this.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  // ---- Main loop ---------------------------------------------------------
  update(time, delta) {
    // Never let a gameplay exception kill the requestAnimationFrame loop (which
    // freezes the whole game). Log it and end the run safely instead.
    try {
      this._update(time, delta);
    } catch (e) {
      console.error('[KANSEI] update error — ending the run safely:', e);
      if (this.state === 'play' && !this._finishing) this._lose();
    }
  }

  _update(time, delta) {
    const realDt = Math.min(0.05, delta / 1000);

    if (this.input2.pausePressed() && this.state === 'play') {
      this._togglePause();
    }
    if (this.paused) return;

    // Recover the time-scale toward normal (hit-stop / slow-mo juice).
    if (this.timeScale < 1) this.timeScale = Math.min(1, this.timeScale + realDt * this._tsRecover);
    const eng = this.matter && this.matter.world && this.matter.world.engine;
    if (eng && eng.timing) eng.timing.timeScale = this.timeScale;
    const dt = realDt * this.timeScale;

    if (this.state === 'intro') {
      Audio.updateEngine(0.08, 0);
      this._syncHud();
      return;
    }
    if (this.state === 'over') return;

    const input = this.input2.read(realDt);
    const hasFuel = this.fuel > 0;

    this.car.offTrack = this.car.airborne ? false : this.track.isOffTrack(this.car.x, this.car.y);
    // Wall geometry (used by the proximity boost BEFORE the step + the bounce after).
    const wctx = this.car.airborne ? null : this.track.wallContext(this.car.x, this.car.y);
    this._setWallBoost(wctx);
    this.car.update(dt, input, hasFuel);
    if (this.car.justLanded) this._onLand();
    // Tire chirp puff each time a flick (steer pump) lands, for feedback.
    if (this.car.flickFired) this.smoke.emitParticleAt(this.car.x, this.car.y, 3);

    // Process pickups touched during the just-finished physics step (safe now).
    if (this._pendingPickups.length) {
      for (const s of this._pendingPickups) this._collect(s);
      this._pendingPickups.length = 0;
    }
    // Bounce off the track-edge walls (not while airborne — you fly over them).
    if (!this.car.airborne) this._wallBounce(wctx);

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

    // Mini-turbo release
    if (this.car.boostFired > 0) this._onBoost(this.car.boostFired);
    if (this.car.perfectRelease) {
      this._popup(this.car.x, this.car.y - 30, 'PERFECT!', COLORS.amber);
      pulseBloom(this.fx, 2.2);
      Audio.sfx('combo');
    }
    // Spin-recovery nudge
    if (this.car.recoverFired) {
      Audio.sfx('combo');
      this.smoke.emitParticleAt(this.car.x, this.car.y, 6);
    }

    // FX
    this._effects(realDt);

    // Audio — engine + slip-driven squeal, and swell the music with the combo.
    Audio.updateEngine(this.car.rev() * (hasFuel ? 1 : 0.2), this.car.isDrifting ? Math.min(1, this.car.effDrift / 1.4) : 0);
    Audio.setIntensity(Math.min(1, (this.scorer.multiplier - 1) / 6));

    this._updateCamera();

    // Free mode: count laps as you cross the start/finish seam.
    if (this.freeMode && !this.car.airborne) {
      const f = this.track.loopFrac(this.car.x, this.car.y);
      if (this._lapFrac > 0.75 && f < 0.25) this._onLap();
      this._lapFrac = f;
    }

    // End conditions (timers use real time)
    if (this.track.isFinished(this.car.x, this.car.y)) {
      this._win();
    } else if (!hasFuel) {
      // Out of fuel: end once nearly stopped (icy coasting can run on), or after a
      // hard cap so it never hangs — but slow enough to coast to a nearby fuel can.
      this.fuelOutTime = (this.fuelOutTime || 0) + realDt;
      if (this.car.speed < 60) this.strandTimer += realDt;
      else this.strandTimer = 0;
      if (this.strandTimer > 1.0 || this.fuelOutTime > 6) this._lose();
    } else {
      this.strandTimer = 0;
      this.fuelOutTime = 0;
    }

    this._syncHud();
  }

  _onBoost(power) {
    Audio.sfx('combo');
    this.smoke.emitParticleAt(this.car.x, this.car.y, 8);
    pulseBloom(this.fx, 1.5);
    if (Save.settings.shake) this.cameras.main.shake(110, 0.005 * power);
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

  // Hugging the OUTER wall of a corner at speed gives an extra speed boost (set on
  // the car so the physics clamp lifts for it). Closer to the wall = bigger boost.
  _setWallBoost(wctx) {
    this.car.wallBoost = 0;
    if (!wctx || wctx.straight || wctx.onInside) return; // outer side of a corner only
    if (this.car.speed < TUNING.wallBoostMinSpeed) return;
    const limit = this.track.half - this.carDef.gfxWidth * 0.42;
    const gap = limit - wctx.dist; // distance from the wall (>0 = inside the track)
    if (gap > TUNING.wallProxBand || gap < -14) return;
    const prox = 1 - Phaser.Math.Clamp(gap, 0, TUNING.wallProxBand) / TUNING.wallProxBand; // 1 at wall → 0 at band edge
    this.car.wallBoost = prox;
    if (prox > 0.45 && Math.random() < 0.5) this.smoke.emitParticleAt(this.car.x, this.car.y, 1);
  }

  // Keep the car inside the track by bouncing it off the edge walls. While drifting,
  // the bounce is FORGIVING — a gentle nudge back onto your line that keeps the slide
  // alive — so clipping the inside wall mid-drift doesn't kill your momentum.
  _wallBounce(wctx) {
    const c = this.car;
    const info = wctx || this.track.wallContext(c.x, c.y);
    const limit = this.track.half - this.carDef.gfxWidth * 0.42;
    if (info.dist <= limit) return;
    const over = info.dist - limit;
    // Shove the car back inside.
    this.matter.body.setPosition(c.sprite.body, { x: c.x + info.nx * over, y: c.y + info.ny * over });
    const vn = c.vx * info.nx + c.vy * info.ny; // >0 = moving toward centre
    if (c.isDrifting) {
      // Forgiving: cancel only the into-wall component (no harsh reflect), nudge back
      // onto the line, and keep nearly all the speed so the drift carries on.
      if (vn < 0) {
        c.vx -= vn * info.nx;
        c.vy -= vn * info.ny;
      }
      c.vx += info.nx * TUNING.wallDriftPush;
      c.vy += info.ny * TUNING.wallDriftPush;
      c.vx *= TUNING.wallDriftScrub;
      c.vy *= TUNING.wallDriftScrub;
    } else {
      // Normal bounce: reflect the outward component + scrub a little speed.
      if (vn < 0) {
        const r = 0.35;
        c.vx -= (1 + r) * vn * info.nx;
        c.vy -= (1 + r) * vn * info.ny;
      }
      c.vx *= 0.88;
      c.vy *= 0.88;
    }
    if (c.speed > 150) this.smoke.emitParticleAt(c.x, c.y, 2);
  }

  // Free mode: a completed lap tops up fuel (keep the run alive), pays a bonus,
  // and counts toward your lap total.
  _onLap() {
    if (this.state !== 'play') return;
    this.laps++;
    this.scorer.addBonus(500);
    this.fuel = Math.min(this.fuelMax, this.fuel + this.fuelMax * 0.3);
    this._popup(this.car.x, this.car.y - 32, 'LAP ' + this.laps, COLORS.cyan);
    pulseBloom(this.fx, 2);
    Audio.sfx('win');
  }

  _syncHud() {
    const h = this.hud;
    h.score = this.scorer.score;
    h.multiplier = this.scorer.multiplier;
    h.driftMult = this.scorer.multiplier;
    h.speedMult = this.scorer.speedMult;
    h.chain = this.scorer.chain;
    h.driftActive = this.scorer.driftActive;
    h.fuel = this.fuel / this.fuelMax;
    h.fuelLow = h.fuel <= TUNING.lowFuelWarn;
    h.outOfFuel = this.fuel <= 0;
    h.boostCharge = this.car.driftChargeFrac;
    h.speed = Math.round(this.car.speed * 0.3); // arcade MPH
    h.freeMode = this.freeMode;
    h.laps = this.laps;
    h.progress = this.freeMode ? this._lapFrac : this.track.progressFrac();
    h.cash = this.cashCollected;
    h.paused = this.paused;
    h.state = this.state;
  }

  // ---- Pause -------------------------------------------------------------
  // The pause menu is its own static-camera scene (PauseScene) so its buttons get
  // clean pointer hit-testing — the GameScene camera is zoomed + scrolling, which
  // mis-maps clicks. We just freeze physics and hand off; PauseScene resumes us.
  _togglePause() {
    if (this.paused) return;
    this.paused = true;
    this.matter.world.pause();
    Audio.updateEngine(0, 0);
    this.scene.launch('PauseScene', { gameKey: this.scene.key, levelId: this.levelId });
    this.scene.bringToTop('PauseScene');
    this.scene.pause();
  }

  _onResumed() {
    this.paused = false;
    if (this.matter && this.matter.world) this.matter.world.resume();
    // The ESC key-up landed while we were paused, so clear any stuck key state.
    try { this.input.keyboard.resetKeys(); } catch (_) {}
  }

  // ---- End ---------------------------------------------------------------
  // A swirling portal at the finish — the car launches off the final ramp and
  // "flies through" as the screen fades to the results.
  _portalFx() {
    makeSoftCircle(this, 'portal_a', 256, COLORS.purple);
    makeSoftCircle(this, 'portal_b', 256, COLORS.cyan);
    const glow = this.add.image(this.car.x, this.car.y, 'portal_a')
      .setDepth(40).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0.9);
    this.tweens.add({ targets: glow, scale: 3.4, alpha: 0, duration: 640, ease: 'Cubic.out', onComplete: () => glow.destroy() });
    const ring = this.add.image(this.car.x, this.car.y, 'portal_b')
      .setDepth(41).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1).setAlpha(1);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 540, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    pulseBloom(this.fx, 3);
    if (Save.settings.shake) this.cameras.main.shake(220, 0.012);
  }

  _win() {
    if (this.state === 'over') return;
    this.state = 'over';
    this._portalFx();
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
    Audio.sfx(this.freeMode ? 'win' : 'lose');
    const score = this.scorer.score;
    // A free run is a score attack, not a failure — full cash + a per-lap bonus.
    const mult = this.freeMode ? 1 : 0.5;
    const lapBonus = this.freeMode ? this.laps * 100 : 0;
    const cashFromScore = Math.round(score * TUNING.cashPerScore * mult);
    const cash = this.cashCollected + cashFromScore + lapBonus;
    this._finish({
      cleared: false, freeMode: this.freeMode, laps: this.laps,
      stars: 0, score, cash, progress: this.freeMode ? 1 : this.track.progressFrac(),
      breakdown: { tokens: this.cashCollected, drift: cashFromScore, finish: lapBonus, stars: 0 },
      bestMultiplier: this.scorer.bestMultiplier,
    });
  }

  _finish(result) {
    if (this._finishing) return; // never double-fire
    this._finishing = true;
    Save.addCash(result.cash);
    Save.recordLevel(this.levelId, { cleared: result.cleared, stars: result.stars, score: result.score });
    // XP from the run (score, cash, stars, multiplier, clear) feeds the player level.
    try {
      const gained = xpForRun({
        score: result.score, cash: result.cash, cleared: result.cleared,
        stars: result.stars, bestMultiplier: result.bestMultiplier,
      });
      const lv = Save.addXp(gained);
      result.xpGained = gained;
      result.leveledUp = lv && lv.leveledUp ? lv.newLevel : 0;
    } catch (_) {}
    this.scene.stop('HUDScene');
    if (Save.settings.shake) {
      this.cameras.main.flash(result.cleared ? 220 : 120, result.cleared ? 60 : 255, result.cleared ? 255 : 60, 120);
    }
    this.cameras.main.fadeOut(480, 0, 0, 0);

    // Go to results on a plain timer (never the fade-complete event, which can
    // stall with post-FX). A window.setTimeout backstop guarantees it fires even
    // if the scene clock is ever interfered with — guarded so it runs once.
    const go = () => {
      if (this._resultStarted || !this.scene) return;
      this._resultStarted = true;
      try {
        this.scene.start('ResultScene', { levelId: this.levelId, result });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[KANSEI] failed to open results — falling back to stages:', e);
        try { this.scene.start('LevelSelectScene'); } catch (_) {}
      }
    };
    this.time.delayedCall(560, go);
    window.setTimeout(() => { if (!this._resultStarted) go(); }, 1100);
  }

  _exitTo(scene) {
    if (this.matter && this.matter.world) this.matter.world.resume();
    Audio.stopEngine();
    this.scene.stop('HUDScene');
    this.scene.start(scene);
  }
}
