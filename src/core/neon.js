// Neon drawing helpers + procedural texture generation. Everything visual in the
// game is built from code here: glow sprites, particles, and the JDM car silhouettes.

import Phaser from 'phaser';
import { COLORS, mixColor } from '../config/theme.js';
import { COLOR_SCHEMES, clampSchemeIndex } from '../config/cars.js';
import { Save } from './SaveManager.js';

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

// --- Chunky 8-bit car renderer ----------------------------------------------
//
// We build a recognisable top-down JDM sports car out of blocky shapes snapped
// to a small pixel grid, then flip the texture to NEAREST filtering so it reads
// as crisp 8-bit pixel art rather than a smooth vector. The car points +X
// (forward = +X, length along the X axis) to match the physics convention.
//
// Layout along the body length (X), front is +X / right:
//   rear bumper | trunk | rear glass | roof | windscreen | bonnet | nose
// The body is shaded as three horizontal bands: a lighter centre "spine" (the
// roof/bonnet crown) flanked by darker "flank" bands so the body looks like it
// curves down to the sides. Those flank bands carry the accent colour so the
// sprite still looks good when Car.js skews it to fake "seeing the side".

// Snap a value to the nearest grid step (gives the blocky pixel look).
function snap(v, step) {
  return Math.round(v / step) * step;
}

// Resolve a car's livery into concrete colours with sensible fallbacks so the
// renderer never has to branch on missing fields.
//
// `schemeIndex` selects one of COLOR_SCHEMES. Index 0 ("Stock", or any scheme
// with a null primary) keeps the car's own hand-tuned livery untouched. Any
// other scheme repaints the body in the scheme's primary and the accents
// (roof/stripe, lower flanks, hood scoop, rear strip) in its secondary, while
// the AE86's 'panda' style is preserved so a repaint still reads as a panda.
function resolveLivery(car, schemeIndex = 0) {
  const lv = car.livery || {};
  const carAccent = car.color ?? COLORS.cyan;
  const baseBody = lv.body ?? mixColor(carAccent, COLORS.white, 0.15);
  const base = {
    style: lv.style || 'solid',
    body: baseBody,
    roof: lv.roof ?? baseBody,
    accent: lv.accent ?? carAccent,
    glass: lv.glass ?? mixColor(COLORS.cyan, COLORS.bgDeep, 0.45),
    trim: lv.trim ?? COLORS.bgDeep,
  };

  const scheme = COLOR_SCHEMES[clampSchemeIndex(schemeIndex)];
  if (!scheme || scheme.primary == null) return base; // stock livery

  const primary = scheme.primary;
  const secondary = scheme.secondary;
  return {
    ...base,
    body: primary,
    // Keep the panda two-tone (white roof) but let solid cars take a roof in the
    // secondary so the scheme reads as genuinely two-tone from above.
    roof: base.style === 'panda' ? COLORS.white : mixColor(primary, secondary, 0.5),
    accent: secondary,
    // Glass shifts slightly toward the primary so tinted bodies don't clash.
    glass: mixColor(base.glass, primary, 0.18),
  };
}

// Generate a chunky 8-bit top-down car texture for a given car definition.
// Uses the +X forward convention. The texture key encodes the colour scheme
// ('car_<id>_s<index>') so repainting a car in the Garage produces a distinct,
// cached texture instead of returning a stale one.
//
// `schemeIndex` is OPTIONAL and backward-compatible: when omitted it falls back
// to the player's saved per-car choice (Save.getCarColor), or the car's stock
// scheme when there's no profile. So every existing 2-arg call site keeps
// working AND automatically reflects the chosen colour everywhere a car is drawn.
export function makeCarTexture(scene, car, schemeIndex) {
  const scheme =
    schemeIndex == null
      ? (Save && typeof Save.getCarColor === 'function' ? Save.getCarColor(car.id) : (car.stockScheme ?? 0))
      : schemeIndex;
  const sIdx = clampSchemeIndex(scheme);
  const key = 'car_' + car.id + '_s' + sIdx;
  if (scene.textures.exists(key)) return key;

  const L = car.gfxLength || 96;
  const W = car.gfxWidth || 46;
  // Generous transparent padding: the sprite gets a glow and gets skewed during
  // drifts, so it needs room to bleed without clipping.
  const pad = 18;
  const texW = L + pad * 2;
  const texH = W + pad * 2;
  const cx = texW / 2;
  const cy = texH / 2;

  // Pixel grid: snapping to ~3px chunks is what sells the 8-bit look.
  const px = 3;
  const hl = snap(L / 2, px);
  const hw = snap(W / 2, px);

  const lv = resolveLivery(car, sIdx);
  const isPanda = lv.style === 'panda';

  // Derived shades for the three-band body shading.
  const bodyMid = lv.body;
  const bodySpine = mixColor(lv.body, COLORS.white, 0.22); // lit crown down the centre
  const bodyFlank = mixColor(lv.body, COLORS.bgDeep, 0.4); // shadowed sides
  const outline = mixColor(lv.body, COLORS.bgDeep, 0.78);
  const accent = lv.accent;
  const glass = lv.glass;
  const glassLit = mixColor(glass, COLORS.white, 0.3);

  const g = scene.make.graphics({ x: 0, y: 0, add: false });

  // Helpers that draw axis-aligned blocks in car-local space (origin at centre).
  // x runs along the length (+X forward), y across the width.
  const block = (x0, y0, x1, y1, color, alpha = 1) => {
    const ax = snap(x0, px);
    const ay = snap(y0, px);
    const bx = snap(x1, px);
    const by = snap(y1, px);
    g.fillStyle(color, alpha);
    g.fillRect(cx + Math.min(ax, bx), cy + Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  };

  // ---- 0. Wheels (drawn UNDER the body so the body overlaps them, leaving
  // only the tyre poking out past the flanks for a planted, detailed look) ----
  const tyre = mixColor(COLORS.bgDeep, 0x000000, 0.2); // near-black rubber
  const tyreLit = mixColor(tyre, COLORS.white, 0.16);
  const rim = mixColor(accent, COLORS.white, 0.35);
  const wheelLen = snap(L * 0.2, px); // tyre footprint along the body
  const wheelHalf = wheelLen / 2;
  const wheelThick = snap(W * 0.16, px); // how far the tyre pokes out past the flank
  const axleFront = snap(hl * 0.62, px);
  const axleRear = -snap(hl * 0.6, px);
  const drawWheel = (ax, side) => {
    const yOuter = side * (hw + wheelThick);
    const yInner = side * snap(hw * 0.74, px);
    const y0 = Math.min(yInner, yOuter);
    const y1 = Math.max(yInner, yOuter);
    g.fillStyle(tyre, 1);
    g.fillRect(cx + ax - wheelHalf, cy + y0, wheelLen, y1 - y0);
    // Lit tread cap on the outer edge + a small hub highlight.
    g.fillStyle(tyreLit, 1);
    g.fillRect(cx + ax - wheelHalf, cy + (side > 0 ? y1 - px : y0), wheelLen, px);
    g.fillStyle(rim, 1);
    g.fillRect(cx + ax - px, cy + (side > 0 ? y0 + px : y1 - px * 2), px * 2, px);
  };
  drawWheel(axleFront, -1);
  drawWheel(axleFront, 1);
  drawWheel(axleRear, -1);
  drawWheel(axleRear, 1);

  // ---- 1. Body silhouette ----
  // We paint the body as a stack of vertical pixel columns whose half-width
  // tapers toward the nose and tail, giving a chamfered (blocky-rounded) car
  // silhouette with transparent corners. Each column is shaded into three
  // horizontal bands (flank / mid / lit spine) for top-down curvature.

  // Width profile along the length: narrower at nose and tail (the car tapers).
  // Returns half-width at a given local x.
  const halfWidthAt = (x) => {
    const t = x / hl; // -1 (rear) .. +1 (nose)
    let w = hw;
    if (t > 0.62) w = hw * (1 - (t - 0.62) / 0.38 * 0.34); // taper to nose
    else if (t < -0.78) w = hw * (1 - (-t - 0.78) / 0.22 * 0.22); // slight tail taper
    return snap(w, px);
  };

  // Paint the body as vertical pixel columns so the silhouette can taper.
  for (let x = -hl; x < hl; x += px) {
    const w = halfWidthAt(x + px / 2);
    if (w <= 0) continue;
    const xa = cx + x;
    const wpx = px;
    // outline column
    g.fillStyle(outline, 1);
    g.fillRect(xa, cy - w, wpx, w * 2);
    const wi = Math.max(0, w - px);
    if (wi <= 0) continue;
    // flank band
    g.fillStyle(bodyFlank, 1);
    g.fillRect(xa, cy - wi, wpx, wi * 2);
    // mid band
    const wm = snap(wi * 0.74, px);
    if (wm > 0) {
      g.fillStyle(bodyMid, 1);
      g.fillRect(xa, cy - wm, wpx, wm * 2);
    }
    // lit spine
    const ws = snap(wi * 0.42, px);
    if (ws > 0) {
      g.fillStyle(bodySpine, 1);
      g.fillRect(xa, cy - ws, wpx, ws * 2);
    }
  }

  // ---- 2. Panda lower flanks (AE86) ----
  // Black lower body band along both flanks + black bonnet accent.
  if (isPanda) {
    const blk = lv.accent; // black
    for (let x = -hl; x < hl; x += px) {
      const w = halfWidthAt(x + px / 2);
      if (w <= 0) continue;
      const xa = cx + x;
      const bandTop = snap(w * 0.62, px);
      g.fillStyle(blk, 1);
      g.fillRect(xa, cy - w, px, w - bandTop); // upper flank black
      g.fillRect(xa, cy + bandTop, px, w - bandTop); // lower flank black
    }
  }

  // ---- 2b. Two-tone racing stripe (solid liveries only) ----
  // A pair of secondary-colour stripes run nose-to-tail down the bonnet/roof
  // crown, so a repaint reads as a genuine two-tone from the top-down camera.
  // Panda cars get their black flanks instead and skip this.
  if (!isPanda) {
    const stripeCol = accent;
    const stripeLit = mixColor(accent, COLORS.white, 0.25);
    const stripeHalf = snap(hw * 0.16, px);
    const gap = snap(hw * 0.06, px);
    for (let x = -hl + px * 2; x < hl - px * 2; x += px) {
      const w = halfWidthAt(x + px / 2);
      if (w <= stripeHalf + gap) continue;
      const xa = cx + x;
      // twin stripes either side of the centre line
      g.fillStyle(stripeCol, 1);
      g.fillRect(xa, cy - stripeHalf - gap, px, stripeHalf);
      g.fillRect(xa, cy + gap, px, stripeHalf);
      g.fillStyle(stripeLit, 1);
      g.fillRect(xa, cy - stripeHalf - gap, px, px); // top highlight
      g.fillRect(xa, cy + gap, px, px);
    }
  }

  // ---- 3. Bonnet (front) detailing: hood scoop / vent hint ----
  const bonnetX0 = snap(hl * 0.42, px);
  const bonnetX1 = snap(hl * 0.84, px);
  // Bonnet shadow line.
  block(bonnetX0, -hw * 0.5, bonnetX0 + px, hw * 0.5, outline, 0.6);
  // Hood scoop: a small darker rectangle with a lighter lip.
  const scoopColor = isPanda ? lv.accent : mixColor(bodyMid, COLORS.bgDeep, 0.5);
  block(bonnetX0 + px * 2, -hw * 0.26, bonnetX1 - px, hw * 0.26, scoopColor);
  block(bonnetX0 + px * 2, -hw * 0.16, bonnetX0 + px * 4, hw * 0.16, mixColor(scoopColor, COLORS.white, 0.25));

  // ---- 4. Cabin: windscreen, roof, rear window ----
  const wsX1 = snap(hl * 0.4, px); // windscreen front edge
  const wsX0 = snap(hl * 0.12, px); // windscreen / roof boundary
  const roofX0 = -snap(hl * 0.16, px); // roof rear edge
  const rwX0 = -snap(hl * 0.46, px); // rear window rear edge
  const cabHalf = snap(hw * 0.66, px);

  // Pillars / cabin base (dark trim around the glass).
  block(rwX0 - px, -cabHalf - px, wsX1 + px, cabHalf + px, lv.trim);

  // Windscreen (raked: trapezoid faked with two stacked blocks).
  block(wsX0, -cabHalf, wsX1, cabHalf, glass);
  block(snap((wsX0 + wsX1) / 2, px), -snap(cabHalf * 0.7, px), wsX1, snap(cabHalf * 0.7, px), glassLit, 0.8);
  // Roof (body colour, lit, central).
  const roofCol = isPanda ? COLORS.white : mixColor(bodySpine, COLORS.white, 0.12);
  block(roofX0, -cabHalf + px, wsX0, cabHalf - px, roofCol);
  // Roof spine highlight.
  block(roofX0, -snap(cabHalf * 0.4, px), wsX0, snap(cabHalf * 0.4, px), mixColor(roofCol, COLORS.white, 0.3));
  // Rear window.
  block(rwX0, -snap(cabHalf * 0.9, px), roofX0, snap(cabHalf * 0.9, px), glass);

  // ---- 5. Side mirrors poking out near the windscreen base ----
  const mirX = wsX1;
  block(mirX, -hw - px * 2, mirX + px * 2, -hw + px, lv.trim);
  block(mirX, hw - px, mirX + px * 2, hw + px * 2, lv.trim);

  // ---- 6. Headlights (front / +x) ----
  const headColor = car.lightColor || COLORS.white;
  const noseX = halfWidthAt(hl - px) > 0 ? hl - px * 2 : hl - px * 3;
  block(noseX, -hw * 0.66, hl - px, -hw * 0.3, headColor);
  block(noseX, hw * 0.3, hl - px, hw * 0.66, headColor);
  // Glow centre on each headlight.
  block(noseX + px, -hw * 0.58, noseX + px * 2, -hw * 0.38, mixColor(headColor, COLORS.white, 0.5));
  block(noseX + px, hw * 0.38, noseX + px * 2, hw * 0.58, mixColor(headColor, COLORS.white, 0.5));
  // Front grille / lip accent.
  block(hl - px, -hw * 0.22, hl, hw * 0.22, mixColor(accent, COLORS.bgDeep, 0.3));

  // ---- 7. Tail-lights (rear / -x) ----
  const tailX0 = -hl + px;
  block(tailX0, -hw * 0.72, tailX0 + px * 2, -hw * 0.28, COLORS.red);
  block(tailX0, hw * 0.28, tailX0 + px * 2, hw * 0.72, COLORS.red);
  // Bright centre of each tail light.
  block(tailX0, -hw * 0.6, tailX0 + px, -hw * 0.4, mixColor(COLORS.red, COLORS.white, 0.4));
  block(tailX0, hw * 0.4, tailX0 + px, hw * 0.6, mixColor(COLORS.red, COLORS.white, 0.4));
  // Rear accent strip between the lights.
  block(tailX0, -hw * 0.2, tailX0 + px, hw * 0.2, accent);

  // ---- 8. Door / character line on the flanks (sells the skew) ----
  const lineCol = mixColor(bodyFlank, COLORS.bgDeep, 0.4);
  block(roofX0, -hw + px, wsX0, -hw + px * 2, lineCol);
  block(roofX0, hw - px * 2, wsX0, hw - px, lineCol);

  g.generateTexture(key, texW, texH);
  g.destroy();

  // Crisp pixels: NEAREST filtering keeps the 8-bit blocks sharp when scaled,
  // rotated, and skewed in-game.
  const tex = scene.textures.get(key);
  if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
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
