// Offline geometry verifier for KANSEI track layouts. Builds the centreline from
// the segment DSL (mirroring config/levels.js buildPath) and reports total length
// plus any self-overlap (non-adjacent centreline points closer than the road
// width — i.e. lanes that would merge/cross). Hairpins legitimately bring the
// road close to itself (entry/exit ~2R apart), so the threshold is set below
// 2*half and we skip a window of same-stretch neighbours.
//
// Usage: node tools/trackcheck.mjs

const STEP = 26;

function buildPath(segments, startAngleDeg = 0) {
  const pts = [{ x: 0, y: 0 }];
  let x = 0, y = 0;
  let ang = (startAngleDeg * Math.PI) / 180;
  for (const seg of segments) {
    const kind = seg[0];
    if (kind === 's') {
      const len = seg[1];
      const n = Math.max(1, Math.round(len / STEP));
      const d = len / n;
      for (let i = 0; i < n; i++) { x += Math.cos(ang) * d; y += Math.sin(ang) * d; pts.push({ x, y }); }
    } else {
      const deg = seg[1], radius = seg[2];
      const dir = kind === 'l' ? -1 : 1;
      const arcLen = (Math.abs(deg) * Math.PI * radius) / 180;
      const n = Math.max(3, Math.round(arcLen / STEP));
      const dAng = (dir * deg * Math.PI) / 180 / n;
      const d = arcLen / n;
      for (let i = 0; i < n; i++) { ang += dAng; x += Math.cos(ang) * d; y += Math.sin(ang) * d; pts.push({ x, y }); }
    }
  }
  return pts;
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

// --- The GENTEN layout (base roadWidth before the global x1.25). ---
const ROAD_BASE = 320;
const EFF_HALF = (ROAD_BASE * 1.25) / 2; // effective half-width in world units
const segments = [
  ['s', 280],                 // 1. intro straight
  ['r', 95, 360], ['r', 40, 230], // 2. big right, wide then tighter (~135deg)
  ['l', 180, 300],            // 3. big left horseshoe
  ['s', 780],                 // 4. straight WITH the jump
  ['r', 180, 230],            // 5. hairpin 1 (right)
  ['s', 320],                 // 6. connector
  ['l', 180, 230],            // 7. hairpin 2 (left) — switchback
  ['s', 300],                 // 8. connector
  ['r', 180, 460],            // 9. massive semicircle (big drift)
  ['s', 380], ['l', 85, 320], ['s', 320], ['r', 70, 300], ['s', 440], // 10. flowing ending -> finish
];

const pts = buildPath(segments);
const total = pathLength(pts);
const WINDOW = 26; // skip same-stretch neighbours
const THRESH = EFF_HALF * 2 * 0.92; // lanes merging/crossing

let minSep = Infinity, worst = null;
const hits = [];
for (let i = 0; i < pts.length; i++) {
  for (let j = i + WINDOW; j < pts.length; j++) {
    const dd = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    if (dd < minSep) { minSep = dd; worst = [i, j]; }
    if (dd < THRESH) hits.push([i, j, Math.round(dd)]);
  }
}

console.log('segments:', segments.length, ' points:', pts.length);
console.log('total length:', Math.round(total));
console.log('effective road width:', Math.round(EFF_HALF * 2), ' half:', Math.round(EFF_HALF));
console.log('overlap threshold (<):', Math.round(THRESH));
console.log('min non-adjacent separation:', Math.round(minSep), 'at points', worst);
console.log('OVERLAP HITS:', hits.length);
if (hits.length) {
  // show a few, as fraction-of-track for intuition
  for (const [i, j, dd] of hits.slice(0, 8)) {
    console.log(`  i=${i}(${(i/pts.length*100)|0}%) j=${j}(${(j/pts.length*100)|0}%) dist=${dd}`);
  }
}
// bounding box (for camera/extent sanity)
let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
console.log('bbox:', Math.round(maxX-minX), 'x', Math.round(maxY-minY));
