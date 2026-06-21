// Procedural nighttime Tokyo street city for the first map. Reads a built Track
// instance and lines BOTH sides of the road with chunky 8-bit neon buildings:
// dark faces, neon outlines, grids of lit windows, rooftop signage (vertical
// kanji-suggesting bars, billboards, glowing logos), plus tasteful wet-asphalt
// ground detailing under the road. Everything is drawn ONCE (the world is
// static) into a small number of Phaser Graphics, deterministically seeded so
// the city looks identical every load.
//
// Aesthetic: CHUNKY PIXEL NEON VECTOR at night — hard edges, bold limited
// palette of deep blues/purples with magenta/cyan and hot accents, neon glow
// faked by layering a soft fat stroke under a bright thin one (matching
// neon.js / Track.js conventions).
//
// Depths (per the world's convention): bg -20, road fill -10, road edges ~-9,
// pickups 5, car 20. The city renders -12 (ground sheen) .. -6 (building tops),
// always OUTSIDE the drivable road and BEHIND the car/pickups.

import Phaser from 'phaser';
import { COLORS, mixColor } from '../config/theme.js';
import { makeSoftCircle } from '../core/neon.js';
import { mulberry32, rangeRand, intRand } from '../core/rng.js';

// Muted concrete/brick/taupe facades for a retro-pixel Japanese night street.
const FACADE = [0x4a4e57, 0x55473f, 0x4f5a5e, 0x5c5048, 0x474551, 0x59504a, 0x445055, 0x5a4d52];
// Window light + rooftop tones.
const WIN_WARM = 0xffce86;
const WIN_COOL = 0xbcd2ee;
const WIN_DARK = 0x2a2c33;
const ROOF = 0x3d4047;
const ROOF_AC = 0x6a6e77;
// Muted shop-sign accents (izakaya warmth, not arcade neon).
const SIGN = [0xd9544e, 0xe0a93a, 0x4a9ec0, 0xc66a9a, 0xe6e0d2];

function unit(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

export class CityDecor {
  constructor(track) {
    this.track = track;
    this.scene = track.scene;
    this.path = track.path;
    this.normals = track.normals;
    this.half = track.half;
    this.bounds = track.bounds;
    this.zone = track.zone;
    this.total = track.total;

    this.graphics = []; // all Graphics we create, for destroy()
    this.images = []; // glow halo Images
    this._haloKeys = []; // soft-circle textures we generated

    // Deterministic: seed from a stable property of the world (path length).
    this._rnd = mulberry32((0xc17 ^ (this.path.length * 2654435761)) >>> 0);

    this._drawGroundDetail();
    this._buildBuildings();
    this._drawLampPosts();
  }

  _g(depth) {
    const g = this.scene.add.graphics();
    g.setDepth(depth);
    this.graphics.push(g);
    return g;
  }

  // ---- Ground: faint wet-asphalt sheen + distant smaller grid UNDER the road.
  // Sits at -12 (above the -20 background, below the -10 road fill) so it never
  // covers the drivable surface.
  _drawGroundDetail() {
    const b = this.bounds;
    const g = this._g(-12);

    // A denser, dimmer secondary grid for distant-city depth.
    const step = 55;
    const gridCol = mixColor(this.zone.fog, COLORS.bgDeep, 0.45);
    g.lineStyle(1, gridCol, 0.18);
    const sx = Math.floor(b.x / step) * step;
    const sy = Math.floor(b.y / step) * step;
    for (let x = sx; x <= b.x + b.w; x += step) {
      g.beginPath();
      g.moveTo(x, b.y);
      g.lineTo(x, b.y + b.h);
      g.strokePath();
    }
    for (let y = sy; y <= b.y + b.h; y += step) {
      g.beginPath();
      g.moveTo(b.x, y);
      g.lineTo(b.x + b.w, y);
      g.strokePath();
    }

    // Wet-asphalt sheen hugging the road: a soft glowing band that follows the
    // centreline, suggesting neon light pooling on the street just off-road.
    const sheen = this._g(-11);
    const p = this.path;
    const stepI = 2;
    for (const side of [1, -1]) {
      const inner = [];
      const outer = [];
      for (let i = 0; i < p.length; i += stepI) {
        const n = this.normals[i];
        const o0 = this.half * 1.02;
        const o1 = this.half * 1.55;
        inner.push({ x: p[i].x + n.x * side * o0, y: p[i].y + n.y * side * o0 });
        outer.push({ x: p[i].x + n.x * side * o1, y: p[i].y + n.y * side * o1 });
      }
      const ribbon = inner.concat(outer.slice().reverse());
      sheen.fillStyle(mixColor(COLORS.asphaltDark, COLORS.bgDeep, 0.3), 0.28);
      sheen.fillPoints(ribbon, true, true);
    }
  }

  // ---- Buildings: walk the track, place a block just outside each edge on
  // both sides, spaced ~150-220 units apart. Batch everything into 3 Graphics
  // layers (shadow/ground, faces, tops) so the whole city is a few draw calls.
  _buildBuildings() {
    const gShadow = this._g(-12); // drop-shadows toward the road (ground)
    const gFace = this._g(-9); // building faces, outlines, windows
    const gTop = this._g(-6); // roof rects + rooftop signage (building tops)

    const p = this.path;
    let landmarkBudget = 4; // a handful of standout billboards

    for (const side of [1, -1]) {
      // March along the track by arc length.
      let d = rangeRand(this._rnd, 40, 120);
      while (d < this.total - 30) {
        const spacing = rangeRand(this._rnd, 150, 220);
        const c = this.track.pointAtDistance(d);
        const n = unit(c.nx, c.ny); // left-side unit normal
        const tx = -n.y; // tangent (along track)
        const ty = n.x;

        // Footprint: width along the road, depth away from the road.
        const along = rangeRand(this._rnd, 95, 165); // building frontage
        const depth = rangeRand(this._rnd, 110, 230); // how far back it goes
        const gap = rangeRand(this._rnd, 26, 64); // setback from road edge

        // Near face sits just outside the road edge on this side.
        const baseOff = this.half + gap;
        const fcx = c.x + n.x * side * (baseOff + depth / 2);
        const fcy = c.y + n.y * side * (baseOff + depth / 2);

        // Decide if this is a landmark billboard tower.
        const isLandmark = landmarkBudget > 0 && this._rnd() < 0.16;
        if (isLandmark) landmarkBudget--;

        this._drawBuilding(gShadow, gFace, gTop, {
          cx: fcx,
          cy: fcy,
          ax: tx, // along-road axis (unit)
          ay: ty,
          nx: n.x * side, // outward-from-road axis (unit)
          ny: n.y * side,
          along,
          depth,
          baseOff,
          c,
          side,
          isLandmark,
        });

        d += spacing;
      }
    }
  }

  // Draw one chunky building. The footprint is an oriented rectangle: its local
  // axes are `a` (along the road) and `n` (outward from the road). We fake
  // height top-down by (a) casting a darker drop-shadow toward the road and
  // (b) drawing a lighter, offset roof rectangle pushed AWAY from the road, so
  // the tall face reads as rising up out of the street.
  _drawBuilding(gShadow, gFace, gTop, o) {
    const r = this._rnd;
    const halfA = o.along / 2;
    const halfN = o.depth / 2;

    // Oriented-rect corner helper in world space (la = along offset, ln = out).
    const pt = (la, ln) => ({
      x: o.cx + o.ax * la + o.nx * ln,
      y: o.cy + o.ay * la + o.ny * ln,
    });
    const rect = (la0, ln0, la1, ln1) => [
      pt(la0, ln0),
      pt(la1, ln0),
      pt(la1, ln1),
      pt(la0, ln1),
    ];

    // Muted facade identity (concrete / brick / taupe).
    const tone = FACADE[intRand(r, 0, FACADE.length - 1)];
    const faceBase = tone;
    const faceLight = mixColor(tone, COLORS.white, 0.1); // upper, catching street light
    const faceDark = mixColor(tone, COLORS.bgDeep, 0.42); // shaded ground floor (road side)
    const outline = mixColor(tone, COLORS.bgDeep, 0.6); // hard pixel outline
    const sign = SIGN[intRand(r, 0, SIGN.length - 1)];

    // Pseudo-3D "height": how far the roof is offset further away from road.
    const rise = rangeRand(r, 16, 46);

    // ---- (a) Drop shadow toward the road (ground plane, darkest). ----
    const shadowDepth = rangeRand(r, 16, 30);
    gShadow.fillStyle(COLORS.bgDeep, 0.5);
    gShadow.fillPoints(rect(-halfA - 4, -halfN - shadowDepth, halfA + 4, -halfN + 2), true, true);

    // ---- Building face: solid muted wall, lighter up top, darker shopfront base. ----
    gFace.fillStyle(faceBase, 1);
    gFace.fillPoints(rect(-halfA, -halfN, halfA, halfN), true, true);
    gFace.fillStyle(faceLight, 0.5);
    gFace.fillPoints(rect(-halfA, halfN - o.depth * 0.5, halfA, halfN), true, true);
    gFace.fillStyle(faceDark, 1);
    gFace.fillPoints(rect(-halfA, -halfN, halfA, -halfN + o.depth * 0.2), true, true);

    // Hard pixel outline (no neon glow).
    const outlineRing = [pt(-halfA, -halfN), pt(halfA, -halfN), pt(halfA, halfN), pt(-halfA, halfN)];
    gFace.lineStyle(2, outline, 1);
    gFace.strokePoints(outlineRing, true, true);

    // ---- Lit window grid (warm/cool/dark apartment windows). ----
    this._drawWindows(gFace, pt, halfA, halfN, o.depth, r);

    // ---- (b) Concrete roof pushed away from the road, with rooftop clutter. ----
    gTop.fillStyle(ROOF, 1);
    gTop.fillPoints(rect(-halfA + 2, halfN, halfA - 2, halfN + rise), true, true);
    gTop.lineStyle(2, mixColor(ROOF, COLORS.bgDeep, 0.5), 1);
    gTop.strokePoints(
      [pt(-halfA + 2, halfN), pt(halfA - 2, halfN), pt(halfA - 2, halfN + rise), pt(-halfA + 2, halfN + rise)],
      true,
      true,
    );
    this._drawRoofClutter(gTop, pt, halfA, halfN, rise, r);

    // ---- Occasional muted shop sign / billboard. ----
    this._drawSignage(gTop, pt, halfA, halfN, rise, sign, r, o.isLandmark);
  }

  // Grid of warm/cool/dark apartment windows on the upper floors (above the
  // shopfront band nearest the road).
  _drawWindows(gFace, pt, halfA, halfN, depth, r) {
    const cell = 14; // pixel-chunky window pitch
    const win = 8;
    const startA = -halfA + 10;
    const endA = halfA - 10;
    const startN = -halfN + depth * 0.28; // leave the ground floor for the shopfront
    const endN = halfN - 8;
    for (let la = startA; la <= endA - win; la += cell) {
      for (let ln = startN; ln <= endN - win; ln += cell) {
        const roll = r();
        if (roll < 0.4) gFace.fillStyle(WIN_DARK, 0.9);
        else if (roll < 0.72) gFace.fillStyle(WIN_WARM, 0.92);
        else gFace.fillStyle(WIN_COOL, 0.82);
        this._fillWinSquare(gFace, pt, la, ln, win);
      }
    }
  }

  // 1-2 air-con boxes / vents on the concrete roof.
  _drawRoofClutter(gTop, pt, halfA, halfN, rise, r) {
    const n = intRand(r, 1, 2);
    for (let i = 0; i < n; i++) {
      const bw = rangeRand(r, 10, 18);
      const off = rangeRand(r, -halfA * 0.5, halfA * 0.5);
      const ln0 = halfN + rangeRand(r, 4, Math.max(6, rise - 9));
      const box = [pt(off - bw / 2, ln0), pt(off + bw / 2, ln0), pt(off + bw / 2, ln0 + 8), pt(off - bw / 2, ln0 + 8)];
      gTop.fillStyle(ROOF_AC, 1);
      gTop.fillPoints(box, true, true);
      gTop.lineStyle(1, mixColor(ROOF_AC, COLORS.bgDeep, 0.5), 1);
      gTop.strokePoints(box, true, true);
    }
  }

  _fillWinSquare(g, pt, la, ln, size) {
    g.fillPoints(
      [pt(la, ln), pt(la + size, ln), pt(la + size, ln + size), pt(la, ln + size)],
      true,
      true,
    );
  }

  // Rooftop signage: muted lit signboards (izakaya warmth, not arcade neon).
  // Landmarks get a flat lit billboard; others an occasional vertical signboard
  // or small lit logo box. The colour `sign` comes from the SIGN palette.
  _drawSignage(gTop, pt, halfA, halfN, rise, sign, r, isLandmark) {
    const topN = halfN + rise;
    const box = (la0, ln0, la1, ln1) => [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)];

    if (isLandmark) {
      const bw = halfA * 1.5;
      const bh = rangeRand(r, 36, 54);
      const la0 = -bw / 2;
      const la1 = bw / 2;
      const ln0 = topN + 6;
      const ln1 = topN + 6 + bh;
      gTop.fillStyle(mixColor(sign, COLORS.bgDeep, 0.42), 1);
      gTop.fillPoints(box(la0, ln0, la1, ln1), true, true);
      gTop.lineStyle(2, mixColor(sign, COLORS.white, 0.2), 1);
      gTop.strokePoints(box(la0, ln0, la1, ln1), true, true);
      const bars = intRand(r, 2, 4);
      const seg = bw / (bars + 1);
      gTop.fillStyle(mixColor(sign, COLORS.white, 0.5), 0.95);
      for (let i = 1; i <= bars; i++) {
        const la = la0 + seg * i;
        gTop.fillPoints(box(la - 4, ln0 + 7, la + 4, ln1 - 7), true, true);
      }
      return;
    }

    const roll = r();
    if (roll < 0.45) return; // bare roof — avoid clutter

    if (roll < 0.74) {
      // Vertical signboard with stacked kanji-suggesting ticks.
      const sw = rangeRand(r, 8, 13);
      const sh = rangeRand(r, 30, 58);
      const off = rangeRand(r, -halfA * 0.5, halfA * 0.5);
      const la0 = off - sw / 2;
      const la1 = off + sw / 2;
      const ln0 = topN + 4;
      const ln1 = topN + 4 + sh;
      gTop.fillStyle(mixColor(sign, COLORS.bgDeep, 0.4), 1);
      gTop.fillPoints(box(la0, ln0, la1, ln1), true, true);
      gTop.lineStyle(1.5, mixColor(sign, COLORS.white, 0.22), 1);
      gTop.strokePoints(box(la0, ln0, la1, ln1), true, true);
      const ticks = intRand(r, 3, 5);
      const tgap = sh / (ticks + 1);
      gTop.fillStyle(mixColor(sign, COLORS.white, 0.55), 0.95);
      for (let i = 1; i <= ticks; i++) {
        const ln = ln0 + tgap * i;
        gTop.fillPoints(box(la0 + 1.5, ln - 1.5, la1 - 1.5, ln + 1.5), true, true);
      }
    } else {
      // Small lit logo box on the roof.
      const bw = rangeRand(r, 20, 36);
      const bh = rangeRand(r, 13, 20);
      const off = rangeRand(r, -halfA * 0.4, halfA * 0.4);
      const la0 = off - bw / 2;
      const la1 = off + bw / 2;
      const ln0 = topN + 4;
      const ln1 = topN + 4 + bh;
      gTop.fillStyle(mixColor(sign, COLORS.bgDeep, 0.32), 1);
      gTop.fillPoints(box(la0, ln0, la1, ln1), true, true);
      gTop.lineStyle(1.5, mixColor(sign, COLORS.white, 0.22), 1);
      gTop.strokePoints(box(la0, ln0, la1, ln1), true, true);
      gTop.fillStyle(mixColor(sign, COLORS.white, 0.5), 1);
      gTop.fillPoints(box(off - bw * 0.18, (ln0 + ln1) / 2 - 2, off + bw * 0.18, (ln0 + ln1) / 2 + 2), true, true);
    }
  }

  // Street lamps along both kerbs — a dark post arm and a warm light pool that
  // spills onto the road edge. Sells the "actual street" feel.
  _drawLampPosts() {
    const gPost = this._g(-8);
    const key = 'lamp_glow';
    if (!this.scene.textures.exists(key)) {
      makeSoftCircle(this.scene, key, 128, COLORS.lamp);
      this._haloKeys.push(key);
    }
    for (const side of [1, -1]) {
      let d = rangeRand(this._rnd, 80, 170);
      while (d < this.total - 30) {
        const c = this.track.pointAtDistance(d);
        const n = unit(c.nx, c.ny);
        const baseX = c.x + n.x * side * (this.half + 16);
        const baseY = c.y + n.y * side * (this.half + 16);
        const headX = c.x + n.x * side * (this.half + 1);
        const headY = c.y + n.y * side * (this.half + 1);
        // warm light pool on the road
        const lx = c.x + n.x * side * (this.half - 8);
        const ly = c.y + n.y * side * (this.half - 8);
        const pool = this.scene.add
          .image(lx, ly, key)
          .setDepth(-9)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0.2)
          .setScale(1.1);
        this.images.push(pool);
        // post arm + warm lamp head
        gPost.lineStyle(3, 0x2b2d33, 1);
        gPost.beginPath();
        gPost.moveTo(baseX, baseY);
        gPost.lineTo(headX, headY);
        gPost.strokePath();
        gPost.fillStyle(COLORS.lamp, 1);
        gPost.fillCircle(headX, headY, 3.5);
        d += rangeRand(this._rnd, 160, 240);
      }
    }
  }

  destroy() {
    for (const g of this.graphics) g.destroy();
    for (const im of this.images) im.destroy();
    this.graphics.length = 0;
    this.images.length = 0;
    // Leave generated halo textures in the cache (cheap, shared by key); they
    // are keyed by colour and may be reused. Remove them if present though.
    for (const k of this._haloKeys) {
      if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    }
    this._haloKeys.length = 0;
  }
}
