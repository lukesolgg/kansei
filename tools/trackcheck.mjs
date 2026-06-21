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
const segments = [
  ['s', 600],                 // 1. intro straight (lengthened)
  ['r', 95, 360], ['r', 40, 230], // 2. big right, wide then tighter (~135deg)
  ['l', 180, 300],            // 3. big left horseshoe
  ['s', 780],                 // 4. straight WITH the jump (segment index 4)
  ['r', 180, 230],            // 5. hairpin 1 (right)
  ['s', 320],                 // 6. connector
  ['l', 180, 230],            // 7. hairpin 2 (left) — switchback
  ['s', 300],                 // 8. connector
  ['r', 180, 460],            // 9. massive semicircle (big drift)
  ['s', 380], ['l', 85, 320], ['s', 320], ['r', 70, 300], ['s', 440], // 10. flowing ending -> finish
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
// jump on the mid-point of segment index 4 (the 5th seg = the long jump straight)
const seg4Start = bounds[3];
const seg4Mid = (bounds[3] + bounds[4]) / 2;
console.log('seg4 (jump straight): start', Math.round(seg4Start), ' end', Math.round(bounds[4]), ' mid', Math.round(seg4Mid));
console.log('=> jumpFrac (mid of seg4):', (seg4Mid / total).toFixed(3));
