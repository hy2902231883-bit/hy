/* 在页面中执行：局内商店购买 / 升级选技能 / 无尽模式 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  try {
    localStorage.clear();
    game.meta = CL.Save.reset();
    game.startRun('campaign', 1);
    await sleep(400);
    const w = game.world;
    w.gold = 120;
    w.player.hp = 30;
    game.openRunShop();
    await sleep(250);
    document.querySelector('[data-act="buy-run-item"][data-id="potion"]').click();
    await sleep(250);
    out.potion = { hp: Math.round(w.player.hp), gold: w.gold, state: game.state };
    document.querySelector('[data-act="close-run-shop"]').click();
    await sleep(200);
    out.closed = game.state;

    w.rollChoices = () => ['orbit', 'power', 'fire'];
    w.gainXp(999);
    await sleep(300);
    out.levelupState = game.state;
    document.querySelector('[data-act="pick-skill"]').click();
    await sleep(300);
    out.picked = { state: game.state, orbit: w.skills.orbit, power: w.skills.power, queued: w.choiceQueue.length };

    game.startRun('endless');
    await sleep(500);
    out.endless = { state: game.state, mode: game.world.mode, timeLeft: game.world.timeLeft, tag: document.getElementById('modeTag').textContent };
    return out;
  } catch (e) {
    return 'ERR ' + e.message + '\n' + (e.stack || '');
  }
})()
