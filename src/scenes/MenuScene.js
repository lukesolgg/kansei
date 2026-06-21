import Phaser from 'phaser';
import { Save } from '../core/SaveManager.js';
import { Audio } from '../core/audio.js';
import { CARS, CAR_ORDER } from '../config/cars.js';
import { COLORS, hex, titleStyle, labelStyle, mixColor } from '../config/theme.js';
import { makeCarTexture, addGlow, drawNeonRoundRect } from '../core/neon.js';
import { fmt } from '../ui/widgets.js';
import { CarParkBackdrop } from '../ui/CarParkBackdrop.js';
import { MenuAmbiance, cinematicFrame } from '../ui/MenuAmbiance.js';
import { applyMenuFX } from '../core/fx.js';
import { LEVELS } from '../config/levels.js';

// Blue lock tint for cars the player doesn't own yet.
const LOCK_TINT = 0x3a6dff;

// Hero showcase anchor (left third of the 1280x720 stage).
const HERO_X = 372;
const HERO_Y = 312;

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    if (!Save.current) {
      this.scene.start('ProfileScene');
      return;
    }
    this.cameras.main.fadeIn(260, 0, 0, 0);
    this.reduceMotion = !!Save.settings.reduceMotion;

    // Living car-park-under-an-overpass backdrop (menu only).
    this.backdrop = new CarParkBackdrop(this);
    // Foreground atmosphere: drifting dust motes + light rain.
    this.ambiance = new MenuAmbiance(this, { depth: -6 });
    applyMenuFX(this.cameras.main);

    // Index into CAR_ORDER for the currently shown / selected car.
    this.viewIndex = CAR_ORDER.indexOf(Save.selectedCar);
    if (this.viewIndex < 0) this.viewIndex = 0;

    // Animated hero handles (idle bob, underglow pulse, exhaust timing).
    this._heroAnim = { t: 0, puff: 1.4, sprite: null, underglow: null, exhaust: null };

    this._title();
    this._heroAndCarousel();
    this._profileCard();
    this._cta();
    this._engagement();
    this._hint();

    // Cinematic frame on top (letterbox + vignette).
    this.frame = cinematicFrame(this, { depth: 900, bar: 24 });

    this._entrance();

    // Resume audio + music on first gesture.
    this.input.once('pointerdown', () => {
      Audio.resume();
      Audio.startMusic();
    });
    Audio.resume();
    Audio.startMusic();
  }

  // ---- Title (top-left wordmark) -----------------------------------------
  _title() {
    this.titleLayer = this.add.container(0, 0).setDepth(40);
    const t = this.add.text(60, 58, 'KANSEI', { ...titleStyle(78), color: hex(COLORS.white) })
      .setOrigin(0, 0.5).setShadow(0, 3, '#000000', 10, false, true).setLetterSpacing(12);
    addGlow(t, COLORS.lamp, 4, 0, 0.2);
    const sub = this.add.text(64, 112, '慣性 · NIGHT MEET', labelStyle(20, COLORS.lamp))
      .setOrigin(0, 0.5).setLetterSpacing(8);
    this.titleLayer.add([t, sub]);
    this._titleParts = [t, sub];
  }

  // ---- Hero car (cinematic showcase) + filmstrip carousel ----------------
  _heroAndCarousel() {
    this.heroLayer = this.add.container(0, 0).setDepth(20);
    this.carouselLayer = this.add.container(0, 0).setDepth(22);
    this._heroStage();
    this._drawHero();
    this._drawCarousel();
  }

  _currentCar() {
    return CARS[CAR_ORDER[this.viewIndex]] || CARS.ae86;
  }

  // Static "stage" furniture that doesn't change as you cycle cars: the
  // spotlight cone from above and a soft pedestal glow. Drawn once.
  _heroStage() {
    const g = this.add.graphics().setDepth(18);
    // Spotlight cone descending onto the hero from the deck lights above.
    const topY = 96;
    const topHalf = 26;
    const botY = HERO_Y + 96;
    const botHalf = 196;
    g.fillStyle(mixColor(COLORS.lamp, COLORS.white, 0.2), 0.05);
    g.beginPath();
    g.moveTo(HERO_X - topHalf, topY);
    g.lineTo(HERO_X + topHalf, topY);
    g.lineTo(HERO_X + botHalf, botY);
    g.lineTo(HERO_X - botHalf, botY);
    g.closePath();
    g.fillPath();
    g.fillStyle(mixColor(COLORS.lamp, COLORS.white, 0.4), 0.05);
    g.beginPath();
    g.moveTo(HERO_X - topHalf * 0.6, topY);
    g.lineTo(HERO_X + topHalf * 0.6, topY);
    g.lineTo(HERO_X + botHalf * 0.55, botY);
    g.lineTo(HERO_X - botHalf * 0.55, botY);
    g.closePath();
    g.fillPath();
    // Bright pool where the cone hits the floor.
    g.fillStyle(mixColor(COLORS.lamp, COLORS.white, 0.3), 0.06);
    g.fillEllipse(HERO_X, botY, botHalf * 1.7, 64);
    this.heroStageGfx = g;
  }

  _drawHero() {
    this.heroLayer.removeAll(true);
    const car = this._currentCar();
    const cx = HERO_X;
    const cy = HERO_Y;
    const scheme = Save.getCarColor(car.id);
    const key = makeCarTexture(this, car, scheme);

    // Ground reflection: a flipped, dimmed copy of the car under it (showroom
    // floor sheen). Drawn first so the car sits on top of its reflection.
    const reflect = this.add.image(cx, cy + 116, key).setScale(1.86, -1.86).setAngle(-16)
      .setAlpha(0.18).setTint(mixColor(car.color, 0x000000, 0.2));
    reflect.setBlendMode(Phaser.BlendModes.ADD);
    this.heroLayer.add(reflect);

    // Contact shadow so the hero is planted on the floor.
    const shadow = this.add.ellipse(cx, cy + 100, 250, 50, 0x000000, 0.36);
    this.heroLayer.add(shadow);
    this._heroAnim.shadow = shadow;

    // Underglow: a coloured pool beneath the car that pulses (idle neon vibe).
    const underglow = this.add.ellipse(cx, cy + 70, 220, 56, car.color, 0.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.heroLayer.add(underglow);
    this._heroAnim.underglow = underglow;

    // The hero sprite itself, larger and spotlit.
    const sprite = this.add.image(cx, cy, key).setScale(1.86).setAngle(-16);
    addGlow(sprite, car.color, 6, 0, 0.32);
    this.heroLayer.add(sprite);
    this._heroAnim.sprite = sprite;
    this._heroAnim.reflect = reflect;
    this._heroAnim.baseY = cy;
    this._heroAnim.t = 0;
    this._heroAnim.color = car.color;

    // Exhaust puff origin (rear of the car — car points up-left at -16°).
    this._heroAnim.exhaustX = cx + 96;
    this._heroAnim.exhaustY = cy + 36;
    this._heroAnim.puff = 1.2;

    // ---- Name plate + chassis + status under the hero ----
    const plate = this.add.container(cx, cy + 150);
    const nameT = this.add.text(0, 0, car.name, { ...titleStyle(40), color: hex(car.color) })
      .setOrigin(0.5).setShadow(0, 2, '#000000', 8, false, true).setLetterSpacing(2);
    addGlow(nameT, car.color, 3, 0, 0.25);
    const chassisT = this.add.text(0, 36, car.chassis.toUpperCase(), labelStyle(15, COLORS.textDim))
      .setOrigin(0.5).setLetterSpacing(3);
    plate.add([nameT, chassisT]);

    if (Save.ownsCar(car.id)) {
      const owned = this.add.text(0, 62, '✓  OWNED', labelStyle(15, COLORS.lime))
        .setOrigin(0.5).setLetterSpacing(3);
      plate.add(owned);
    } else {
      const locked = this.add.text(0, 62, `🔒  LOCKED · $${fmt(car.price)}`, labelStyle(15, COLORS.lamp))
        .setOrigin(0.5).setLetterSpacing(2);
      plate.add(locked);
    }
    this.heroLayer.add(plate);
    this._heroAnim.plate = plate;

    // A tiny stat strip (speed / accel / grip) so the hero reads as a showcase.
    const strip = this._heroStats(car);
    strip.setPosition(cx, cy + 232);
    this.heroLayer.add(strip);
  }

  // Three compact stat pips for the hero car.
  _heroStats(car) {
    const c = this.add.container(0, 0);
    const items = [
      { k: 'SPD', v: car.stats.speed, col: COLORS.lamp },
      { k: 'ACC', v: car.stats.accel, col: COLORS.orange },
      { k: 'GRP', v: car.stats.grip, col: COLORS.cyan },
    ];
    const barW = 86;
    const gap = 26;
    const total = items.length * barW + (items.length - 1) * gap;
    let x = -total / 2 + barW / 2;
    for (const it of items) {
      const col = this.add.container(x, 0);
      col.add(this.add.text(0, -14, it.k, labelStyle(12, COLORS.textDim)).setOrigin(0.5).setLetterSpacing(2));
      const g = this.add.graphics();
      g.fillStyle(COLORS.bgDeep, 0.85);
      g.fillRoundedRect(-barW / 2, 4, barW, 7, 3.5);
      const fillW = Math.max(7, barW * Phaser.Math.Clamp(it.v / 100, 0, 1));
      g.fillStyle(it.col, 1);
      g.fillRoundedRect(-barW / 2, 4, fillW, 7, 3.5);
      col.add(g);
      c.add(col);
      x += barW + gap;
    }
    return c;
  }

  // ---- Filmstrip carousel: a low strip with the selected car spotlit ------
  _drawCarousel() {
    this.carouselLayer.removeAll(true);
    const n = CAR_ORDER.length;
    const cellW = 92;
    const gap = 10;
    const totalW = n * cellW + (n - 1) * gap;
    const x0 = HERO_X - totalW / 2 + cellW / 2;
    const y = 556;

    // Filmstrip backing plate so the row reads as one cinematic element.
    const plateW = totalW + 96;
    const plate = this.add.graphics();
    drawNeonRoundRect(plate, HERO_X - plateW / 2, y - 56, plateW, 112, 14, COLORS.kerb, {
      fill: COLORS.asphaltDark, fillAlpha: 0.72, lineWidth: 2, glow: true, glowAlpha: 0.16,
    });
    // Sprocket-hole dots top & bottom for a film-strip feel.
    plate.fillStyle(mixColor(COLORS.kerb, COLORS.bgDeep, 0.4), 0.5);
    for (let sx = HERO_X - plateW / 2 + 14; sx < HERO_X + plateW / 2 - 8; sx += 22) {
      plate.fillRect(sx, y - 54, 6, 4);
      plate.fillRect(sx, y + 50, 6, 4);
    }
    this.carouselLayer.add(plate);

    // Prev / next arrows flanking the row.
    this.carouselLayer.add(this._arrow(x0 - cellW / 2 - 30, y, '‹', () => this._cycle(-1)));
    this.carouselLayer.add(this._arrow(x0 + totalW - cellW / 2 + 30, y, '›', () => this._cycle(1)));

    CAR_ORDER.forEach((id, i) => {
      const car = CARS[id];
      const cx = x0 + i * (cellW + gap);
      const selected = i === this.viewIndex;
      const owned = Save.ownsCar(id);
      const cell = this.add.container(cx, y);

      // Card frame: brighter + accent-glowing when this is the selected car.
      const frame = this.add.graphics();
      drawNeonRoundRect(frame, -cellW / 2, -38, cellW, 76, 10, selected ? car.color : COLORS.kerb, {
        fill: selected ? mixColor(COLORS.asphalt, car.color, 0.2) : COLORS.asphaltDark,
        fillAlpha: 0.94,
        lineWidth: selected ? 3 : 2,
        glow: selected,
        glowAlpha: 0.34,
      });
      cell.add(frame);

      // Mini car sprite using the player's chosen colour scheme.
      const key = makeCarTexture(this, car, Save.getCarColor(id));
      const mini = this.add.image(0, -4, key).setScale(0.6).setAngle(-14);
      if (!owned) mini.setTint(LOCK_TINT); // blue overlay for unowned cars
      cell.add(mini);

      // Ownership marker: green tick (owned) or padlock (locked).
      if (owned) {
        cell.add(this.add.text(cellW / 2 - 13, -26, '✓', { ...titleStyle(17), color: hex(COLORS.lime) }).setOrigin(0.5));
      } else {
        cell.add(this.add.text(cellW / 2 - 13, -26, '🔒', labelStyle(14, COLORS.text)).setOrigin(0.5));
      }

      // Name caption.
      cell.add(this.add.text(0, 27, car.name, labelStyle(12, selected ? COLORS.white : COLORS.textDim)).setOrigin(0.5));

      // Click to select this car.
      const zone = this.add.zone(0, 0, cellW, 84).setOrigin(0.5).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { if (i !== this.viewIndex) this.tweens.add({ targets: cell, scale: 1.08, duration: 90 }); });
      zone.on('pointerout', () => this.tweens.add({ targets: cell, scale: selected ? 1.1 : 1, duration: 90 }));
      zone.on('pointerup', () => this._select(i));
      cell.add(zone);
      if (selected) cell.setScale(1.1);

      this.carouselLayer.add(cell);
    });
  }

  _arrow(x, y, glyph, onClick) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    drawNeonRoundRect(g, -22, -28, 44, 56, 10, COLORS.lamp, {
      fill: COLORS.asphaltDark, fillAlpha: 0.92, lineWidth: 2, glow: true, glowAlpha: 0.24,
    });
    const t = this.add.text(0, -2, glyph, { ...titleStyle(34), color: hex(COLORS.lamp) }).setOrigin(0.5);
    const zone = this.add.zone(0, 0, 48, 60).setOrigin(0.5).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.tweens.add({ targets: c, scale: 1.14, duration: 90 }));
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
    // A quick punch-in on the hero so swaps feel responsive.
    if (changed && this._heroAnim.sprite && !this.reduceMotion) {
      this._heroAnim.sprite.setScale(1.98);
      this.tweens.add({ targets: this._heroAnim.sprite, scale: 1.86, duration: 220, ease: 'Back.out' });
    }
  }

  // ---- Player identity / rank card (top-right) ---------------------------
  _profileCard() {
    const x = 760;
    const y = 52;
    const w = 462;
    const h = 150;
    const lv = Save.getLevel();
    const ownedCount = CAR_ORDER.filter((id) => Save.ownsCar(id)).length;

    const card = this.add.container(x, y).setDepth(30);

    const g = this.add.graphics();
    drawNeonRoundRect(g, 0, 0, w, h, 16, COLORS.lamp, {
      fill: COLORS.asphaltDark, fillAlpha: 0.9, lineWidth: 2, glow: true, glowAlpha: 0.22,
    });
    // Header divider stripe.
    g.fillStyle(COLORS.lamp, 0.85);
    g.fillRoundedRect(0, 0, w, 4, { tl: 16, tr: 16, bl: 0, br: 0 });
    card.add(g);

    // LEVEL badge — a prominent hexish plate on the left.
    const badge = this.add.container(58, 56);
    const bg = this.add.graphics();
    drawNeonRoundRect(bg, -42, -38, 84, 76, 14, COLORS.amber, {
      fill: mixColor(COLORS.asphalt, COLORS.amber, 0.12), fillAlpha: 0.95, lineWidth: 2, glow: true, glowAlpha: 0.3,
    });
    badge.add(bg);
    badge.add(this.add.text(0, -16, 'LV', labelStyle(13, COLORS.amber)).setOrigin(0.5).setLetterSpacing(3));
    const lvNum = this.add.text(0, 12, `${lv.level}`, { ...titleStyle(40), color: hex(COLORS.white) })
      .setOrigin(0.5).setShadow(0, 2, '#000000', 5, false, true);
    addGlow(lvNum, COLORS.amber, 3, 0, 0.3);
    badge.add(lvNum);
    card.add(badge);

    // Driver name + cash.
    card.add(this.add.text(116, 18, Save.current.name, { ...titleStyle(28), color: hex(COLORS.white) })
      .setOrigin(0, 0).setShadow(0, 2, '#000000', 4, false, true));
    card.add(this.add.text(118, 54, 'DRIVER', labelStyle(12, COLORS.textDim)).setOrigin(0, 0).setLetterSpacing(4));

    // XP progress bar across the lower half.
    const barX = 116;
    const barY = 92;
    const barW = w - barX - 24;
    const barH = 14;
    const track = this.add.graphics();
    track.fillStyle(COLORS.bgDeep, 0.92);
    track.fillRoundedRect(barX, barY, barW, barH, barH / 2);
    const fillW = Math.max(barH, barW * lv.progress);
    track.fillStyle(COLORS.amber, 1);
    track.fillRoundedRect(barX, barY, fillW, barH, barH / 2);
    track.fillStyle(mixColor(COLORS.amber, COLORS.white, 0.5), 0.85);
    track.fillRoundedRect(barX, barY, fillW, barH / 2, barH / 2); // glossy top half
    track.lineStyle(2, mixColor(COLORS.amber, COLORS.bgDeep, 0.4), 0.9);
    track.strokeRoundedRect(barX, barY, barW, barH, barH / 2);
    card.add(track);
    card.add(this.add.text(barX, barY + barH + 4, `${fmt(lv.xpInto)} / ${fmt(lv.xpForNext)} XP`,
      labelStyle(12, COLORS.textDim)).setOrigin(0, 0));

    // Right-side quick stats: cash · stars · cars owned.
    const statX = w - 24;
    card.add(this.add.text(statX, 22, `$ ${fmt(Save.cash)}`, { ...titleStyle(20), color: hex(COLORS.lime) }).setOrigin(1, 0));
    card.add(this.add.text(statX, 50, `★ ${Save.totalStars()} / 27`, labelStyle(16, COLORS.amber)).setOrigin(1, 0));
    card.add(this.add.text(barX + barW, barY + barH + 4, `${ownedCount} / ${CAR_ORDER.length} CARS`,
      labelStyle(12, COLORS.textDim)).setOrigin(1, 0).setLetterSpacing(2));

    this.profileCard = card;
  }

  // ---- Primary CTA + secondary actions (right column) --------------------
  _cta() {
    this.ctaLayer = this.add.container(0, 0).setDepth(28);

    // Big juicy DRIVE button — the obvious focal point.
    const driveX = 991;
    const driveY = 268;
    const drive = this._bigButton(driveX, driveY, 462, 96, {
      label: '▶  DRIVE',
      sub: 'HIT THE TOUGE',
      color: COLORS.lime,
      action: () => this._go('LevelSelectScene'),
      sfx: 'select',
      primary: true,
    });
    this.ctaLayer.add(drive);
    this._driveBtn = drive;

    // Secondary actions stacked below.
    const defs = [
      { label: '🔧  GARAGE', sub: 'Tune & repaint', color: COLORS.lamp, action: () => this._go('GarageScene') },
      { label: '⚙  SETTINGS', sub: 'Audio & display', color: COLORS.cyan, action: () => this._go('SettingsScene') },
      { label: '👤  SWITCH DRIVER', sub: 'Change profile', color: COLORS.textDim, action: () => { Save.logout(); this._go('ProfileScene'); } },
    ];
    let by = driveY + 96;
    const bw = 462;
    const bh = 70;
    const step = 80;
    for (const d of defs) {
      const b = this._bigButton(driveX, by, bw, bh, d);
      this.ctaLayer.add(b);
      by += step;
    }
  }

  // A chunky "garage plate" button. `primary` makes it taller/brighter with a
  // breathing glow so the DRIVE CTA dominates the hierarchy.
  _bigButton(x, y, w, h, d) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const draw = (hover) => {
      g.clear();
      drawNeonRoundRect(g, -w / 2, -h / 2, w, h, 14, d.color, {
        fill: hover ? mixColor(COLORS.asphalt, d.color, d.primary ? 0.26 : 0.16) : (d.primary ? mixColor(COLORS.asphaltDark, d.color, 0.1) : COLORS.asphaltDark),
        fillAlpha: 0.95,
        lineWidth: d.primary ? (hover ? 4 : 3) : (hover ? 3 : 2),
        glow: true,
        glowAlpha: d.primary ? (hover ? 0.5 : 0.34) : (hover ? 0.34 : 0.18),
      });
      // Left accent stripe (painted bay marker).
      g.fillStyle(d.color, hover ? 1 : 0.85);
      g.fillRoundedRect(-w / 2 + 10, -h / 2 + 12, d.primary ? 10 : 8, h - 24, 4);
    };
    draw(false);
    c.add(g);

    const labelSize = d.primary ? 38 : 25;
    const main = this.add.text(-w / 2 + (d.primary ? 46 : 38), d.primary ? -12 : -9, d.label, {
      ...titleStyle(labelSize), color: hex(COLORS.white),
    }).setOrigin(0, 0.5).setShadow(0, 2, '#000000', 5, false, true);
    const sub = this.add.text(-w / 2 + (d.primary ? 48 : 40), d.primary ? 22 : 17, d.sub,
      labelStyle(d.primary ? 16 : 14, COLORS.textDim)).setOrigin(0, 0.5).setLetterSpacing(d.primary ? 4 : 2);
    c.add([main, sub]);

    if (d.primary) {
      addGlow(main, d.color, 4, 0, 0.3);
      // Breathing glow on the primary CTA so it pulls the eye (calm if reduced).
      if (!this.reduceMotion) {
        c._breathe = this.tweens.add({
          targets: c, scaleX: 1.012, scaleY: 1.012, duration: 1400,
          yoyo: true, repeat: -1, ease: 'Sine.inOut',
        });
      }
    }

    const zone = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      draw(true); main.setColor(hex(d.color));
      this.tweens.add({ targets: c, x: x + 8, duration: 100, ease: 'Sine.out' });
    });
    zone.on('pointerout', () => {
      draw(false); main.setColor(hex(COLORS.white));
      this.tweens.add({ targets: c, x, duration: 100, ease: 'Sine.out' });
    });
    zone.on('pointerdown', () => this.tweens.add({ targets: c, scaleX: 0.98, scaleY: 0.98, duration: 60 }));
    zone.on('pointerup', () => {
      Audio.resume();
      Audio.sfx(d.sfx || 'click');
      this.tweens.add({ targets: c, scaleX: 1, scaleY: 1, duration: 60 });
      d.action();
    });
    c.add(zone);
    return c;
  }

  // ---- Engagement: daily challenge + best-run stat strip -----------------
  _engagement() {
    const x = 760;
    const y = 590;
    const w = 462;
    const h = 96;
    const layer = this.add.container(x, y).setDepth(28);

    const g = this.add.graphics();
    drawNeonRoundRect(g, 0, 0, w, h, 14, COLORS.pink, {
      fill: COLORS.asphaltDark, fillAlpha: 0.9, lineWidth: 2, glow: true, glowAlpha: 0.2,
    });
    // Accent stripe + header.
    g.fillStyle(COLORS.pink, 0.85);
    g.fillRoundedRect(0, 0, 6, h, { tl: 14, tr: 0, bl: 14, br: 0 });
    layer.add(g);

    const daily = this._dailyChallenge();
    layer.add(this.add.text(22, 14, '◈  DAILY CHALLENGE', labelStyle(13, COLORS.pink)).setOrigin(0, 0).setLetterSpacing(3));
    layer.add(this.add.text(22, 36, daily.title, { ...titleStyle(21), color: hex(COLORS.white) })
      .setOrigin(0, 0).setShadow(0, 2, '#000000', 4, false, true));
    layer.add(this.add.text(22, 66, daily.detail, labelStyle(14, COLORS.textDim)).setOrigin(0, 0));

    // Reward chip on the right.
    const chip = this.add.graphics();
    drawNeonRoundRect(chip, w - 132, 28, 110, 40, 10, COLORS.lime, {
      fill: mixColor(COLORS.asphalt, COLORS.lime, 0.1), fillAlpha: 0.95, lineWidth: 2, glow: true, glowAlpha: 0.26,
    });
    layer.add(chip);
    layer.add(this.add.text(w - 77, 40, 'REWARD', labelStyle(10, COLORS.textDim)).setOrigin(0.5).setLetterSpacing(2));
    layer.add(this.add.text(w - 77, 56, `+$${fmt(daily.reward)}`, { ...titleStyle(17), color: hex(COLORS.lime) }).setOrigin(0.5));

    // Make the whole card a shortcut into the featured level's zone.
    const zone = this.add.zone(w / 2, h / 2, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.tweens.add({ targets: layer, scale: 1.015, duration: 100 }));
    zone.on('pointerout', () => this.tweens.add({ targets: layer, scale: 1, duration: 100 }));
    zone.on('pointerup', () => { Audio.sfx('click'); this._go('LevelSelectScene'); });
    layer.add(zone);

    this.engagementLayer = layer;
  }

  // Deterministic "daily" pick keyed to the calendar day so it's stable for a
  // day but rotates. Falls back gracefully if level data is unexpected.
  _dailyChallenge() {
    const day = Math.floor(Date.now() / 86400000);
    const list = (LEVELS && LEVELS.length) ? LEVELS : [{ name: 'Genten — Free Run', scoreGold: 48000 }];
    const lvl = list[day % list.length] || list[0];
    const targets = [25000, 40000, 50000, 60000, 75000];
    const target = lvl.scoreGold ? Math.round(lvl.scoreGold * 1.05 / 1000) * 1000 : targets[day % targets.length];
    const reward = 2000 + (day % 4) * 750;
    const name = (lvl.name || 'Free Run').replace(/—/g, '·');
    return {
      title: `${fmt(target)} pts in ${name}`,
      detail: 'Set a score on today\'s featured run',
      reward,
    };
  }

  // ---- Bottom hint -------------------------------------------------------
  _hint() {
    this.hint = this.add.text(this.scale.width / 2, this.scale.height - 38,
      'Click a car to select  ·  ‹ ›  to browse  ·  hold SPACE in-game to drift',
      labelStyle(15, COLORS.textDim)).setOrigin(0.5).setDepth(30).setLetterSpacing(1);
  }

  // ---- Entrance animation ------------------------------------------------
  // Stagger the major elements in so the screen assembles like a title card.
  _entrance() {
    if (this.reduceMotion) return;
    const slideIn = (obj, fromX, fromY, delay) => {
      if (!obj) return;
      const tx = obj.x;
      const ty = obj.y;
      obj.setAlpha(0);
      obj.x = tx + fromX;
      obj.y = ty + fromY;
      this.tweens.add({ targets: obj, x: tx, y: ty, alpha: 1, duration: 460, delay, ease: 'Cubic.out' });
    };
    slideIn(this.titleLayer, -40, 0, 60);
    slideIn(this.heroLayer, -30, 20, 160);
    slideIn(this.carouselLayer, 0, 40, 260);
    slideIn(this.profileCard, 40, -20, 200);
    slideIn(this.ctaLayer, 60, 0, 300);
    slideIn(this.engagementLayer, 40, 30, 380);
    if (this.hint) { this.hint.setAlpha(0); this.tweens.add({ targets: this.hint, alpha: 1, duration: 500, delay: 520 }); }
    // Frame fades in last.
    if (this.frame) { this.frame.setAlpha(0); this.tweens.add({ targets: this.frame, alpha: 1, duration: 600, delay: 120 }); }
  }

  _go(scene) {
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene));
  }

  // ---- Per-frame animation -----------------------------------------------
  _animateHero(dt) {
    const a = this._heroAnim;
    if (!a.sprite) return;
    a.t += dt;

    if (this.reduceMotion) {
      // Hold a still, level hero — just a faint underglow so it's not dead.
      a.sprite.setAngle(-16);
      a.sprite.y = a.baseY;
      if (a.underglow) a.underglow.setAlpha(0.14);
      return;
    }

    // Gentle idle bob + a touch of angle sway.
    const bob = Math.sin(a.t * 1.1) * 8;
    a.sprite.y = a.baseY + bob;
    a.sprite.setAngle(-16 + Math.sin(a.t * 0.7) * 2.2);
    if (a.reflect) a.reflect.y = a.baseY + 116 - bob * 0.4;
    if (a.plate) a.plate.y = a.baseY + 150 + bob * 0.15;

    // Underglow pulse synced a little slower than the bob.
    if (a.underglow) {
      a.underglow.setAlpha(0.12 + 0.08 * (0.5 + 0.5 * Math.sin(a.t * 1.8)));
      a.underglow.setScale(1 + 0.04 * Math.sin(a.t * 1.8));
    }
    if (a.shadow) a.shadow.setScale(1 - bob * 0.0015, 1); // shadow tightens as car lifts

    // Occasional exhaust puff: a quick fading, rising blob at the tailpipe.
    a.puff -= dt;
    if (a.puff <= 0) {
      a.puff = 2.6 + Math.random() * 2.4;
      this._exhaustPuff(a.exhaustX, a.exhaustY, a.color);
    }
  }

  _exhaustPuff(x, y, color) {
    const puff = this.add.circle(x, y, 6, mixColor(color, COLORS.white, 0.3), 0.5)
      .setDepth(19).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: puff,
      x: x + 26 + Math.random() * 18,
      y: y - 18 - Math.random() * 14,
      scale: 3.2,
      alpha: 0,
      duration: 900,
      ease: 'Sine.out',
      onComplete: () => puff.destroy(),
    });
  }

  update(_, delta) {
    const dt = delta / 1000;
    if (this.backdrop) this.backdrop.update(dt);
    if (this.ambiance) this.ambiance.update(dt);
    this._animateHero(dt);
  }
}
