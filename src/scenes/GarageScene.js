import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS, CAR_ORDER, COLOR_SCHEMES, DECALS, RIMS, GLOWS } from '../config/cars.js';
import { UPGRADES, UPGRADE_ORDER, maxLevel } from '../config/upgrades.js';
import { COLORS, hex, titleStyle, labelStyle, mixColor } from '../config/theme.js';
import { makeCarTexture, addGlow } from '../core/neon.js';
import { neonButton, neonPanel, statBar, scanlines, fmt } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';
import { applyMenuFX } from '../core/fx.js';

export default class GarageScene extends Phaser.Scene {
  constructor() {
    super('GarageScene');
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.backdrop = new Backdrop(this, { sunTop: COLORS.lamp, sunBot: COLORS.amber, grid: COLORS.kerb });
    scanlines(this);
    applyMenuFX(this.cameras.main);
    this.input.keyboard.on('keydown-ESC', () => this._go('MenuScene'));
    this.viewIndex = CAR_ORDER.indexOf(Save.selectedCar);
    if (this.viewIndex < 0) this.viewIndex = 0;
    this.tab = 'tune';

    this.add.text(640, 48, 'GARAGE', { ...titleStyle(46), color: hex(COLORS.white) })
      .setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, hex(COLORS.lamp), 14, false, true);

    neonButton(this, 110, 48, 160, 50, '‹ MENU', { color: COLORS.purple, fontSize: 20, sfx: 'back' }, () => this._go('MenuScene'));

    this.dyn = this.add.container(0, 0);
    this.build();
  }

  build() {
    this.dyn.removeAll(true);
    const car = CARS[CAR_ORDER[this.viewIndex]];
    const owned = Save.ownsCar(car.id);
    const selected = Save.selectedCar === car.id;

    this.dyn.add(this.add.text(1170, 48, `$ ${fmt(Save.cash)}`, { ...titleStyle(28), color: hex(COLORS.lime) }).setOrigin(1, 0.5));

    // ---- Car showcase (left) ----
    const cx = 380;
    const cy = 290;
    this.dyn.add(neonPanel(this, cx - 320, cy - 170, 640, 350, car.color, { fillAlpha: 0.4 }));
    const schemeIdx = Save.getCarColor(car.id);
    const key = makeCarTexture(this, car, schemeIdx); // cosmetics auto-read from Save
    const sprite = this.add.image(cx, cy - 24, key).setScale(3.2).setAngle(-18);
    addGlow(sprite, Save.getGlowColor(car.id), 6, 0);
    this.tweens.add({ targets: sprite, angle: -12, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.dyn.add(sprite);
    if (!owned) {
      sprite.setTint(0x444466);
      this.dyn.add(this.add.text(cx, cy - 24, '🔒', titleStyle(60)).setOrigin(0.5));
    }

    this.dyn.add(neonButton(this, cx - 296, cy - 24, 52, 80, '‹', { color: COLORS.cyan, fontSize: 40 }, () => this._cycle(-1)));
    this.dyn.add(neonButton(this, cx + 296, cy - 24, 52, 80, '›', { color: COLORS.cyan, fontSize: 40 }, () => this._cycle(1)));

    this.dyn.add(this.add.text(cx, cy + 96, car.name, { ...titleStyle(42), color: hex(car.color) }).setOrigin(0.5));
    this.dyn.add(this.add.text(cx, cy + 136, `${car.full} · ${car.chassis}`, labelStyle(17, COLORS.textDim)).setOrigin(0.5));
    CAR_ORDER.forEach((id, i) => {
      this.dyn.add(this.add.circle(cx - (CAR_ORDER.length - 1) * 9 + i * 18, cy - 156, 5, i === this.viewIndex ? car.color : COLORS.textMute));
    });

    // ---- Action button (BUY / SELECT) ----
    if (!owned) {
      const can = Save.cash >= car.price;
      const btn = neonButton(this, cx, cy + 196, 320, 56, `BUY  ·  $${fmt(car.price)}`, { color: can ? COLORS.lime : COLORS.textMute, fontSize: 24, sfx: 'purchase' }, () => {
        if (Save.buyCar(car.id)) { Save.selectCar(car.id); this.cameras.main.flash(160, 60, 255, 120); this.build(); }
        else { this.cameras.main.shake(150, 0.004); Audio.sfx('back'); }
      });
      btn.setDisabled(!can);
      this.dyn.add(btn);
    } else if (selected) {
      this.dyn.add(this.add.text(cx, cy + 196, '✓ SELECTED', { ...titleStyle(26), color: hex(COLORS.lime) }).setOrigin(0.5));
    } else {
      this.dyn.add(neonButton(this, cx, cy + 196, 320, 56, 'SELECT CAR', { color: COLORS.cyan, fontSize: 24, sfx: 'select' }, () => {
        Save.selectCar(car.id); this.build();
      }));
    }

    // ---- Right column: TUNE / STYLE tabs ----
    const px = 950;
    const mkTab = (label, id, tx) => {
      const on = this.tab === id;
      const b = neonButton(this, tx, 118, 150, 46, label, { color: on ? COLORS.cyan : COLORS.textMute, fontSize: 20 }, () => {
        if (this.tab !== id) { this.tab = id; Audio.sfx('click'); this.build(); }
      });
      this.dyn.add(b);
    };
    mkTab('TUNE', 'tune', px - 86);
    mkTab('STYLE', 'style', px + 86);

    if (this.tab === 'tune') this._tunePanel(car, owned, px);
    else this._stylePanel(car, owned, px);
  }

  // ---- TUNE: performance stats + upgrades ----
  _tunePanel(car, owned, px) {
    const pw = 440;
    const ups = Save.getUpgrades(car.id);
    this.dyn.add(neonPanel(this, px - pw / 2, 168, pw, 222, COLORS.cyan, { fillAlpha: 0.4 }));
    this.dyn.add(this.add.text(px - pw / 2 + 24, 184, 'PERFORMANCE', labelStyle(17, COLORS.cyan)).setLetterSpacing(4));
    const engLvl = ups.engine || 0;
    const tireLvl = ups.tires || 0;
    const turboLvl = ups.turbo || 0;
    const bars = [
      ['SPEED', Phaser.Math.Clamp(car.stats.speed / 100 + engLvl * 0.045, 0, 1), COLORS.pink],
      ['ACCEL', Phaser.Math.Clamp(car.stats.accel / 100 + engLvl * 0.045, 0, 1), COLORS.orange],
      ['GRIP', Phaser.Math.Clamp(car.stats.grip / 100 + tireLvl * 0.05, 0, 1), COLORS.cyan],
      ['BOOST', Phaser.Math.Clamp(0.4 + turboLvl * 0.14, 0, 1), COLORS.lime],
    ];
    bars.forEach((b, i) => {
      this.dyn.add(this.add.text(px - pw / 2 + 24, 222 + i * 38, b[0], labelStyle(15, COLORS.textDim)));
      this.dyn.add(statBar(this, px - pw / 2 + 130, 224 + i * 38, 260, b[1], b[2]));
    });

    this.dyn.add(neonPanel(this, px - pw / 2, 404, pw, 250, COLORS.lime, { fillAlpha: 0.4 }));
    this.dyn.add(this.add.text(px - pw / 2 + 24, 420, 'UPGRADES', labelStyle(17, COLORS.lime)).setLetterSpacing(4));
    if (!owned) {
      this.dyn.add(this.add.text(px, 535, 'Buy this car to tune it.', labelStyle(19, COLORS.textDim)).setOrigin(0.5));
      return;
    }
    UPGRADE_ORDER.forEach((key2, i) => {
      const y = 462 + i * 48;
      const def = UPGRADES[key2];
      const lvl = ups[key2] || 0;
      const mx = maxLevel(key2);
      this.dyn.add(this.add.text(px - pw / 2 + 24, y - 11, def.name, labelStyle(17, COLORS.text)));
      for (let p = 0; p < mx; p++) {
        const on = p < lvl;
        this.dyn.add(this.add.rectangle(px - pw / 2 + 150 + p * 20, y - 4, 14, 10, on ? def.color : COLORS.bgDeep).setStrokeStyle(1, def.color, on ? 1 : 0.4));
      }
      const cost = Save.upgradeCost(car.id, key2);
      if (cost == null) {
        this.dyn.add(this.add.text(px + pw / 2 - 24, y - 4, 'MAX', labelStyle(17, COLORS.amber)).setOrigin(1, 0.5));
      } else {
        const can = Save.cash >= cost;
        const btn = neonButton(this, px + pw / 2 - 76, y - 4, 104, 38, `$${fmt(cost)}`, { color: can ? def.color : COLORS.textMute, fontSize: 16, sfx: 'purchase' }, () => {
          if (Save.buyUpgrade(car.id, key2)) { Save.addXp(15); this.cameras.main.flash(120, 60, 255, 120); this.build(); }
          else Audio.sfx('back');
        });
        btn.setDisabled(!can);
        this.dyn.add(btn);
      }
    });
  }

  // ---- STYLE: colour + decal + rims + glow ----
  _stylePanel(car, owned, px) {
    const pw = 440;
    this.dyn.add(neonPanel(this, px - pw / 2, 168, pw, 486, COLORS.pink, { fillAlpha: 0.4 }));
    this._pickerRow(car, 'COLOUR', COLOR_SCHEMES, 'twotone', () => Save.getCarColor(car.id), (i) => Save.setCarColor(car.id, i), px, 210);
    this._pickerRow(car, 'DECAL', DECALS, 'chip', () => Save.getCosmetic(car.id, 'decal'), (i) => Save.setCosmetic(car.id, 'decal', i), px, 320);
    this._pickerRow(car, 'RIMS', RIMS, 'solid', () => Save.getCosmetic(car.id, 'rim'), (i) => Save.setCosmetic(car.id, 'rim', i), px, 470);
    this._pickerRow(car, 'GLOW', GLOWS, 'solid', () => Save.getCosmetic(car.id, 'glow'), (i) => Save.setCosmetic(car.id, 'glow', i), px, 580);
  }

  // A labelled row of selectable options. kind: 'twotone' | 'solid' | 'chip'.
  _pickerRow(car, label, options, kind, getIdx, setIdx, cx, y) {
    const current = getIdx();
    this.dyn.add(this.add.text(cx, y - 30, label, labelStyle(15, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(4));

    if (kind === 'chip') {
      // text chips wrap over up to two rows
      const cols = 3;
      const cw = 124;
      const ch = 34;
      const gx = 8;
      const gy = 8;
      const startX = cx - (cols * cw + (cols - 1) * gx) / 2 + cw / 2;
      options.forEach((o, i) => {
        const sx = startX + (i % cols) * (cw + gx);
        const sy = y + Math.floor(i / cols) * (ch + gy);
        const on = i === current;
        const g = this.add.graphics();
        g.fillStyle(on ? mixColor(COLORS.asphaltDark, COLORS.cyan, 0.3) : COLORS.asphaltDark, 0.9);
        g.fillRoundedRect(sx - cw / 2, sy - ch / 2, cw, ch, 7);
        g.lineStyle(2, on ? COLORS.cyan : mixColor(COLORS.kerb, COLORS.bgDeep, 0.3), 1);
        g.strokeRoundedRect(sx - cw / 2, sy - ch / 2, cw, ch, 7);
        this.dyn.add(g);
        this.dyn.add(this.add.text(sx, sy, o.name, labelStyle(15, on ? COLORS.white : COLORS.textDim)).setOrigin(0.5));
        this._hit(sx, sy, cw, ch, i, current, setIdx);
      });
      return;
    }

    const n = options.length;
    const sw = 34;
    const gap = 8;
    const startX = cx - (n * sw + (n - 1) * gap) / 2 + sw / 2;
    options.forEach((o, i) => {
      const sx = startX + i * (sw + gap);
      const on = i === current;
      const g = this.add.graphics();
      if (kind === 'twotone') {
        const prim = o.primary == null ? (car.livery?.body ?? car.color) : o.primary;
        const sec = o.secondary == null ? (car.livery?.accent ?? car.color) : o.secondary;
        g.fillStyle(prim, 1);
        g.fillRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
        g.fillStyle(sec, 1);
        g.fillTriangle(sx + sw / 2, y - sw / 2, sx + sw / 2, y + sw / 2, sx - sw / 2, y + sw / 2);
      } else {
        // solid swatch; null colour ('Stock') shows the car's own tone
        const col = o.color == null ? mixColor(car.color, COLORS.bgDeep, 0.2) : o.color;
        g.fillStyle(col, 1);
        g.fillRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
        if (o.color == null) {
          g.lineStyle(2, COLORS.textMute, 1);
          g.beginPath();
          g.moveTo(sx - sw / 2 + 4, y + sw / 2 - 4);
          g.lineTo(sx + sw / 2 - 4, y - sw / 2 + 4);
          g.strokePath();
        }
      }
      if (on) {
        g.lineStyle(4, COLORS.cyan, 0.4);
        g.strokeRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
      }
      g.lineStyle(2, on ? COLORS.white : mixColor(COLORS.kerb, COLORS.bgDeep, 0.3), 1);
      g.strokeRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
      this.dyn.add(g);
      this._hit(sx, y, sw + 8, sw + 8, i, current, setIdx);
    });
  }

  _hit(sx, sy, w, h, i, current, setIdx) {
    const zone = this.add.zone(sx, sy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (i === current) return;
      setIdx(i);
      Audio.sfx('select');
      this.build();
    });
    this.dyn.add(zone);
  }

  _cycle(dir) {
    this.viewIndex = (this.viewIndex + dir + CAR_ORDER.length) % CAR_ORDER.length;
    Audio.sfx('click');
    this.build();
  }

  _go(scene) {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
