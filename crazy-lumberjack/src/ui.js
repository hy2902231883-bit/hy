/*
 * 界面层：大厅 / 关卡选择 / 商店 / 升级三选一 / 局内商店 / 结算 / 广告
 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});
  const CFG = CL.CFG;

  const COIN_SVG =
    '<svg class="ico coin" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#b8860b"/><circle cx="8" cy="8" r="5" fill="#f2c14e"/><path d="M8 4.2v7.6M6 6.2h3.4a1.5 1.5 0 010 3H6" stroke="#8a5a10" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>';

  const ITEM_ICONS = {
    potion: '🧪',
    rage: '🍶',
    bomb: '💣',
    shield: '🔷',
    inhibit: '❄️',
  };

  const WEAPON_ICONS = ['🪓', '🪓', '🪓', '🪚', '🪚', '⚔️'];
  const AUX_ICONS = { orbit: '🌀', robot: '🤖', core: '🔷' };

  class UI {
    constructor(refs) {
      this.screensEl = refs.screens;
      this.hudEl = refs.hud;
      this.toastEl = refs.toast;
      this.game = null;
      this.shopTab = 'weapon';
      this.refs = refs;
      this._toastTimer = 0;
      this.screensEl.addEventListener('click', (e) => this.onClick(e));
      this.hudEl.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (el) this.onClick(e);
      });
    }

    onClick(e) {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      CL.Audio.resume();
      CL.Audio.play('click');
      this.dispatch(el.dataset.act, el.dataset, el);
    }

    dispatch(act, data, el) {
      const g = this.game;
      if (!g) return;
      switch (act) {
        case 'back-lobby': g.toLobby(); break;
        case 'start-campaign': g.openLevels(); break;
        case 'start-endless': g.startRun('endless'); break;
        case 'open-shop': g.openShop(); break;
        case 'open-daily': g.openDaily(); break;
        case 'open-settings': g.openSettings(); break;
        case 'open-help': g.openHelp(); break;
        case 'pick-level': g.startRun('campaign', +data.level); break;
        case 'shop-tab': this.shopTab = data.tab; g.openShop(this.shopTab); break;
        case 'buy-weapon': g.buyWeapon(data.id); break;
        case 'equip-weapon': g.equip('weapon', data.id); break;
        case 'buy-armor': g.buyArmor(data.id); break;
        case 'equip-armor': g.equip('armor', data.id); break;
        case 'buy-boots': g.buyBoots(data.id); break;
        case 'equip-boots': g.equip('boots', data.id); break;
        case 'buy-aux': g.buyAux(data.id); break;
        case 'upgrade-weapon': g.upgradeWeapon(); break;
        case 'daily-claim': g.claimDaily(); break;
        case 'toggle-sound': g.toggleSound(); break;
        case 'reset-save': g.resetSave(); break;
        case 'resume': g.resume(); break;
        case 'pause-restart': g.restartRun(); break;
        case 'pause-quit': g.abandonRun(); break;
        case 'open-run-shop': g.openRunShop(); break;
        case 'close-run-shop': g.closeRunShop(); break;
        case 'buy-run-item': g.buyRunItem(data.id); break;
        case 'pick-skill': g.pickSkill(data.skill); break;
        case 'reroll-skill': g.rerollSkill(); break;
        case 'ad-revive': g.adRevive(); break;
        case 'ad-extend': g.adExtendTime(); break;
        case 'ad-fullkeep': g.adFullKeep(); break;
        case 'ad-double': g.adDouble(); break;
        case 'result-retry': g.resultRetry(); break;
        case 'result-lobby': g.resultLobby(); break;
        case 'result-next': g.resultNext(); break;
        case 'noop': break;
      }
    }

    clear() {
      this.screensEl.innerHTML = '';
    }

    hide() {
      this.clear();
    }

    make(html, cls) {
      this.clear();
      const d = document.createElement('div');
      d.className = 'screen ' + (cls || '');
      d.innerHTML = html;
      this.screensEl.appendChild(d);
      return d;
    }

    setHudVisible(v) {
      this.hudEl.classList.toggle('hidden', !v);
    }

    coin(v) {
      return `<span class="price">${COIN_SVG}${v}</span>`;
    }

    /* ------------------------------------------------------------- lobby */

    lobby(meta) {
      this.setHudVisible(false);
      const dailyReady = meta.dailyDate !== CL.Save.todayKey();
      const html = `
        <div class="lobby-top">
          <div class="gold-pill">${COIN_SVG}<span>${meta.gold}</span></div>
        </div>
        <div class="logo-wrap">
          <div class="logo-kicker">PIXEL LUMBERJACK</div>
          <h1 class="logo">疯狂伐木工</h1>
          <div class="logo-sub">砍倒母树 · 在熊爪下活下来</div>
        </div>
        <div class="lobby-actions">
          <button class="btn primary" data-act="start-campaign">开 始 游 戏</button>
          <div class="btn-row">
            <button class="btn" data-act="start-endless">无尽挑战</button>
            <button class="btn" data-act="open-shop">装备商店</button>
          </div>
          <div class="btn-row">
            <button class="btn ghost" data-act="open-daily">每日奖励${dailyReady ? '<i class="dot"></i>' : ''}</button>
            <button class="btn ghost" data-act="open-help">玩法</button>
            <button class="btn ghost" data-act="open-settings">设置</button>
          </div>
        </div>
        <div class="lobby-meta">
          <span>已解锁 <b class="lobby-best">${meta.maxLevel <= 1 ? '第 1 关' : `第 1 - ${meta.maxLevel} 关`}</b></span>
          <span>通关 ${meta.wins || 0} 次</span>
        </div>
      `;
      this.make(html, 'lobby-screen');
    }

    /* ------------------------------------------------------------ levels */

    levels(meta) {
      let grid = '';
      for (let lv = 1; lv <= 30; lv++) {
        const locked = lv > meta.maxLevel;
        const cleared = !!meta.cleared[lv];
        const cur = lv === meta.maxLevel && !cleared;
        grid += `<button class="level-btn ${locked ? 'locked' : ''} ${cleared ? 'cleared' : ''} ${cur ? 'current' : ''}"
          ${locked ? 'disabled' : ''} data-act="pick-level" data-level="${lv}">${lv}</button>`;
      }
      const cfg = CFG.levelConfig(Math.min(30, meta.maxLevel));
      const html = `
        <div class="screen-head">
          <button class="back-btn" data-act="back-lobby">‹</button>
          <div class="screen-title">主线闯关</div>
          <div class="screen-sub">${this.coin(meta.gold)}</div>
        </div>
        <div class="panel">
          <div class="level-grid">${grid}</div>
        </div>
        <div class="panel">
          <div class="howto">
            当前进度：<b>第 ${cfg.level} 关</b> · 母树 ${cfg.mothers} 棵 · 限时 ${Math.floor(cfg.time / 60)}:${String(cfg.time % 60).padStart(2, '0')}<br/>
            通关条件：砍倒所有 <b>母树</b>，并把地图上的树全部清空。
          </div>
        </div>
        <div class="level-note">失败会扣掉一半收益，但永久金币和装备会保留。连续失败时，下一次挑战会获得小幅补偿。</div>
      `;
      this.make(html, 'solid');
    }

    /* -------------------------------------------------------------- shop */

    shop(meta, tab) {
      this.shopTab = tab || this.shopTab || 'weapon';
      this.setHudVisible(false);
      const tabs = [
        ['weapon', '主武器'],
        ['armor', '护甲'],
        ['boots', '鞋子'],
        ['aux', '辅助'],
      ]
        .map(([id, name]) => `<button class="tab ${this.shopTab === id ? 'active' : ''}" data-act="shop-tab" data-tab="${id}">${name}</button>`)
        .join('');

      let body = '';
      if (this.shopTab === 'weapon') {
        body = this.weaponList(meta);
      } else if (this.shopTab === 'armor') {
        body = this.gearList(meta, CFG.ARMORS, 'armor', 'buy-armor', 'equip-armor');
      } else if (this.shopTab === 'boots') {
        body = this.gearList(meta, CFG.BOOTS, 'boots', 'buy-boots', 'equip-boots');
      } else {
        body = this.auxList(meta);
      }

      const html = `
        <div class="screen-head">
          <button class="back-btn" data-act="back-lobby">‹</button>
          <div class="screen-title">装备商店</div>
          <div class="screen-sub">${this.coin(meta.gold)}</div>
        </div>
        <div class="shop-tabs">${tabs}</div>
        <div class="shop-list">${body}</div>
        <div class="shop-foot">永久装备会保留到下一局；局内等级和技能每局重置。<br/>通关结算即可获得永久金币。</div>
      `;
      this.make(html, 'solid');
    }

    weaponList(meta) {
      let html = '';
      CFG.WEAPONS.forEach((w, i) => {
        const owned = meta.ownedWeapons.includes(w.id);
        const equipped = meta.weapon === w.id;
        const upg = equipped ? meta.weaponUpgrade : 0;
        const canBuy = !owned && meta.gold >= w.cost;
        const action = equipped
          ? `<span class="badge gold">使用中</span>`
          : owned
          ? `<button class="btn small" data-act="equip-weapon" data-id="${w.id}">装备</button>`
          : `<button class="btn small ${canBuy ? 'primary' : ''}" ${canBuy ? '' : 'disabled'} data-act="buy-weapon" data-id="${w.id}">${this.coin(w.cost)}</button>`;
        html += `
          <div class="item-card ${equipped ? 'equipped' : ''}">
            <div class="item-icon">${WEAPON_ICONS[i] || '🪓'}</div>
            <div class="item-body">
              <div class="item-name">${w.name}${equipped && upg ? `<span class="badge gold">+${upg}</span>` : ''}</div>
              <div class="item-stats">伤害 ${w.dmg + (equipped ? upg * 2 : 0)} · 间隔 ${w.interval.toFixed(2)}s</div>
              <div class="item-desc">${i === 0 ? '祖父留下的老伙计，至少还能用。' : i >= 4 ? '锯齿嗡鸣，整片森林都在发抖。' : '更快、更狠、更省力。'}</div>
            </div>
            <div class="item-action">${action}</div>
          </div>`;
      });
      const cost = 120 * (meta.weaponUpgrade + 1);
      const maxed = meta.weaponUpgrade >= 10;
      html += `
        <div class="panel" style="margin-top:6px">
          <div class="settings-row" style="padding-top:2px">
            <div>
              <div class="item-name">武器强化 +${meta.weaponUpgrade}</div>
              <div class="item-desc">当前武器伤害 +${meta.weaponUpgrade * 2}，每次强化 +2</div>
            </div>
            <button class="btn small ${!maxed && meta.gold >= cost ? 'primary' : ''}" ${maxed || meta.gold < cost ? 'disabled' : ''} data-act="upgrade-weapon">
              ${maxed ? '已满级' : '强化 ' + cost}
            </button>
          </div>
        </div>`;
      return html;
    }

    gearList(meta, list, key, buyAct, equipAct) {
      let html = '';
      list.forEach((it, i) => {
        if (i === 0) return;
        const owned = meta[`owned${key[0].toUpperCase()}${key.slice(1)}s`].includes(it.id);
        const equipped = meta[key] === it.id;
        const canBuy = !owned && meta.gold >= it.cost;
        const stat = key === 'armor' ? `生命 +${it.hp} · 减伤 ${(it.dr * 100).toFixed(0)}%` : `移速 +${(it.spd * 100).toFixed(0)}%`;
        const action = equipped
          ? `<span class="badge gold">使用中</span>`
          : owned
          ? `<button class="btn small" data-act="${equipAct}" data-id="${it.id}">装备</button>`
          : `<button class="btn small ${canBuy ? 'primary' : ''}" ${canBuy ? '' : 'disabled'} data-act="${buyAct}" data-id="${it.id}">${this.coin(it.cost)}</button>`;
        html += `
          <div class="item-card ${equipped ? 'equipped' : ''}">
            <div class="item-icon">${key === 'armor' ? '🛡️' : '👢'}</div>
            <div class="item-body">
              <div class="item-name">${it.name}</div>
              <div class="item-stats">${stat}</div>
              <div class="item-desc">${key === 'armor' ? '多挨几下，就能多砍几棵。' : '跑得快，熊就追不上你。'}</div>
            </div>
            <div class="item-action">${action}</div>
          </div>`;
      });
      return html;
    }

    auxList(meta) {
      return CFG.AUX.map((a) => {
        const owned = !!meta.aux[a.id];
        const canBuy = !owned && meta.gold >= a.cost;
        return `
          <div class="item-card ${owned ? 'equipped' : ''}">
            <div class="item-icon">${AUX_ICONS[a.id]}</div>
            <div class="item-body">
              <div class="item-name">${a.name}${owned ? '<span class="badge gold">已拥有</span>' : ''}</div>
              <div class="item-desc">${a.desc}</div>
            </div>
            <div class="item-action">
              ${owned ? '<span class="badge">生效中</span>' : `<button class="btn small ${canBuy ? 'primary' : ''}" ${canBuy ? '' : 'disabled'} data-act="buy-aux" data-id="${a.id}">${this.coin(a.cost)}</button>`}
            </div>
          </div>`;
      }).join('');
    }

    /* ----------------------------------------------------------- run shop */

    runShop(world) {
      const items = CFG.RUN_ITEMS.map((it) => {
        const can = world.gold >= it.cost;
        return `
          <div class="item-card">
            <div class="item-icon">${ITEM_ICONS[it.id]}</div>
            <div class="item-body">
              <div class="item-name">${it.name}</div>
              <div class="item-desc">${it.desc}</div>
            </div>
            <div class="item-action">
              <button class="btn small ${can ? '' : ''}" ${can ? '' : 'disabled'} data-act="buy-run-item" data-id="${it.id}">${this.coin(it.cost)}</button>
            </div>
          </div>`;
      }).join('');
      const html = `
        <div class="modal-wrap screen dim">
          <div class="modal">
            <h2 class="modal-title">行商</h2>
            <div class="modal-sub">局内金币：${this.coin(world.gold)}</div>
            <div class="shop-list">${items}</div>
            <div class="result-actions" style="margin-top:14px">
              <button class="btn primary" data-act="close-run-shop">继续砍树</button>
            </div>
          </div>
        </div>`;
      this.make(html, '');
    }

    /* ----------------------------------------------------------- level up */

    levelUp(world) {
      const choices = world.choiceQueue[0] || [];
      const cards = choices.map((id) => this.skillCard(world, id)).join('');
      const html = `
        <div class="modal-wrap screen dim">
          <div class="modal">
            <h2 class="modal-title">升级！</h2>
            <div class="modal-sub">Lv.${world.playerLevel} · 选择一项能力</div>
            <div class="choices">${cards}</div>
            <div class="result-actions" style="margin-top:12px">
              <button class="btn ghost" data-act="reroll-skill">看广告刷新<span class="ad-tag">演示</span></button>
            </div>
          </div>
        </div>`;
      this.make(html, '');
    }

    skillCard(world, id) {
      if (id === 'heal') {
        return `<button class="choice-card" data-act="pick-skill" data-skill="heal">
          <div class="choice-icon">❤️</div>
          <div class="choice-body"><div class="choice-name">紧急包扎</div><div class="choice-desc">立刻回复 35 点生命值。</div></div>
        </button>`;
      }
      if (id === 'gold') {
        return `<button class="choice-card" data-act="pick-skill" data-skill="gold">
          <div class="choice-icon">💰</div>
          <div class="choice-body"><div class="choice-name">金币袋</div><div class="choice-desc">立刻获得 40 局内金币。</div></div>
        </button>`;
      }
      const def = CFG.SKILLS[id];
      const lv = world.skills[id];
      const next = lv + 1;
      const evo = next >= def.max;
      return `<button class="choice-card" data-act="pick-skill" data-skill="${id}">
        <div class="choice-icon">${def.icon}</div>
        <div class="choice-body">
          <div class="choice-name">${def.name}<span class="choice-lvl">Lv.${lv} → ${next}</span>${evo ? '<span class="evo-tag">进化</span>' : ''}</div>
          <div class="choice-desc">${this.skillDetail(id, next)}</div>
        </div>
      </button>`;
    }

    skillDetail(id, lv) {
      const evo = lv >= 5;
      switch (id) {
        case 'orbit': {
          const n = 1 + (lv >= 3 ? 1 : 0) + (evo ? 1 : 0);
          return `环绕飞斧 ${n} 把，每下 ${4 + 2 * lv} 伤害${evo ? '，命中时可能落雷' : ''}。`;
        }
        case 'power': {
          const n = lv >= 3 ? 2 + (evo ? 2 : 0) : 1;
          return `挥砍伤害 +${lv * 15}%，每次可砍 ${n} 棵树${evo ? '，攻速 +10%' : ''}。`;
        }
        case 'fire': {
          const cd = (6 - 0.6 * lv).toFixed(1);
          return `每 ${cd} 秒投掷燃烧弹，${18 + 9 * lv} 范围伤害${evo ? '，留下火海' : ''}。`;
        }
        case 'shield':
          return `护盾上限 ${lv * 20}，脱战 6 秒后自动恢复${evo ? '，受击反伤' : ''}。`;
        case 'berserk':
          return `攻速 +${lv * 8}%、移速 +${lv * 2}%，击杀叠加狂暴${evo ? '，常驻额外攻速' : ''}。`;
        default:
          return '';
      }
    }

    /* -------------------------------------------------------------- pause */

    pause(world) {
      if (!world) return;
      const html = `
        <div class="modal-wrap screen dim">
          <div class="modal">
            <h2 class="modal-title">暂停</h2>
            <div class="modal-sub">${world.mode === 'endless' ? '无尽挑战' : '第 ' + world.level + ' 关'} · 已击杀 ${world.stats.bears} 只熊</div>
            <div class="result-actions">
              <button class="btn primary" data-act="resume">继续游戏</button>
              <button class="btn" data-act="pause-restart">重新开始</button>
              <button class="btn ghost" data-act="pause-quit">返回大厅</button>
            </div>
          </div>
        </div>`;
      this.make(html, '');
    }

    /* ------------------------------------------------------------- result */

    result(view) {
      const r = view.result;
      const win = r.win;
      const reason =
        r.mode === 'endless'
          ? `坚持 ${this.time(r.timeUsed)} · 得分 ${r.score}`
          : win
          ? `清场成功 · 剩余 ${this.time(r.timeLeft)}`
          : r.reason === 'time'
          ? '时间耗尽，森林没有清空'
          : '你被熊放倒了';

      const lines = [];
      lines.push(`<div class="reward-line"><span>本局累计收益</span><b>${r.goldEarned}</b></div>`);
      if (!win) {
        lines.push(`<div class="reward-line"><span>失败保留</span><b>${Math.round(view.keep * 100)}%</b></div>`);
      }
      if (r.clearBonus) lines.push(`<div class="reward-line"><span>通关奖励</span><b>+${r.clearBonus}</b></div>`);
      if (view.double) lines.push(`<div class="reward-line"><span>广告双倍</span><b>×2</b></div>`);
      lines.push(`<div class="reward-line total"><span>获得永久金币</span><b>${view.gold}</b></div>`);

      const actions = [];
      if (view.canRevive) {
        actions.push(`<button class="btn primary" data-act="ad-revive">看广告复活<span class="ad-tag">剩余 ${2 - view.adsUsed} 次</span></button>`);
      }
      if (view.canExtend) {
        actions.push(`<button class="btn primary" data-act="ad-extend">看广告 +30 秒<span class="ad-tag">剩余 ${2 - view.adsUsed} 次</span></button>`);
      }
      if (!win && !view.fullKeep && r.goldEarned > 0) {
        actions.push(`<button class="btn" data-act="ad-fullkeep">看广告保留 100% 金币</button>`);
      }
      if (win && !view.double) {
        actions.push(`<button class="btn" data-act="ad-double">看广告双倍金币</button>`);
      }
      if (win && r.mode === 'campaign' && r.level < 30) {
        actions.push(`<button class="btn" data-act="result-next">进入第 ${r.level + 1} 关</button>`);
      }
      actions.push(`<div class="btn-row">
        <button class="btn ghost" data-act="result-retry">再来一局</button>
        <button class="btn primary" data-act="result-lobby">结算并返回</button>
      </div>`);

      const html = `
        <div class="modal-wrap screen dim">
          <div class="modal">
            <div class="result-head">
              <h2 class="result-title ${win ? '' : 'lose'}">${r.mode === 'endless' ? '挑战结束' : win ? '通关！' : '失败'}</h2>
              <div class="result-reason">${reason}</div>
            </div>
            <div class="stats-grid">
              <div class="stat"><b>${r.chopped}</b><span>砍树</span></div>
              <div class="stat"><b>${r.knocked}</b><span>撞倒</span></div>
              <div class="stat"><b>${r.bears}</b><span>击败熊</span></div>
              <div class="stat"><b>${r.mothers}</b><span>母树</span></div>
              <div class="stat"><b>${this.time(r.timeUsed)}</b><span>用时</span></div>
              <div class="stat"><b>Lv.${r.playerLevel}</b><span>等级</span></div>
            </div>
            <div class="reward-box">${lines.join('')}</div>
            <div class="result-actions">${actions.join('')}</div>
          </div>
        </div>`;
      this.make(html, '');
    }

    /* --------------------------------------------------------------- daily */

    daily(meta) {
      const claimed = meta.dailyDate === CL.Save.todayKey();
      const html = `
        <div class="modal-wrap screen dim">
          <div class="modal">
            <h2 class="modal-title">每日奖励</h2>
            <div class="modal-sub">每天登录都能领一份补给</div>
            <div class="panel" style="text-align:center">
              <div style="font-size:44px;line-height:1.2">🎁</div>
              <div style="font-size:20px;font-weight:800;color:var(--gold);font-family:var(--mono)">+150 金币</div>
              <div class="item-desc" style="margin-top:6px">金币可用于购买和强化永久装备。</div>
            </div>
            <div class="result-actions" style="margin-top:14px">
              <button class="btn ${claimed ? '' : 'primary'}" ${claimed ? 'disabled' : ''} data-act="daily-claim">
                ${claimed ? '今日已领取' : '领取'}
              </button>
              <button class="btn ghost" data-act="back-lobby">返回大厅</button>
            </div>
          </div>
        </div>`;
      this.make(html, '');
    }

    /* ------------------------------------------------------------ settings */

    settings(meta) {
      const html = `
        <div class="screen-head">
          <button class="back-btn" data-act="back-lobby">‹</button>
          <div class="screen-title">设置</div>
          <div class="screen-sub">v1.0 原型</div>
        </div>
        <div class="panel">
          <div class="settings-row">
            <span>音效</span>
            <div class="switch ${meta.sound ? 'on' : ''}" data-act="toggle-sound"><i></i></div>
          </div>
          <div class="settings-row">
            <span>清除存档</span>
            <button class="btn small ghost" data-act="reset-save">重置</button>
          </div>
        </div>
        <div class="panel">
          <div class="howto">
            <b>操作</b><br/>
            摇杆 / WASD / 方向键移动；空格或右侧按钮释放旋风斩；Esc 暂停。<br/><br/>
            <b>目标</b><br/>
            靠近树木会自动砍伐；砍倒所有母树并清空森林即可通关。熊会冲锋、撞树，撞到巨树或母树会眩晕。<br/><br/>
            <b>关于广告</b><br/>
            当前为单机原型，广告位使用“模拟播放”占位，接入微信 / 抖音小游戏 SDK 后替换 AdManager 即可。
          </div>
        </div>
        <div class="shop-foot">数据保存在浏览器本地；清除后不可恢复。</div>
      `;
      this.make(html, 'solid');
    }

    help() {
      const html = `
        <div class="screen-head">
          <button class="back-btn" data-act="back-lobby">‹</button>
          <div class="screen-title">玩法</div>
        </div>
        <div class="panel">
          <div class="howto">
            <b>1. 移动与砍伐</b><br/>
            左摇杆移动。角色靠近树木会自动挥斧，附近没有树时才会攻击熊；被熊贴身时会优先反击。<br/><br/>
            <b>2. 母树</b><br/>
            母树会不断生成树苗，地图上的树也会向空地扩散。先砍母树，才能停止森林扩张。<br/><br/>
            <b>3. 熊</b><br/>
            熊蓄力后会直线冲锋，撞倒小树、撞晕在巨树上。看准红色预警线躲开。<br/><br/>
            <b>4. 成长</b><br/>
            砍树、杀熊、拆熊窝获得经验和金币。升级时三选一技能，5 级进化。局内金币可在行商处买道具。<br/><br/>
            <b>5. 结算</b><br/>
            通关拿走全部收益，失败只保留一半；永久金币用来在商店买装备，装备会保留到下一局。
          </div>
        </div>
        <div class="result-actions">
          <button class="btn primary" data-act="start-campaign">去闯关</button>
          <button class="btn ghost" data-act="back-lobby">返回大厅</button>
        </div>
      `;
      this.make(html, 'solid');
    }

    /* ----------------------------------------------------------------- ad */

    showAd(seconds, label, onDone) {
      const el = document.createElement('div');
      el.className = 'screen ad-overlay';
      el.innerHTML = `
        <div class="ad-box">
          <div class="ad-title">${label || '广告播放中'}</div>
          <div class="ad-count">${seconds}</div>
          <div class="ad-progress"><i></i></div>
          <div class="ad-reward"></div>
          <div class="ad-note">演示用模拟广告 · 正式发布时接入平台激励视频 SDK</div>
        </div>`;
      this.screensEl.parentElement.appendChild(el);
      const count = el.querySelector('.ad-count');
      const bar = el.querySelector('.ad-progress i');
      const reward = el.querySelector('.ad-reward');
      let left = seconds;
      const total = seconds;
      const timer = setInterval(() => {
        left -= 0.25;
        if (left < 0) left = 0;
        count.textContent = Math.ceil(left);
        bar.style.width = ((total - left) / total) * 100 + '%';
        if (left <= 0) {
          clearInterval(timer);
          count.textContent = '✓';
          reward.textContent = '奖励已发放';
          CL.Audio.play('coin');
          setTimeout(() => {
            el.remove();
            if (onDone) onDone();
          }, 450);
        }
      }, 250);
    }

    /* --------------------------------------------------------------- hud */

    bindHud(refs) {
      this.hpFill = refs.hpFill;
      this.shieldFill = refs.shieldFill;
      this.hpText = refs.hpText;
      this.timerText = refs.timerText;
      this.timerLabel = refs.timerLabel;
      this.goldText = refs.goldText;
      this.xpFill = refs.xpFill;
      this.lvlText = refs.lvlText;
      this.skillMask = refs.skillMask;
      this.skillCdText = refs.skillCdText;
      this.skillBtn = refs.skillBtn;
      this.modeTag = refs.modeTag;
      this.objective = refs.objective;
      this.hint = refs.hint;
    }

    updateHud(world) {
      if (!world || !this.hpFill) return;
      const p = world.player;
      const hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp));
      this.hpFill.style.width = hpPct * 100 + '%';
      this.shieldFill.style.width = Math.max(0, Math.min(1, p.shield / p.maxHp)) * 100 + '%';
      this.hpText.textContent = Math.max(0, Math.ceil(p.hp));

      if (world.mode === 'endless') {
        this.timerText.textContent = this.time(world.elapsed);
        this.timerLabel.textContent = '存活';
      } else {
        this.timerText.textContent = this.time(world.timeLeft);
        this.timerLabel.textContent = '剩余';
        this.timerText.classList.toggle('warn', world.timeLeft <= 30 && !world.finished);
      }

      this.goldText.textContent = world.gold;
      const need = CFG.XP.toNext(world.playerLevel);
      this.xpFill.style.width = Math.min(1, world.xp / need) * 100 + '%';
      this.lvlText.textContent = 'Lv.' + world.playerLevel;

      const cd = world.whirlCd;
      this.skillMask.style.height = Math.min(1, cd / 8) * 100 + '%';
      this.skillCdText.textContent = cd > 0 ? cd.toFixed(1) + 's' : '就绪';
      this.skillBtn.classList.toggle('ready', cd <= 0);

      this.modeTag.textContent = world.mode === 'endless' ? '无尽挑战' : `第 ${world.level} 关`;
      if (this.objective) {
        this.objective.textContent = world.mode === 'endless'
          ? `已砍 ${world.stats.chopped} · 得分 ${world.mode === 'endless' ? Math.round(world.elapsed * 10 + world.stats.chopped * 5 + world.stats.bears * 30) : 0}`
          : `目标：母树 ×${world.aliveMothers()} · 树木 ×${world.aliveTrees()}`;
      }
    }

    setHint(v) {
      if (!this.hint) return;
      this.hint.classList.toggle('fade', !v);
    }

    time(sec) {
      sec = Math.max(0, Math.round(sec));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    toast(msg) {
      const el = this.toastEl;
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }
  }

  CL.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
