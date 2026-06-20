// Neon drawing helpers + procedural texture generation. Everything visual in the
// game is built from code here: glow sprites, particles, and the JDM car silhouettes.

import { COLORS, mixColor } from '../config/theme.js';

// Apply a WebGL glow FX to a sprite/text/image. No-op on the Canvas renderer.
export function addGlow(obj, color, outer = 4, inner = 0, quality = 0.3) {
  try {
    if (obj.preFX) {
      obj.preFX.setPadding(10);
      return obj.preFX.addGlow(color, outer, inner, false, quality, 12);
    }
    if (obj.postFX) {
      return obj.postFX.addGlow(color, outer, inner, false, quality, 12);
    }
  } catch (_) {}
  return null;
}

// Soft radial glow dot, used for particles, pickup halos and light bloom.
export function makeSoftCircle(scene, key, size, colorInt) {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, size, size);
  const ctx = canvas.getContext();
  const r = size / 2;
  const c = '#' + (colorInt & 0xffffff).toString(16).padStart(6, '0');
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, c);
  grad.addColorStop(0.35, hexA(colorInt, 0.7));
  grad.addColorStop(1, hexA(colorInt, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
  return key;
}

// Tiny 4px square spark for drift/impact particles.
export function makeSpark(scene, key = 'spark') {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 6, 6);
  g.generateTexture(key, 6, 6);
  g.destroy();
  return key;
}

function hexA(colorInt, a) {
  const r = (colorInt >> 16) & 0xff;
  const g = (colorInt >> 8) & 0xff;
  const b = colorInt & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

// Generate a top-down neon car texture for a given car definition.
// The car points toward +x (so body length is along the X axis), matching the
// physics convention where heading angle 0 means "facing right".
export function makeCarTexture(scene, car) {
  const key = 'car_' + car.id;
  if (scene.textures.exists(key)) return key;

  const L = car.gfxLength || 96;
  const W = car.gfxWidth || 46;
  const pad = 14;
  const texW = L + pad * 2;
  const texH = W + pad * 2;
  const cx = texW / 2;
  const cy = texH / 2;
  const hl = L / 2;
  const hw = W / 2;

  const accent = car.color;
  const body = mixColor(accent, COLORS.bgDeep, 0.78);
  const cabinCol = mixColor(COLORS.cyan, COLORS.bgDeep, 0.55);

  // Shape factors let each chassis look a little different.
  const s = car.shape || {};
  const nose = s.nose ?? 0.32; // how pointed the front is (lower = sharper)
  const cabF = s.cabinFront ?? 0.42;
  const cabR = s.cabinRear ?? 0.2;

  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  const P = (x, y) => ({ x: cx + x, y: cy + y });
  const hull = [
    P(-hl, -hw * 0.72),
    P(-hl * 0.6, -hw),
    P(hl * 0.25, -hw),
    P(hl * 0.74, -hw * 0.82),
    P(hl, -hw * nose),
    P(hl, hw * nose),
    P(hl * 0.74, hw * 0.82),
    P(hl * 0.25, hw),
    P(-hl * 0.6, hw),
    P(-hl, hw * 0.72),
  ];

  // Body fill + neon outline.
  g.fillStyle(body, 1);
  g.fillPoints(hull, true, true);
  g.lineStyle(3, accent, 1);
  g.strokePoints(hull, true, true);

  // Center racing stripe.
  g.lineStyle(2, mixColor(accent, COLORS.white, 0.4), 0.5);
  g.beginPath();
  g.moveTo(cx - hl * 0.55, cy);
  g.lineTo(cx + hl * 0.7, cy);
  g.strokePath();

  // Cabin / glass.
  const cabin = [
    P(-hl * cabR, -hw * 0.6),
    P(hl * cabF, -hw * 0.5),
    P(hl * (cabF + 0.12), 0),
    P(hl * cabF, hw * 0.5),
    P(-hl * cabR, hw * 0.6),
    P(-hl * (cabR + 0.18), 0),
  ];
  g.fillStyle(cabinCol, 0.9);
  g.fillPoints(cabin, true, true);
  g.lineStyle(2, COLORS.cyan, 0.8);
  g.strokePoints(cabin, true, true);

  // Headlights (front / +x) and taillights (rear / -x).
  g.fillStyle(car.lightColor || COLORS.white, 1);
  g.fillCircle(cx + hl * 0.92, cy - hw * 0.45, 3.2);
  g.fillCircle(cx + hl * 0.92, cy + hw * 0.45, 3.2);
  g.fillStyle(COLORS.red, 1);
  g.fillRect(cx - hl * 0.99, cy - hw * 0.62, 3, hw * 0.32);
  g.fillRect(cx - hl * 0.99, cy + hw * 0.3, 3, hw * 0.32);

  g.generateTexture(key, texW, texH);
  g.destroy();
  return key;
}

// Draw a glowing rounded-rect (panel / button) into a Graphics. Simulates a
// neon glow by layering a soft fat stroke under a bright thin one.
export function drawNeonRoundRect(g, x, y, w, h, radius, color, opts = {}) {
  const {
    fill = COLORS.panel,
    fillAlpha = 0.9,
    lineWidth = 2,
    glow = true,
    glowAlpha = 0.18,
  } = opts;

  if (fillAlpha > 0) {
    g.fillStyle(fill, fillAlpha);
    g.fillRoundedRect(x, y, w, h, radius);
  }
  if (glow) {
    g.lineStyle(lineWidth + 6, color, glowAlpha);
    g.strokeRoundedRect(x, y, w, h, radius);
    g.lineStyle(lineWidth + 3, color, glowAlpha * 1.6);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
  g.lineStyle(lineWidth, color, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
}

// Draw an animated-looking perspective grid (synthwave floor) into a Graphics.
export function drawGrid(g, w, h, color, spacing = 64, alpha = 0.12) {
  g.lineStyle(1, color, alpha);
  for (let x = 0; x <= w; x += spacing) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.strokePath();
  }
  for (let y = 0; y <= h; y += spacing) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.strokePath();
  }
}
