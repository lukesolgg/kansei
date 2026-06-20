import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS } from '../config/cars.js';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { makeCarTexture, addGlow } from '../core/neon.js';
import { neonButton, scanlines, fmt } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    if (!Save.current) {
      this.scene.start('ProfileScene');
      return;
    }
    this.cameras.main.fadeIn(220, 0, 0, 0);
    this.backdrop = new Backdrop(this, { sunTop: COLORS.amber, sunBot: COLORS.pink, grid: COLORS.purple });
    scanlines(this);

    // Title
    this.add.text(360, 150, 'KANSEI', { ...titleStyle(96), color: hex(COLORS.white) })
      .setOrigin(0.5).setShadow(0, 0, hex(COLORS.pink), 28, false, true).setLetterSpacing(16);
    this.add.text(360, 214, '慣性 · NEON DRIFT', labelStyle(22, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(10);

    // Featured car
    this._showCar();

    // Buttons
    const bx = 360;
    let by = 340;
    const step = 78;
    neonButton(this, bx, by, 360, 64, '▶  DRIVE', { color: COLORS.lime, fontSize: 30, sfx: 'select' }, () => this._go('LevelSelectScene'));
    neonButton(this, bx, by + step, 360, 64, '🔧  GARAGE', { color: COLORS.cyan, fontSize: 28 }, () => this._go('GarageScene'));
    neonButton(this, bx, by + step * 2, 360, 64, '👤  SWITCH DRIVER', { color: COLORS.purple, fontSize: 24 }, () => {
      Save.logout();
      this._go('ProfileScene');
    });

    // Profile chip (top-right)
    this._profileChip();
    this._settings();

    this.add.text(640, 698, 'Hold SPACE to drift · W/A/S/D or arrows to drive', labelStyle(17, COLORS.textDim))
      .setOrigin(0.5);

    // Resume audio + music on first gesture.
    this.input.once('pointerdown', () => {
      Audio.resume();
      Audio.startMusic();
    });
    Audio.resume();
    Audio.startMusic();
  }

  _showCar() {
    const car = CARS[Save.selectedCar] || CARS.ae86;
    const key = makeCarTexture(this, car);
    const cx = 940;
    const cy = 360;
    const halo = this.add.image(cx, cy, 'spark').setVisible(false);
    const sprite = this.add.image(cx, cy, key).setScale(3.4).setAngle(-20);
    addGlow(sprite, car.color, 6, 0);
    this.tweens.add({ targets: sprite, angle: -14, y: cy - 14, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.text(cx, cy + 150, car.name, { ...titleStyle(40), color: hex(car.color) }).setOrigin(0.5);
    this.add.text(cx, cy + 196, car.chassis, labelStyle(20, COLORS.textDim)).setOrigin(0.5);
  }

  _profileChip() {
    const stars = Save.totalStars();
    this.add.text(1256, 28, Save.current.name, { ...titleStyle(26), color: hex(COLORS.white) }).setOrigin(1, 0);
    this.add.text(1256, 62, `$ ${fmt(Save.cash)}`, labelStyle(22, COLORS.lime)).setOrigin(1, 0);
    this.add.text(1256, 90, `★ ${stars} / 27`, labelStyle(20, COLORS.amber)).setOrigin(1, 0);
  }

  _settings() {
    const mk = (x, key, label) => {
      const btn = neonButton(this, x, 690, 150, 44, '', { color: COLORS.purple, fontSize: 18 }, () => {
        const v = !Save.settings[key];
        Save.setSetting(key, v);
        if (key === 'music') v ? Audio.startMusic() : Audio.stopMusic();
        Audio.refreshVolumes();
        upd();
      });
      const upd = () => btn.setLabel(`${label}: ${Save.settings[key] ? 'ON' : 'OFF'}`);
      upd();
      return btn;
    };
    mk(96, 'sfx', 'SFX');
    mk(258, 'music', 'MUSIC');
  }

  _go(scene) {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
