import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { getLevelById, nextLevelId } from '../config/levels.js';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { drawStar } from '../ui/widgets.js';
import { neonButton, neonPanel, scanlines, fmt } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';
import { applyMenuFX } from '../core/fx.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.levelId = data.levelId;
    this.result = data.result;
  }

  create() {
    // Never let a bad result object throw out of create() — that escapes Phaser's
    // step and freezes the whole game. Build inside a guard; on failure show a
    // minimal screen that can still navigate out.
    try {
      this._build();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[KANSEI] result screen failed to build — safe fallback:', e);
      this._fallback();
    }
  }

  _build() {
    this.cameras.main.fadeIn(280, 0, 0, 0);
    const level = getLevelById(this.levelId) || { name: '', zoneData: { accent: COLORS.cyan } };
    const zone = level.zoneData || { accent: COLORS.cyan };
    const r = this.result || {};
    r.breakdown = r.breakdown || {};
    if (typeof r.bestMultiplier !== 'number' || !isFinite(r.bestMultiplier)) r.bestMultiplier = 1;
    if (typeof r.score !== 'number' || !isFinite(r.score)) r.score = 0;
    if (typeof r.cash !== 'number' || !isFinite(r.cash)) r.cash = 0;
    this.backdrop = new Backdrop(this, { sunTop: r.cleared ? COLORS.lime : COLORS.red, sunBot: zone.accent, grid: zone.accent });
    scanlines(this);
    applyMenuFX(this.cameras.main);
    this.input.keyboard.on('keydown-ESC', () => this._go('LevelSelectScene'));
    Audio.resume();
    Audio.startMusic();

    const W = this.scale.width;

    // Banner
    const titleColor = r.freeMode ? COLORS.cyan : r.cleared ? COLORS.lime : COLORS.red;
    const bannerText = r.freeMode ? 'FREE RUN' : r.cleared ? 'STAGE CLEAR' : 'OUT OF FUEL';
    this.add.text(W / 2, 90, bannerText, { ...titleStyle(64), color: hex(titleColor) })
      .setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, hex(titleColor), 24, false, true);
    this.add.text(W / 2, 142, level.name, labelStyle(24, COLORS.textDim)).setOrigin(0.5);

    // Stars / lap total / fuel hint
    if (r.freeMode) {
      this.add.text(W / 2, 214, `${r.laps || 0} LAP${(r.laps || 0) === 1 ? '' : 'S'} — keep drifting for a higher score`, labelStyle(22, COLORS.cyan)).setOrigin(0.5);
    } else if (r.cleared) {
      const sy = 220;
      for (let i = 0; i < 3; i++) {
        const on = i < r.stars;
        const s = drawStar(this, W / 2 - 90 + i * 90, sy, 36, on ? COLORS.amber : COLORS.textMute, on);
        s.setScale(0);
        this.tweens.add({ targets: s, scale: 1, ease: 'Back.out', duration: 360, delay: 300 + i * 220, onStart: () => { if (on) Audio.sfx('combo'); } });
      }
    } else {
      this.add.text(W / 2, 214, 'You ran dry. Upgrade your fuel tank in the garage!', labelStyle(20, COLORS.amber)).setOrigin(0.5);
    }

    // Stats panel
    neonPanel(this, W / 2 - 280, 290, 560, 230, zone.accent, { fillAlpha: 0.45 });
    const bd = r.breakdown;
    const distPct = Math.round((r.progress != null ? r.progress : r.cleared ? 1 : 0) * 100);
    const rows = [
      ['DRIFT SCORE', fmt(r.score), COLORS.white],
      ['BEST MULTIPLIER', 'x' + r.bestMultiplier.toFixed(1), COLORS.pink],
      ['DISTANCE REACHED', distPct + '%', r.cleared ? COLORS.lime : COLORS.cyan],
      ['CASH PICKED UP', '$' + fmt(bd.tokens), COLORS.lime],
      ['DRIFT BONUS', '$' + fmt(bd.drift), COLORS.lime],
    ];
    if (r.cleared) {
      rows.push(['FINISH BONUS', '$' + fmt(bd.finish), COLORS.lime]);
      rows.push(['STAR BONUS', '$' + fmt(bd.stars), COLORS.lime]);
    }
    rows.forEach((row, i) => {
      const y = 314 + i * 30;
      this.add.text(W / 2 - 255, y, row[0], labelStyle(19, COLORS.textDim));
      this.add.text(W / 2 + 255, y, row[2] === COLORS.lime || row[1].startsWith('$') ? row[1] : row[1], { ...labelStyle(21, row[2]) }).setOrigin(1, 0);
    });

    // Total cash earned
    this.add.text(W / 2, 540, `+ $${fmt(r.cash)} EARNED`, { ...titleStyle(40), color: hex(COLORS.lime) }).setOrigin(0.5)
      .setShadow(0, 0, hex(COLORS.lime), 16, false, true);
    this.add.text(W / 2, 582, `Balance: $${fmt(Save.cash)}`, labelStyle(20, COLORS.textDim)).setOrigin(0.5);

    // Buttons — RETRY / NEXT / GARAGE / STAGES. NEXT is always shown but greyed
    // out until the level is actually cleared.
    const next = nextLevelId(this.levelId);
    const btnY = 650;
    const xs = [330, 540, 750, 960];
    neonButton(this, xs[0], btnY, 190, 56, '↻ RETRY', { color: COLORS.amber, sfx: 'select' }, () => this._play(this.levelId));
    const nextBtn = neonButton(this, xs[1], btnY, 190, 56, 'NEXT ▶', { color: COLORS.lime, sfx: 'select' }, () => {
      if (r.cleared && next) this._play(next);
    });
    if (!r.cleared || !next) nextBtn.setDisabled(true);
    neonButton(this, xs[2], btnY, 190, 56, '🔧 GARAGE', { color: COLORS.cyan }, () => this._go('GarageScene'));
    neonButton(this, xs[3], btnY, 190, 56, '☰ STAGES', { color: COLORS.purple, sfx: 'back' }, () => this._go('LevelSelectScene'));
    if (!r.cleared) {
      this.add.text(W / 2, btnY + 44, 'Clear the level to continue — try upgrading your car.', labelStyle(15, COLORS.textMute)).setOrigin(0.5);
    }
  }

  // Minimal screen shown if the full results build ever fails — guarantees a way out.
  _fallback() {
    const W = this.scale.width;
    try { this.cameras.main.setBackgroundColor(0x07060f); } catch (_) {}
    this.add.text(W / 2, 250, 'RUN COMPLETE', { ...titleStyle(54), color: hex(COLORS.white) }).setOrigin(0.5);
    this.add.text(W / 2, 312, 'Tap to continue.', labelStyle(20, COLORS.textDim)).setOrigin(0.5);
    neonButton(this, W / 2 - 135, 420, 250, 56, '☰ STAGES', { color: COLORS.purple, sfx: 'back' }, () => this._go('LevelSelectScene'));
    neonButton(this, W / 2 + 135, 420, 250, 56, '🔧 GARAGE', { color: COLORS.cyan }, () => this._go('GarageScene'));
  }

  // Transition on a timer, not the fade-complete event (robust against post-FX).
  _play(levelId) {
    Audio.stopMusic();
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.time.delayedCall(240, () => this.scene.start('GameScene', { levelId }));
  }

  _go(scene) {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.time.delayedCall(220, () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
