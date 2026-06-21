// Offline geometry verifier for KANSEI tracks — now for CLOSED LOOPS.
//
// Closure trick: a half-loop HALF with exactly +180 deg of net turning, repeated
// twice, is 180-deg rotationally symmetric and closes EXACTLY (end == start,
// heading wraps to 0). So we only hand-tune HALF; the full loop = HALF + HALF.
//
// Reports: net turning, closure error (should be ~0), cyclic self-overlap (the
// seam where end meets start is allowed), total length, bbox, and the loop's
// jump fraction. Usage: node tools/trackcheck.mjs

const STEP = 26;

function deg2rad(d) { return (d * Math.PI) / 180; }

function buildPath(segments) {
  const pts = [{ x: 0, y: 0 }];
  let x = 0, y = 0, ang = 0, net = 0;
  const bounds = [];
  let cum = 0;
  for (const seg of segments) {
    if (seg[0] === 's') {
      const len = seg[1];
      const n = Math.max(1, Math.round(len / STEP));
      const d = len / n;
      for (let i = 0; i < n; i++) { x += Math.cos(ang) * d; y += Math.sin(ang) * d; pts.push({ x, y }); }
      cum += len;
    } else {
      const deg = seg[1], radius = seg[2];
      const dir = seg[0] === 'l' ? -1 : 1;
      net += dir * deg;
      const arcLen = (Math.abs(deg) * Math.PI * radius) / 180;
      const n = Math.max(3, Math.round(arcLen / STEP));
      const dAng = (dir * deg2rad(deg)) / n;
      const d = arcLen / n;
      for (let i = 0; i < n; i++) { ang += dAng; x += Math.cos(ang) * d; y += Math.sin(ang) * d; pts.push({ x, y }); }
      cum += arcLen;
    }
    bounds.push(cum);
  }
  return { pts, bounds, endAng: ang, net };
}

// ---- GENTEN closed loop: design HALF (net +180), loop = HALF + HALF ----
const ROAD_BASE = 300;
const EFF_HALF = (ROAD_BASE * 1.25) / 2;
const HALF = [
  ['s', 620],        // start straight (entry speed)
  ['r', 90, 470],    // fast sweeper
  ['s', 300],
  ['l', 50, 320],    // esse out
  ['s', 240],
  ['r', 80, 330],    // sweeper back
  ['s', 340],
  ['l', 45, 300],    // flick
  ['s', 240],
  ['r', 105, 270],   // tighter right to set up the return
];
// net of HALF must be +180:  +90 -50 +80 -45 +105 = +180
const segments = [...HALF, ...HALF];

const { pts, bounds, endAng, net } = buildPath(segments);
const N = pts.length;

// closure error (compare last point to first; ignore the duplicate first point)
const last = pts[N - 1];
const dxy = Math.hypot(last.x - pts[0].x, last.y - pts[0].y);
const headDeg = ((endAng * 180) / Math.PI) % 360;

// total length
let total = 0;
for (let i = 1; i < N; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);

// cyclic self-overlap: skip neighbours within WINDOW on the ring (incl. the seam)
const WINDOW = 26;
const THRESH = EFF_HALF * 2 * 0.92;
let minSep = Infinity, worst = null, hits = 0;
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const cyc = Math.min(j - i, N - (j - i));
    if (cyc < WINDOW) continue;
    const dd = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    if (dd < minSep) { minSep = dd; worst = [i, j]; }
    if (dd < THRESH) hits++;
  }
}

let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}

console.log('HALF net turning:', net, '(must be 180)');
console.log('CLOSURE error: position', Math.round(dxy), ' heading', Math.round(headDeg), '(both ~0 = closed)');
console.log('total length:', Math.round(total), ' road width:', Math.round(EFF_HALF * 2));
console.log('overlap threshold (<):', Math.round(THRESH), ' min separation:', Math.round(minSep), 'at', worst);
console.log('CYCLIC OVERLAP HITS:', hits);
console.log('bbox:', Math.round(maxX - minX), 'x', Math.round(maxY - minY));
// place the free-mode/start jump on the mid of the first segment (the start straight)
console.log('start-straight mid frac:', ((bounds[0] / 2) / total).toFixed(3));
