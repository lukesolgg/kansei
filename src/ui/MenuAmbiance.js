// Foreground atmosphere for the menu: floating dust motes drifting in the
// sodium light, a few streaks of light rain, plus the cinematic frame
// (letterbox bars + a soft vignette). Kept separate from MenuScene so the home
// screen stays readable. Everything is deterministic-seeded and honours
// reduceMotion (motes/rain go calm/still). Drawn entirely with a couple of
// Graphics objects so it's cheap (no per-particle game objects).

import Phaser from 'phaser';
import { COLORS, mixColor } from '../config/theme.js';
import { Save } from '../core/SaveManager.js';

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

export class MenuAmbiance {
  // depth: where the particles draw (above backdrop, below UI panels).
  constructor(scene, { depth = -6 } = {}) {
    this.scene = scene;
    this.w = scene.scale.width;
    this.h = scene.scale.height;
    this.t = 0;

    this.gfx = scene.add.graphics().setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);

    const r = rng(0xa11ce);
    // Slow floating dust motes catching the light.
    this.motes = [];
    const moteCount = 46;
    for (let i = 0; i < moteCount; i++) {
      this.motes.push({
        x: r() * this.w,
        y: r() * this.h,
        r: 0.8 + r() * 1.8,
        vx: (r() - 0.5) * 10, // gentle horizontal drift
        vy: -3 - r() * 8, // mostly drifting upward
        base: 0.08 + r() * 0.16,
        tw: 0.4 + r() * 2.4, // twinkle speed
        ph: r() * Math.PI * 2,
        warm: r() < 0.6, // most are warm sodium-lit
      });
    }

    // A thin scattering of light rain streaks (front-of-camera, subtle).
    this.rain = [];
    const rainCount = 28;
    for (let i = 0; i < rainCount; i++) {
      this.rain.push({
        x: r() * this.w,
        y: r() * this.h,
        len: 14 + r() * 22,
        vy: 420 + r() * 260, // fast fall
        slant: 18 + r() * 12,
        a: 0.05 + r() * 0.07,
      });
    }
  }

  update(dt) {
    this.t += dt;
    const calm = Save.settings.reduceMotion;
    const g = this.gfx;
    g.clear();

    // --- Dust motes ---
    for (const m of this.motes) {
      if (!calm) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -4) { m.y = this.h + 4; m.x = Math.random() * this.w; }
        if (m.x < -4) m.x = this.w + 4;
        if (m.x > this.w + 4) m.x = -4;
      }
      const tw = calm ? 0.7 : 0.5 + 0.5 * Math.sin(this.t * m.tw + m.ph);
      const col = m.warm ? COLORS.lamp : mixColor(COLORS.cyan, COLORS.white, 0.4);
      g.fillStyle(col, m.base * tw);
      g.fillCircle(m.x, m.y, m.r);
    }

    // --- Light rain (skipped entirely when reduceMotion is on) ---
    if (!calm) {
      g.lineStyle(1.5, mixColor(COLORS.lamp, COLORS.white, 0.5), 1);
      for (const d of this.rain) {
        d.y += d.vy * dt;
        d.x += d.slant * dt;
        if (d.y > this.h + d.len) { d.y = -d.len; d.x = Math.random() * this.w; }
        if (d.x > this.w + 20) d.x = -20;
        g.lineStyle(1.5, mixColor(COLORS.lamp, COLORS.white, 0.5), d.a);
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - d.slant * 0.12 * d.len * 0.06, d.y - d.len);
        g.strokePath();
      }
    }
  }
}

// Cinematic frame drawn ONCE at a high depth: thin letterbox bars top & bottom
// plus a soft corner vignette so the screen feels framed like a title shot.
// Returns the container so the scene can fade/tween it in.
export function cinematicFrame(scene, { depth = 900, bar = 26 } = {}) {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const c = scene.add.container(0, 0).setDepth(depth);

  // Letterbox bars.
  const bars = scene.add.graphics();
  bars.fillStyle(0x000000, 0.92);
  bars.fillRect(0, 0, w, bar);
  bars.fillRect(0, h - bar, w, bar);
  // A faint warm hairline along the inner edge of each bar.
  bars.fillStyle(COLORS.lamp, 0.12);
  bars.fillRect(0, bar, w, 1);
  bars.fillRect(0, h - bar - 1, w, 1);
  c.add(bars);

  // Soft vignette: stacked translucent frames darkening toward the corners.
  const vig = scene.add.graphics();
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const inset = i * 26;
    vig.lineStyle(30, 0x000000, 0.05);
    vig.strokeRect(-inset, -inset, w + inset * 2, h + inset * 2);
  }
  c.add(vig);

  return c;
}
