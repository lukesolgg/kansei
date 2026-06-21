// Persistent tire-decal system for drift marks. Replaces the old weak skid
// particle effect with proper stamped decals: two streaks (one per rear wheel)
// laid down each frame while drifting, drawn onto the road below the car.
//
// Memory stays bounded via a fixed POOL of reusable Image sprites that are
// recycled oldest-first. No per-frame allocations in emit(), and no giant
// RenderTexture — just a small shared streak texture stamped many times.

import Phaser from 'phaser';
import { COLORS, mixColor } from '../config/theme.js';

// One streak texture shared by every mark. A short rounded dark rect with soft
// (low-alpha) ends so consecutive stamps blend into a continuous line.
const TEX_KEY = 'skidmark_streak';
const TEX_W = 18; // along the heading (length of one stamp)
const TEX_H = 8; // across (tire width)

function makeStreakTexture(scene) {
  if (scene.textures.exists(TEX_KEY)) return TEX_KEY;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Near-black with a faint purple bias so it reads as rubber over the neon road
  // without becoming a hard pure-black slab.
  const col = mixColor(COLORS.bgDeep, COLORS.purple, 0.18);
  const r = TEX_H / 2;
  // Layer a few rounded rects of rising alpha to get soft feathered edges.
  g.fillStyle(col, 0.22);
  g.fillRoundedRect(0, 0, TEX_W, TEX_H, r);
  g.fillStyle(col, 0.3);
  g.fillRoundedRect(1, 1, TEX_W - 2, TEX_H - 2, r - 1);
  g.fillStyle(col, 0.4);
  g.fillRoundedRect(2, 2, TEX_W - 4, TEX_H - 4, Math.max(1, r - 2));
  g.generateTexture(TEX_KEY, TEX_W, TEX_H);
  g.destroy();
  return TEX_KEY;
}

export class SkidMarks {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} [opts]
   * @param {number} [opts.carWidth=46]  Track width; wheel offset = carWidth*0.32.
   * @param {number} [opts.maxMarks=700] Pool size (total sprites = this).
   * @param {number} [opts.depth=2]      Render depth (just above road, below car@20).
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.carWidth = opts.carWidth ?? 46;
    this.maxMarks = opts.maxMarks ?? 700;
    this.depth = opts.depth ?? 2;
    this.wheelOffset = this.carWidth * 0.32;

    const key = makeStreakTexture(scene);

    // Pre-create the full pool up front so emit() never allocates. Sprites start
    // hidden/inactive and are revealed as they're stamped. `head` is the index of
    // the oldest (next-to-recycle) sprite once we wrap around.
    /** @type {Phaser.GameObjects.Image[]} */
    this.pool = new Array(this.maxMarks);
    for (let i = 0; i < this.maxMarks; i++) {
      const img = scene.add.image(0, 0, key);
      img.setDepth(this.depth);
      img.setActive(false).setVisible(false);
      this.pool[i] = img;
    }
    this.head = 0; // next pool slot to (re)use
    this.count = 0; // how many are currently live (<= maxMarks)
  }

  // Stamp a single streak from the pool at the given world position/orientation.
  _stamp(x, y, angle, alpha, scaleLen) {
    const img = this.pool[this.head];
    img.setPosition(x, y);
    img.setRotation(angle);
    img.setScale(scaleLen, 1);
    img.setAlpha(alpha);
    img.setActive(true).setVisible(true);
    this.head = (this.head + 1) % this.maxMarks;
    if (this.count < this.maxMarks) this.count++;
  }

  /**
   * Lay down marks for both rear wheels. Call each frame while drifting.
   * @param {number} x          Rear-axle world X (e.g. car.rearAxle().x).
   * @param {number} y          Rear-axle world Y.
   * @param {number} headingAngle  Car heading in radians.
   * @param {number} intensity  0..1 drift strength (e.g. slip angle, normalized).
   */
  emit(x, y, headingAngle, intensity) {
    const t = Phaser.Math.Clamp(intensity, 0, 1);
    if (t <= 0) return;

    const cos = Math.cos(headingAngle);
    const sin = Math.sin(headingAngle);
    // Perpendicular (left/right) of the heading direction.
    const px = -sin * this.wheelOffset;
    const py = cos * this.wheelOffset;

    // Alpha and stamp length both scale with how hard we're sliding.
    const alpha = 0.35 + 0.55 * t;
    const scaleLen = 0.85 + 0.6 * t;

    // Right wheel, then left wheel.
    this._stamp(x + px, y + py, headingAngle, alpha, scaleLen);
    this._stamp(x - px, y - py, headingAngle, alpha, scaleLen);
  }

  // Hide and reset every mark (e.g. on restart). Keeps the pool allocated.
  clear() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].setActive(false).setVisible(false);
    }
    this.head = 0;
    this.count = 0;
  }

  // Tear down: destroy every pooled sprite.
  destroy() {
    if (this.pool) {
      for (let i = 0; i < this.pool.length; i++) {
        if (this.pool[i]) this.pool[i].destroy();
      }
      this.pool = null;
    }
    this.scene = null;
  }
}
