// Player XP / level curve. Pure math, no Phaser, no persistence — SaveManager
// owns the stored xp value and calls into here. The curve is intentionally
// gentle early and steepens later so the first few levels feel quick while
// reaching high levels takes many runs.

// XP required to advance FROM level n TO level n+1.
// Grows roughly quadratically: lvl1->2 = 100, and each level costs more.
//   n=1: 100, n=2: 175, n=3: 265, n=4: 370, ... (base + step * (n-1) ^ 1.35)
export function xpForLevel(n) {
  const lvl = Math.max(1, Math.floor(n));
  const base = 100;
  const step = 75;
  return Math.round(base + step * Math.pow(lvl - 1, 1.35));
}

// Total cumulative XP needed to be sitting exactly at the start of `level`.
// Level 1 starts at 0 XP. Cached growth is fine here — levels stay small.
export function totalXpForLevel(level) {
  let total = 0;
  for (let n = 1; n < Math.max(1, Math.floor(level)); n++) {
    total += xpForLevel(n);
  }
  return total;
}

// Resolve a cumulative XP value into a level + progress toward the next level.
//   { level, xpInto, xpForNext, progress }  progress is 0..1
export function getLevelFromXp(xp) {
  let remaining = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  // Walk levels until the remaining XP no longer covers the next level's cost.
  // Bounded loop guard so a corrupted huge value can't hang.
  while (level < 999) {
    const need = xpForLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  const xpForNext = xpForLevel(level);
  return {
    level,
    xpInto: remaining,
    xpForNext,
    progress: xpForNext > 0 ? Math.min(1, remaining / xpForNext) : 0,
  };
}

// XP awarded for a single completed run. Tuned so a solid clear is meaningful
// (~tens of XP) but reaching high levels takes many runs.
//   score          numeric run score (drift points etc.)
//   cash           cash earned this run
//   cleared        did the player finish/clear the level
//   stars          0..3 stars earned
//   bestMultiplier peak drift multiplier reached
// All fields optional; missing ones contribute 0.
export function xpForRun({ score = 0, cash = 0, cleared = false, stars = 0, bestMultiplier = 0 } = {}) {
  let xp = 0;
  xp += Math.max(0, score) / 250;        // score is the bulk, but heavily damped
  xp += Math.max(0, cash) / 60;          // a little for the payout
  xp += Math.max(0, stars) * 12;         // stars are a strong, reliable signal
  xp += Math.max(0, bestMultiplier) * 4; // reward big drift chains
  if (cleared) xp += 25;                 // flat clear bonus
  xp = Math.round(xp);
  return Math.max(cleared ? 10 : 1, xp); // never award nothing for a run
}
