// Camera post-processing + screen-feel helpers for the neon look.
//
// Phaser 3.90 exposes camera.postFX (WebGL only) with addBloom/addVignette/
// addColorMatrix/addGlow. On the Canvas renderer camera.postFX is undefined, so
// every helper here guards with `if (camera.postFX)` and returns null handles.
// Callers must treat all returned handles (and their fields) as possibly-null.

import { COLORS } from '../config/theme.js';

// Tuned defaults for the gameplay stack. Kept tasteful so neon glows without
// the screen blowing out to white.
const GAMEPLAY = {
  bloom: { color: COLORS.white, offsetX: 1, offsetY: 1, blurStrength: 1.1, strength: 0.55, steps: 4 },
  vignette: { x: 0.5, y: 0.5, radius: 0.92, strength: 0.34 },
};

// Speed-reactive ranges. We lerp between the "rest" and "max" values as the
// normalized speed climbs, adding a subtle sense of pace.
const SPEED = {
  bloomMin: 0.55, bloomMax: 0.78,
  vignetteRadiusMin: 0.92, vignetteRadiusMax: 0.66,
  vignetteStrengthMin: 0.34, vignetteStrengthMax: 0.52,
};

// Split a 0xRRGGBB int into 0..1 r,g,b components.
function rgb01(n) {
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Add a tasteful neon post stack to the gameplay camera: a soft Bloom (to make
 * neon glow), a subtle Vignette, and a ColorMatrix grade (boosted saturation +
 * a hint of contrast and a cool tint). No-op + null handles on Canvas.
 *
 * @param {Phaser.Cameras.Scene2D.Camera} camera
 * @param {object} [opts]
 * @param {number} [opts.bloomStrength]   Base bloom strength (default 0.55).
 * @param {number} [opts.vignetteStrength] Base vignette darkness (default 0.34).
 * @param {number} [opts.saturation]      Saturation grade, 1 = neutral (default 1.18).
 * @param {number} [opts.contrast]        Contrast grade, 1 = neutral (default 1.06).
 * @returns {{ bloom: object|null, vignette: object|null, grade: object|null }}
 */
export function applyGameplayFX(camera, opts = {}) {
  const handles = { bloom: null, vignette: null, grade: null };
  if (!camera || !camera.postFX) return handles;

  const bloomStrength = opts.bloomStrength ?? GAMEPLAY.bloom.strength;
  const vignetteStrength = opts.vignetteStrength ?? GAMEPLAY.vignette.strength;
  const saturation = opts.saturation ?? 1.18;
  const contrast = opts.contrast ?? 1.06;

  try {
    const b = GAMEPLAY.bloom;
    handles.bloom = camera.postFX.addBloom(b.color, b.offsetX, b.offsetY, b.blurStrength, bloomStrength, b.steps);

    const v = GAMEPLAY.vignette;
    handles.vignette = camera.postFX.addVignette(v.x, v.y, v.radius, vignetteStrength);

    // ColorMatrix grade: boost saturation and lift contrast a touch so the neon
    // reads richer. (Phaser's ColorMatrix has saturate/contrast but no scale().)
    const grade = camera.postFX.addColorMatrix();
    grade.saturate(saturation - 1);
    grade.contrast(contrast - 1);
    handles.grade = grade;
  } catch (_) { /* WebGL hiccup — leave whatever handles we got */ }

  return handles;
}

/**
 * Modulate the gameplay stack with normalized speed (0..1): vignette tightens
 * and darkens, and bloom blooms a little harder, for a sense of speed.
 * Null-safe — does nothing if handles or individual effects are missing.
 *
 * @param {{ bloom: object|null, vignette: object|null }} handles
 * @param {number} speed01  Normalized speed, 0..1.
 */
export function setSpeedFX(handles, speed01) {
  if (!handles) return;
  const t = clamp01(speed01 || 0);

  if (handles.bloom) {
    handles.bloom.strength = SPEED.bloomMin + (SPEED.bloomMax - SPEED.bloomMin) * t;
  }
  if (handles.vignette) {
    handles.vignette.radius = SPEED.vignetteRadiusMin + (SPEED.vignetteRadiusMax - SPEED.vignetteRadiusMin) * t;
    handles.vignette.strength = SPEED.vignetteStrengthMin + (SPEED.vignetteStrengthMax - SPEED.vignetteStrengthMin) * t;
  }
}

/**
 * Briefly boost bloom strength for combo / finish pops. Just sets the value —
 * the caller may tween it back if desired. Null-safe.
 *
 * @param {{ bloom: object|null }} handles
 * @param {number} [amount]  Strength to set (default 1.2).
 */
export function pulseBloom(handles, amount = 1.2) {
  if (handles && handles.bloom) handles.bloom.strength = amount;
}

/**
 * A lighter post stack for menu cameras: a softer bloom + faint vignette.
 * No-op + null handles on Canvas.
 *
 * @param {Phaser.Cameras.Scene2D.Camera} camera
 * @returns {{ bloom: object|null, vignette: object|null }}
 */
export function applyMenuFX(camera) {
  const handles = { bloom: null, vignette: null };
  if (!camera || !camera.postFX) return handles;
  try {
    handles.bloom = camera.postFX.addBloom(COLORS.white, 1, 1, 1.0, 0.42, 4);
    handles.vignette = camera.postFX.addVignette(0.5, 0.5, 0.95, 0.22);
  } catch (_) { /* leave whatever we got */ }
  return handles;
}
