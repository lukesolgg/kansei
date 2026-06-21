// Offline geometry verifier for KANSEI track layouts. Builds the centreline from
// the segment DSL (mirroring config/levels.js buildPath) and reports total length,
// self-overlap (non-adjacent centreline points closer than the road width), and
// the cumulative distance at each segment boundary (so jumps can be placed by
// fraction). Hairpins legitimately bring the road close to itself, so the
// threshold is set below 2*half and we skip a window of same-stretch neighbours.
//
// Usage: node tools/trackcheck.mjs

const STEP = 26;

function buildPath(segments, startAngleDeg = 0) {
  const pts = [{ x: 0, y: 0 }];
  let x = 0, y = 0;
  let ang = (startAngleDeg * Math.PI) / 180;
  const bounds = []; // cumulative arc length at the END of each segment
  let cum = 0;
  for (const seg of segments) {
    const kind = seg[0];
    if (kind === 's') {
      const len = seg[1];
      const n = Math.max(1, Math.round(len / STEP));
      const d = len / n;
      for (let i = 0; i < n; i++) { x += Math.cos(ang) * d; y += Math.sin(ang) * d; pts.push({ x, y }); }
      cum += len;
    } else {
      const deg = seg[1], radius = seg[2];
      const dir = kind === 'l' ? -1 : 1;
      const arcLen = (Math.abs(deg) * Math.PI * radius) / 180;
      const n = Math.max(3, Math.round(arcLen / STEP));
      const dAng = (dir * deg * Math.PI) / 180 / n;
      const d = arcLen / n;
      for (let i = 0; i < n; i++) { ang += dAng; x += Math.cos(ang) * d; y += Math.sin(ang) * d; pts.push({ x, y }); }
      cum += arcLen;
    }
    bounds.push(cum);
  }
  return { pts, bounds };
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

// --- The GENTEN layout (base roadWidth before the global x1.25). ---
const ROAD_BASE = 320;
const EFF_HALF = (ROAD_BASE * 1.25) / 2;
const JUMP_SEG = 7; // segment index of the jump straight
const segments = [
  ['s', 600], // 0  intro straight (entry speed)
  ['r', 90, 480], // 1  fast right sweeper (hold angle)
  ['s', 300], // 2  short link
  ['l', 180, 285], // 3  left hairpin (the key element)
  ['s', 520], // 4  diagonal straight (variety)
  ['r', 70, 360], // 5  right sweeper into the esses
  ['l', 90, 280], // 6  left transition (flick)
  ['s', 700], // 7  JUMP straight (can cut the next corner)
  ['r', 180, 285], // 8  right hairpin
  ['s', 380], // 9  link
  ['l', 160, 460], // 10 massive left sweeper (big drift)
  ['r', 60, 320], // 11 right kink
  ['s', 400], ['l', 80, 300], ['s', 360], ['r', 50, 340], ['s', 500], // 12+ flowing run to finish
];

const { pts, bounds } = buildPath(segments);
const total = pathLength(pts);
const WINDOW = 26;
const THRESH = EFF_HALF * 2 * 0.92;

let minSep = Infinity, worst = null;
let hits = 0;
for (let i = 0; i < pts.length; i++) {
  for (let j = i + WINDOW; j < pts.length; j++) {
    const dd = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    if (dd < minSep) { minSep = dd; worst = [i, j]; }
    if (dd < THRESH) hits++;
  }
}

console.log('total length:', Math.round(total), ' road width:', Math.round(EFF_HALF * 2));
console.log('overlap threshold (<):', Math.round(THRESH), ' min separation:', Math.round(minSep), 'at', worst);
console.log('OVERLAP HITS:', hits);
// jump on the mid-point of the JUMP_SEG straight
const jMid = (bounds[JUMP_SEG - 1] + bounds[JUMP_SEG]) / 2;
console.log('jump straight: start', Math.round(bounds[JUMP_SEG - 1]), ' end', Math.round(bounds[JUMP_SEG]), ' mid', Math.round(jMid));
console.log('=> jumpFrac (mid of jump straight):', (jMid / total).toFixed(3));
