// Builds a level's world from its centerline path: the neon road ribbon, the
// synthwave background grid, start/finish bands, and all pickups + obstacles.
// Also answers gameplay queries: off-track?, progress%, finished?.

import Phaser from 'phaser';
import { COLORS, mixColor } from '../config/theme.js';
import { makeSoftCircle } from '../core/neon.js';
import { CityDecor } from './CityDecor.js';
import { mulberry32, rangeRand } from '../core/rng.js';
import { TUNING } from '../config/gameplay.js';

function unit(dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

function neonPolyline(g, pts, color, width, closed = false) {
  g.lineStyle(width + 7, color, 0.12);
  g.strokePoints(pts, closed, closed);
  g.lineStyle(width + 3, color, 0.22);
  g.strokePoints(pts, closed, closed);
  g.lineStyle(width, color, 1);
  g.strokePoints(pts, closed, closed);
}

export class Track {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.path = level.path;
    this.half = level.roadWidth / 2;
    this.zone = level.zoneData;
    this.pickups = []; // { sprite, halo, type, value, collected }
    this.obstacles = [];
    this.pads = []; // boosters + ramps (persistent sensors)
    this.trash = [];
    this._lastIdx = 0;
    this.maxProgress = 0;

    this._buildArcTable();
    this._computeBounds();
    this._drawBackground();
    this._drawRoad();
    this.city = new CityDecor(this);
    this._drawStartFinish();
    this._placePickups();
    this._placeObstacles();
    this._placeExtras();
  }

  // Tangent (forward) angle of the track at a sampled point.
  _tangentAngle(pt) {
    return Math.atan2(-pt.nx, pt.ny);
  }

  // ---- Geometry helpers --------------------------------------------------
  _buildArcTable() {
    const p = this.path;
    this.cum = [0];
    for (let i = 1; i < p.length; i++) {
      this.cum[i] = this.cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    }
    this.total = this.cum[this.cum.length - 1];
    // Precompute per-point normals.
    this.normals = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)];
      const b = p[Math.min(p.length - 1, i + 1)];
      const t = unit(b.x - a.x, b.y - a.y);
      this.normals.push({ x: -t.y, y: t.x });
    }
  }

  pointAtDistance(d) {
    d = Math.max(0, Math.min(this.total, d));
    // binary-ish linear scan (paths are short enough)
    let i = 1;
    while (i < this.cum.length && this.cum[i] < d) i++;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(this.path.length - 1, i);
    const seg = this.cum[i1] - this.cum[i0] || 1;
    const t = (d - this.cum[i0]) / seg;
    const p0 = this.path[i0];
    const p1 = this.path[i1];
    const n0 = this.normals[i0];
    const n1 = this.normals[i1];
    return {
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
      nx: n0.x + (n1.x - n0.x) * t,
      ny: n0.y + (n1.y - n0.y) * t,
    };
  }

  _computeBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.path) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const m = this.half + 700;
    this.bounds = { x: minX - m, y: minY - m, w: maxX - minX + m * 2, h: maxY - minY + m * 2 };
  }

  // ---- Rendering ---------------------------------------------------------
  _drawBackground() {
    const b = this.bounds;
    const g = this.scene.add.graphics();
    g.setDepth(-20);
    g.fillStyle(COLORS.bg, 1);
    g.fillRect(b.x, b.y, b.w, b.h);
    // Perspective-less neon grid floor.
    g.lineStyle(1, this.zone.fog, 0.5);
    const step = 110;
    const startX = Math.floor(b.x / step) * step;
    const startY = Math.floor(b.y / step) * step;
    for (let x = startX; x <= b.x + b.w; x += step) {
      g.beginPath();
      g.moveTo(x, b.y);
      g.lineTo(x, b.y + b.h);
      g.strokePath();
    }
    for (let y = startY; y <= b.y + b.h; y += step) {
      g.beginPath();
      g.moveTo(b.x, y);
      g.lineTo(b.x + b.w, y);
      g.strokePath();
    }
  }

  _drawRoad() {
    const p = this.path;
    const half = this.half;
    const left = [];
    const right = [];
    for (let i = 0; i < p.length; i++) {
      const n = this.normals[i];
      left.push({ x: p[i].x + n.x * half, y: p[i].y + n.y * half });
      right.push({ x: p[i].x - n.x * half, y: p[i].y - n.y * half });
    }

    const g = this.scene.add.graphics();
    g.setDepth(-10);

    // Tarmac fill (left edge forward, right edge back = closed ring).
    const ring = left.concat(right.slice().reverse());
    g.fillStyle(this.zone.road, 1);
    g.fillPoints(ring, true, true);

    // Subtle inner tarmac sheen.
    g.fillStyle(mixColor(this.zone.road, COLORS.white, 0.04), 1);
    const innerL = [];
    const innerR = [];
    for (let i = 0; i < p.length; i++) {
      const n = this.normals[i];
      innerL.push({ x: p[i].x + n.x * half * 0.55, y: p[i].y + n.y * half * 0.55 });
      innerR.push({ x: p[i].x - n.x * half * 0.55, y: p[i].y - n.y * half * 0.55 });
    }
    g.fillPoints(innerL.concat(innerR.slice().reverse()), true, true);

    // Neon edge lines.
    neonPolyline(g, left, this.zone.edge, 4);
    neonPolyline(g, right, this.zone.edge, 4);

    // Dashed centre line.
    const dash = this.scene.add.graphics();
    dash.setDepth(-9);
    dash.lineStyle(3, mixColor(this.zone.edge, COLORS.white, 0.3), 0.35);
    const dashLen = 46;
    const gap = 46;
    let d = 0;
    let on = true;
    while (d < this.total) {
      if (on) {
        const a = this.pointAtDistance(d);
        const bb = this.pointAtDistance(Math.min(this.total, d + dashLen));
        dash.beginPath();
        dash.moveTo(a.x, a.y);
        dash.lineTo(bb.x, bb.y);
        dash.strokePath();
      }
      d += on ? dashLen : gap;
      on = !on;
    }
  }

  _drawBand(dist, color, checkered) {
    const c = this.pointAtDistance(dist);
    const nl = unit(c.nx, c.ny);
    const half = this.half;
    const g = this.scene.add.graphics();
    g.setDepth(-8);
    if (checkered) {
      const cells = 8;
      const cw = (half * 2) / cells;
      const depth = 30;
      const tx = -nl.y; // tangent
      const ty = nl.x;
      for (let i = 0; i < cells; i++) {
        const along = -half + i * cw;
        const px = c.x + nl.x * along;
        const py = c.y + nl.y * along;
        const col = i % 2 === 0 ? COLORS.white : COLORS.bgDeep;
        g.fillStyle(col, 1);
        g.fillPoints(
          [
            { x: px - tx * depth, y: py - ty * depth },
            { x: px + nl.x * cw - tx * depth, y: py + nl.y * cw - ty * depth },
            { x: px + nl.x * cw + tx * depth, y: py + nl.y * cw + ty * depth },
            { x: px + tx * depth, y: py + ty * depth },
          ],
          true,
          true,
        );
      }
    }
    // Glowing line across the road.
    g.lineStyle(6, color, 0.9);
    g.beginPath();
    g.moveTo(c.x - nl.x * half, c.y - nl.y * half);
    g.lineTo(c.x + nl.x * half, c.y + nl.y * half);
    g.strokePath();
  }

  _drawStartFinish() {
    this._drawBand(20, this.zone.accent, false);
    this._drawBand(this.total - 6, COLORS.lime, true);
    // Big finish glow halo.
    const c = this.pointAtDistance(this.total - 6);
    makeSoftCircle(this.scene, 'soft_finish', 256, COLORS.lime);
    const halo = this.scene.add.image(c.x, c.y, 'soft_finish');
    halo.setDepth(-7).setBlendMode(Phaser.BlendModes.ADD).setScale(2).setAlpha(0.4);
    this.scene.tweens.add({ targets: halo, alpha: 0.7, scale: 2.4, duration: 900, yoyo: true, repeat: -1 });
    this.finishPoint = c;
  }

  // ---- Pickups & obstacles ----------------------------------------------
  _ensureItemTextures() {
    const s = this.scene;
    if (!s.textures.exists('pk_fuel')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      // Fuel can
      g.fillStyle(mixColor(COLORS.amber, COLORS.bgDeep, 0.6), 1);
      g.fillRoundedRect(8, 12, 32, 30, 6);
      g.lineStyle(3, COLORS.amber, 1);
      g.strokeRoundedRect(8, 12, 32, 30, 6);
      g.fillStyle(COLORS.amber, 1);
      g.fillRect(20, 6, 12, 8); // spout
      g.fillStyle(COLORS.white, 0.95);
      g.fillRect(22, 20, 4, 16); // droplet bar
      g.fillCircle(24, 38, 4);
      g.generateTexture('pk_fuel', 48, 48);
      g.destroy();
    }
    if (!s.textures.exists('pk_cash')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(mixColor(COLORS.lime, COLORS.bgDeep, 0.5), 1);
      g.fillCircle(24, 24, 18);
      g.lineStyle(3, COLORS.lime, 1);
      g.strokeCircle(24, 24, 18);
      g.strokeCircle(24, 24, 12);
      g.fillStyle(COLORS.white, 1);
      g.fillRect(22, 12, 4, 24); // $ stem
      g.fillRect(16, 16, 16, 3);
      g.fillRect(16, 30, 16, 3);
      g.generateTexture('pk_cash', 48, 48);
      g.destroy();
    }
    if (!s.textures.exists('ob_cone')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(mixColor(COLORS.orange, COLORS.bgDeep, 0.35), 1);
      g.fillTriangle(24, 6, 8, 42, 40, 42);
      g.lineStyle(3, COLORS.orange, 1);
      g.strokeTriangle(24, 6, 8, 42, 40, 42);
      g.fillStyle(COLORS.white, 0.9);
      g.fillRect(14, 26, 20, 4);
      g.generateTexture('ob_cone', 48, 48);
      g.destroy();
    }
    if (!s.textures.exists('ob_barrier')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(mixColor(COLORS.red, COLORS.bgDeep, 0.4), 1);
      g.fillRoundedRect(4, 16, 56, 22, 5);
      g.lineStyle(3, COLORS.red, 1);
      g.strokeRoundedRect(4, 16, 56, 22, 5);
      g.fillStyle(COLORS.white, 0.85);
      for (let i = 0; i < 4; i++) g.fillRect(10 + i * 14, 20, 6, 14);
      g.generateTexture('ob_barrier', 64, 54);
      g.destroy();
    }
    makeSoftCircle(s, 'soft_amber', 96, COLORS.amber);
    makeSoftCircle(s, 'soft_lime', 96, COLORS.lime);

    if (!s.textures.exists('pad_boost')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(mixColor(COLORS.cyan, COLORS.bgDeep, 0.55), 0.55);
      g.fillRoundedRect(4, 8, 84, 48, 6);
      g.lineStyle(2, COLORS.cyan, 1);
      g.strokeRoundedRect(4, 8, 84, 48, 6);
      for (let i = 0; i < 3; i++) {
        const cx = 26 + i * 20;
        g.lineStyle(5, COLORS.cyan, 1);
        g.beginPath();
        g.moveTo(cx - 9, 18);
        g.lineTo(cx + 4, 32);
        g.lineTo(cx - 9, 46);
        g.strokePath();
      }
      g.generateTexture('pad_boost', 92, 64);
      g.destroy();
    }
    if (!s.textures.exists('pad_ramp')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(mixColor(COLORS.amber, COLORS.bgDeep, 0.35), 0.8);
      g.fillRoundedRect(4, 10, 66, 44, 5);
      g.lineStyle(2, COLORS.amber, 1);
      g.strokeRoundedRect(4, 10, 66, 44, 5);
      g.fillStyle(0x16151c, 1);
      for (let i = 0; i < 3; i++) g.fillRect(14 + i * 16, 14, 8, 36);
      g.fillStyle(COLORS.white, 0.95); // bright launch lip at the +x end
      g.fillRect(62, 10, 8, 44);
      g.generateTexture('pad_ramp', 76, 64);
      g.destroy();
    }
    if (!s.textures.exists('trash')) {
      const g = s.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x33333d, 1);
      g.fillRoundedRect(8, 12, 24, 28, 4);
      g.lineStyle(2, 0x6a6a78, 1);
      g.strokeRoundedRect(8, 12, 24, 28, 4);
      g.fillStyle(0x4a4a55, 1);
      g.fillRoundedRect(6, 6, 28, 8, 3);
      g.fillStyle(0x24242b, 1);
      for (let i = 0; i < 3; i++) g.fillRect(13 + i * 7, 16, 3, 20);
      g.generateTexture('trash', 40, 46);
      g.destroy();
    }
  }

  _addPad(type, x, y, angle) {
    const key = type === 'ramp' ? 'pad_ramp' : 'pad_boost';
    const sprite = this.scene.matter.add.sprite(x, y, key, null, {
      isStatic: true,
      isSensor: true,
      shape: { type: 'rectangle', width: type === 'ramp' ? 64 : 80, height: 56 },
      label: type,
      angle,
    });
    sprite.setDepth(3);
    this.pads.push(sprite);
  }

  _addTrash(x, y) {
    const sprite = this.scene.matter.add.sprite(x, y, 'trash', null, {
      isStatic: true,
      isSensor: true,
      shape: { type: 'circle', radius: 16 },
      label: 'trash',
    });
    sprite.setDepth(6);
    this.trash.push(sprite);
  }

  _placeExtras() {
    const L = this.level;
    for (let i = 0; i < (L.boosters || 0); i++) {
      const frac = 0.12 + (0.76 * (i + 0.5)) / L.boosters;
      const pt = this.pointAtDistance(frac * this.total);
      this._addPad('booster', pt.x, pt.y, this._tangentAngle(pt));
    }
    for (let i = 0; i < (L.ramps || 0); i++) {
      const frac = 0.22 + (0.56 * (i + 0.5)) / Math.max(1, L.ramps);
      const pt = this.pointAtDistance(frac * this.total);
      this._addPad('ramp', pt.x, pt.y, this._tangentAngle(pt));
    }
    for (let i = 0; i < (L.trashCans || 0); i++) {
      const frac = 0.1 + (0.8 * (i + 0.5)) / Math.max(1, L.trashCans);
      const pt = this.pointAtDistance(frac * this.total);
      const off = rangeRand(this._rnd, -0.62, 0.62) * this.half;
      this._addTrash(pt.x + pt.nx * off, pt.y + pt.ny * off);
    }
  }

  collectTrash(sprite) {
    if (!sprite || !sprite.body) return false;
    this.scene.tweens.killTweensOf(sprite);
    sprite.destroy();
    return true;
  }

  _addPickup(type, x, y) {
    const s = this.scene;
    const key = type === 'fuel' ? 'pk_fuel' : 'pk_cash';
    const haloKey = type === 'fuel' ? 'soft_amber' : 'soft_lime';
    const halo = s.add.image(x, y, haloKey).setDepth(4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
    s.tweens.add({ targets: halo, alpha: 0.85, scale: 1.25, duration: 700, yoyo: true, repeat: -1 });
    const sprite = s.matter.add.sprite(x, y, key, null, {
      isStatic: true,
      isSensor: true,
      shape: { type: 'circle', radius: 26 },
      label: type,
    });
    sprite.setDepth(5);
    const value = type === 'fuel' ? TUNING.fuelRefill : TUNING.cashToken;
    const rec = { sprite, halo, type, value, collected: false };
    sprite.setData('pickup', rec);
    if (type === 'cash') {
      s.tweens.add({ targets: sprite, angle: 360, duration: 2600, repeat: -1 });
    } else {
      s.tweens.add({ targets: sprite, y: y - 6, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.pickups.push(rec);
  }

  _addObstacle(x, y, kind) {
    const s = this.scene;
    const key = kind === 'barrier' ? 'ob_barrier' : 'ob_cone';
    const shape =
      kind === 'barrier'
        ? { type: 'rectangle', width: 54, height: 20 }
        : { type: 'circle', radius: 15 };
    const sprite = s.matter.add.sprite(x, y, key, null, {
      isStatic: true,
      shape,
      label: 'obstacle',
      angle: rangeRand(this._rnd, -0.4, 0.4),
    });
    sprite.setDepth(6);
    this.obstacles.push({ sprite });
  }

  _placePickups() {
    this._ensureItemTextures();
    this._rnd = mulberry32(0x9e37 + this.level.order * 2654435761);
    const L = this.level;
    // Fuel cans — fairly even, mild lateral offset.
    for (let i = 0; i < L.fuelCans; i++) {
      const frac = 0.12 + (0.78 * (i + 0.5)) / L.fuelCans;
      const pt = this.pointAtDistance(frac * this.total);
      const off = rangeRand(this._rnd, -0.45, 0.45) * this.half;
      this._addPickup('fuel', pt.x + pt.nx * off, pt.y + pt.ny * off);
    }
    // Cash — clustered, sometimes hugging the outside (risk/reward on corners).
    let placed = 0;
    let i = 0;
    while (placed < L.cashTokens) {
      const frac = 0.06 + (0.9 * (i + 0.5)) / Math.ceil(L.cashTokens / 2.2);
      if (frac > 0.97) break;
      const base = this.pointAtDistance(frac * this.total);
      const lane = rangeRand(this._rnd, -0.5, 0.5) * this.half;
      const cluster = Math.min(3, L.cashTokens - placed);
      for (let c = 0; c < cluster && placed < L.cashTokens; c++) {
        const pt = this.pointAtDistance((frac + c * 0.012) * this.total);
        this._addPickup('cash', pt.x + pt.nx * lane, pt.y + pt.ny * lane);
        placed++;
      }
      i++;
    }
  }

  _placeObstacles() {
    const L = this.level;
    for (let i = 0; i < L.obstacles; i++) {
      const frac = 0.15 + (0.74 * (i + 0.5)) / L.obstacles + rangeRand(this._rnd, -0.02, 0.02);
      const pt = this.pointAtDistance(Math.min(0.94, Math.max(0.1, frac)) * this.total);
      const off = rangeRand(this._rnd, -0.55, 0.55) * this.half;
      const kind = this._rnd() > 0.55 ? 'barrier' : 'cone';
      this._addObstacle(pt.x + pt.nx * off, pt.y + pt.ny * off, kind);
    }
  }

  collect(sprite) {
    const rec = sprite.getData('pickup');
    if (!rec || rec.collected) return null;
    rec.collected = true;
    // Kill the spin/bob/halo tweens FIRST — otherwise they keep writing .angle/.y
    // to the destroyed Matter sprite, whose body is gone, and throw.
    this.scene.tweens.killTweensOf(rec.sprite);
    if (rec.halo) this.scene.tweens.killTweensOf(rec.halo);
    rec.sprite.destroy();
    if (rec.halo) rec.halo.destroy();
    return { type: rec.type, value: rec.value };
  }

  // ---- Queries -----------------------------------------------------------
  // Windowed nearest-point search around the last known index.
  _nearest(x, y) {
    const p = this.path;
    const W = 70;
    let lo = Math.max(0, this._lastIdx - 20);
    let hi = Math.min(p.length - 1, this._lastIdx + W);
    let bestD = Infinity;
    let bestI = this._lastIdx;
    for (let i = lo; i <= hi; i++) {
      const d = (p[i].x - x) ** 2 + (p[i].y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    // Fallback: if we strayed far, full scan.
    if (Math.sqrt(bestD) > this.half * 2.4) {
      for (let i = 0; i < p.length; i++) {
        const d = (p[i].x - x) ** 2 + (p[i].y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
    }
    this._lastIdx = bestI;
    if (bestI > this.maxProgress) this.maxProgress = bestI;
    return { dist: Math.sqrt(bestD), index: bestI };
  }

  isOffTrack(x, y) {
    return this._nearest(x, y).dist > this.half * 0.96;
  }

  // Distance from the centreline + the unit vector pointing back toward it
  // (inward normal). Used for the soft edge-walls.
  edgeInfo(x, y) {
    const n = this._nearest(x, y);
    const p = this.path[n.index];
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.hypot(dx, dy) || 1;
    return { dist: n.dist, nx: dx / d, ny: dy / d };
  }

  progressFrac() {
    return this.maxProgress / (this.path.length - 1);
  }

  isFinished(x, y) {
    const last = this.path[this.path.length - 1];
    const near = Math.hypot(x - last.x, y - last.y) < this.half * 1.4;
    return this.progressFrac() > 0.97 && near;
  }

  spawn() {
    const p0 = this.path[0];
    const p1 = this.path[Math.min(3, this.path.length - 1)];
    return { x: p0.x, y: p0.y, angle: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
  }
}
