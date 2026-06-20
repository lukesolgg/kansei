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
import { neonButton } from '../ui/widgets.js';

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

    this.scorer = new DriftScorer();
    this.input2 = new InputController(this);

    // Fuel
    this.fuelMax = this.car.fuelTank;
    this.fuel = this.fuelMax * level.fuelStart;
    this.cashCollected = 0;
    this.strandTimer = 0;

    // Particles
    this._particles();

    // Camera follow
    this.cameras.main.startFollow(this.car.sprite, true, 0.09, 0.09);
    this.cameras.main.setZoom(0.95);
    this.targetZoom = 0.95;

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
    this.skid = this.add.particles(0, 0, 'spark', {
      lifespan: 3500, speed: 0, scale: { start: 1.7, end: 1.5 },
      alpha: { start: 0.3, end: 0.1 }, tint: 0x07060d, emitting: false,
    }).setDepth(2);
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
        this._collect(other.gameObject);
      } else if (other.label === 'obstacle') {
        this._crash(other.position.x, other.position.y);
      }
    }
  }

  _collect(sprite) {
    if (!sprite) return;
    const res = this.track.collect(sprite);
    if (!res) return;
    if (res.type === 'fuel') {
      this.fuel = Math.min(this.fuelMax, this.fuel + res.value);
      Audio.sfx('fuel');
      this.collectFx.setParticleTint(COLORS.amber);
      this.collectFx.emitParticleAt(sprite.x, sprite.y, 14);
      this._popup(sprite.x, sprite.y, `+${res.value} FUEL`, COLORS.amber);
    } else {
      this.cashCollected += res.value;
      Audio.sfx('cash');
      this.collectFx.setParticleTint(COLORS.lime);
      this.collectFx.emitParticleAt(sprite.x, sprite.y, 14);
      this._popup(sprite.x, sprite.y, `+$${res.value}`, COLORS.lime);
    }
  }

  _crash(ox, oy) {
    if (this.state !== 'play') return;
    if (this.car.crashInto(ox, oy)) {
      this.scorer.crash();
      Audio.sfx('crash');
      this.sparks.emitParticleAt(this.car.x, this.car.y, 18);
      this.cameras.main.shake(TUNING.crashShakeMs, 0.012);
    }
  }

  _popup(x, y, text, color) {
    const t = this.add.text(x, y - 20, text, { ...titleStyle(22), color: hex(color) })
      .setOrigin(0.5).setDepth(40).setShadow(0, 0, hex(color), 10, false, true);
    this.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  // ---- Main loop ---------------------------------------------------------
  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);

    if (this.input2.pausePressed() && this.state === 'play') {
      this._togglePause();
    }
    if (this.paused) return;

    if (this.state === 'intro') {
      Audio.updateEngine(0.08, 0);
      this._syncHud(0);
      return;
    }
    if (this.state === 'over') return;

    const input = this.input2.read();
    const hasFuel = this.fuel > 0;

    this.car.offTrack = this.track.isOffTrack(this.car.x, this.car.y);
    this.car.update(dt, input, hasFuel);

    // Fuel burn
    if (hasFuel) {
      const burn = (TUNING.fuelIdleBurn + input.throttle * TUNING.fuelThrottleBurn) * this.carDef.phys.baseFuelBurn;
      this.fuel = Math.max(0, this.fuel - burn * dt);
    }

    // Scoring
    this.scorer.update(dt, this.car);
    const banked = this.scorer.consumeBanked();
    if (banked > 200) this._popup(this.car.x, this.car.y, `+${Math.round(banked)}`, COLORS.cyan);

    // FX
    this._effects(dt);

    // Audio
    Audio.updateEngine(this.car.rev() * (hasFuel ? 1 : 0.2), this.car.isDrifting ? Math.min(1, this.car.effDrift / 1.4) : 0);

    // Camera zoom by speed
    this.targetZoom = 0.95 - 0.2 * Math.min(1, this.car.speed / this.car.phys.maxSpeed);
    const cam = this.cameras.main;
    cam.setZoom(cam.zoom + (this.targetZoom - cam.zoom) * 0.05);

    // End conditions
    if (this.track.isFinished(this.car.x, this.car.y)) {
      this._win();
    } else if (!hasFuel) {
      if (this.car.speed < 26) this.strandTimer += dt;
      else this.strandTimer = 0;
      if (this.strandTimer > 1.1) this._lose();
    } else {
      this.strandTimer = 0;
    }

    this._syncHud(dt);
  }

  _effects(dt) {
    const rear = this.car.rearAxle();
    if (this.car.isDrifting) {
      this.smoke.emitParticleAt(rear.x, rear.y, 1);
      if (Math.random() < 0.8) this.skid.emitParticleAt(rear.x, rear.y, 1);
    }
    if (this.car.offTrack && this.car.speed > 60 && Math.random() < 0.4) {
      this.smoke.setParticleTint(0x5a4a30);
      this.smoke.emitParticleAt(rear.x, rear.y, 1);
      this.smoke.setParticleTint(0xece6ff);
    }
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
    Audio.stopEngine();
    Audio.sfx('win');
    const score = this.scorer.score;
    let stars = 1;
    if (score >= this.level.scoreBronze) stars++;
    if (score >= this.level.scoreGold) stars++;
    const cashFromScore = Math.round(score * TUNING.cashPerScore);
    const cash = this.cashCollected + cashFromScore + TUNING.finishBonus + stars * TUNING.starBonus;
    this._finish({
      cleared: true, stars, score, cash,
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
      cleared: false, stars: 0, score, cash,
      breakdown: { tokens: this.cashCollected, drift: cashFromScore, finish: 0, stars: 0 },
      bestMultiplier: this.scorer.bestMultiplier,
    });
  }

  _finish(result) {
    Save.addCash(result.cash);
    Save.recordLevel(this.levelId, { cleared: result.cleared, stars: result.stars, score: result.score });
    this.cameras.main.flash(result.cleared ? 220 : 120, result.cleared ? 60 : 255, result.cleared ? 255 : 60, 120);
    this.time.delayedCall(700, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop('HUDScene');
        this.scene.start('ResultScene', { levelId: this.levelId, result });
      });
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
