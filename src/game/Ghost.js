// Best-lap ghost for Free Mode. Records the car's pose each lap; when a lap beats
// your stored best, that lap becomes the ghost. On every subsequent lap a
// translucent replay car runs your best line from the start/finish seam, so you
// race yourself. The best lap persists per level in localStorage.

import { makeCarTexture } from '../core/neon.js';

const STEP_T = 1 / 30;        // record a pose every 1/30 s of game time
const MAX_SAMPLES = 4000;     // ~133 s cap so an idled lap can't grow unbounded
const TWO_PI = Math.PI * 2;

function storeKey(levelId) {
  return 'kansei_ghost_' + levelId;
}

// Shortest signed delta from a to b (radians), for interpolating heading.
function shortestAngle(a, b) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return d;
}

export class GhostManager {
  constructor(scene, carDef, levelId) {
    this.scene = scene;
    this.carDef = carDef;
    this.levelId = levelId;

    // Current-lap recorder.
    this._buf = [];   // flat [x, y, heading, ...]
    this._acc = 0;    // time toward the next sample
    this._lapTime = 0;

    // Persisted best: { time, step, pts: [x,y,h,...] }.
    this.best = this._load();

    // Playback.
    this._play = null; // { t } when a ghost lap is running
    this.sprite = null;
  }

  _load() {
    try {
      const raw = window.localStorage.getItem(storeKey(this.levelId));
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.pts) && o.pts.length >= 6 && o.time > 0 && o.step > 0) return o;
    } catch (_) {}
    return null;
  }

  _save() {
    try {
      window.localStorage.setItem(storeKey(this.levelId), JSON.stringify(this.best));
    } catch (_) {}
  }

  _ensureSprite() {
    if (this.sprite) return;
    const key = makeCarTexture(this.scene, this.carDef); // cached; mirrors the player's looks
    this.sprite = this.scene.add
      .image(0, 0, key)
      .setDepth(17)            // under the player's shadow(18)/glow(19)/visual(20)
      .setAlpha(0.4)
      .setTint(0x8fe8ff)       // cool, holographic — reads as a ghost, not a 2nd car
      .setVisible(false);
  }

  _push(x, y, heading) {
    if (this._buf.length >= MAX_SAMPLES * 3) return;
    // Round to keep the persisted JSON small.
    this._buf.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(heading * 1000) / 1000);
  }

  // Begin a fresh lap recording and (re)start ghost playback from the seam.
  startLap(x, y, heading) {
    this._buf = [];
    this._acc = 0;
    this._lapTime = 0;
    this._push(x, y, heading);
    if (this.best) {
      this._play = { t: 0 };
      this._ensureSprite();
    }
  }

  // Record + replay each frame. dt is the game-time delta (matches the car), so a
  // hit-stop slows the ghost with you and they stay visually synced.
  update(dt, x, y, heading) {
    this._lapTime += dt;
    this._acc += dt;
    while (this._acc >= STEP_T) {
      this._acc -= STEP_T;
      this._push(x, y, heading);
    }

    if (!this._play || !this.best || !this.sprite) return;
    const pts = this.best.pts;
    const n = pts.length / 3;
    if (n < 2) return;
    this._play.t += dt;
    const fidx = this._play.t / this.best.step;
    let i = Math.floor(fidx);
    if (i >= n - 1) {
      // Ghost reached the line first — park it there until the player's lap ends.
      i = n - 1;
      this.sprite.setPosition(pts[i * 3], pts[i * 3 + 1]).setRotation(pts[i * 3 + 2]);
    } else {
      const f = fidx - i;
      const ax = pts[i * 3], ay = pts[i * 3 + 1], ah = pts[i * 3 + 2];
      const bx = pts[(i + 1) * 3], by = pts[(i + 1) * 3 + 1], bh = pts[(i + 1) * 3 + 2];
      this.sprite.setPosition(ax + (bx - ax) * f, ay + (by - ay) * f);
      this.sprite.setRotation(ah + shortestAngle(ah, bh) * f);
    }
    this.sprite.setVisible(true);
  }

  // Finalize the just-completed lap. Returns true if it's a new best.
  finishLap() {
    const time = this._lapTime;
    if (this._buf.length < 6 || time <= 0) return false;
    // A capped recording stopped mid-lap, so its path doesn't reach the seam —
    // never store it as the ghost (only happens on a degenerate >133 s lap).
    if (this._buf.length >= MAX_SAMPLES * 3) return false;
    if (!this.best || time < this.best.time) {
      this.best = { time, step: STEP_T, pts: this._buf.slice() };
      this._save();
      return true;
    }
    return false;
  }

  lapTime() {
    return this._lapTime;
  }

  bestTime() {
    return this.best ? this.best.time : null;
  }

  destroy() {
    if (this.sprite) this.sprite.destroy();
    this.sprite = null;
    this._play = null;
  }
}
