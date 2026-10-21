'use strict';
const { loadGame } = require('./harness');
const { play } = require('./bot');
const { World } = loadGame();

function run(level, seed) {
  const w = new World({ level, seed, meta: {} });
  const start = Date.now();
  const r = play(w, { maxSeconds: 420 });
  return {
    level, seed,
    win: w.win, reason: w.failReason, t: Math.round(r.t),
    mothers: w.aliveMothers(), trees: w.aliveTrees(),
    chopped: w.stats.chopped, knocked: w.stats.knocked,
    bears: w.stats.bears, plv: w.playerLevel,
    gold: w.gold, hp: Math.round(w.player.hp),
    motherGoneAt: Math.round(r.motherGoneAt),
    skills: JSON.stringify(w.skills),
    ms: Date.now() - start,
  };
}

const levels = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];
const seeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [101, 202, 303];
for (const lv of levels) {
  for (const seed of seeds) {
    const r = run(lv, seed);
    console.log(
      `Lv${String(lv).padStart(2)} seed${seed} ${r.win ? 'WIN ' : 'FAIL'} ${r.reason || ''} ` +
      `t=${r.t}s motherGone=${r.motherGoneAt}s treesLeft=${r.trees} ` +
      `chop=${r.chopped} knocked=${r.knocked} bears=${r.bears} plv=${r.plv} hp=${r.hp} gold=${r.gold} ${r.skills} (${r.ms}ms)`
    );
  }
}
