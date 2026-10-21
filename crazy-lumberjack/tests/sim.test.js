'use strict';
const assert = require('assert');
const { loadGame } = require('./harness');
const { play } = require('./bot');

const { World, CFG } = loadGame();
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('疯狂伐木工 · 模拟层测试');

test('初始地图包含树、母树、熊窝，且出生点空旷', () => {
  const w = new World({ level: 5, seed: 1234, meta: {} });
  assert.ok(w.trees.length >= 20, 'trees');
  assert.strictEqual(w.aliveMothers(), 2);
  assert.strictEqual(w.aliveTrees() + w.aliveMothers(), w.trees.length);
  assert.ok(w.nests.length >= 1);
  for (const t of w.trees) {
    const d = Math.hypot(t.x - w.player.x, t.y - w.player.y);
    assert.ok(d > CFG.TILE * 2, 'tree too close to spawn');
  }
});

test('靠近树木会自动攻击并砍倒，获得金币与经验', () => {
  const w = new World({ level: 1, seed: 7, meta: {} });
  const tree = w.trees.find((t) => !t.mother && t.stage <= 1);
  w.player.x = tree.x - 20;
  w.player.y = tree.y;
  for (let i = 0; i < 300 && tree.alive; i++) w.update(1 / 30, { x: 0, y: 0 });
  assert.ok(!tree.alive, 'tree should be chopped');
  assert.ok(w.gold > 0, 'gold gained');
  assert.ok(w.stats.xp > 0, 'xp gained');
  assert.strictEqual(w.stats.chopped, 1);
});

test('母树更耐打，倒下后停止繁殖', () => {
  const w = new World({ level: 1, seed: 11, meta: {} });
  const mother = w.trees.find((t) => t.mother);
  assert.ok(mother.maxHp > 500);
  mother.hp = 1;
  w.damageTree(mother, 999, { source: 'test' });
  assert.strictEqual(w.aliveMothers(), 0);
  const before = w.trees.length;
  for (let i = 0; i < 40; i++) w.update(0.5, { x: 0, y: 0 });
  assert.ok(w.trees.length <= before, 'no new trees after mother down');
});

test('胜负判定：清空母树与树木即通关', () => {
  const w = new World({ level: 1, seed: 21, meta: {} });
  for (const t of w.trees.slice()) {
    if (t.alive) w.damageTree(t, 99999, { source: 'test' });
  }
  w.update(1 / 30, { x: 0, y: 0 });
  assert.ok(w.finished && w.win, 'should win');
  const r = w.getResult();
  assert.strictEqual(r.level, 1);
  assert.strictEqual(r.mothers, 1);
});

test('超时判负，续时后可以继续', () => {
  const w = new World({ level: 1, seed: 22, meta: {} });
  w.timeLeft = 0.01;
  w.update(0.1, { x: 0, y: 0 });
  assert.ok(w.finished && !w.win && w.failReason === 'time');
  assert.ok(w.extendTime(30));
  assert.ok(!w.finished);
  assert.ok(w.timeLeft > 25);
});

test('生命归零判负，复活恢复并重新开局', () => {
  const w = new World({ level: 3, seed: 23, meta: {} });
  w.player.hp = 1;
  w.hurtPlayer(999, null);
  assert.ok(w.finished && w.dead);
  assert.ok(w.revive());
  assert.ok(!w.finished && !w.dead);
  assert.strictEqual(w.player.hp, w.player.maxHp);
  assert.ok(w.player.invuln >= 3);
});

test('熊冲锋撞倒小树但不给玩家收益，撞巨树会眩晕', () => {
  const w = new World({ level: 3, seed: 24, meta: {} });
  const bear = w.bears.find((b) => b.alive) || w.spawnBear('brown', 100, 100);
  // 小树
  const sapling = w.trees.find((t) => t.alive && !t.mother && t.stage < 3);
  bear.x = sapling.x - 18; bear.y = sapling.y;
  bear.state = 'charge'; bear.stateT = 0.4; bear.chargeId = 999; bear.chargeDirX = 1; bear.chargeDirY = 0;
  const goldBefore = w.gold;
  w.update(1 / 60, { x: 0, y: 0 });
  assert.ok(!sapling.alive, 'sapling knocked down');
  assert.strictEqual(w.gold, goldBefore, 'no gold from knock');
  assert.ok(w.stats.knocked >= 1);

  // 巨树
  const giant = w.trees.find((t) => t.alive && !t.mother && t.stage === 3) ||
    (() => { const g = w.trees[0]; g.stage = 3; g.alive = true; return g; })();
  bear.x = giant.x - 18; bear.y = giant.y;
  bear.state = 'charge'; bear.stateT = 0.4; bear.chargeId = 1000; bear.chargeDirX = 1; bear.chargeDirY = 0;
  w.update(1 / 60, { x: 0, y: 0 });
  assert.strictEqual(bear.state, 'stun');
  assert.ok(giant.alive);
});

test('局内商店扣金币并生效，金币不足时拒绝', () => {
  const w = new World({ level: 2, seed: 25, meta: {} });
  w.gold = 100;
  w.player.hp = 20;
  assert.ok(w.buyRunItem('potion'));
  assert.ok(w.player.hp > 20);
  assert.ok(w.gold === 70);
  w.gold = 10;
  assert.ok(!w.buyRunItem('bomb'));
  assert.strictEqual(w.gold, 10);
});

test('升级弹出三选一，技能到 5 级自动进化', () => {
  const w = new World({ level: 1, seed: 26, meta: {} });
  w.skills.power = 4;
  w.choiceQueue = [['power', 'orbit', 'fire']];
  assert.ok(w.applySkill('power'));
  assert.strictEqual(w.skills.power, 5);
  assert.ok(w.evolved.power);
  assert.strictEqual(w.choiceQueue.length, 0);
});

test('永久装备加成会进入局内属性', () => {
  const plain = new World({ level: 1, seed: 27, meta: {} });
  const geared = new World({
    level: 1, seed: 27,
    meta: { weapon: 'axe_legend', weaponUpgrade: 5, armor: 'plate', boots: 'gale', aux: { orbit: true, core: true, robot: true } },
  });
  assert.ok(geared.base.atkDmg > plain.base.atkDmg + 20);
  assert.ok(geared.player.maxHp > plain.player.maxHp);
  assert.ok(geared.base.speed > plain.base.speed);
  assert.ok(geared.skills.orbit === 1);
  assert.ok(geared.player.shield === 25);
});

test('结算：失败保留 50%，通关 100% 且有奖励', () => {
  const w = new World({ level: 1, seed: 28, meta: {} });
  w.stats.gold = 200;
  w.finish(false, 'dead');
  const lose = w.getResult();
  assert.strictEqual(lose.goldEarned, 200);
  assert.strictEqual(lose.clearBonus, 0);

  const w2 = new World({ level: 2, seed: 29, meta: {} });
  w2.stats.gold = 200;
  for (const t of w2.trees.slice()) if (t.alive) w2.damageTree(t, 99999, {});
  w2.update(1 / 30, { x: 0, y: 0 });
  const win = w2.getResult();
  assert.ok(win.win);
  assert.ok(win.clearBonus > 0);
});

test('连续失败 3 次的缓冲：攻击与生命 +10%', () => {
  const plain = new World({ level: 5, seed: 31, meta: {} });
  const pity1 = new World({ level: 5, seed: 31, meta: {}, pity: 1 });
  const pity2 = new World({ level: 5, seed: 31, meta: {}, pity: 2 });
  assert.ok(pity1.base.atkDmg > plain.base.atkDmg * 1.09);
  assert.ok(pity2.player.maxHp > plain.player.maxHp * 1.18);
});

test('无尽模式：不要求清场，计时向上累计', () => {
  const w = new World({ mode: 'endless', seed: 31, meta: {} });
  w.player.maxHp = 1e9;
  w.player.hp = 1e9;
  for (let i = 0; i < 30 * 30; i++) w.update(1 / 30, { x: 0, y: 0 });
  assert.ok(!w.finished);
  assert.ok(w.elapsed > 29);
  assert.strictEqual(w.timeLeft, 0);
  const r = w.getResult();
  assert.ok(r.score > 0);
});

test('所有实体坐标与半径均为有限数值', () => {
  for (const level of [1, 7, 16]) {
    const w = new World({ level, seed: 4242, meta: {} });
    for (const e of [...w.trees, ...w.bears, ...w.nests]) {
      assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `${e.kind} position`);
      assert.ok(Number.isFinite(e.r) && e.r > 0, `${e.kind} radius`);
      assert.ok(Number.isFinite(e.hp) && e.hp > 0, `${e.kind} hp`);
    }
  }
});

test('自动玩家可在时限内通关第 1 关', () => {
  const w = new World({ level: 1, seed: 101, meta: {} });
  const r = play(w, { maxSeconds: 260 });
  console.log(`    [bot] Lv1 ${w.win ? '通关' : '失败'} 用时 ${r.t.toFixed(0)}s 砍树 ${w.stats.chopped} 等级 ${w.playerLevel}`);
  assert.ok(w.win, 'bot should clear level 1');
});

if (process.exitCode) {
  console.error('存在失败用例');
} else {
  console.log(`\n全部 ${passed} 项通过`);
}
