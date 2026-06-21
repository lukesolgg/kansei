import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { MAPS, getLevelById } from '../config/levels.js';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { drawNeonRoundRect } from '../core/neon.js';
import { neonButton, scanlines, fmt, starRow } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';
import { applyMenuFX } from '../core/fx.js';

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelectScene');
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.backdrop = new Backdrop(this, { sunTop: COLORS.lamp, sunBot: COLORS.amber, grid: COLORS.kerb });
    scanlines(this);
    applyMenuFX(this.cameras.main);
    this.layer = this.add.container(0, 0);
    this._view = 'maps';
    this.input.keyboard.on('keydown-ESC', () => this._back());
    this.showMaps();
  }

  _clear() {
    this.layer.removeAll(true);
  }

  // ---- Map grid ----------------------------------------------------------
  showMaps() {
    this._view = 'maps';
    this._clear();
    this.layer.add(this.add.text(640, 58, 'SELECT MAP', { ...titleStyle(48), color: hex(COLORS.white) }).setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, hex(COLORS.cyan), 16, false, true));
    this.layer.add(this.add.text(640, 100, `★ ${Save.totalStars()}   ·   $ ${fmt(Save.cash)}`, labelStyle(20, COLORS.amber)).setOrigin(0.5));
    this.layer.add(neonButton(this, 110, 52, 160, 50, '‹ MENU', { color: COLORS.purple, fontSize: 20, sfx: 'back' }, () => this._go('MenuScene')));

    const n = MAPS.length;
    const cardW = 208;
    const gap = 22;
    const startX = 640 - (n * cardW + (n - 1) * gap) / 2 + cardW / 2;
    MAPS.forEach((m, i) => this.layer.add(this._mapCard(m, startX + i * (cardW + gap), 380)));
  }

  _mapCard(m, x, y) {
    const w = 200;
    const h = 300;
    const c = this.add.container(x, y);
    const locked = m.locked;
    const color = locked ? COLORS.textMute : COLORS.cyan;
    const g = this.add.graphics();
    drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 16, color, { fillAlpha: locked ? 0.32 : 0.5, glow: !locked });
    c.add(g);
    c.add(this.add.text(0, -h / 2 + 30, m.name, { ...titleStyle(locked ? 42 : 30), color: hex(locked ? COLORS.textMute : COLORS.white) }).setOrigin(0.5));
    c.add(this.add.text(0, -h / 2 + 66, m.subtitle, labelStyle(12, locked ? COLORS.textMute : COLORS.cyan)).setOrigin(0.5).setLetterSpacing(2));

    if (locked) {
      c.add(this.add.text(0, 6, '🔒', titleStyle(60)).setOrigin(0.5));
      c.add(this.add.text(0, h / 2 - 30, 'COMING SOON', labelStyle(13, COLORS.textDim)).setOrigin(0.5).setLetterSpacing(2));
    } else {
      const stars = m.stages.reduce((s, id) => s + (Save.getLevelProgress(id).stars || 0), 0);
      c.add(this.add.text(0, -4, '★', { ...titleStyle(64), color: hex(COLORS.amber) }).setOrigin(0.5).setShadow(0, 0, hex(COLORS.amber), 16, false, true));
      c.add(this.add.text(0, h / 2 - 58, `${stars} / ${m.stages.length * 3} ★`, labelStyle(17, COLORS.amber)).setOrigin(0.5));
      c.add(this.add.text(0, h / 2 - 32, 'FREE RUN + 6 STAGES', labelStyle(11, COLORS.textDim)).setOrigin(0.5).setLetterSpacing(1));
      const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.04, duration: 90 }));
      zone.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
      zone.on('pointerup', () => { Audio.resume(); Audio.sfx('select'); this.showMap(m); });
      c.add(zone);
    }
    return c;
  }

  // ---- Inside a map: Free Run + 6 stages ---------------------------------
  showMap(m) {
    this._view = 'map';
    this._clear();
    this.layer.add(this.add.text(640, 50, m.name, { ...titleStyle(46), color: hex(COLORS.white) }).setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, hex(COLORS.cyan), 16, false, true));
    this.layer.add(this.add.text(640, 90, m.subtitle, labelStyle(17, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(3));
    this.layer.add(neonButton(this, 110, 52, 160, 50, '‹ MAPS', { color: COLORS.purple, fontSize: 20, sfx: 'back' }, () => this.showMaps()));

    // FREE RUN (big card up top)
    this.layer.add(this._modeCard('▶ FREE RUN', 'Endless laps — chase the highest score', m.free, 640, 176, 580, 86, COLORS.cyan));

    // 6 stage cards, 3 x 2
    const cols = 3;
    const cw = 282;
    const ch = 116;
    const gx = 22;
    const gy = 20;
    const sx = 640 - (cols * cw + (cols - 1) * gx) / 2 + cw / 2;
    const sy = 312;
    m.stages.forEach((id, i) => {
      const lvl = getLevelById(id);
      if (!lvl) return;
      const cx = sx + (i % cols) * (cw + gx);
      const cy = sy + Math.floor(i / cols) * (ch + gy);
      const unlocked = i === 0 || Save.getLevelProgress(m.stages[i - 1]).stars > 0;
      this.layer.add(this._stageCard(lvl, i + 1, cx, cy, cw, ch, unlocked));
    });
  }

  _modeCard(title, sub, levelId, x, y, w, h, color) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 14, color, { fillAlpha: 0.5, glow: true });
    c.add(g);
    c.add(this.add.text(-w / 2 + 26, -h / 2 + 18, title, { ...titleStyle(32), color: hex(COLORS.white) }));
    c.add(this.add.text(-w / 2 + 26, -h / 2 + 56, sub, labelStyle(16, COLORS.textDim)));
    const prog = Save.getLevelProgress(levelId);
    if (prog.bestScore) c.add(this.add.text(w / 2 - 24, 0, 'BEST ' + fmt(prog.bestScore), { ...titleStyle(22), color: hex(COLORS.amber) }).setOrigin(1, 0.5));
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.03, duration: 90 }));
    zone.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    zone.on('pointerup', () => { Audio.resume(); Audio.sfx('select'); this._start(levelId); });
    c.add(zone);
    return c;
  }

  _stageCard(lvl, n, x, y, w, h, unlocked) {
    const c = this.add.container(x, y);
    const prog = Save.getLevelProgress(lvl.id);
    const color = unlocked ? COLORS.purple : COLORS.textMute;
    const g = this.add.graphics();
    drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 12, color, { fillAlpha: unlocked ? 0.45 : 0.3 });
    c.add(g);
    c.add(this.add.text(-w / 2 + 18, -h / 2 + 14, 'STAGE ' + n, { ...titleStyle(24), color: hex(unlocked ? COLORS.white : COLORS.textMute) }));
    if (unlocked) {
      c.add(starRow(this, -w / 2 + 20, h / 2 - 26, prog.stars, 20));
      c.add(this.add.text(w / 2 - 16, -h / 2 + 16, prog.bestScore ? 'BEST ' + fmt(prog.bestScore) : 'NOT SET', labelStyle(14, COLORS.cyan)).setOrigin(1, 0));
      c.add(this.add.text(w / 2 - 16, h / 2 - 24, 'GOLD ' + fmt(lvl.scoreGold), labelStyle(13, COLORS.amber)).setOrigin(1, 0.5));
      const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.04, duration: 90 }));
      zone.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
      zone.on('pointerup', () => { Audio.resume(); Audio.sfx('select'); this._start(lvl.id); });
      c.add(zone);
    } else {
      c.add(this.add.text(w / 2 - 26, 0, '🔒', titleStyle(30)).setOrigin(0.5));
      c.add(this.add.text(-w / 2 + 18, h / 2 - 26, 'Clear the previous stage', labelStyle(13, COLORS.textDim)));
    }
    return c;
  }

  _start(levelId) {
    Audio.stopMusic();
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene', { levelId }));
  }

  _back() {
    if (this._view === 'map') this.showMaps();
    else this._go('MenuScene');
  }

  _go(scene) {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
