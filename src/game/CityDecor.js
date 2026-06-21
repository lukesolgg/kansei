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

// Neon accent palette for building outlines / signage — Japanese-night energy.
const NEON = [COLORS.pink, COLORS.cyan, COLORS.purple, COLORS.amber, COLORS.red, COLORS.orange];

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
      sheen.fillStyle(mixColor(this.zone.edge, COLORS.bgDeep, 0.62), 0.22);
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

    // Colour identity for this building.
    const neon = NEON[intRand(r, 0, NEON.length - 1)];
    // Dark face: deep blue/purple base tinted slightly toward its neon accent.
    const faceBase = mixColor(COLORS.bgDeep, mixColor(COLORS.purple, neon, 0.5), 0.18);
    const faceDark = mixColor(faceBase, COLORS.bgDeep, 0.35);

    // Pseudo-3D "height": how far the roof is offset further away from road.
    const rise = rangeRand(r, 14, 40);

    // ---- (a) Drop shadow toward the road (ground plane, darkest). ----
    const shadowDepth = rangeRand(r, 16, 30);
    gShadow.fillStyle(COLORS.bgDeep, 0.55);
    gShadow.fillPoints(
      rect(-halfA - 4, -halfN - shadowDepth, halfA + 4, -halfN + 2),
      true,
      true,
    );

    // ---- Building face (the wall that the car visually bounces off). ----
    // Vertical face gradient feel: split into a darker lower band + lit upper.
    gFace.fillStyle(faceDark, 1);
    gFace.fillPoints(rect(-halfA, -halfN, halfA, halfN), true, true);
    gFace.fillStyle(faceBase, 1);
    gFace.fillPoints(rect(-halfA, -halfN + o.depth * 0.32, halfA, halfN), true, true);

    // Neon outline (soft fat under bright thin — matches neon.js glow trick).
    const outlineRing = [
      pt(-halfA, -halfN),
      pt(halfA, -halfN),
      pt(halfA, halfN),
      pt(-halfA, halfN),
    ];
    gFace.lineStyle(7, neon, 0.1);
    gFace.strokePoints(outlineRing, true, true);
    gFace.lineStyle(3.5, neon, 0.28);
    gFace.strokePoints(outlineRing, true, true);
    gFace.lineStyle(1.5, neon, 0.9);
    gFace.strokePoints(outlineRing, true, true);

    // ---- Lit window grid. Small bright squares, deterministically lit/dark.
    this._drawWindows(gFace, pt, halfA, halfN, neon, r);

    // ---- (b) Lighter offset roof rect pushed away from the road (the top). ----
    const roofCol = mixColor(faceBase, COLORS.white, 0.1);
    gTop.fillStyle(roofCol, 1);
    gTop.fillPoints(
      rect(-halfA + 2, halfN, halfA - 2, halfN + rise),
      true,
      true,
    );
    // Roof neon lip facing away from the road.
    gTop.lineStyle(2, neon, 0.8);
    const lip = [pt(-halfA + 2, halfN + rise), pt(halfA - 2, halfN + rise)];
    gTop.beginPath();
    gTop.moveTo(lip[0].x, lip[0].y);
    gTop.lineTo(lip[1].x, lip[1].y);
    gTop.strokePath();

    // ---- Rooftop signage. ----
    this._drawSignage(gTop, pt, halfA, halfN, rise, neon, r, o.isLandmark);
  }

  // Grid of lit/dark window squares across the face.
  _drawWindows(gFace, pt, halfA, halfN, neon, r) {
    const cell = 13; // pixel-chunky window pitch
    const cols = Math.max(2, Math.floor((halfA * 2 - 16) / cell));
    const rows = Math.max(2, Math.floor((halfN * 2 - 16) / cell));
    const win = 8; // lit square size
    const startA = -halfA + 10;
    const startN = -halfN + 10;

    // Warm/cool window palette; mostly the building's neon, some hot windows.
    const litCool = mixColor(neon, COLORS.white, 0.55);
    const litWarm = mixColor(COLORS.amber, COLORS.white, 0.3);
    const dark = mixColor(COLORS.bgDeep, neon, 0.12);

    for (let cI = 0; cI < cols; cI++) {
      for (let rI = 0; rI < rows; rI++) {
        const la = startA + cI * cell;
        const ln = startN + rI * cell;
        const roll = r();
        if (roll < 0.42) {
          // dark / off window
          gFace.fillStyle(dark, 0.85);
          this._fillWinSquare(gFace, pt, la, ln, win);
        } else {
          const warm = r() < 0.3;
          gFace.fillStyle(warm ? litWarm : litCool, warm ? 0.95 : 0.85);
          this._fillWinSquare(gFace, pt, la, ln, win);
        }
      }
    }
  }

  _fillWinSquare(g, pt, la, ln, size) {
    g.fillPoints(
      [pt(la, ln), pt(la + size, ln), pt(la + size, ln + size), pt(la, ln + size)],
      true,
      true,
    );
  }

  // Rooftop signage: vertical neon bars (kanji-suggesting), billboards, glowing
  // logos. Landmarks get a big bright billboard with an additive glow halo.
  _drawSignage(gTop, pt, halfA, halfN, rise, neon, r, isLandmark) {
    const signNeon = NEON[intRand(r, 0, NEON.length - 1)];
    const topN = halfN + rise;

    if (isLandmark) {
      // Big billboard panel spanning much of the frontage, with a glow halo.
      const bw = halfA * 1.5;
      const bh = rangeRand(r, 40, 60);
      const la0 = -bw / 2;
      const la1 = bw / 2;
      const ln0 = topN + 6;
      const ln1 = topN + 6 + bh;
      const panel = mixColor(COLORS.bgDeep, signNeon, 0.35);
      gTop.fillStyle(panel, 1);
      gTop.fillPoints(
        [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)],
        true,
        true,
      );
      // Bright neon frame.
      const frame = [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)];
      gTop.lineStyle(6, signNeon, 0.16);
      gTop.strokePoints(frame, true, true);
      gTop.lineStyle(2.5, signNeon, 1);
      gTop.strokePoints(frame, true, true);
      // Faux kanji/logo block bars inside the billboard.
      const bars = intRand(r, 2, 4);
      const seg = bw / (bars + 1);
      for (let i = 1; i <= bars; i++) {
        const la = la0 + seg * i;
        gTop.fillStyle(mixColor(signNeon, COLORS.white, 0.6), 0.95);
        gTop.fillPoints(
          [
            pt(la - 4, ln0 + 8),
            pt(la + 4, ln0 + 8),
            pt(la + 4, ln1 - 8),
            pt(la - 4, ln1 - 8),
          ],
          true,
          true,
        );
      }
      // Additive glow halo centred on the billboard.
      const c = pt(0, (ln0 + ln1) / 2);
      const key = 'city_glow_' + (signNeon & 0xffffff).toString(16);
      if (!this.scene.textures.exists(key)) {
        makeSoftCircle(this.scene, key, 256, signNeon);
        this._haloKeys.push(key);
      }
      const halo = this.scene.add
        .image(c.x, c.y, key)
        .setDepth(-7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.35)
        .setScale((bw / 256) * 1.6);
      this.images.push(halo);
      return;
    }

    // Otherwise: occasional vertical kanji-suggesting neon bar tower or a small
    // billboard / logo. ~60% of buildings get something.
    const roll = r();
    if (roll < 0.4) return; // bare roof — keeps it from getting cluttered

    if (roll < 0.72) {
      // Vertical neon sign: a tall narrow bar with stacked kanji-like ticks.
      const sw = rangeRand(r, 7, 12);
      const sh = rangeRand(r, 34, 64);
      const off = rangeRand(r, -halfA * 0.5, halfA * 0.5);
      const la0 = off - sw / 2;
      const la1 = off + sw / 2;
      const ln0 = topN + 4;
      const ln1 = topN + 4 + sh;
      gTop.fillStyle(mixColor(COLORS.bgDeep, signNeon, 0.4), 1);
      gTop.fillPoints(
        [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)],
        true,
        true,
      );
      gTop.lineStyle(4, signNeon, 0.18);
      gTop.strokePoints(
        [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)],
        true,
        true,
      );
      gTop.lineStyle(1.5, signNeon, 1);
      gTop.strokePoints(
        [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)],
        true,
        true,
      );
      // Stacked kanji-suggesting ticks down the bar.
      const ticks = intRand(r, 3, 5);
      const tgap = sh / (ticks + 1);
      gTop.fillStyle(mixColor(signNeon, COLORS.white, 0.7), 0.95);
      for (let i = 1; i <= ticks; i++) {
        const ln = ln0 + tgap * i;
        gTop.fillPoints(
          [
            pt(la0 + 1.5, ln - 1.6),
            pt(la1 - 1.5, ln - 1.6),
            pt(la1 - 1.5, ln + 1.6),
            pt(la0 + 1.5, ln + 1.6),
          ],
          true,
          true,
        );
      }
    } else {
      // Small glowing logo box on the roof corner.
      const bw = rangeRand(r, 20, 38);
      const bh = rangeRand(r, 14, 22);
      const off = rangeRand(r, -halfA * 0.4, halfA * 0.4);
      const la0 = off - bw / 2;
      const la1 = off + bw / 2;
      const ln0 = topN + 4;
      const ln1 = topN + 4 + bh;
      const box = [pt(la0, ln0), pt(la1, ln0), pt(la1, ln1), pt(la0, ln1)];
      gTop.fillStyle(mixColor(COLORS.bgDeep, signNeon, 0.3), 1);
      gTop.fillPoints(box, true, true);
      gTop.lineStyle(4, signNeon, 0.16);
      gTop.strokePoints(box, true, true);
      gTop.lineStyle(1.5, signNeon, 1);
      gTop.strokePoints(box, true, true);
      // Bright logo dot/dash.
      gTop.fillStyle(mixColor(signNeon, COLORS.white, 0.6), 1);
      gTop.fillPoints(
        [
          pt(off - bw * 0.18, (ln0 + ln1) / 2 - 2),
          pt(off + bw * 0.18, (ln0 + ln1) / 2 - 2),
          pt(off + bw * 0.18, (ln0 + ln1) / 2 + 2),
          pt(off - bw * 0.18, (ln0 + ln1) / 2 + 2),
        ],
        true,
        true,
      );
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
