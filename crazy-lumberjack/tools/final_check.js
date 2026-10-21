/* 最终冒烟：清空存档 → 大厅 → 选关 → 移动 → 状态检查 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    localStorage.clear();
    game.meta = CL.Save.reset();
    game.toLobby();
    await sleep(300);
    document.querySelector('[data-act="start-campaign"]').click();
    await sleep(250);
    document.querySelector('[data-act="pick-level"][data-level="1"]').click();
    await sleep(700);
    const w = game.world;
    game.keys.add('d');
    await sleep(2000);
    game.keys.delete('d');
    await sleep(300);
    return {
      state: game.state,
      level: w.level,
      moved: w.player.x > w.cfg.mapW * 24 * 0.5,
      hp: Math.round(w.player.hp),
      gold: w.gold,
      hudVisible: !document.getElementById('hud').classList.contains('hidden'),
      screens: document.querySelectorAll('.screen').length,
    };
  } catch (e) {
    return 'ERR ' + e.message + '\n' + (e.stack || '');
  }
})()
