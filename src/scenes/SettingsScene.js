import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { COLORS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { neonButton, neonPanel, slider, scanlines } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';
import { applyMenuFX } from '../core/fx.js';

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene');
  }

  init(data) {
    this.from = (data && data.from) || 'MenuScene';
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.backdrop = new Backdrop(this, { sunTop: COLORS.cyan, sunBot: COLORS.purple, grid: COLORS.cyan });
    scanlines(this);
    applyMenuFX(this.cameras.main);
    Audio.resume();
    this.input.keyboard.on('keydown-ESC', () => this._back());

    this.add.text(640, 56, 'SETTINGS', { ...titleStyle(48), color: hex(COLORS.white) })
      .setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, hex(COLORS.cyan), 18, false, true);
    neonButton(this, 110, 52, 160, 50, '‹ BACK', { color: COLORS.purple, fontSize: 20, sfx: 'back' }, () => this._back());

    const s = Save.settings;

    // ---- Audio ----
    neonPanel(this, 200, 120, 880, 230, COLORS.cyan, { fillAlpha: 0.4 });
    this.add.text(240, 140, 'AUDIO', labelStyle(20, COLORS.cyan)).setLetterSpacing(4);
    const mkSlider = (y, label, get, set, preview) => {
      this.add.text(240, y, label, labelStyle(20, COLORS.text)).setOrigin(0, 0.5);
      const valText = this.add.text(1040, y, Math.round(get() * 100) + '%', labelStyle(20, COLORS.lime)).setOrigin(1, 0.5);
      slider(this, 470, y, 500, get(), COLORS.cyan, (v) => {
        set(v);
        valText.setText(Math.round(v * 100) + '%');
        if (preview) { Audio.resume(); Audio.sfx('click'); }
      });
    };
    mkSlider(196, 'Master Volume', () => s.masterVolume, (v) => { Save.setSetting('masterVolume', v); Audio.setMasterVolume(v); });
    mkSlider(248, 'Music Volume', () => s.musicVolume, (v) => { Save.setSetting('musicVolume', v); Audio.setMusicVolume(v); });
    mkSlider(300, 'SFX Volume', () => s.sfxVolume, (v) => { Save.setSetting('sfxVolume', v); Audio.setSfxVolume(v); }, true);

    // ---- Display & feel ----
    neonPanel(this, 200, 376, 880, 264, COLORS.pink, { fillAlpha: 0.4 });
    this.add.text(240, 396, 'DISPLAY & FEEL', labelStyle(20, COLORS.pink)).setLetterSpacing(4);
    const mkToggle = (x, y, label, key, onChange) => {
      const btn = neonButton(this, x, y, 300, 52, '', { color: COLORS.pink, fontSize: 19 }, () => {
        const v = !Save.settings[key];
        Save.setSetting(key, v);
        upd();
        onChange && onChange(v);
      });
      const upd = () => btn.setLabel(`${label}: ${Save.settings[key] ? 'ON' : 'OFF'}`);
      upd();
      return btn;
    };
    mkToggle(400, 452, 'Screen Shake', 'shake');
    mkToggle(740, 452, 'Post-FX Bloom', 'postfx');
    mkToggle(400, 516, 'Reduce Motion', 'reduceMotion');
    mkToggle(740, 516, 'Music', 'music', () => Audio.refreshVolumes());
    mkToggle(400, 580, 'Sound FX', 'sfx', () => Audio.refreshVolumes());
    neonButton(this, 740, 580, 300, 52, this.scale.isFullscreen ? '⛶ EXIT FULLSCREEN' : '⛶ FULLSCREEN', { color: COLORS.lime, fontSize: 19 }, (btn) => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    });

    this.add.text(640, 678, 'Changes save automatically · Post-FX applies on next screen', labelStyle(15, COLORS.textDim)).setOrigin(0.5);
  }

  _back() {
    Audio.refreshVolumes();
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(this.from));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
