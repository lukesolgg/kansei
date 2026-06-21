import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS } from '../config/cars.js';
import { COLORS, FONTS, hex, titleStyle, labelStyle } from '../config/theme.js';
import { makeCarTexture, drawNeonRoundRect } from '../core/neon.js';
import { neonButton, scanlines, fmt, starRow } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';
import { applyMenuFX } from '../core/fx.js';

export default class ProfileScene extends Phaser.Scene {
  constructor() {
    super('ProfileScene');
  }

  create() {
    this.backdrop = new Backdrop(this, { sunTop: COLORS.cyan, sunBot: COLORS.pink, grid: COLORS.purple });
    scanlines(this);
    applyMenuFX(this.cameras.main);

    this.add
      .text(640, 78, 'KANSEI', { ...titleStyle(74), color: hex(COLORS.white) })
      .setOrigin(0.5)
      .setShadow(0, 0, hex(COLORS.pink), 24, false, true)
      .setLetterSpacing(14);
    this.add
      .text(640, 134, 'SELECT DRIVER', labelStyle(22, COLORS.cyan))
      .setOrigin(0.5)
      .setLetterSpacing(8);

    this.layer = this.add.container(0, 0);
    this.keyHandler = null;
    this.showList();
    this.input.keyboard.on('keydown-ESC', () => this.showList());

    this.events.on('shutdown', () => this._removeKeyHandler());
  }

  update(_, delta) {
    this.backdrop.update(delta / 1000);
  }

  _removeKeyHandler() {
    if (this.keyHandler) {
      this.input.keyboard.off('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  clearLayer() {
    this._removeKeyHandler();
    this.layer.removeAll(true);
  }

  // ---- Profile list ------------------------------------------------------
  showList() {
    this.clearLayer();
    const profiles = Save.listProfiles();

    if (profiles.length === 0) {
      this.layer.add(
        this.add
          .text(640, 330, 'No drivers yet. Create one to start your career.', labelStyle(22, COLORS.textDim))
          .setOrigin(0.5),
      );
    }

    const cols = 2;
    const cardW = 384;
    const cardH = 92;
    const gapX = 36;
    const gapY = 22;
    const startX = 640 - ((cols * cardW + (cols - 1) * gapX) / 2) + cardW / 2;
    const startY = 232;
    profiles.forEach((p, i) => {
      const cx = startX + (i % cols) * (cardW + gapX);
      const cy = startY + Math.floor(i / cols) * (cardH + gapY);
      this.layer.add(this._profileCard(p, cx, cy, cardW, cardH));
    });

    const newY = 232 + Math.ceil(Math.max(profiles.length, 1) / cols) * (cardH + gapY) + 14;
    this.layer.add(
      neonButton(this, 640, Math.min(newY, 624), 320, 60, '+ NEW DRIVER', { color: COLORS.lime, fontSize: 24 }, () =>
        this.showCreate(),
      ),
    );
  }

  _profileCard(p, x, y, w, h) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const accent = CARS[p.selectedCar]?.color || COLORS.cyan;
    drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 14, accent, { fillAlpha: 0.5, glowAlpha: 0.16 });
    c.add(g);

    const carKey = makeCarTexture(this, CARS[p.selectedCar] || CARS.ae86);
    const icon = this.add.image(-w / 2 + 56, 0, carKey).setScale(0.6).setAngle(-12);
    c.add(icon);

    c.add(this.add.text(-w / 2 + 110, -h / 2 + 16, p.name, { ...titleStyle(26), color: hex(COLORS.white) }).setOrigin(0, 0));
    c.add(this.add.text(-w / 2 + 112, 12, `$${fmt(p.cash)}`, labelStyle(18, COLORS.lime)).setOrigin(0, 0));

    const stars = Object.values(p.levels || {}).reduce((s, l) => s + (l.stars || 0), 0);
    c.add(this.add.text(w / 2 - 18, 14, `★ ${stars}`, labelStyle(18, COLORS.amber)).setOrigin(1, 0));
    if (p.pin) c.add(this.add.text(w / 2 - 18, -h / 2 + 14, '🔒', labelStyle(16)).setOrigin(1, 0));

    // Whole card selects (minus the delete hot-corner).
    const zone = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.03, duration: 90 }));
    zone.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    zone.on('pointerup', () => {
      Audio.resume();
      Audio.sfx('select');
      this.handleSelect(p);
    });
    c.add(zone);

    const del = this.add.text(w / 2 - 16, h / 2 - 22, '✕', labelStyle(18, COLORS.red)).setOrigin(0.5).setInteractive({ useHandCursor: true });
    del.on('pointerup', (pointer, lx, ly, e) => {
      e?.stopPropagation?.();
      this.confirmDelete(p);
    });
    c.add(del);
    return c;
  }

  handleSelect(p) {
    if (Save.requiresPin(p.id)) {
      this.showPin(p);
    } else {
      Save.login(p.id, '');
      this._enter();
    }
  }

  confirmDelete(p) {
    this.clearLayer();
    this.layer.add(this.add.text(640, 300, `Delete driver “${p.name}”?`, { ...titleStyle(34), color: hex(COLORS.white) }).setOrigin(0.5));
    this.layer.add(this.add.text(640, 350, 'This cannot be undone.', labelStyle(20, COLORS.textDim)).setOrigin(0.5));
    this.layer.add(neonButton(this, 520, 440, 220, 60, 'DELETE', { color: COLORS.red }, () => {
      Save.deleteProfile(p.id);
      this.showList();
    }));
    this.layer.add(neonButton(this, 760, 440, 220, 60, 'CANCEL', { color: COLORS.cyan }, () => this.showList()));
  }

  _enter() {
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
  }

  // ---- Create driver -----------------------------------------------------
  showCreate() {
    this.clearLayer();
    this.name = '';
    this.pin = '';
    const errText = this.add.text(640, 168, '', labelStyle(18, COLORS.red)).setOrigin(0.5);
    this.layer.add(errText);

    this.layer.add(this.add.text(640, 210, 'DRIVER NAME', labelStyle(18, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(4));
    const nameG = this.add.graphics();
    drawNeonRoundRect(nameG, 640 - 240, 232, 480, 56, 12, COLORS.cyan, { fillAlpha: 0.5 });
    this.layer.add(nameG);
    const nameText = this.add.text(640, 260, '', { ...titleStyle(28), color: hex(COLORS.white) }).setOrigin(0.5);
    this.layer.add(nameText);
    const cursor = this.add.text(640, 260, '', titleStyle(28)).setOrigin(0, 0.5);
    this.layer.add(cursor);
    this.tweens.add({ targets: cursor, alpha: { from: 1, to: 0 }, duration: 500, yoyo: true, repeat: -1 });

    const refreshName = () => {
      nameText.setText(this.name || '');
      cursor.setText('|');
      cursor.setX(nameText.x + nameText.width / 2 + 4);
      if (!this.name) {
        nameText.setText('');
        cursor.setX(640 - 6);
      }
    };
    refreshName();

    // Keyboard capture for the name.
    this.keyHandler = (e) => {
      if (e.key === 'Backspace') {
        this.name = this.name.slice(0, -1);
      } else if (e.key === 'Enter') {
        doCreate();
        return;
      } else if (e.key.length === 1 && /[a-zA-Z0-9 _-]/.test(e.key) && this.name.length < 14) {
        this.name += e.key;
      }
      refreshName();
    };
    this.input.keyboard.on('keydown', this.keyHandler);

    // Optional PIN.
    this.layer.add(this.add.text(640, 330, 'OPTIONAL 4-DIGIT PIN', labelStyle(18, COLORS.amber)).setOrigin(0.5).setLetterSpacing(4));
    const pinDots = this.add.text(640, 364, '— — — —', { ...titleStyle(30), color: hex(COLORS.amber) }).setOrigin(0.5).setLetterSpacing(6);
    this.layer.add(pinDots);
    const refreshPin = () => {
      const d = [];
      for (let i = 0; i < 4; i++) d.push(i < this.pin.length ? '●' : '—');
      pinDots.setText(d.join(' '));
    };
    this.layer.add(this._keypad(640, 400, (digit) => {
      if (digit === 'back') this.pin = this.pin.slice(0, -1);
      else if (this.pin.length < 4) this.pin += digit;
      refreshPin();
    }));

    const doCreate = () => {
      const res = Save.createProfile(this.name, this.pin.length === 4 ? this.pin : '');
      if (res.error) {
        errText.setText(res.error);
        Audio.sfx('back');
        return;
      }
      Audio.sfx('purchase');
      this._enter();
    };

    this.layer.add(neonButton(this, 520, 654, 220, 56, 'CREATE', { color: COLORS.lime }, doCreate));
    this.layer.add(neonButton(this, 760, 654, 220, 56, 'BACK', { color: COLORS.cyan, sfx: 'back' }, () => this.showList()));
  }

  // ---- PIN login ---------------------------------------------------------
  showPin(p) {
    this.clearLayer();
    this.pin = '';
    this.layer.add(this.add.text(640, 220, `Welcome back, ${p.name}`, { ...titleStyle(34), color: hex(COLORS.white) }).setOrigin(0.5));
    this.layer.add(this.add.text(640, 268, 'ENTER PIN', labelStyle(20, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(6));
    const err = this.add.text(640, 300, '', labelStyle(18, COLORS.red)).setOrigin(0.5);
    this.layer.add(err);
    const dots = this.add.text(640, 338, '— — — —', { ...titleStyle(34), color: hex(COLORS.amber) }).setOrigin(0.5).setLetterSpacing(8);
    this.layer.add(dots);
    const refresh = () => {
      const d = [];
      for (let i = 0; i < 4; i++) d.push(i < this.pin.length ? '●' : '—');
      dots.setText(d.join(' '));
    };
    const tryLogin = () => {
      if (Save.login(p.id, this.pin)) {
        Audio.sfx('select');
        this._enter();
      } else {
        err.setText('Wrong PIN');
        this.pin = '';
        refresh();
        Audio.sfx('back');
        this.cameras.main.shake(150, 0.004);
      }
    };
    this.layer.add(this._keypad(640, 376, (digit) => {
      if (digit === 'back') this.pin = this.pin.slice(0, -1);
      else if (this.pin.length < 4) this.pin += digit;
      refresh();
      if (this.pin.length === 4) this.time.delayedCall(120, tryLogin);
    }));
    this.layer.add(neonButton(this, 640, 660, 220, 56, 'BACK', { color: COLORS.cyan, sfx: 'back' }, () => this.showList()));
  }

  // Numeric keypad: 1-9, then ⌫ 0 (returns a container).
  _keypad(cx, top, onPress) {
    const c = this.add.container(0, 0);
    const bw = 84;
    const bh = 56;
    const gap = 12;
    const layout = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['back', '0', null],
    ];
    layout.forEach((row, r) => {
      row.forEach((key, col) => {
        if (key === null) return;
        const x = cx + (col - 1) * (bw + gap);
        const y = top + r * (bh + gap);
        const label = key === 'back' ? '⌫' : key;
        const color = key === 'back' ? COLORS.red : COLORS.cyan;
        c.add(neonButton(this, x, y, bw, bh, label, { color, fontSize: 26 }, () => onPress(key)));
      });
    });
    return c;
  }
}
