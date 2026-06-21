import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS, CAR_ORDER } from '../config/cars.js';
import { COLORS, hex, titleStyle, labelStyle, mixColor } from '../config/theme.js';
import { makeCarTexture, addGlow, drawNeonRoundRect } from '../core/neon.js';
import { fmt } from '../ui/widgets.js';
import { CarParkBackdrop } from '../ui/CarParkBackdrop.js';
import { applyMenuFX } from '../core/fx.js';

// Blue lock tint for cars the player doesn't own yet.
const LOCK_TINT = 0x3a6dff;

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

    // Car-park-under-an-overpass backdrop (menu only). Same construct/update
    // interface as the old neon Backdrop, so it's a drop-in here.
    this.backdrop = new CarParkBackdrop(this);
    applyMenuFX(this.cameras.main);

    // Index into CAR_ORDER for the currently shown / selected car.
    this.viewIndex = CAR_ORDER.indexOf(Save.selectedCar);
    if (this.viewIndex < 0) this.viewIndex = 0;

    // Title (kept up top-left so the car park reads behind it).
    this.add.text(60, 60, 'KANSEI', { ...titleStyle(76), color: hex(COLORS.white) })
      .setOrigin(0, 0.5).setShadow(0, 3, '#000000', 8, false, true).setLetterSpacing(12);
    this.add.text(64, 112, '慣性 · NIGHT MEET', labelStyle(20, COLORS.lamp)).setOrigin(0, 0.5).setLetterSpacing(8);

    // Hero car + carousel (left half), buttons (right half), profile + level (top-right).
    this._heroAndCarousel();
    this._buttons();
    this._profileChip();

    this.add.text(640, 700, 'Click a car to select · arrows to browse · Hold SPACE to drift', labelStyle(16, COLORS.textDim))
      .setOrigin(0.5);

    // Resume audio + music on first gesture.
    this.input.once('pointerdown', () => {
      Audio.resume();
      Audio.startMusic();
    });
    Audio.resume();
    Audio.startMusic();
  }

  // ---- Hero car (smaller, up + left) with a carousel of the others -------
  _heroAndCarousel() {
    this.heroLayer = this.add.container(0, 0);
    this.carouselLayer = this.add.container(0, 0);
    this._drawHero();
    this._drawCarousel();
  }

  _currentCar() {
    return CARS[CAR_ORDER[this.viewIndex]] || CARS.ae86;
  }

  _drawHero() {
    this.heroLayer.removeAll(true);
    const car = this._currentCar();
    // ~50% smaller than the old menu (was scale 3.4) and moved UP + LEFT.
    const cx = 380;
    const cy = 286;
    const scheme = Save.getCarColor(car.id);
    const key = makeCarTexture(this, car, scheme);

    // Soft platform shadow so the hero sits on the car-park floor.
    const shadow = this.add.ellipse(cx, cy + 92, 230, 46, 0x000000, 0.32);
    this.heroLayer.add(shadow);

    const sprite = this.add.image(cx, cy, key).setScale(1.7).setAngle(-18);
    addGlow(sprite, car.color, 5, 0);
    this.tweens.add({ targets: sprite, angle: -12, y: cy - 10, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.heroLayer.add(sprite);

    // Name + chassis under the hero.
    this.heroLayer.add(this.add.text(cx, cy + 120, car.name, { ...titleStyle(38), color: hex(car.color) })
      .setOrigin(0.5).setShadow(0, 2, '#000000', 6, false, true));
    this.heroLayer.add(this.add.text(cx, cy + 158, car.chassis, labelStyle(17, COLORS.textDim)).setOrigin(0.5));

    // Owned / price tag.
    if (Save.ownsCar(car.id)) {
      this.heroLayer.add(this.add.text(cx, cy + 186, '✓ OWNED', labelStyle(16, COLORS.lime)).setOrigin(0.5).setLetterSpacing(2));
    } else {
      this.heroLayer.add(this.add.text(cx, cy + 186, `LOCKED · $${fmt(car.price)}`, labelStyle(16, COLORS.lamp))
        .setOrigin(0.5).setLetterSpacing(2));
    }
  }

  _drawCarousel() {
    this.carouselLayer.removeAll(true);
    const n = CAR_ORDER.length;
    const cellW = 96;
    const gap = 12;
    const totalW = n * cellW + (n - 1) * gap;
    const x0 = 380 - totalW / 2 + cellW / 2;
    const y = 520;

    // Prev / next arrows flanking the row.
    this.carouselLayer.add(this._arrow(x0 - cellW / 2 - 34, y, '‹', () => this._cycle(-1)));
    this.carouselLayer.add(this._arrow(x0 + totalW - cellW / 2 + 34, y, '›', () => this._cycle(1)));

    CAR_ORDER.forEach((id, i) => {
      const car = CARS[id];
      const cx = x0 + i * (cellW + gap);
      const selected = i === this.viewIndex;
      const owned = Save.ownsCar(id);
      const cell = this.add.container(cx, y);

      // Card frame: brighter + accent-glowing when this is the selected car.
      const frame = this.add.graphics();
      drawNeonRoundRect(frame, -cellW / 2, -36, cellW, 72, 10, selected ? car.color : COLORS.kerb, {
        fill: selected ? mixColor(COLORS.asphalt, car.color, 0.18) : COLORS.asphaltDark,
        fillAlpha: 0.92,
        lineWidth: selected ? 3 : 2,
        glow: selected,
        glowAlpha: 0.3,
      });
      cell.add(frame);

      // Mini car sprite using the player's chosen colour scheme.
      const key = makeCarTexture(this, car, Save.getCarColor(id));
      const mini = this.add.image(0, -2, key).setScale(0.62).setAngle(-14);
      if (!owned) mini.setTint(LOCK_TINT); // blue overlay for unowned cars
      cell.add(mini);

      // Ownership marker: green tick (owned) or padlock (locked).
      if (owned) {
        cell.add(this.add.text(cellW / 2 - 14, -24, '✓', { ...titleStyle(18), color: hex(COLORS.lime) }).setOrigin(0.5));
      } else {
        cell.add(this.add.text(cellW / 2 - 14, -24, '🔒', labelStyle(15, COLORS.text)).setOrigin(0.5));
      }

      // Name caption.
      cell.add(this.add.text(0, 26, car.name, labelStyle(13, selected ? COLORS.white : COLORS.textDim)).setOrigin(0.5));

      // Click to select this car.
      const zone = this.add.zone(0, 0, cellW, 80).setOrigin(0.5).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { if (i !== this.viewIndex) this.tweens.add({ targets: cell, scale: 1.07, duration: 90 }); });
      zone.on('pointerout', () => this.tweens.add({ targets: cell, scale: 1, duration: 90 }));
      zone.on('pointerup', () => this._select(i));
      cell.add(zone);
      if (selected) cell.setScale(1.08);

      this.carouselLayer.add(cell);
    });
  }

  _arrow(x, y, glyph, onClick) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawNeonRoundRect(g, -22, -28, 44, 56, 10, COLORS.lamp, {
      fill: COLORS.asphaltDark, fillAlpha: 0.9, lineWidth: 2, glow: true, glowAlpha: 0.22,
    });
    const t = this.add.text(0, -2, glyph, { ...titleStyle(34), color: hex(COLORS.lamp) }).setOrigin(0.5);
    const zone = this.add.zone(0, 0, 48, 60).setOrigin(0.5).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.12, duration: 90 }));
    zone.on('pointerout', () => this.tweens.add({ targets: c, scale: 1, duration: 90 }));
    zone.on('pointerup', () => { Audio.sfx('click'); onClick(); });
    c.add([g, t, zone]);
    return c;
  }

  _cycle(dir) {
    const n = CAR_ORDER.length;
    this._select((this.viewIndex + dir + n) % n);
  }

  // Change the hero / selected car. Selecting persists only when the car is
  // owned (you can still browse locked cars to preview them).
  _select(i) {
    const changed = i !== this.viewIndex;
    this.viewIndex = i;
    const id = CAR_ORDER[i];
    if (Save.ownsCar(id)) {
      Save.selectCar(id); // persists Save.selectedCar
      Audio.sfx('select');
    } else if (changed) {
      Audio.sfx('click');
    }
    this._drawHero();
    this._drawCarousel();
  }

  // ---- Nicer main menu buttons (right column) ----------------------------
  _buttons() {
    const defs = [
      { label: '▶  DRIVE', sub: 'Hit the touge', color: COLORS.lime, fontSize: 30, action: () => this._go('LevelSelectScene'), sfx: 'select' },
      { label: '🔧  GARAGE', sub: 'Tune & repaint', color: COLORS.lamp, fontSize: 26, action: () => this._go('GarageScene') },
      { label: '⚙  SETTINGS', sub: 'Audio & display', color: COLORS.kerb, fontSize: 24, action: () => this._go('SettingsScene') },
      { label: '👤  SWITCH DRIVER', sub: 'Change profile', color: COLORS.textDim, fontSize: 22, action: () => { Save.logout(); this._go('ProfileScene'); } },
    ];
    const bx = 980;
    const bw = 420;
    const bh = 78;
    let by = 250;
    const step = 96;
    defs.forEach((d) => {
      this._menuButton(bx, by, bw, bh, d);
      by += step;
    });
  }

  // A chunky, two-line "garage plate" button matching the street/pixel look.
  _menuButton(x, y, w, h, d) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      // Outer plate.
      drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 14, d.color, {
        fill: hover ? mixColor(COLORS.asphalt, d.color, 0.16) : COLORS.asphaltDark,
        fillAlpha: 0.95,
        lineWidth: hover ? 3 : 2,
        glow: true,
        glowAlpha: hover ? 0.34 : 0.18,
      });
      // Left accent stripe (like a painted bay marker).
      g.fillStyle(d.color, hover ? 1 : 0.85);
      g.fillRoundedRect(-w / 2 + 10, -h / 2 + 12, 8, h - 24, 4);
    };
    draw(false);

    const main = this.add.text(-w / 2 + 38, -10, d.label, {
      ...titleStyle(d.fontSize), color: hex(COLORS.white),
    }).setOrigin(0, 0.5).setShadow(0, 2, '#000000', 4, false, true);
    const sub = this.add.text(-w / 2 + 40, 18, d.sub, labelStyle(15, COLORS.textDim)).setOrigin(0, 0.5).setLetterSpacing(2);

    const zone = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => { draw(true); main.setColor(hex(d.color)); this.tweens.add({ targets: c, x: x + 6, duration: 90 }); });
    zone.on('pointerout', () => { draw(false); main.setColor(hex(COLORS.white)); this.tweens.add({ targets: c, x, duration: 90 }); });
    zone.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.98, duration: 60 }));
    zone.on('pointerup', () => {
      Audio.resume();
      Audio.sfx(d.sfx || 'click');
      this.tweens.add({ targets: c, scale: 1, duration: 60 });
      d.action();
    });

    c.add([g, main, sub, zone]);
    return c;
  }

  // ---- Driver name + cash + LEVEL & XP bar (top-right) -------------------
  _profileChip() {
    const right = 1220;
    const top = 30;
    this.add.text(right, top, Save.current.name, { ...titleStyle(28), color: hex(COLORS.white) })
      .setOrigin(1, 0).setShadow(0, 2, '#000000', 4, false, true);
    this.add.text(right, top + 38, `$ ${fmt(Save.cash)}`, labelStyle(22, COLORS.lime)).setOrigin(1, 0);
    this.add.text(right, top + 66, `★ ${Save.totalStars()} / 27`, labelStyle(19, COLORS.amber)).setOrigin(1, 0);

    // Level badge + XP progress bar.
    const lv = Save.getLevel();
    const barW = 260;
    const barH = 16;
    const barX = right - barW;
    const barY = top + 104;

    // "LV n" badge to the left of the bar.
    const badgeW = 64;
    const bg = this.add.graphics();
    drawNeonRoundRect(bg, barX - badgeW - 10, barY - 6, badgeW, barH + 12, 8, COLORS.lamp, {
      fill: COLORS.asphaltDark, fillAlpha: 0.95, lineWidth: 2, glow: true, glowAlpha: 0.26,
    });
    this.add.text(barX - badgeW - 10 + badgeW / 2, barY + barH / 2 - 1, `LV ${lv.level}`,
      { ...titleStyle(18), color: hex(COLORS.lamp) }).setOrigin(0.5);

    // XP track + fill.
    const track = this.add.graphics();
    track.fillStyle(COLORS.bgDeep, 0.92);
    track.fillRoundedRect(barX, barY, barW, barH, barH / 2);
    track.lineStyle(2, mixColor(COLORS.lamp, COLORS.bgDeep, 0.4), 0.9);
    track.strokeRoundedRect(barX, barY, barW, barH, barH / 2);
    const fillW = Math.max(barH, barW * lv.progress);
    track.fillStyle(COLORS.lamp, 1);
    track.fillRoundedRect(barX, barY, fillW, barH, barH / 2);
    track.fillStyle(mixColor(COLORS.lamp, COLORS.white, 0.5), 0.8);
    track.fillRoundedRect(barX, barY, fillW, barH / 2, barH / 2); // glossy top half

    this.add.text(barX + barW, barY + barH + 4, `${fmt(lv.xpInto)} / ${fmt(lv.xpForNext)} XP`,
      labelStyle(13, COLORS.textDim)).setOrigin(1, 0);
  }

  _go(scene) {
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  update(_, delta) {
    if (this.backdrop) this.backdrop.update(delta / 1000);
  }
}
