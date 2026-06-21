// Levels are authored with a compact segment DSL and expanded into a centerline
// path at load. Pickups/obstacles are placed deterministically by the Track
// builder from per-level counts (see game/Track.js), seeded by level order.
//
// Segment commands:
//   ['s', length]          straight of `length` world units
//   ['l', degrees, radius] curve LEFT  by `degrees` at turn `radius`
//   ['r', degrees, radius] curve RIGHT by `degrees` at turn `radius`

import { COLORS } from './theme.js';

function buildPath(segments, startAngleDeg = 0) {
  const pts = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  let ang = (startAngleDeg * Math.PI) / 180;
  const STEP = 26; // sampling resolution along the path

  for (const seg of segments) {
    const kind = seg[0];
    if (kind === 's') {
      const len = seg[1];
      const n = Math.max(1, Math.round(len / STEP));
      const d = len / n;
      for (let i = 0; i < n; i++) {
        x += Math.cos(ang) * d;
        y += Math.sin(ang) * d;
        pts.push({ x, y });
      }
    } else {
      const deg = seg[1];
      const radius = seg[2];
      const dir = kind === 'l' ? -1 : 1; // left decreases heading (y-down screen space)
      const arcLen = (Math.abs(deg) * Math.PI * radius) / 180;
      const n = Math.max(3, Math.round(arcLen / STEP));
      const dAng = (dir * deg * Math.PI) / 180 / n;
      const d = arcLen / n;
      for (let i = 0; i < n; i++) {
        ang += dAng;
        x += Math.cos(ang) * d;
        y += Math.sin(ang) * d;
        pts.push({ x, y });
      }
    }
  }
  return pts;
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

export const ZONES = {
  docks: {
    id: 'docks',
    name: 'Neon Docks',
    subtitle: 'Wide harbor roads. Learn to dance.',
    road: 0x14122b,
    edge: COLORS.cyan,
    accent: COLORS.cyan,
    sky: [0x0a0820, 0x130a2e],
    fog: 0x0b1530,
  },
  touge: {
    id: 'touge',
    name: 'Mountain Touge',
    subtitle: 'Tight switchbacks at midnight.',
    road: 0x1a1430,
    edge: COLORS.pink,
    accent: COLORS.pink,
    sky: [0x0c0618, 0x1d0a2a],
    fog: 0x200a2e,
  },
  expressway: {
    id: 'expressway',
    name: 'Skyline Expressway',
    subtitle: 'Flat-out sweepers above the city.',
    road: 0x12102e,
    edge: COLORS.purple,
    accent: COLORS.purple,
    sky: [0x07060f, 0x140a30],
    fog: 0x140a30,
  },
};

// Raw level definitions. order is the global index (drives unlock + difficulty).
const RAW = [
  // ---- Neon Docks --------------------------------------------------------
  {
    id: 'genten', zone: 'docks', name: 'Genten', order: 0,
    roadWidth: 320, fuelStart: 0.82, scoreBronze: 14000, scoreGold: 30000,
    fuelCans: 8, cashTokens: 18, boosters: 3, ramps: 0, jumpFracs: [0.287],
    // GENTEN (原点, "the origin / starting point"). Section-built and verified
    // overlap-free (tools/trackcheck.mjs): intro straight -> big tightening right
    // (~135°) -> left horseshoe -> jump straight -> twin hairpins (the jump can
    // leap across them) -> massive semicircle (big drift) -> flowing run to finish.
    segments: [
      ['s', 280],
      ['r', 95, 360], ['r', 40, 230],
      ['l', 180, 300],
      ['s', 780],
      ['r', 180, 230],
      ['s', 320],
      ['l', 180, 230],
      ['s', 300],
      ['r', 180, 460],
      ['s', 380], ['l', 85, 320], ['s', 320], ['r', 70, 300], ['s', 440],
    ],
  },
  {
    id: 'docks-2', zone: 'docks', name: 'Container Run', order: 1,
    roadWidth: 370, fuelStart: 0.66, scoreBronze: 8000, scoreGold: 17000,
    fuelCans: 5, cashTokens: 10,
    segments: [['s', 700], ['l', 90, 320], ['s', 600], ['r', 90, 320], ['s', 520], ['r', 70, 340], ['s', 700]],
  },
  {
    id: 'docks-3', zone: 'docks', name: 'Pier Pressure', order: 2,
    roadWidth: 360, fuelStart: 0.62, scoreBronze: 10000, scoreGold: 21000,
    fuelCans: 6, cashTokens: 12,
    segments: [['s', 600], ['r', 120, 280], ['s', 520], ['l', 120, 280], ['s', 720], ['l', 80, 320], ['s', 520], ['r', 80, 320], ['s', 600]],
  },

  // ---- Mountain Touge ----------------------------------------------------
  {
    id: 'touge-1', zone: 'touge', name: 'First Climb', order: 3,
    roadWidth: 320, fuelStart: 0.62, scoreBronze: 12000, scoreGold: 24000,
    fuelCans: 6, cashTokens: 12,
    segments: [['s', 600], ['l', 150, 210], ['s', 420], ['r', 150, 210], ['s', 520], ['l', 90, 250], ['s', 520]],
  },
  {
    id: 'touge-2', zone: 'touge', name: 'Switchback', order: 4,
    roadWidth: 315, fuelStart: 0.58, scoreBronze: 14000, scoreGold: 29000,
    fuelCans: 7, cashTokens: 14,
    segments: [['s', 520], ['r', 160, 200], ['s', 360], ['l', 160, 200], ['s', 360], ['r', 140, 215], ['s', 420], ['l', 90, 235], ['s', 520]],
  },
  {
    id: 'touge-3', zone: 'touge', name: 'Mountain King', order: 5,
    roadWidth: 310, fuelStart: 0.56, scoreBronze: 17000, scoreGold: 35000,
    fuelCans: 8, cashTokens: 16,
    segments: [['s', 520], ['l', 120, 235], ['s', 420], ['r', 150, 205], ['s', 360], ['l', 150, 205], ['s', 420], ['r', 110, 245], ['s', 420], ['l', 80, 275], ['s', 520]],
  },

  // ---- Skyline Expressway ------------------------------------------------
  {
    id: 'exp-1', zone: 'expressway', name: 'Night Run', order: 6,
    roadWidth: 350, fuelStart: 0.6, scoreBronze: 18000, scoreGold: 38000,
    fuelCans: 7, cashTokens: 14,
    segments: [['s', 1200], ['l', 70, 480], ['s', 900], ['r', 80, 460], ['s', 1100]],
  },
  {
    id: 'exp-2', zone: 'expressway', name: 'Skyline Loop', order: 7,
    roadWidth: 340, fuelStart: 0.56, scoreBronze: 21000, scoreGold: 44000,
    fuelCans: 8, cashTokens: 16,
    segments: [['s', 1000], ['r', 90, 440], ['s', 820], ['l', 120, 320], ['s', 720], ['r', 100, 400], ['s', 900]],
  },
  {
    id: 'exp-3', zone: 'expressway', name: 'Final Apex', order: 8,
    roadWidth: 330, fuelStart: 0.54, scoreBronze: 25000, scoreGold: 52000,
    fuelCans: 9, cashTokens: 18,
    segments: [['s', 900], ['l', 80, 460], ['s', 720], ['r', 130, 300], ['s', 520], ['l', 150, 260], ['s', 520], ['r', 90, 380], ['s', 820], ['l', 100, 360], ['s', 900]],
  },
];

export const LEVELS = RAW.map((lvl) => {
  const path = buildPath(lvl.segments, lvl.startAngle || 0);
  return {
    ...lvl,
    // Roads are 25% wider than authored — more room for the street, roadside props
    // and committed drifts.
    roadWidth: Math.round(lvl.roadWidth * 1.25),
    // Tighter fuel economy: roughly half the cans and a leaner tank to start, so
    // levels demand fuel upgrades + a few attempts rather than a single easy lap.
    fuelCans: Math.max(1, Math.round(lvl.fuelCans * 0.5)),
    fuelStart: Math.max(0.36, lvl.fuelStart - 0.12),
    zoneData: ZONES[lvl.zone],
    path,
    length: pathLength(path),
    // Need at least `order` total stars to unlock — i.e. clearing prior levels
    // (1 star each for finishing) always unlocks the next. Stars beyond that are
    // bonus cash + completion.
    unlockStars: lvl.order,
  };
});

export function getLevelById(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export function nextLevelId(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1].id : null;
}

export function levelsByZone() {
  const out = {};
  for (const z of Object.keys(ZONES)) out[z] = [];
  for (const l of LEVELS) out[l.zone].push(l);
  return out;
}
