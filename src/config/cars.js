// The garage: six JDM legends. `phys` feeds the drift model in game/Car.js;
// `stats` are 0–100 bars for the garage UI; `color` is the neon accent.

import { COLORS } from './theme.js';

export const CARS = {
  ae86: {
    id: 'ae86',
    name: 'AE86',
    full: 'Hachi-Roku',
    chassis: 'Toyota Sprinter Trueno',
    price: 0, // starter car
    color: COLORS.cyan,
    lightColor: 0xffffff,
    blurb: 'Light, tossable, eternal. The tofu-shop legend that taught the world to drift.',
    gfxLength: 92,
    gfxWidth: 44,
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
    blurb: 'The drifter’s drifter. Perfectly balanced — born sideways.',
    gfxLength: 96,
    gfxWidth: 46,
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
    blurb: 'Heavier and planted. Forgiving angle, smooth transitions, real-deal sedan.',
    gfxLength: 100,
    gfxWidth: 48,
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
    color: COLORS.purple,
    lightColor: 0xe6dcff,
    blurb: 'Rotary scream, knife-edge balance. Fast, light, and a little bit feral.',
    gfxLength: 98,
    gfxWidth: 46,
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
    blurb: 'Big torque, big slides. Muscle from the East — grunt over finesse.',
    gfxLength: 102,
    gfxWidth: 50,
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
    blurb: 'The 2JZ icon. Endless power, mountains of grip — the endgame ride.',
    gfxLength: 108,
    gfxWidth: 52,
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
