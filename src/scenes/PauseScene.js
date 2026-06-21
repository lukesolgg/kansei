import Phaser from 'phaser';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { neonButton } from '../ui/widgets.js';
import { Audio } from '../core/audio.js';

// A dedicated overlay scene for the in-game pause menu. The GameScene camera is
// zoomed + scrolling, which breaks pointer hit-testing on buttons drawn there —
// so the pause menu lives on its own static-camera scene where clicks land
// correctly. It pauses the GameScene underneath and resumes/restarts/quits it.
export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  init(data) {
    this.gameKey = data.gameKey || 'GameScene';
    this.levelId = data.levelId;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0x05040b, 0.72).setOrigin(0, 0);
    this.add
      .text(w / 2, h / 2 - 132, 'PAUSED', { ...titleStyle(64), color: hex(COLORS.cyan) })
      .setOrigin(0.5)
      .setLetterSpacing(8)
      .setShadow(0, 0, hex(COLORS.cyan), 18, false, true);

    const resume = () => this._resume();
    neonButton(this, w / 2, h / 2 - 30, 320, 58, '▶ RESUME', { color: COLORS.lime, sfx: 'select' }, resume);
    neonButton(this, w / 2, h / 2 + 44, 320, 58, '↻ RESTART', { color: COLORS.amber, sfx: 'select' }, () => {
      Audio.stopEngine();
      this.scene.stop('HUDScene');
      this.scene.start(this.gameKey, { levelId: this.levelId });
      this.scene.stop();
    });
    neonButton(this, w / 2, h / 2 + 118, 320, 58, '✕ QUIT TO STAGES', { color: COLORS.red, sfx: 'back' }, () => {
      Audio.stopEngine();
      this.scene.stop('HUDScene');
      this.scene.stop(this.gameKey);
      this.scene.start('LevelSelectScene');
      this.scene.stop();
    });

    this.add.text(w / 2, h / 2 + 196, 'ESC to resume', labelStyle(15, COLORS.textMute)).setOrigin(0.5);
    // Bind ESC-to-resume slightly late so the same keypress that opened the menu
    // doesn't immediately close it.
    this.time.delayedCall(220, () => {
      this.input.keyboard.on('keydown-ESC', resume);
    });
  }

  _resume() {
    this.scene.resume(this.gameKey); // GameScene listens for 'resume' to unpause physics
    this.scene.stop();
  }
}
