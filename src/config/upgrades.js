// Upgrade tracks. Each is bought per-car. Level 0 is the stock value (cost 0).
// `value` semantics are documented per track and consumed in game/Car.js.

export const UPGRADES = {
  // Fuel tank capacity (absolute units). Fuel is the main fail condition, so this
  // is the key "complete the level" upgrade the brief asked for.
  fuel: {
    name: 'Fuel Tank',
    blurb: 'Bigger tank = more time on track.',
    color: 0xffd23f,
    unit: 'L',
    levels: [
      { cost: 0, value: 100 },
      { cost: 1500, value: 132 },
      { cost: 3400, value: 168 },
      { cost: 6200, value: 210 },
      { cost: 11000, value: 260 },
    ],
  },

  // Engine: multiplies acceleration force and raises top speed. value = multiplier.
  engine: {
    name: 'Engine',
    blurb: 'More power, more speed, more score.',
    color: 0xff3b5c,
    unit: '×',
    levels: [
      { cost: 0, value: 1.0 },
      { cost: 2000, value: 1.1 },
      { cost: 4600, value: 1.22 },
      { cost: 8800, value: 1.36 },
      { cost: 15000, value: 1.52 },
    ],
  },

  // Tires: adds lateral grip + drift control (faster combo build, easier recovery,
  // less off-track penalty). value = grip bonus added to the car's base grip.
  tires: {
    name: 'Tires',
    blurb: 'Grip & control — hold longer slides.',
    color: 0x19e3ff,
    unit: '',
    levels: [
      { cost: 0, value: 0.0 },
      { cost: 1800, value: 0.025 },
      { cost: 4200, value: 0.05 },
      { cost: 7800, value: 0.075 },
      { cost: 13000, value: 0.1 },
    ],
  },
};

export const UPGRADE_ORDER = ['fuel', 'engine', 'tires'];

export function maxLevel(key) {
  return UPGRADES[key].levels.length - 1;
}
