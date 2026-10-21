/* 在页面中执行的 UI 流程测试（由 cdp_shot.js --eval-file 加载） */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    game.meta.gold = 1000;
    game.toLobby();
    await sleep(250);
    const s0 = game.state;
    document.querySelector('[data-act="start-campaign"]').click();
    await sleep(250);
    const s1 = game.state;
    const lvlBtn = document.querySelector('[data-act="pick-level"][data-level="1"]');
    if (!lvlBtn) return 'ERR no level button; state=' + game.state;
    lvlBtn.click();
    await sleep(900);
    const s2 = game.state;
    game.openShop('weapon');
    await sleep(350);
    const btn = document.querySelector('[data-act="buy-weapon"][data-id="axe_iron"]');
    const before = game.meta.gold;
    if (btn) btn.click();
    await sleep(350);
    return {
      s0, s1, s2, s3: game.state,
      before, after: game.meta.gold,
      weapon: game.meta.weapon,
      owned: game.meta.ownedWeapons,
      hudHidden: document.getElementById('hud').classList.contains('hidden'),
      screens: document.querySelectorAll('.screen').length,
    };
  } catch (e) {
    return 'ERR ' + e.message + '\n' + (e.stack || '');
  }
})()
