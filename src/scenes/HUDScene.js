import Phaser from 'phaser';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { drawNeonRoundRect } from '../core/neon.js';
import { fmt } from '../ui/widgets.js';
import { TOUCH } from '../game/Input.js';

function multColor(m) {
  if (m < 1.4) return COLORS.textDim;
  if (m < 3) return COLORS.cyan;
  if (m < 5) return COLORS.lime;
  if (m < 7) return COLORS.amber;
  return COLORS.pink;
}

export default class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUDScene');
  }

  init(data) {
    this.gs = data.gameScene;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Score (top-left)
    this.add.text(34, 22, 'SCORE', labelStyle(16, COLORS.cyan)).setLetterSpacing(4);
    this.scoreText = this.add.text(32, 40, '0', { ...titleStyle(46), color: hex(COLORS.white) });

    // Multiplier
    this.multText = this.add.text(36, 96, 'x1.0', { ...titleStyle(40), color: hex(COLORS.textDim) });
    this.driftText = this.add.text(150, 110, 'DRIFT', labelStyle(20, COLORS.pink)).setLetterSpacing(4).setVisible(false);

    // Level + progress (top-center)
    this.levelText = this.add.text(W / 2, 22, this.gs.level.name.toUpperCase(), { ...titleStyle(22), color: hex(this.gs.level.zoneData.accent) })
      .setOrigin(0.5).setLetterSpacing(3);
    this.progG = this.add.graphics();

    // Cash (top-right)
    this.add.text(W - 34, 22, 'CASH', labelStyle(16, COLORS.lime)).setOrigin(1, 0).setLetterSpacing(4);
    this.cashText = this.add.text(W - 34, 40, '$0', { ...titleStyle(40), color: hex(COLORS.lime) }).setOrigin(1, 0);

    // Fuel (bottom-left)
    this.add.text(36, H - 84, '⛽ FUEL', labelStyle(18, COLORS.amber)).setLetterSpacing(2);
    this.fuelG = this.add.graphics();
    this.outText = this.add.text(180, H - 84, '', { ...titleStyle(22), color: hex(COLORS.red) });

    // Speed (bottom-right)
    this.speedText = this.add.text(W - 36, H - 96, '0', { ...titleStyle(64), color: hex(COLORS.white) }).setOrigin(1, 1);
    this.add.text(W - 36, H - 40, 'KM/H', labelStyle(18, COLORS.textDim)).setOrigin(1, 1).setLetterSpacing(4);

    // Pause hint
    this.add.text(W / 2, H - 24, 'ESC to pause', labelStyle(15, COLORS.textMute)).setOrigin(0.5);

    if (this.sys.game.device.input.touch || window.matchMedia('(pointer: coarse)').matches) {
      this._touchControls(W, H);
    }
  }

  _touchControls(W, H) {
    this.input.addPointer(3);
    const mk = (x, y, r, label, color, flag) => {
      const g = this.add.graphics();
      drawNeonRoundRect(g, x - r, y - r, r * 2, r * 2, r, color, { fillAlpha: 0.35 });
      const t = this.add.text(x, y, label, { ...titleStyle(30), color: hex(color) }).setOrigin(0.5);
      const zone = this.add.circle(x, y, r, 0xffffff, 0.001).setInteractive();
      const set = (v) => { TOUCH[flag] = v; g.setAlpha(v ? 0.7 : 1); t.setScale(v ? 0.9 : 1); };
      zone.on('pointerdown', () => set(true));
      zone.on('pointerup', () => set(false));
      zone.on('pointerout', () => set(false));
    };
    // Steering (left side)
    mk(96, H - 110, 52, '‹', COLORS.cyan, 'left');
    mk(220, H - 110, 52, '›', COLORS.cyan, 'right');
    // Throttle / brake / handbrake (right side)
    mk(W - 96, H - 200, 56, '▲', COLORS.lime, 'throttle');
    mk(W - 96, H - 78, 50, '▼', COLORS.orange, 'brake');
    mk(W - 224, H - 120, 52, '✋', COLORS.pink, 'handbrake');
  }

  update() {
    const h = this.gs && this.gs.hud;
    if (!h) return;

    this.scoreText.setText(fmt(h.score));
    const mc = multColor(h.multiplier);
    this.multText.setText('x' + h.multiplier.toFixed(1)).setColor(hex(mc));
    const pulse = h.driftActive ? 1 + Math.sin(this.time.now / 90) * 0.06 : 1;
    this.multText.setScale(pulse);
    this.driftText.setVisible(h.driftActive).setAlpha(0.6 + Math.sin(this.time.now / 80) * 0.4);

    this.cashText.setText('$' + fmt(h.cash));
    this.speedText.setText(h.speed);

    // Progress bar
    const W = this.scale.width;
    const pw = 300;
    const px = W / 2 - pw / 2;
    const py = 54;
    const g = this.progG;
    g.clear();
    g.fillStyle(COLORS.bgDeep, 0.8);
    g.fillRoundedRect(px, py, pw, 10, 5);
    g.fillStyle(this.gs.level.zoneData.accent, 1);
    g.fillRoundedRect(px, py, Math.max(6, pw * Phaser.Math.Clamp(h.progress, 0, 1)), 10, 5);
    g.fillStyle(COLORS.lime, 1);
    g.fillCircle(px + pw, py + 5, 6);

    // Fuel bar
    const H = this.scale.height;
    const fw = 260;
    const fx = 36;
    const fy = H - 58;
    const fg = this.fuelG;
    fg.clear();
    fg.fillStyle(COLORS.bgDeep, 0.85);
    fg.fillRoundedRect(fx, fy, fw, 20, 8);
    let fcol = COLORS.lime;
    if (h.fuel < 0.45) fcol = COLORS.amber;
    if (h.fuel < 0.22) fcol = COLORS.red;
    let alpha = 1;
    if (h.fuelLow) alpha = 0.5 + Math.sin(this.time.now / 120) * 0.5;
    fg.fillStyle(fcol, alpha);
    fg.fillRoundedRect(fx, fy, Math.max(4, fw * Phaser.Math.Clamp(h.fuel, 0, 1)), 20, 8);
    fg.lineStyle(2, fcol, 0.8);
    fg.strokeRoundedRect(fx, fy, fw, 20, 8);
    this.outText.setText(h.outOfFuel ? 'OUT OF FUEL!' : h.fuelLow ? 'LOW FUEL' : '');
  }
}
