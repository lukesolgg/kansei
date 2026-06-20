import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS } from '../config/cars.js';
import { ZONES, levelsByZone } from '../config/levels.js';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { makeCarTexture, drawNeonRoundRect } from '../core/neon.js';
import { neonButton, scanlines, fmt, starRow } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.backdrop = new Backdrop(this, { sunTop: COLORS.pink, sunBot: COLORS.purple, grid: COLORS.pink });
    scanlines(this);

    this.add.text(640, 46, 'SELECT STAGE', { ...titleStyle(46), color: hex(COLORS.white) })
      .setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, hex(COLORS.pink), 18, false, true);
    this.add.text(640, 86, `★ ${Save.totalStars()} / 27   ·   $ ${fmt(Save.cash)}`, labelStyle(20, COLORS.amber)).setOrigin(0.5);

    neonButton(this, 110, 46, 160, 50, '‹ MENU', { color: COLORS.purple, fontSize: 20, sfx: 'back' }, () => this._go('MenuScene'));

    // Selected car badge + quick garage
    const car = CARS[Save.selectedCar] || CARS.ae86;
    const key = makeCarTexture(this, car);
    this.add.image(1110, 50, key).setScale(0.7).setAngle(-10);
    this.add.text(1150, 38, car.name, labelStyle(20, car.color)).setOrigin(0, 0);
    neonButton(this, 1170, 70, 120, 34, 'GARAGE', { color: COLORS.cyan, fontSize: 15 }, () => this._go('GarageScene'));

    const byZone = levelsByZone();
    const zoneIds = Object.keys(ZONES);
    const colW = 386;
    const startX = 640 - colW;
    zoneIds.forEach((zid, zi) => {
      const zone = ZONES[zid];
      const x = startX + zi * colW;
      this.add.text(x, 130, zone.name, { ...titleStyle(26), color: hex(zone.accent) }).setOrigin(0.5);
      this.add.text(x, 162, zone.subtitle, labelStyle(15, COLORS.textDim)).setOrigin(0.5);
      byZone[zid].forEach((lvl, li) => {
        this._levelCard(lvl, x, 220 + li * 154);
      });
    });
  }

  _levelCard(lvl, x, y) {
    const w = 340;
    const h = 134;
    const unlocked = Save.isLevelUnlocked(lvl);
    const prog = Save.getLevel(lvl.id);
    const zone = lvl.zoneData;
    const color = unlocked ? zone.accent : COLORS.textMute;

    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 14, color, { fillAlpha: unlocked ? 0.5 : 0.35, glow: unlocked });
    c.add(g);

    c.add(this.add.text(-w / 2 + 20, -h / 2 + 14, lvl.name, { ...titleStyle(24), color: hex(unlocked ? COLORS.white : COLORS.textMute) }));
    c.add(this.add.text(-w / 2 + 20, -h / 2 + 46, `STAGE ${lvl.order + 1}`, labelStyle(15, COLORS.textDim)));

    if (unlocked) {
      c.add(starRow(this, -w / 2 + 22, h / 2 - 30, prog.stars, 22));
      const best = prog.bestScore ? `BEST ${fmt(prog.bestScore)}` : 'NOT SET';
      c.add(this.add.text(w / 2 - 18, -h / 2 + 18, best, labelStyle(15, COLORS.cyan)).setOrigin(1, 0));
      c.add(this.add.text(w / 2 - 18, h / 2 - 30, 'TARGET ' + fmt(lvl.scoreGold), labelStyle(14, COLORS.amber)).setOrigin(1, 0.5));

      const zone2 = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
      zone2.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.04, duration: 90 }));
      zone2.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
      zone2.on('pointerup', () => {
        Audio.resume();
        Audio.sfx('select');
        this._start(lvl.id);
      });
      c.add(zone2);
    } else {
      c.add(this.add.text(0, 6, '🔒', titleStyle(36)).setOrigin(0.5));
      c.add(this.add.text(0, h / 2 - 26, `★ ${lvl.unlockStars} to unlock`, labelStyle(15, COLORS.textDim)).setOrigin(0.5));
    }
    return c;
  }

  _start(levelId) {
    Audio.stopMusic();
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene', { levelId }));
  }

  _go(scene) {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
