import Phaser from 'phaser';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { drawNeonRoundRect } from '../core/neon.js';
import { fmt } from '../ui/widgets.js';
import { TOUCH } from '../game/Input.js';

// Colour ramp for a multiplier — cooler when low, hotter as it climbs.
function multColor(m) {
  if (m < 1.5) return COLORS.textDim;
  if (m < 2.5) return COLORS.cyan;
  if (m < 4) return COLORS.lime;
  if (m < 6) return COLORS.amber;
  if (m < 8) return COLORS.orange;
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
    this.add.text(34, 18, 'SCORE', labelStyle(15, COLORS.textDim)).setLetterSpacing(4);
    this.scoreText = this.add
      .text(32, 34, '0', { ...titleStyle(48), color: hex(COLORS.white) })
      .setShadow(0, 0, hex(COLORS.cyan), 14, false, true);

    // Two multipliers under the score — SPEED and DRIFT, each colours by height.
    this.add.text(36, 98, 'SPEED', labelStyle(14, COLORS.textDim)).setLetterSpacing(3);
    this.spMultText = this.add.text(120, 90, '×1.0', { ...titleStyle(30), color: hex(COLORS.textDim) });
    this.drLabel = this.add.text(36, 136, 'DRIFT', labelStyle(14, COLORS.textDim)).setLetterSpacing(3);
    this.drMultText = this.add.text(120, 128, '×1.0', { ...titleStyle(30), color: hex(COLORS.textDim) });

    // Level + progress (top-center)
    this.levelText = this.add
      .text(W / 2, 22, this.gs.level.name.toUpperCase(), { ...titleStyle(22), color: hex(this.gs.level.zoneData.accent) })
      .setOrigin(0.5)
      .setLetterSpacing(3);
    this.lapText = this.add.text(W / 2, 70, '', labelStyle(18, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(3);
    this.progG = this.add.graphics();

    // Cash (top-right)
    this.add.text(W - 34, 20, 'CASH', labelStyle(15, COLORS.lime)).setOrigin(1, 0).setLetterSpacing(4);
    this.cashText = this.add.text(W - 34, 38, '$0', { ...titleStyle(36), color: hex(COLORS.lime) }).setOrigin(1, 0);

    // Speed (bottom-right) + MPH, with a small fuel bar tucked underneath.
    this.speedText = this.add.text(W - 98, H - 72, '0', { ...titleStyle(58), color: hex(COLORS.white) }).setOrigin(1, 1);
    this.add.text(W - 36, H - 78, 'MPH', labelStyle(18, COLORS.textDim)).setOrigin(1, 1).setLetterSpacing(3);
    this.fuelG = this.add.graphics();
    this.outText = this.add.text(W - 36, H - 38, '', labelStyle(13, COLORS.red)).setOrigin(1, 0);

    // Boost charge bar (bottom-center) with a red "perfect release" line at 90%.
    this.boostG = this.add.graphics();
    this.add.text(W / 2, H - 70, 'BOOST', labelStyle(13, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(3);

    // Pause hint (bottom-center)
    this.add.text(W / 2, H - 18, 'ESC to pause', labelStyle(13, COLORS.textMute)).setOrigin(0.5);

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
    // Throttle / brake / handbrake (drift) / boost (right side)
    mk(W - 96, H - 200, 56, '▲', COLORS.lime, 'throttle');
    mk(W - 96, H - 78, 50, '▼', COLORS.orange, 'brake');
    mk(W - 224, H - 120, 52, '✋', COLORS.pink, 'handbrake');
    mk(W - 224, H - 244, 48, '⚡', COLORS.amber, 'boost');
  }

  update() {
    const h = this.gs && this.gs.hud;
    if (!h) return;
    const W = this.scale.width;
    const H = this.scale.height;

    this.scoreText.setText(fmt(h.score));

    // Multipliers
    const sm = h.speedMult || 1;
    this.spMultText.setText('×' + sm.toFixed(1)).setColor(hex(multColor(sm)));
    const dm = h.driftMult || 1;
    this.drMultText.setText('×' + dm.toFixed(1)).setColor(hex(multColor(dm)));
    this.drLabel.setColor(hex(h.driftActive ? COLORS.pink : COLORS.textDim));
    const pulse = h.driftActive ? 1 + Math.sin(this.time.now / 90) * 0.08 : 1;
    this.drMultText.setScale(pulse);

    this.cashText.setText('$' + fmt(h.cash));
    this.speedText.setText(h.speed);
    if (this.lapText) this.lapText.setText(h.freeMode ? 'LAP ' + (h.laps || 0) : '');

    // Progress bar (top-center)
    const pw = 300;
    const px = W / 2 - pw / 2;
    const py = 54;
    const g = this.progG;
    g.clear();
    g.fillStyle(COLORS.bgDeep, 0.8);
    g.fillRoundedRect(px, py, pw, 8, 4);
    g.fillStyle(this.gs.level.zoneData.accent, 1);
    g.fillRoundedRect(px, py, Math.max(6, pw * Phaser.Math.Clamp(h.progress, 0, 1)), 8, 4);
    g.fillStyle(COLORS.lime, 1);
    g.fillCircle(px + pw, py + 4, 5);

    // Small fuel bar tucked under the speed (bottom-right)
    const fw = 200;
    const fh = 11;
    const fx = W - 36 - fw;
    const fy = H - 54;
    const fg = this.fuelG;
    fg.clear();
    fg.fillStyle(COLORS.bgDeep, 0.85);
    fg.fillRoundedRect(fx, fy, fw, fh, 5);
    let fcol = COLORS.lime;
    if (h.fuel < 0.45) fcol = COLORS.amber;
    if (h.fuel < 0.22) fcol = COLORS.red;
    let alpha = 1;
    if (h.fuelLow) alpha = 0.5 + Math.sin(this.time.now / 120) * 0.5;
    fg.fillStyle(fcol, alpha);
    fg.fillRoundedRect(fx, fy, Math.max(4, fw * Phaser.Math.Clamp(h.fuel, 0, 1)), fh, 5);
    fg.lineStyle(2, fcol, 0.7);
    fg.strokeRoundedRect(fx, fy, fw, fh, 5);
    this.outText.setText(h.outOfFuel ? 'OUT OF FUEL!' : h.fuelLow ? 'LOW FUEL' : '');

    // Boost charge bar (bottom-center): fills as you hold a slide; release near the
    // red line (90%) for a PERFECT bonus.
    const bw = 260;
    const bx = W / 2 - bw / 2;
    const by = H - 56;
    const charge = Phaser.Math.Clamp(h.boostCharge || 0, 0, 1);
    const perfectZone = charge >= 0.81 && charge <= 0.99;
    const bg = this.boostG;
    bg.clear();
    bg.fillStyle(COLORS.bgDeep, 0.85);
    bg.fillRoundedRect(bx, by, bw, 12, 6);
    bg.fillStyle(perfectZone ? COLORS.amber : COLORS.cyan, perfectZone ? 1 : 0.9);
    bg.fillRoundedRect(bx, by, Math.max(2, bw * charge), 12, 6);
    // red "perfect release" line at 90%
    bg.fillStyle(COLORS.red, 1);
    bg.fillRect(bx + bw * 0.9 - 1.5, by - 3, 3, 18);
    bg.lineStyle(2, perfectZone ? COLORS.amber : COLORS.cyan, 0.8);
    bg.strokeRoundedRect(bx, by, bw, 12, 6);
  }
}
