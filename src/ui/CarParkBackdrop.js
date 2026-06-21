// Menu-only backdrop: a retro-pixel multi-storey car park under an overpass at
// night — a Japanese car-meet vibe. Concrete deck across the top on pillars,
// warm sodium downlights, painted parking bays with a few parked pixel cars,
// faint tyre marks. Muted warm/grey palette (theme street tones), NOT neon.
//
// LIVING backdrop: the static scene is still drawn ONCE into Graphics for
// performance, but on top of it sit a handful of cheap animated layers so the
// menu feels alive instead of being a still image:
//   - sodium lamp flicker (the original behaviour)
//   - distant neon shop signs that buzz / flicker behind the deck
//   - headlights that occasionally sweep across the overpass deck
//   - slow drifting haze/fog banks across the floor
//   - a faint wet-floor reflection sheen that breathes
// Everything is deterministic-seeded so the scene is identical each load, and
// every animated layer collapses to a calm/idle state when reduceMotion is set.
//
// Drop-in for ui/backdrop.js Backdrop on the menu: same constructor(scene, opts)
// + update(dt) interface.

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
    this._distantSigns(); // flickering neon shop signs far behind the deck
    this._lightPools(); // additive sodium glow pools on the floor (drawn under cars)
    this._deck(); // overpass/deck + pillars across the top
    this._floor(); // painted parking bays + tyre marks
    this._wetSheen(); // faint reflective wet-floor sheen (animated breathe)
    this._parkedCars(); // a few blocky parked pixel cars in bays
    this._haze(); // slow drifting fog banks across the scene

    // Lamp glow halos get re-tinted each frame for a faint flicker.
    this.lampGlow = scene.add.graphics().setDepth(-7).setBlendMode(Phaser.BlendModes.ADD);
    this.lamps = []; // { x, y, r, base }
    this._lampPositions();
    this._drawLamps(1);

    // Headlight sweep: a moving wedge of light that crosses the deck now and then.
    this._headlights();
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

  // ---- Distant neon shop signs glimpsed behind/beside the deck -----------
  // A row of small coloured neon boxes far away in the city, each buzzing with
  // its own flicker rhythm so the skyline feels inhabited. Cheap: each sign is
  // one additive rectangle whose alpha we modulate per frame.
  _distantSigns() {
    const r = rng(0x5163);
    // Static dark backing buildings so the signs read as "on" windows/boards.
    const bg = this.scene.add.graphics().setDepth(-11);
    const horizon = this.h * 0.12;
    // Faint silhouette skyline behind the deck: a row of dark building blocks.
    const buildCols = mixColor(this.col.skyBot, 0x000000, 0.35);
    let bx = -20;
    while (bx < this.w + 20) {
      const bw = 40 + ((r() * 70) | 0);
      const bh = 26 + ((r() * 60) | 0);
      bg.fillStyle(buildCols, 0.9);
      bg.fillRect(bx, horizon - bh, bw, bh + 40);
      bx += bw + 6 + ((r() * 12) | 0);
    }

    // Neon sign sources (additive, animated).
    this.signGfx = this.scene.add.graphics().setDepth(-10.5).setBlendMode(Phaser.BlendModes.ADD);
    const palette = [COLORS.pink, COLORS.cyan, COLORS.amber, COLORS.lime, COLORS.orange, COLORS.purple];
    this.signs = [];
    const count = 9;
    for (let i = 0; i < count; i++) {
      const sx = 60 + (this.w - 120) * (i / (count - 1)) + (r() - 0.5) * 50;
      const sy = horizon - 8 - r() * 34;
      this.signs.push({
        x: Math.round(sx),
        y: Math.round(sy),
        w: 8 + ((r() * 22) | 0),
        h: 5 + ((r() * 10) | 0),
        color: palette[(r() * palette.length) | 0],
        base: 0.28 + r() * 0.3,
        // Per-sign flicker character: speed, phase, and how "broken" the tube is.
        spd: 1.4 + r() * 5.5,
        phase: r() * Math.PI * 2,
        broken: r() < 0.34 ? 5 + r() * 6 : 0, // some signs stutter/cut out
      });
    }
    this._drawSigns(0);
  }

  _drawSigns(t) {
    const g = this.signGfx;
    if (!g) return;
    g.clear();
    for (const s of this.signs) {
      let a = s.base * (0.82 + 0.18 * Math.sin(t * s.spd + s.phase));
      if (s.broken) {
        // Occasional hard stutter so a couple of signs read as failing tubes.
        const stutter = Math.sin(t * s.broken + s.phase * 1.7);
        if (stutter > 0.86) a *= 0.15;
      }
      // Soft halo around the tube.
      g.fillStyle(s.color, a * 0.16);
      g.fillRect(s.x - s.w, s.y - s.h, s.w * 3, s.h * 3);
      // Tube core.
      g.fillStyle(mixColor(s.color, COLORS.white, 0.35), a);
      g.fillRect(s.x, s.y, s.w, s.h);
    }
  }

  // ---- Overpass deck on pillars across the top ---------------------------
  _deck() {
    const g = this.scene.add.graphics().setDepth(-9);
    const deckY = this.h * 0.16; // underside of the deck
    const deckH = this.h * 0.16; // thickness of the deck slab
    this.deckY = deckY;
    this.deckH = deckH;

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
    this.floorY = floorY;

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

  // ---- Wet-floor reflection sheen ----------------------------------------
  // Cool vertical streaks of light reflected in a damp concrete floor, plus a
  // broad sheen band. Drawn additive and gently "breathed" in update() so the
  // ground looks faintly wet and alive rather than flat. Reflections sit under
  // the hero/UI (depth -8.5) so the hero's own reflection (drawn by MenuScene)
  // layers on top.
  _wetSheen() {
    this.sheen = this.scene.add.graphics().setDepth(-8.5).setBlendMode(Phaser.BlendModes.ADD);
    const r = rng(0x7e7);
    // Pre-compute reflection streaks under each sodium lamp pool + a few signs.
    this.sheenStreaks = [];
    const floorY = this.floorY ?? this.h * 0.5;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const lx = Math.round(((i + 0.5) / n) * this.w);
      this.sheenStreaks.push({
        x: lx + (r() - 0.5) * 16,
        y0: floorY + 40,
        len: 120 + r() * 120,
        wMul: 1,
        color: this.col.lamp,
        base: 0.05 + r() * 0.03,
        wob: r() * Math.PI * 2,
      });
    }
    // A couple of cool blue reflections (city sign colour) for variety.
    for (let i = 0; i < 3; i++) {
      this.sheenStreaks.push({
        x: 120 + r() * (this.w - 240),
        y0: floorY + 60,
        len: 90 + r() * 90,
        wMul: 0.7,
        color: i % 2 ? COLORS.cyan : COLORS.pink,
        base: 0.03 + r() * 0.025,
        wob: r() * Math.PI * 2,
      });
    }
    this._drawSheen(0);
  }

  _drawSheen(t) {
    const g = this.sheen;
    if (!g) return;
    g.clear();
    for (const s of this.sheenStreaks) {
      // Breathe the brightness + a tiny horizontal wobble (water shimmer).
      const a = s.base * (0.7 + 0.3 * Math.sin(t * 1.3 + s.wob));
      const wob = Math.sin(t * 0.8 + s.wob) * 3;
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const f = i / segs;
        const yy = s.y0 + f * s.len;
        const ww = (10 + f * 26) * s.wMul; // widens as it nears the viewer
        const aa = a * (1 - f) * (1 - f);
        g.fillStyle(s.color, aa);
        g.fillRect(s.x - ww / 2 + wob * f, yy, ww, s.len / segs + 2);
      }
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

  // ---- Drifting haze / fog banks -----------------------------------------
  // A few large, soft, translucent fog ellipses that drift slowly sideways and
  // wrap around, giving the air a hazy car-meet atmosphere. Redrawn each frame
  // (only a handful of ellipses, so cheap).
  _haze() {
    this.hazeGfx = this.scene.add.graphics().setDepth(-7.5).setBlendMode(Phaser.BlendModes.ADD);
    const r = rng(0xfa2e);
    this.hazeBanks = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      this.hazeBanks.push({
        x: r() * this.w,
        y: this.h * (0.42 + r() * 0.4),
        rx: 220 + r() * 220,
        ry: 70 + r() * 70,
        // Drift speed/direction; slow so it's ambient not distracting.
        vx: (r() < 0.5 ? -1 : 1) * (6 + r() * 12),
        base: 0.022 + r() * 0.02,
        tint: r() < 0.3 ? mixColor(this.col.lamp, COLORS.white, 0.3) : mixColor(this.col.skyBot, COLORS.white, 0.25),
        bob: r() * Math.PI * 2,
      });
    }
    this._drawHaze(0, 0);
  }

  _drawHaze(t, dt) {
    const g = this.hazeGfx;
    if (!g) return;
    g.clear();
    for (const b of this.hazeBanks) {
      b.x += b.vx * dt;
      // Wrap horizontally so banks recycle across the screen.
      if (b.x < -b.rx) b.x = this.w + b.rx;
      if (b.x > this.w + b.rx) b.x = -b.rx;
      const yy = b.y + Math.sin(t * 0.3 + b.bob) * 10;
      const a = b.base * (0.75 + 0.25 * Math.sin(t * 0.5 + b.bob));
      // A couple of stacked ellipses for a soft edge.
      g.fillStyle(b.tint, a);
      g.fillEllipse(b.x, yy, b.rx, b.ry);
      g.fillStyle(b.tint, a * 0.6);
      g.fillEllipse(b.x, yy, b.rx * 0.6, b.ry * 0.7);
    }
  }

  // ---- Lamp glow halos ----------------------------------------------------
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

  // ---- Headlight sweep across the overpass deck --------------------------
  // Every so often a car "passes" on the overpass: a soft wedge of cool-white
  // light sweeps left-to-right (or back) across the underside of the deck and
  // briefly rakes the pillars. Long idle gaps between passes so it's a treat,
  // not a strobe.
  _headlights() {
    this.headGfx = this.scene.add.graphics().setDepth(-8.8).setBlendMode(Phaser.BlendModes.ADD);
    this.headState = {
      active: false,
      t: 0,
      dur: 0,
      dir: 1,
      cooldown: 2.5, // first pass comes fairly soon
      y: (this.deckY ?? this.h * 0.16) - (this.deckH ?? this.h * 0.16) * 0.4,
      seed: rng(0x4ead),
    };
  }

  _drawHeadlights() {
    const g = this.headGfx;
    if (!g) return;
    g.clear();
    const s = this.headState;
    if (!s.active) return;
    const p = s.t / s.dur; // 0..1 sweep progress
    // Ease in/out the overall brightness so it fades on and off.
    const env = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
    const x = s.dir > 0 ? -120 + (this.w + 240) * p : this.w + 120 - (this.w + 240) * p;
    const y = s.y;
    const col = mixColor(COLORS.white, this.col.lamp, 0.15);
    // Twin headlight cores + a soft elongated glow trailing across the deck.
    const gap = 16;
    for (let k = -1; k <= 1; k += 2) {
      g.fillStyle(col, 0.5 * env);
      g.fillEllipse(x + k * gap, y, 26, 12);
    }
    // Broad wash on the deck underside.
    g.fillStyle(col, 0.12 * env);
    g.fillEllipse(x, y, 200, 40);
    // A faint cast pool on the floor directly below (light spilling down).
    g.fillStyle(col, 0.05 * env);
    g.fillEllipse(x, (this.floorY ?? this.h * 0.5) + 30, 160, 50);
  }

  _updateHeadlights(dt) {
    const s = this.headState;
    if (s.active) {
      s.t += dt;
      if (s.t >= s.dur) {
        s.active = false;
        // Idle gap before the next car passes (varied so it's not metronomic).
        s.cooldown = 4 + s.seed() * 7;
      }
      this._drawHeadlights();
    } else {
      s.cooldown -= dt;
      if (s.cooldown <= 0) {
        s.active = true;
        s.t = 0;
        s.dur = 1.6 + s.seed() * 1.2; // sweep duration
        s.dir = s.seed() < 0.5 ? 1 : -1;
      }
    }
  }

  // ---- Per-frame update ---------------------------------------------------
  // Drives all the living layers. Static geometry is never redrawn. When
  // reduceMotion is set we hold a calm idle state: lamps steady, haze/sheen
  // settle to a still frame, no headlight sweeps, signs barely breathe.
  update(dt) {
    const calm = Save.settings.reduceMotion;
    this.phase += dt;
    const t = this.phase;

    if (calm) {
      // Settle everything to a still, gentle frame once (cheap to repeat).
      this._drawLamps(0.98);
      this._drawSigns(t * 0.15); // very slow, faint life so it's not dead-flat
      this._drawSheen(0);
      this._drawHaze(t * 0.15, dt * 0.15);
      if (this.headGfx) this.headGfx.clear();
      return;
    }

    // Gentle multi-sine flicker around ~1.0 so the lamps feel alive.
    const flick = 0.94 + 0.05 * Math.sin(t * 7.1) + 0.03 * Math.sin(t * 2.3);
    this._drawLamps(flick);
    this._drawSigns(t);
    this._drawSheen(t);
    this._drawHaze(t, dt);
    this._updateHeadlights(dt);
  }
}
