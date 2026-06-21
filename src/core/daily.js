// The daily challenge: a deterministic score target on a featured GENTEN level,
// keyed to the calendar day so it's stable for the day but rotates. Shared by the
// menu (display) and GameScene (completion check) so they always agree.

import { getLevelById } from '../config/levels.js';

// Only feature levels the player can actually reach from the map screen.
const POOL = ['genten', 'genten-s1', 'genten-s2', 'genten-s3', 'genten-s4', 'genten-s5', 'genten-s6'];

export function getDailyChallenge() {
  const day = Math.floor(Date.now() / 86400000);
  const id = POOL[day % POOL.length];
  const lvl = getLevelById(id) || getLevelById('genten');
  const target = lvl && lvl.scoreGold ? Math.round((lvl.scoreGold * 1.1) / 1000) * 1000 : 40000;
  const reward = 2000 + (day % 4) * 750;
  const name = ((lvl && lvl.name) || 'Genten — Free Run').replace(/—/g, '·');
  return { dayKey: day, levelId: lvl ? lvl.id : 'genten', target, reward, name };
}
