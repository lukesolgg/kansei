// The garage: six JDM legends. `phys` feeds the drift model in game/Car.js;
// `stats` are 0–100 bars for the garage UI; `color` is the neon accent.
//
// `livery` drives the chunky 8-bit car sprite in core/neon.js. Shape:
//   {
//     body:   0xRRGGBB  – main paint colour of the bodywork
//     roof:   0xRRGGBB  – optional roof colour (defaults to body)
//     accent: 0xRRGGBB  – secondary/trim colour: hood scoop, rear strip, the
//                         black flanks for 'panda', and the neon glow accent
//     glass:  0xRRGGBB  – windscreen / window colour
//     style: 'solid' | 'panda'  – 'panda' paints black lower flanks + white
//                                 roof for the AE86 Trueno look
//   }
// `color` is still the menu/HUD neon accent, so it's kept in sync with the
// livery's most representative colour.

import { COLORS } from './theme.js';

// Eight classic two-tone paint schemes the player can pick per car in the
// Garage. `primary` paints the main bodywork; `secondary` paints the accents
// (roof/stripe, lower flanks, hood scoop, rear strip and the neon glow accent).
// makeCarTexture(scene, car, schemeIndex) reads these and repaints the sprite.
// Index 0 ("Stock") is special: it keeps each car's own hand-tuned livery so the
// AE86 stays panda, the FD stays Efini red, etc. Indices 1..7 are the shared
// repaints. `name` is shown under the swatch row; `label` is a short caption.
export const COLOR_SCHEMES = [
  { name: 'Stock', primary: null, secondary: null }, // use the car's own livery
  { name: 'Midnight', primary: 0x1b2030, secondary: 0x19e3ff }, // black / cyan
  { name: 'Sakura', primary: 0xf4f6ff, secondary: 0xff2d9b }, // white / pink
  { name: 'Bayside', primary: 0x1f6dd6, secondary: 0xeef2ff }, // blue / silver
  { name: 'Lightning', primary: 0xffd23f, secondary: 0x16151c }, // yellow / black
  { name: 'Verde', primary: 0x1f6a3a, secondary: 0x39ff5e }, // green / lime
  { name: 'Inferno', primary: 0xd61f3a, secondary: 0x16151c }, // red / black
  { name: 'Champagne', primary: 0xb89a5e, secondary: 0x2a2330 }, // gold / charcoal
];

// Clamp/normalise a scheme index to a valid slot.
export function clampSchemeIndex(i) {
  const n = COLOR_SCHEMES.length;
  if (!Number.isInteger(i) || i < 0 || i >= n) return 0;
  return i;
}

export const CARS = {
  ae86: {
    id: 'ae86',
    name: 'AE86',
    full: 'Hachi-Roku',
    chassis: 'Toyota Sprinter Trueno',
    price: 0, // starter car
    color: 0xf2f4ff, // panda white reads as the menu/HUD accent
    lightColor: 0xffffff,
    livery: { body: 0xf2f4ff, roof: 0xffffff, accent: 0x14151c, glass: 0x2a3550, style: 'panda' },
    blurb: 'Light, tossable, eternal. The tofu-shop legend that taught the world to drift.',
    stockScheme: 0,
    gfxLength: 110,
    gfxWidth: 53,
    shape: { nose: 0.3, cabinFront: 0.4, cabinRear: 0.22 },
    phys: { power: 0.92, maxSpeed: 360, grip: 0.86, turn: 1.08, mass: 0.9, baseFuelBurn: 1.0 },
    stats: { speed: 52, accel: 60, grip: 70, weight: 30 },
  },

  s15: {
    id: 's15',
    name: 'S15',
    full: 'Silvia Spec-R',
    chassis: 'Nissan Silvia S15',
    price: 4500,
    color: COLORS.pink,
    lightColor: 0xfff0ff,
    // Silver bodywork with a hot-pink drift-team accent.
    livery: { body: 0xc9d2e0, roof: 0xdfe6f0, accent: COLORS.pink, glass: 0x2c2540, style: 'solid' },
    blurb: 'The drifter’s drifter. Perfectly balanced — born sideways.',
    stockScheme: 0,
    gfxLength: 115,
    gfxWidth: 55,
    shape: { nose: 0.32, cabinFront: 0.42, cabinRear: 0.2 },
    phys: { power: 1.02, maxSpeed: 400, grip: 0.84, turn: 1.02, mass: 1.0, baseFuelBurn: 1.05 },
    stats: { speed: 60, accel: 66, grip: 66, weight: 44 },
  },

  is200: {
    id: 'is200',
    name: 'IS200',
    full: 'Altezza RS200',
    chassis: 'Lexus IS200',
    price: 9000,
    color: COLORS.amber,
    lightColor: 0xfff6d0,
    // White Altezza with gold accents.
    livery: { body: 0xeef0f5, roof: 0xf6f8fc, accent: COLORS.amber, glass: 0x2b2a3a, style: 'solid' },
    blurb: 'Heavier and planted. Forgiving angle, smooth transitions, real-deal sedan.',
    stockScheme: 0,
    gfxLength: 120,
    gfxWidth: 58,
    shape: { nose: 0.36, cabinFront: 0.46, cabinRear: 0.24 },
    phys: { power: 0.98, maxSpeed: 384, grip: 0.9, turn: 0.92, mass: 1.16, baseFuelBurn: 1.1 },
    stats: { speed: 56, accel: 58, grip: 80, weight: 64 },
  },

  fd: {
    id: 'fd',
    name: 'FD RX-7',
    full: 'Efini FD3S',
    chassis: 'Mazda RX-7',
    price: 16000,
    color: COLORS.red,
    lightColor: 0xe6dcff,
    // Efini RX-7 in deep red with a violet under-accent.
    livery: { body: 0xd61f3a, roof: 0xe23a52, accent: COLORS.purple, glass: 0x241d3a, style: 'solid' },
    blurb: 'Rotary scream, knife-edge balance. Fast, light, and a little bit feral.',
    stockScheme: 0,
    gfxLength: 118,
    gfxWidth: 55,
    shape: { nose: 0.26, cabinFront: 0.4, cabinRear: 0.18 },
    phys: { power: 1.22, maxSpeed: 460, grip: 0.82, turn: 1.06, mass: 0.96, baseFuelBurn: 1.2 },
    stats: { speed: 74, accel: 78, grip: 60, weight: 40 },
  },

  z370: {
    id: 'z370',
    name: '370Z',
    full: 'Fairlady Z',
    chassis: 'Nissan 370Z',
    price: 26000,
    color: COLORS.orange,
    lightColor: 0xffe0c0,
    // Orange over black — aggressive muscle scheme.
    livery: { body: COLORS.orange, roof: 0xff8c2e, accent: 0x16151c, glass: 0x241a14, style: 'solid' },
    blurb: 'Big torque, big slides. Muscle from the East — grunt over finesse.',
    stockScheme: 0,
    gfxLength: 122,
    gfxWidth: 60,
    shape: { nose: 0.3, cabinFront: 0.4, cabinRear: 0.2 },
    phys: { power: 1.32, maxSpeed: 480, grip: 0.85, turn: 0.94, mass: 1.2, baseFuelBurn: 1.3 },
    stats: { speed: 80, accel: 84, grip: 64, weight: 70 },
  },

  supra: {
    id: 'supra',
    name: 'A80 Supra',
    full: '2JZ Legend',
    chassis: 'Toyota Supra MK4',
    price: 42000,
    color: COLORS.lime,
    lightColor: 0xdfffe0,
    // Classic white A80 with a lime-green 2JZ accent.
    livery: { body: 0xeef4ee, roof: 0xf6faf6, accent: COLORS.lime, glass: 0x1e2a22, style: 'solid' },
    blurb: 'The 2JZ icon. Endless power, mountains of grip — the endgame ride.',
    stockScheme: 0,
    gfxLength: 130,
    gfxWidth: 62,
    shape: { nose: 0.28, cabinFront: 0.42, cabinRear: 0.2 },
    phys: { power: 1.5, maxSpeed: 540, grip: 0.83, turn: 0.96, mass: 1.26, baseFuelBurn: 1.45 },
    stats: { speed: 96, accel: 92, grip: 62, weight: 74 },
  },
};

export const CAR_ORDER = ['ae86', 's15', 'is200', 'fd', 'z370', 'supra'];
export const STARTER_CAR = 'ae86';

export function carList() {
  return CAR_ORDER.map((id) => CARS[id]);
}
