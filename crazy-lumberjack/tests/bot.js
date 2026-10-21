'use strict';
/* 自动玩家：用于平衡性回归测试，不是游戏代码 */

const SKILL_PRIORITY = ['power', 'orbit', 'fire', 'berserk', 'shield', 'heal', 'gold'];

function play(world, opts = {}) {
  const dt = opts.dt || 1 / 30;
  const maxSeconds = opts.maxSeconds || 420;
  const sample = opts.sample || 0;
  let t = 0;
  let nextSample = sample;
  const timeline = [];
  let motherGoneAt = 0;
  let fleeT = 0;
  let locked = null;

  while (!world.finished && t < maxSeconds) {
    if (world.choiceQueue.length) {
      const choices = world.choiceQueue[0];
      let pick = choices[0];
      for (const p of SKILL_PRIORITY) if (choices.includes(p)) { pick = p; break; }
      world.applySkill(pick);
    }

    const p = world.player;
    if (p.hp < 45 && world.gold >= 30 && p.hp < p.maxHp - 20) world.buyRunItem('potion');

    let bear = null;
    let bd = 1e18;
    for (const b of world.bears) {
      if (!b.alive) continue;
      const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      if (d < bd) { bd = d; bear = b; }
    }
    const bearD = bear ? Math.sqrt(bd) : Infinity;

    let target = null;
    let ix = 0, iy = 0;
    const mothers = world.trees.filter((tr) => tr.alive && tr.mother);
    if (mothers.length) {
      mothers.sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
      target = mothers[0];
    } else {
      if (!locked || !locked.alive) locked = null;
      if (!locked) {
        let bd2 = 1e18;
        for (const tr of world.trees) {
          if (!tr.alive) continue;
          const d = (tr.x - p.x) ** 2 + (tr.y - p.y) ** 2;
          if (d < bd2) { bd2 = d; locked = tr; }
        }
      }
      target = locked;
    }

    if (bear && bearD < 75 && (p.hp < 70 || (bearD < 48 && bear.state === 'charge'))) {
      fleeT = Math.max(fleeT, 0.9);
    }
    if (fleeT > 0) fleeT -= dt;
    const flee = fleeT > 0 && bear;
    if (flee) {
      const a = Math.atan2(p.y - bear.y, p.x - bear.x);
      ix = Math.cos(a); iy = Math.sin(a);
    } else if (target) {
      const d = Math.hypot(target.x - p.x, target.y - p.y) - target.r;
      if (d > world.base.range - 4) {
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        ix = Math.cos(a); iy = Math.sin(a);
      }
    }

    let near = 0;
    for (const tr of world.trees) if (tr.alive && (tr.x - p.x) ** 2 + (tr.y - p.y) ** 2 < 4900) near++;
    for (const b of world.bears) if (b.alive && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 4900) near++;
    const skill = world.whirlCd <= 0 && (near >= 3 || (bear && bearD < 70));

    world.update(dt, { x: ix, y: iy, skill });
    t += dt;

    if (mothers.length && !world.aliveMothers()) motherGoneAt = t;
    if (sample && t >= nextSample) {
      nextSample += sample;
      timeline.push(`t${Math.round(t)} Lv${world.playerLevel} trees${world.aliveTrees()} chop${world.stats.chopped} hp${Math.round(p.hp)}`);
    }
  }

  return {
    t,
    win: world.win,
    timeline,
    motherGoneAt,
  };
}

module.exports = { play, SKILL_PRIORITY };
