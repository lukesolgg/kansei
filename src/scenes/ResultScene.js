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
    this.cameras.main.fadeIn(280, 0, 0, 0);
    const level = getLevelById(this.levelId);
    const zone = level.zoneData;
    const r = this.result;
    this.backdrop = new Backdrop(this, { sunTop: r.cleared ? COLORS.lime : COLORS.red, sunBot: zone.accent, grid: zone.accent });
    scanlines(this);
    applyMenuFX(this.cameras.main);
    Audio.resume();
    Audio.startMusic();

    const W = this.scale.width;

    // Banner
    const titleColor = r.cleared ? COLORS.lime : COLORS.red;
    this.add.text(W / 2, 90, r.cleared ? 'STAGE CLEAR' : 'OUT OF FUEL', { ...titleStyle(64), color: hex(titleColor) })
      .setOrigin(0.5).setLetterSpacing(8).setShadow(0, 0, hex(titleColor), 24, false, true);
    this.add.text(W / 2, 142, level.name, labelStyle(24, COLORS.textDim)).setOrigin(0.5);

    // Stars
    if (r.cleared) {
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
    const rows = [
      ['DRIFT SCORE', fmt(r.score), COLORS.white],
      ['BEST MULTIPLIER', 'x' + r.bestMultiplier.toFixed(1), COLORS.pink],
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

    // Buttons
    const next = nextLevelId(this.levelId);
    const btnY = 650;
    const hasNext = r.cleared && next;
    const xs = hasNext ? [330, 540, 750, 950] : [400, 640, 880];
    let i = 0;
    neonButton(this, xs[i++], btnY, 190, 56, '↻ RETRY', { color: COLORS.amber, sfx: 'select' }, () => this._play(this.levelId));
    if (hasNext) neonButton(this, xs[i++], btnY, 190, 56, 'NEXT ▶', { color: COLORS.lime, sfx: 'select' }, () => this._play(next));
    neonButton(this, xs[i++], btnY, 190, 56, '🔧 GARAGE', { color: COLORS.cyan }, () => this._go('GarageScene'));
    neonButton(this, xs[i++], btnY, 190, 56, '☰ STAGES', { color: COLORS.purple, sfx: 'back' }, () => this._go('LevelSelectScene'));
  }

  _play(levelId) {
    Audio.stopMusic();
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene', { levelId }));
  }

  _go(scene) {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
