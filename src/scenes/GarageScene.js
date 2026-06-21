import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS, CAR_ORDER, COLOR_SCHEMES } from '../config/cars.js';
import { UPGRADES, UPGRADE_ORDER, maxLevel } from '../config/upgrades.js';
import { COLORS, hex, titleStyle, labelStyle, mixColor } from '../config/theme.js';
import { makeCarTexture, addGlow, drawNeonRoundRect } from '../core/neon.js';
import { neonButton, neonPanel, statBar, scanlines, fmt } from '../ui/widgets.js';
import { Backdrop } from '../ui/backdrop.js';
import { applyMenuFX } from '../core/fx.js';

export default class GarageScene extends Phaser.Scene {
  constructor() {
    super('GarageScene');
  }

  create() {
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.backdrop = new Backdrop(this, { sunTop: COLORS.cyan, sunBot: COLORS.purple, grid: COLORS.cyan });
    scanlines(this);
    applyMenuFX(this.cameras.main);
    this.input.keyboard.on('keydown-ESC', () => this._go('MenuScene'));
    this.viewIndex = CAR_ORDER.indexOf(Save.selectedCar);
    if (this.viewIndex < 0) this.viewIndex = 0;

    this.add.text(640, 50, 'GARAGE', { ...titleStyle(48), color: hex(COLORS.white) })
      .setOrigin(0.5).setLetterSpacing(10).setShadow(0, 0, hex(COLORS.cyan), 18, false, true);

    neonButton(this, 110, 50, 160, 50, '‹ MENU', { color: COLORS.purple, fontSize: 20, sfx: 'back' }, () => this._go('MenuScene'));

    this.dyn = this.add.container(0, 0);
    this.build();
  }

  build() {
    this.dyn.removeAll(true);
    const car = CARS[CAR_ORDER[this.viewIndex]];
    const owned = Save.ownsCar(car.id);
    const selected = Save.selectedCar === car.id;
    const ups = Save.getUpgrades(car.id);

    // Cash
    this.dyn.add(this.add.text(1170, 50, `$ ${fmt(Save.cash)}`, { ...titleStyle(30), color: hex(COLORS.lime) }).setOrigin(1, 0.5));

    // ---- Car showcase (left) ----
    const cx = 380;
    const cy = 300;
    this.dyn.add(neonPanel(this, cx - 320, cy - 170, 640, 360, car.color, { fillAlpha: 0.35 }));
    const schemeIdx = Save.getCarColor(car.id);
    const key = makeCarTexture(this, car, schemeIdx);
    const sprite = this.add.image(cx, cy - 30, key).setScale(3.2).setAngle(-18);
    addGlow(sprite, car.color, 6, 0);
    this.tweens.add({ targets: sprite, angle: -12, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.dyn.add(sprite);
    if (!owned) {
      sprite.setTint(0x444466);
      this.dyn.add(this.add.text(cx, cy - 30, '🔒', titleStyle(60)).setOrigin(0.5));
    }

    // Arrows
    this.dyn.add(neonButton(this, cx - 296, cy - 30, 52, 80, '‹', { color: COLORS.cyan, fontSize: 40 }, () => this._cycle(-1)));
    this.dyn.add(neonButton(this, cx + 296, cy - 30, 52, 80, '›', { color: COLORS.cyan, fontSize: 40 }, () => this._cycle(1)));

    // Name + chassis + blurb
    this.dyn.add(this.add.text(cx, cy + 96, car.name, { ...titleStyle(44), color: hex(car.color) }).setOrigin(0.5));
    this.dyn.add(this.add.text(cx, cy + 138, `${car.full} · ${car.chassis}`, labelStyle(18, COLORS.textDim)).setOrigin(0.5));
    this.dyn.add(this.add.text(cx, cy + 178, car.blurb, { ...labelStyle(17, COLORS.text), align: 'center', wordWrap: { width: 560 } }).setOrigin(0.5, 0));

    // Dots indicator
    CAR_ORDER.forEach((id, i) => {
      const dot = this.add.circle(cx - (CAR_ORDER.length - 1) * 9 + i * 18, cy - 156, 5, i === this.viewIndex ? car.color : COLORS.textMute);
      this.dyn.add(dot);
    });

    // ---- Stats + upgrades (right) ----
    const px = 760;
    const pw = 440;
    this.dyn.add(neonPanel(this, px, 120, pw, 250, COLORS.purple, { fillAlpha: 0.4 }));
    this.dyn.add(this.add.text(px + 24, 138, 'PERFORMANCE', labelStyle(18, COLORS.cyan)).setLetterSpacing(4));

    const engLvl = ups.engine || 0;
    const tireLvl = ups.tires || 0;
    const bars = [
      ['SPEED', Phaser.Math.Clamp(car.stats.speed / 100 + engLvl * 0.045, 0, 1), COLORS.pink],
      ['ACCEL', Phaser.Math.Clamp(car.stats.accel / 100 + engLvl * 0.045, 0, 1), COLORS.orange],
      ['GRIP', Phaser.Math.Clamp(car.stats.grip / 100 + tireLvl * 0.05, 0, 1), COLORS.cyan],
      ['WEIGHT', car.stats.weight / 100, COLORS.amber],
    ];
    bars.forEach((b, i) => {
      this.dyn.add(this.add.text(px + 24, 182 + i * 42, b[0], labelStyle(16, COLORS.textDim)));
      this.dyn.add(statBar(this, px + 150, 184 + i * 42, 260, b[1], b[2]));
    });

    // Upgrades panel (owned only)
    this.dyn.add(neonPanel(this, px, 388, pw, 250, COLORS.lime, { fillAlpha: 0.4 }));
    this.dyn.add(this.add.text(px + 24, 404, 'UPGRADES', labelStyle(18, COLORS.lime)).setLetterSpacing(4));

    if (owned) {
      UPGRADE_ORDER.forEach((key2, i) => {
        const y = 448 + i * 58;
        const def = UPGRADES[key2];
        const lvl = ups[key2] || 0;
        const mx = maxLevel(key2);
        this.dyn.add(this.add.text(px + 24, y - 12, def.name, labelStyle(18, COLORS.text)));
        // Level pips
        for (let p = 0; p < mx; p++) {
          const on = p < lvl;
          const pip = this.add.rectangle(px + 150 + p * 22, y - 4, 16, 10, on ? def.color : COLORS.bgDeep)
            .setStrokeStyle(1, def.color, on ? 1 : 0.4);
          this.dyn.add(pip);
        }
        const cost = Save.upgradeCost(car.id, key2);
        if (cost == null) {
          this.dyn.add(this.add.text(px + pw - 24, y - 4, 'MAX', labelStyle(18, COLORS.amber)).setOrigin(1, 0.5));
        } else {
          const can = Save.cash >= cost;
          const btn = neonButton(this, px + pw - 80, y - 4, 110, 40, `$${fmt(cost)}`, { color: can ? def.color : COLORS.textMute, fontSize: 17, sfx: 'purchase' }, () => {
            if (Save.buyUpgrade(car.id, key2)) {
              this.cameras.main.flash(120, 60, 255, 120);
              this.build();
            } else {
              Audio.sfx('back');
            }
          });
          btn.setDisabled(!can);
          this.dyn.add(btn);
        }
      });
    } else {
      this.dyn.add(this.add.text(px + pw / 2, 520, 'Buy this car to tune it.', labelStyle(20, COLORS.textDim)).setOrigin(0.5));
    }

    // ---- Action button ----
    if (!owned) {
      const can = Save.cash >= car.price;
      const btn = neonButton(this, 380, 560, 320, 60, `BUY  ·  $${fmt(car.price)}`, { color: can ? COLORS.lime : COLORS.textMute, fontSize: 26, sfx: 'purchase' }, () => {
        if (Save.buyCar(car.id)) {
          Save.selectCar(car.id);
          this.cameras.main.flash(160, 60, 255, 120);
          this.build();
        } else {
          this.cameras.main.shake(150, 0.004);
          Audio.sfx('back');
        }
      });
      btn.setDisabled(!can);
      this.dyn.add(btn);
    } else if (selected) {
      this.dyn.add(this.add.text(380, 560, '✓ SELECTED', { ...titleStyle(28), color: hex(COLORS.lime) }).setOrigin(0.5));
    } else {
      this.dyn.add(neonButton(this, 380, 560, 320, 60, 'SELECT CAR', { color: COLORS.cyan, fontSize: 26, sfx: 'select' }, () => {
        Save.selectCar(car.id);
        this.build();
      }));
    }

    // ---- Colour-scheme picker (left column, under the action button) ----
    this._colorPicker(car, owned, schemeIdx, 380, 640);
  }

  // Row of 8 two-tone colour swatches for the currently-shown car. Clicking one
  // repaints the showcase sprite and persists the choice via SaveManager.
  _colorPicker(car, owned, current, cx, y) {
    const n = COLOR_SCHEMES.length;
    const sw = 32; // swatch size
    const gap = 9;
    const totalW = n * sw + (n - 1) * gap;
    const x0 = cx - totalW / 2;

    this.dyn.add(this.add.text(cx, y - 30, 'COLOUR', labelStyle(16, COLORS.cyan)).setOrigin(0.5).setLetterSpacing(4));

    COLOR_SCHEMES.forEach((scheme, i) => {
      const sx = x0 + i * (sw + gap) + sw / 2;
      const selected = i === current;
      // Stock swatch shows the car's own livery colours; others show the scheme.
      const prim = scheme.primary == null ? (car.livery?.body ?? car.color) : scheme.primary;
      const sec = scheme.secondary == null ? (car.livery?.accent ?? car.color) : scheme.secondary;

      const g = this.add.graphics();
      // Primary fills the swatch; a secondary corner wedge shows the two-tone.
      g.fillStyle(prim, 1);
      g.fillRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
      g.fillStyle(sec, 1);
      g.fillTriangle(
        sx + sw / 2, y - sw / 2,
        sx + sw / 2, y + sw / 2,
        sx - sw / 2, y + sw / 2,
      );
      // Border: bright + glowing when selected, dim otherwise.
      const bcol = selected ? COLORS.white : mixColor(prim, COLORS.bgDeep, 0.5);
      if (selected) {
        g.lineStyle(5, COLORS.cyan, 0.4);
        g.strokeRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
      }
      g.lineStyle(2, bcol, 1);
      g.strokeRoundedRect(sx - sw / 2, y - sw / 2, sw, sw, 6);
      this.dyn.add(g);

      // Hover ring drawn around the swatch (graphics use absolute coords, so we
      // toggle a separate highlight rather than scaling the graphics object).
      const hover = this.add.graphics();
      hover.lineStyle(2, COLORS.cyan, 1);
      hover.strokeRoundedRect(sx - sw / 2 - 3, y - sw / 2 - 3, sw + 6, sw + 6, 8);
      hover.setVisible(false);
      this.dyn.add(hover);

      const zone = this.add.zone(sx, y, sw + 8, sw + 8).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => hover.setVisible(true));
      zone.on('pointerout', () => hover.setVisible(false));
      zone.on('pointerup', () => {
        if (i === Save.getCarColor(car.id)) return;
        Save.setCarColor(car.id, i);
        Audio.sfx(owned ? 'select' : 'click');
        this.build(); // regenerates the showcase texture under the new key
      });
      this.dyn.add(zone);
    });
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
