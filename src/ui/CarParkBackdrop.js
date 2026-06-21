// Menu-only backdrop: a retro-pixel multi-storey car park under an overpass at
// night — a Japanese car-meet vibe. Concrete deck across the top on pillars,
// warm sodium downlights, painted parking bays with a few parked pixel cars,
// faint tyre marks. Muted warm/grey palette (theme street tones), NOT neon.
//
// Drop-in for ui/backdrop.js Backdrop on the menu: same constructor(scene, opts)
// + update(dt) interface. Everything is drawn ONCE into Graphics for performance;
// update() only does a cheap, subtle light flicker (and honours reduceMotion).

import Phaser from 'phaser';
import { COLORS, hex, mixColor } from '../config/theme.js';
import { Save } from '../core/SaveManager.js';

// Small deterministic PRNG so the scene is identical every load (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CarParkBackdrop {
  constructor(scene, opts = {}) {
    this.scene = scene;
    const w = scene.scale.width;
    const h = scene.scale.height;
    this.w = w;
    this.h = h;
    this.phase = 0;

    // Muted street palette (warm greys + sodium), explicitly NOT neon.
    this.col = {
      skyTop: 0x1a1820,
      skyBot: 0x272029,
      concrete: COLORS.asphalt ?? 0x3c3f46,
      concreteDark: COLORS.asphaltDark ?? 0x303338,
      concreteLight: COLORS.asphaltWorn ?? 0x474a52,
      kerb: COLORS.kerb ?? 0x7b7f88,
      bay: COLORS.roadEdgeLine ?? 0xeae4d2,
      lamp: COLORS.lamp ?? 0xffca6e,
    };

    this._sky();
    this._lightPools(); // additive sodium glow pools on the floor (drawn under cars)
    this._deck(); // overpass/deck + pillars across the top
    this._floor(); // painted parking bays + tyre marks
    this._parkedCars(); // a few blocky parked pixel cars in bays

    // Lamp glow halos get re-tinted each frame for a faint flicker.
    this.lampGlow = scene.add.graphics().setDepth(-7).setBlendMode(Phaser.BlendModes.ADD);
    this.lamps = []; // { x, y, r, base }
    this._lampPositions();
    this._drawLamps(1);
  }

  // ---- Sky / upper darkness above the deck -------------------------------
  _sky() {
    const key = 'cp_sky';
    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, 8, this.h);
      const ctx = tex.getContext();
      const grad = ctx.createLinearGradient(0, 0, 0, this.h);
      grad.addColorStop(0, hex(this.col.skyTop));
      grad.addColorStop(0.5, hex(this.col.skyBot));
      grad.addColorStop(1, hex(mixColor(this.col.concreteDark, 0x000000, 0.2)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, this.h);
      tex.refresh();
    }
    this.scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.w, this.h).setDepth(-12);
  }

  // ---- Overpass deck on pillars across the top ---------------------------
  _deck() {
    const g = this.scene.add.graphics().setDepth(-9);
    const deckY = this.h * 0.16; // underside of the deck
    const deckH = this.h * 0.16; // thickness of the deck slab

    // Pillars descending from the deck.
    const pillarW = Math.round(this.w * 0.045);
    const cols = 4;
    const span = this.w / cols;
    for (let i = 0; i <= cols; i++) {
      const px = Math.round(i * span - pillarW / 2);
      // Pillar body with a lit edge and a shadow edge for chunky relief.
      g.fillStyle(this.col.concreteDark, 1);
      g.fillRect(px, deckY, pillarW, deckY + deckH); // tall pillar down past the deck base
      g.fillStyle(this.col.concrete, 1);
      g.fillRect(px + 3, deckY, pillarW - 6, deckY + deckH);
      g.fillStyle(this.col.concreteLight, 1);
      g.fillRect(px + 3, deckY, 4, deckY + deckH); // lit left edge
      // Capital where pillar meets the slab.
      g.fillStyle(this.col.concreteLight, 1);
      g.fillRect(px - 4, deckY - 6, pillarW + 8, 8);
    }

    // The deck slab itself across the very top.
    g.fillStyle(this.col.concreteDark, 1);
    g.fillRect(0, 0, this.w, deckY);
    g.fillStyle(this.col.concrete, 1);
    g.fillRect(0, deckY - deckH, this.w, deckH);
    // Lit top lip + shadowed underside line.
    g.fillStyle(this.col.concreteLight, 1);
    g.fillRect(0, deckY - deckH, this.w, 4);
    g.fillStyle(mixColor(this.col.concreteDark, 0x000000, 0.35), 1);
    g.fillRect(0, deckY - 5, this.w, 5);

    // Expansion-joint seams + barrier posts along the deck edge (pixel detail).
    g.fillStyle(mixColor(this.col.concrete, 0x000000, 0.25), 1);
    for (let x = 0; x < this.w; x += Math.round(this.w / 16)) {
      g.fillRect(x, deckY - deckH + 6, 2, deckH - 10);
    }
    g.fillStyle(this.col.kerb, 1);
    for (let x = 14; x < this.w; x += 64) {
      g.fillRect(x, deckY - deckH - 10, 6, 10); // little barrier posts on top
    }

    // Sodium light boxes hung under the deck (the lamp sources).
    this.deckLightY = deckY + 10;
    this.deckLights = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const lx = Math.round(((i + 0.5) / n) * this.w);
      g.fillStyle(mixColor(this.col.concreteDark, 0x000000, 0.3), 1);
      g.fillRect(lx - 12, deckY, 24, 8); // housing
      g.fillStyle(this.col.lamp, 1);
      g.fillRect(lx - 9, deckY + 6, 18, 4); // glowing tube
      this.deckLights.push(lx);
    }
  }

  // ---- Soft sodium light pools cast on the floor -------------------------
  _lightPools() {
    const g = this.scene.add.graphics().setDepth(-10).setBlendMode(Phaser.BlendModes.ADD);
    const floorY = this.h * 0.5;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const lx = Math.round(((i + 0.5) / n) * this.w);
      // Stacked translucent ellipses fake a soft pool of warm light.
      for (let r = 5; r >= 1; r--) {
        g.fillStyle(this.col.lamp, 0.025);
        g.fillEllipse(lx, floorY + (this.h - floorY) * 0.5, 120 + r * 26, 70 + r * 16);
      }
    }
  }

  // ---- Floor: parking bays + faded tyre marks ----------------------------
  _floor() {
    const g = this.scene.add.graphics().setDepth(-8);
    const floorY = this.h * 0.5;

    // Concrete floor with a slightly lighter near band (worn wheel paths).
    g.fillStyle(this.col.concrete, 1);
    g.fillRect(0, floorY, this.w, this.h - floorY);
    g.fillStyle(this.col.concreteDark, 1);
    g.fillRect(0, floorY, this.w, 6); // shadowed line where wall meets floor
    g.fillStyle(this.col.concreteLight, 0.4);
    g.fillRect(0, this.h - 70, this.w, 70); // brighter near foreground

    // Back wall band (between floor and the deck's lit zone) for depth.
    g.fillStyle(this.col.concreteDark, 1);
    g.fillRect(0, this.h * 0.34, this.w, floorY - this.h * 0.34);
    g.fillStyle(mixColor(this.col.concreteDark, this.col.concrete, 0.5), 1);
    g.fillRect(0, this.h * 0.34, this.w, 4);

    // Painted parking bays receding toward the back wall. Bays nearer the
    // viewer are wider/taller (cheap fake perspective).
    const r = rng(1337);
    const bayLine = mixColor(this.col.bay, this.col.concrete, 0.15);
    const rows = [
      { y: this.h * 0.40, scale: 0.55, alpha: 0.5 },
      { y: this.h * 0.62, scale: 0.85, alpha: 0.7 },
      { y: this.h * 0.86, scale: 1.15, alpha: 0.9 },
    ];
    this.bays = []; // remembered so cars can park in them
    for (const row of rows) {
      const bayW = Math.round(118 * row.scale);
      const depth = Math.round(70 * row.scale);
      g.fillStyle(bayLine, row.alpha);
      let x = -bayW * 0.5 + ((r() * bayW) | 0) * 0.2;
      while (x < this.w + bayW) {
        // Each bay = two side lines + a back line (a 'U' opening toward viewer).
        g.fillRect(Math.round(x), row.y, 3, depth); // left
        g.fillRect(Math.round(x + bayW - 3), row.y, 3, depth); // right
        g.fillRect(Math.round(x), row.y, bayW, 3); // back
        this.bays.push({ x: x + bayW / 2, y: row.y, w: bayW, depth, scale: row.scale });
        x += bayW;
      }
    }

    // Faint curved tyre marks smeared across the foreground floor.
    g.lineStyle(5, mixColor(this.col.concrete, 0x000000, 0.4), 0.35);
    for (let i = 0; i < 5; i++) {
      const sx = r() * this.w;
      const sy = this.h * (0.7 + r() * 0.25);
      g.beginPath();
      g.moveTo(sx, sy);
      const sweep = (r() - 0.5) * 280;
      g.lineTo(sx + sweep, sy - 26 - r() * 24);
      g.strokePath();
    }
  }

  // ---- A few blocky parked pixel cars sitting in the back bays -----------
  _parkedCars() {
    const g = this.scene.add.graphics().setDepth(-8);
    const r = rng(99);
    // Muted parked-car body colours (no neon) — dusty street tones.
    const palette = [0x6b6f7a, 0x8a5a4a, 0x4a5a6b, 0x7a7466, 0x5a4a5a, 0x9a9488];
    // Pick a handful of the deeper (smaller) bays so cars sit "behind" the UI.
    const candidates = this.bays
      .filter((b) => b.scale <= 0.9)
      .sort(() => r() - 0.5)
      .slice(0, 5);

    for (const b of candidates) {
      if (r() < 0.3) continue; // leave some bays empty
      const col = palette[(r() * palette.length) | 0];
      this._drawParkedCar(g, b.x, b.y + b.depth * 0.5, b.w * 0.74, b.scale, col, r);
    }
  }

  // Chunky top-down-ish parked car silhouette (kept simple, reads as pixel art).
  _drawParkedCar(g, cx, cy, len, scale, body, r) {
    const w = Math.round(len);
    const h = Math.round(34 * scale);
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    const dark = mixColor(body, 0x000000, 0.45);
    const lit = mixColor(body, COLORS.white, 0.18);
    const glass = mixColor(body, 0x10131a, 0.6);

    // Drop shadow on the concrete.
    g.fillStyle(0x000000, 0.3);
    g.fillRect(x - 3, y + h - 3, w + 6, 8);
    // Body + relief edges.
    g.fillStyle(dark, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(body, 1);
    g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle(lit, 1);
    g.fillRect(x + 2, y + 2, w - 4, 3); // lit roof edge
    // Cabin glass band across the middle.
    g.fillStyle(glass, 1);
    g.fillRect(x + Math.round(w * 0.28), y + 5, Math.round(w * 0.44), h - 12);
    // Warm reflection of the sodium lamp in the rear glass.
    g.fillStyle(this.col.lamp, 0.5);
    g.fillRect(x + Math.round(w * 0.3), y + 6, 4, 3);
    // Tail lights (this end faces the viewer in the bay).
    g.fillStyle(COLORS.red, 0.85);
    g.fillRect(x + 3, y + h - 6, 6, 3);
    g.fillRect(x + w - 9, y + h - 6, 6, 3);
  }

  // ---- Lamp glow halos (the only thing that animates) --------------------
  _lampPositions() {
    const lampY = this.deckLightY ?? this.h * 0.18;
    for (const lx of this.deckLights || []) {
      this.lamps.push({ x: lx, y: lampY, r: 70, base: 0.16 });
    }
  }

  _drawLamps(flick) {
    const g = this.lampGlow;
    g.clear();
    for (const l of this.lamps) {
      const a = l.base * flick;
      for (let i = 5; i >= 1; i--) {
        g.fillStyle(this.col.lamp, a * 0.16);
        g.fillCircle(l.x, l.y, l.r + i * 12);
      }
      // bright core
      g.fillStyle(mixColor(this.col.lamp, COLORS.white, 0.4), a * 0.9);
      g.fillCircle(l.x, l.y, 10);
    }
  }

  // Cheap update: a subtle, deterministic sodium flicker. No redraw of the
  // static scene. Honours the reduce-motion accessibility toggle.
  update(dt) {
    if (Save.settings.reduceMotion) return;
    this.phase += dt;
    // Gentle multi-sine flicker around ~1.0 so the lamps feel alive.
    const flick = 0.94 + 0.05 * Math.sin(this.phase * 7.1) + 0.03 * Math.sin(this.phase * 2.3);
    this._drawLamps(flick);
  }
}
