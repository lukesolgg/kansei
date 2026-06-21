// Animated synthwave backdrop shared by all menu scenes: gradient sky, a glowing
// neon sun with slits, a scrolling perspective floor grid, and drifting stars.

import Phaser from 'phaser';
import { COLORS, hex, mixColor } from '../config/theme.js';
import { Save } from '../core/SaveManager.js';

export class Backdrop {
  constructor(scene, opts = {}) {
    this.scene = scene;
    const w = scene.scale.width;
    const h = scene.scale.height;
    this.w = w;
    this.h = h;
    this.horizon = h * 0.52;
    this.sunColorTop = opts.sunTop ?? COLORS.amber;
    this.sunColorBot = opts.sunBot ?? COLORS.pink;
    this.gridColor = opts.grid ?? COLORS.purple;
    this.phase = 0;

    this._sky(opts.skyBottom ?? 0x1a0b30);
    this._stars();
    this._sun();
    this.grid = scene.add.graphics().setDepth(-8);
    this._drawGrid(0);
  }

  _sky(bottom) {
    const key = 'sky_' + bottom.toString(16);
    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, 8, this.h);
      const ctx = tex.getContext();
      const grad = ctx.createLinearGradient(0, 0, 0, this.h);
      grad.addColorStop(0, hex(COLORS.bgDeep));
      grad.addColorStop(0.5, hex(mixColor(COLORS.bgDeep, bottom, 0.6)));
      grad.addColorStop(1, hex(bottom));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, this.h);
      tex.refresh();
    }
    this.scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.w, this.h).setDepth(-12);
  }

  _stars() {
    const g = this.scene.add.graphics().setDepth(-11);
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5) % this.w;
      const y = (i * 71.3) % this.horizon;
      const a = 0.2 + ((i * 53) % 60) / 100;
      g.fillStyle(i % 5 === 0 ? COLORS.cyan : COLORS.white, a);
      g.fillCircle(x, y, i % 7 === 0 ? 1.6 : 1);
    }
  }

  _sun() {
    const cx = this.w / 2;
    const cy = this.horizon - 60;
    const r = 150;
    // Glow halo (additive).
    const g = this.scene.add.graphics().setDepth(-10).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(this.sunColorBot, 0.05);
      g.fillCircle(cx, cy, r + i * 14);
    }
    // Sun body split into colour bands.
    const body = this.scene.add.graphics().setDepth(-10);
    const bands = 26;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const yTop = cy - r + t * r * 2;
      const col = mixColor(this.sunColorTop, this.sunColorBot, t);
      // Slits widen toward the bottom.
      if (t > 0.5 && (i % 2 === 0)) continue;
      const halfW = Math.sqrt(Math.max(0, r * r - (yTop - cy) ** 2));
      body.fillStyle(col, 1);
      body.fillRect(cx - halfW, yTop, halfW * 2, (r * 2) / bands + 1);
    }
  }

  _drawGrid(offset) {
    const g = this.grid;
    g.clear();
    const cx = this.w / 2;
    const hz = this.horizon;
    const bottom = this.h;
    g.lineStyle(2, this.gridColor, 0.5);
    // Vertical lines converging to the vanishing point.
    for (let i = -10; i <= 10; i++) {
      const xb = cx + i * (this.w / 9);
      g.beginPath();
      g.moveTo(cx + i * 6, hz);
      g.lineTo(xb, bottom);
      g.strokePath();
    }
    // Horizontal lines accelerating toward the viewer (scrolling).
    const lines = 16;
    for (let i = 0; i < lines; i++) {
      let f = (i + offset) % lines / lines; // 0..1
      const y = hz + Math.pow(f, 2.2) * (bottom - hz);
      const a = 0.12 + f * 0.5;
      g.lineStyle(2, this.gridColor, a);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(this.w, y);
      g.strokePath();
    }
  }

  update(dt) {
    if (Save.settings.reduceMotion) return; // honour the accessibility toggle
    this.phase += dt * 1.1;
    this._drawGrid(this.phase % 16);
  }
}
