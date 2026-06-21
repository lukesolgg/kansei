// Central neon-retro theme: palette, fonts, and small helpers shared by every scene.

export const COLORS = {
  // Backgrounds
  bg: 0x07060f,
  bgDeep: 0x05040b,
  panel: 0x120c2b,
  panelLight: 0x1b1340,
  grid: 0x231a4d,

  // Neon accents
  pink: 0xff2d9b,
  cyan: 0x19e3ff,
  purple: 0x7c4dff,
  lime: 0x39ff5e,
  amber: 0xffd23f,
  red: 0xff3b5c,
  orange: 0xff7a18,
  white: 0xffffff,

  // Text
  text: 0xf2f0ff,
  textDim: 0x9b95cf,
  textMute: 0x615a8f,

  // ---- Retro-pixel street (asphalt + JP road markings) ----
  asphalt: 0x3c3f46, // grey tarmac
  asphaltDark: 0x303338,
  asphaltWorn: 0x474a52, // lighter wheel-path strips
  roadEdgeLine: 0xeae4d2, // cream white edge line
  roadCentreLine: 0xf3c640, // JP yellow centre line
  kerb: 0x7b7f88, // light-grey kerb
  lamp: 0xffca6e, // warm sodium lamp glow
};


export const FONTS = {
  display: 'Orbitron, sans-serif',
  body: 'Rajdhani, sans-serif',
};

// Reference design resolution. The game scales to fit while keeping this aspect.
export const GAME_W = 1280;
export const GAME_H = 720;

// Convert a 0xRRGGBB int to a "#rrggbb" string.
export function hex(n) {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

// Linearly interpolate between two 0xRRGGBB colors. t in [0,1].
export function mixColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// Standard text styles used across UI scenes.
export function titleStyle(size = 64, color = COLORS.white) {
  return {
    fontFamily: FONTS.display,
    fontSize: `${size}px`,
    fontStyle: '900',
    color: hex(color),
  };
}

export function labelStyle(size = 22, color = COLORS.text) {
  return {
    fontFamily: FONTS.body,
    fontSize: `${size}px`,
    fontStyle: '600',
    color: hex(color),
  };
}
