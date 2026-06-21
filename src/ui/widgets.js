// Reusable neon UI widgets: buttons, panels, stat bars, star rows, and the
// retro scanline overlay. Keeps every scene's look consistent.

import Phaser from 'phaser';
import { COLORS, FONTS, hex, labelStyle, mixColor } from '../config/theme.js';
import { drawNeonRoundRect } from '../core/neon.js';
import { Audio } from '../core/audio.js';

export function neonButton(scene, x, y, w, h, label, opts = {}, onClick) {
  const color = opts.color || COLORS.cyan;
  const radius = opts.radius ?? 12;
  const baseTextColor = opts.textColor || COLORS.text;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  let disabled = false;

  const draw = (hover) => {
    g.clear();
    const col = disabled ? COLORS.textMute : color;
    drawNeonRoundRect(g, -w / 2, -h / 2, w, h, radius, col, {
      fill: hover && !disabled ? col : COLORS.asphaltDark,
      fillAlpha: hover && !disabled ? 0.28 : 0.82,
      lineWidth: 2,
      glow: !disabled,
      glowAlpha: hover ? 0.3 : 0.14,
    });
  };
  draw(false);

  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: opts.font || FONTS.body,
      fontSize: `${opts.fontSize || 24}px`,
      fontStyle: opts.fontStyle || '700',
      color: hex(baseTextColor),
      align: 'center',
    })
    .setOrigin(0.5);
  if (opts.letterSpacing) txt.setLetterSpacing(opts.letterSpacing);

  // Hit-testing via an interactive Zone CHILD (the reliable pattern used by the
  // stage cards). container.setInteractive(Rectangle) mis-maps the hit area
  // under FIT scaling, which left most of each button unclickable.
  const zone = scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
  c.add([g, txt, zone]);
  c.setSize(w, h);

  zone.on('pointerover', () => {
    if (disabled) return;
    draw(true);
    txt.setColor(hex(color));
    scene.tweens.add({ targets: c, scale: 1.04, duration: 90 });
  });
  zone.on('pointerout', () => {
    draw(false);
    txt.setColor(hex(disabled ? COLORS.textMute : baseTextColor));
    scene.tweens.add({ targets: c, scale: 1, duration: 90 });
  });
  zone.on('pointerdown', () => {
    if (disabled) return;
    scene.tweens.add({ targets: c, scale: 0.96, duration: 60 });
  });
  zone.on('pointerup', () => {
    if (disabled) return;
    Audio.resume();
    Audio.sfx(opts.sfx || 'click');
    scene.tweens.add({ targets: c, scale: 1.04, duration: 60 });
    onClick && onClick();
  });

  c.setLabel = (s) => txt.setText(s);
  c.setColorTo = (col) => {
    opts.color = col;
    draw(false);
  };
  c.setDisabled = (d) => {
    disabled = d;
    c.setAlpha(d ? 0.5 : 1);
    draw(false);
    txt.setColor(hex(d ? COLORS.textMute : baseTextColor));
  };
  c.txt = txt;
  return c;
}

export function neonPanel(scene, x, y, w, h, color = COLORS.purple, opts = {}) {
  const g = scene.add.graphics();
  drawNeonRoundRect(g, x, y, w, h, opts.radius ?? 16, color, {
    fill: opts.fill ?? COLORS.asphaltDark,
    fillAlpha: opts.fillAlpha ?? 0.8,
    lineWidth: opts.lineWidth ?? 2,
    glow: opts.glow ?? true,
    glowAlpha: opts.glowAlpha ?? 0.14,
  });
  return g;
}

// Horizontal stat bar (0..1 value) used in the garage.
export function statBar(scene, x, y, w, value, color, label) {
  const c = scene.add.container(x, y);
  const h = 12;
  const g = scene.add.graphics();
  g.fillStyle(COLORS.bgDeep, 0.9);
  g.fillRoundedRect(0, 0, w, h, 6);
  g.lineStyle(1, mixColor(color, COLORS.bgDeep, 0.4), 0.8);
  g.strokeRoundedRect(0, 0, w, h, 6);
  const fillW = Math.max(6, w * Phaser.Math.Clamp(value, 0, 1));
  g.fillStyle(color, 1);
  g.fillRoundedRect(0, 0, fillW, h, 6);
  c.add(g);
  if (label) {
    const t = scene.add
      .text(-10, h / 2, label, labelStyle(15, COLORS.textDim))
      .setOrigin(1, 0.5);
    c.add(t);
  }
  return c;
}

// Row of stars (filled = earned). count out of max.
export function starRow(scene, x, y, count, size = 26, max = 3) {
  const c = scene.add.container(x, y);
  const gap = size + 8;
  for (let i = 0; i < max; i++) {
    const on = i < count;
    const star = drawStar(scene, i * gap, 0, size / 2, on ? COLORS.amber : COLORS.textMute, on);
    c.add(star);
  }
  c.setSize(gap * max, size);
  return c;
}

export function drawStar(scene, x, y, r, color, glow) {
  const g = scene.add.graphics({ x, y });
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
  }
  if (glow) {
    g.fillStyle(color, 0.18);
    g.fillCircle(0, 0, r * 1.5);
  }
  g.fillStyle(glow ? color : COLORS.panel, 1);
  g.fillPoints(pts, true, true);
  g.lineStyle(2, color, 1);
  g.strokePoints(pts, true, true);
  return g;
}

// Subtle CRT scanline + vignette overlay across the whole screen (screen-space).
export function scanlines(scene, depth = 1000) {
  const cam = scene.cameras.main;
  const w = cam.width;
  const h = cam.height;
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  g.fillStyle(0x000000, 0.12);
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  return g;
}

// Draggable horizontal slider (0..1). Calls onChange(value) on drag/click.
// Returns a container with a setValue(v) helper.
export function slider(scene, x, y, w, value, color, onChange) {
  const c = scene.add.container(x, y);
  const h = 8;
  const g = scene.add.graphics();
  const knob = scene.add.circle(0, 0, 11, color).setStrokeStyle(2, COLORS.white, 0.9);
  let val = Phaser.Math.Clamp(value, 0, 1);

  const redraw = () => {
    g.clear();
    g.fillStyle(COLORS.bgDeep, 0.9);
    g.fillRoundedRect(0, -h / 2, w, h, h / 2);
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, -h / 2, Math.max(h, w * val), h, h / 2);
    g.lineStyle(2, color, 0.4);
    g.strokeRoundedRect(0, -h / 2, w, h, h / 2);
    knob.setPosition(w * val, 0);
  };
  redraw();
  c.add([g, knob]);

  const zone = scene.add.zone(w / 2, 0, w + 28, 36).setInteractive({ useHandCursor: true, draggable: true });
  const apply = (pointer) => {
    val = Phaser.Math.Clamp((pointer.x - c.x) / w, 0, 1);
    redraw();
    onChange && onChange(val);
  };
  zone.on('pointerdown', apply);
  zone.on('drag', apply);
  c.add(zone);

  c.setValue = (v) => {
    val = Phaser.Math.Clamp(v, 0, 1);
    redraw();
  };
  return c;
}

// Format an integer with thousands separators.
export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}
