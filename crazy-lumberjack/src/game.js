/* 游戏主流程：状态机、输入、渲染循环、存档与广告占位 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});
  const CFG = CL.CFG;

  class Game {
    constructor() {
      this.meta = CL.Save.load();
      this.audio = CL.Audio;
      this.audio.setEnabled(this.meta.sound);

      this.canvas = document.getElementById('game');
      this.minimap = document.getElementById('minimap');
      this.renderer = new CL.Renderer(this.canvas);

      this.ui = new CL.UI({
        screens: document.getElementById('screens'),
        hud: document.getElementById('hud'),
        toast: document.getElementById('toast'),
      });
      this.ui.bindHud({
        hpFill: document.getElementById('hpFill'),
        shieldFill: document.getElementById('shieldFill'),
        hpText: document.getElementById('hpText'),
        timerText: document.getElementById('timerText'),
        timerLabel: document.getElementById('timerLabel'),
        goldText: document.getElementById('goldText'),
        xpFill: document.getElementById('xpFill'),
        lvlText: document.getElementById('lvlText'),
        skillMask: document.getElementById('skillCdMask'),
        skillCdText: document.getElementById('skillCdText'),
        skillBtn: document.getElementById('btnSkill'),
        modeTag: document.getElementById('modeTag'),
        objective: document.getElementById('objective'),
        hint: document.getElementById('hint'),
      });
      this.ui.game = this;

      this.state = 'lobby';
      this.world = null;
      this.mode = 'campaign';
      this.level = 1;
      this.adsUsed = 0;
      this.runSettled = true;
      this.resultMods = { fullKeep: false, double: false };
      this.skillQueued = false;
      this.keys = new Set();
      this.joy = { active: false, x: 0, y: 0, pointerId: null };
      this.lastTs = performance.now();
      this.hintTimer = 0;

      this.demoWorld = this.makeDemoWorld();
      this.renderer.setWorld(this.demoWorld);

      this.bindInput();
      this.bindHudButtons();
      this.ui.lobby(this.meta);
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    makeDemoWorld() {
      const w = new CL.World({ level: 1, seed: 20251021, meta: { weapon: 'axe_iron', armor: 'none', boots: 'none' } });
      w.player.x = w.cfg.mapW * CFG.TILE * 0.5;
      w.player.y = w.cfg.mapH * CFG.TILE * 0.58;
      return w;
    }

    /* -------------------------------------------------------------- input */

    bindInput() {
      window.addEventListener('keydown', (e) => {
        CL.Audio.resume();
        const k = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        this.keys.add(k);
        if (e.repeat) return;
        if (k === ' ' || k === 'j') this.skillQueued = true;
        if (k === 'escape') {
          if (this.state === 'playing') this.pause();
          else if (this.state === 'paused') this.resume();
          else if (this.state === 'runshop') this.closeRunShop();
        }
        if (k === 'e' && this.state === 'playing') this.openRunShop();
        if (k === 'p' && this.state === 'playing') this.pause();
      });
      window.addEventListener('keyup', (e) => {
        this.keys.delete(e.key.toLowerCase());
      });
      window.addEventListener('blur', () => {
        this.keys.clear();
        this.resetJoystick();
        if (this.state === 'playing') this.pause();
      });

      const joy = document.getElementById('joystick');
      const knob = document.getElementById('joyKnob');
      const update = (e) => {
        const r = joy.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2);
        let dy = e.clientY - (r.top + r.height / 2);
        const max = r.width * 0.34;
        const len = Math.hypot(dx, dy);
        if (len > max) {
          dx = (dx / len) * max;
          dy = (dy / len) * max;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy.x = dx / max;
        this.joy.y = dy / max;
      };
      joy.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        CL.Audio.resume();
        this.joy.active = true;
        this.joy.pointerId = e.pointerId;
        joy.setPointerCapture(e.pointerId);
        update(e);
      });
      joy.addEventListener('pointermove', (e) => {
        if (!this.joy.active || e.pointerId !== this.joy.pointerId) return;
        update(e);
      });
      const end = (e) => {
        if (e.pointerId !== this.joy.pointerId) return;
        this.resetJoystick();
      };
      joy.addEventListener('pointerup', end);
      joy.addEventListener('pointercancel', end);
      joy.addEventListener('lostpointercapture', end);

      document.getElementById('btnSkill').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        CL.Audio.resume();
        if (this.state === 'playing') this.skillQueued = true;
      });
      document.getElementById('btnShop').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        CL.Audio.resume();
        if (this.state === 'playing') this.openRunShop();
      });
      window.addEventListener('pointerdown', () => CL.Audio.resume(), { once: true });
    }

    bindHudButtons() {
      document.getElementById('btnPause').addEventListener('click', () => {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      });
    }

    resetJoystick() {
      this.joy.active = false;
      this.joy.x = 0;
      this.joy.y = 0;
      this.joy.pointerId = null;
      const knob = document.getElementById('joyKnob');
      if (knob) knob.style.transform = 'translate(0px, 0px)';
    }

    readInput() {
      let x = 0;
      let y = 0;
      if (this.joy.active) {
        x = this.joy.x;
        y = this.joy.y;
      } else {
        if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
        if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
        if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
        if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
      }
      const skill = this.skillQueued;
      this.skillQueued = false;
      return { x, y, skill };
    }

    /* -------------------------------------------------------------- loop */

    frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastTs) / 1000));
      this.lastTs = now;

      if (this.state === 'playing' && this.world) {
        const input = this.readInput();
        this.world.update(dt, input);
        this.handleEvents();
        if (this.world.finished) {
          this.onRunEnd();
        } else if (this.world.choiceQueue.length) {
          this.openLevelUp();
        }
      }

      const w = this.state === 'lobby' ? this.demoWorld : this.world;
      if (w) {
        this.renderer.draw(w, dt);
        if (this.state !== 'lobby') {
          this.renderer.drawMinimap(w, this.minimap);
          this.ui.updateHud(w);
        }
      }
      requestAnimationFrame(this.frame);
    }

    currentPity(level) {
      const n = (this.meta.failStreak && this.meta.failStreak[level]) || 0;
      return n >= 6 ? 2 : n >= 3 ? 1 : 0;
    }

    handleEvents() {
      const events = this.world.drainEvents();
      for (const e of events) {
        switch (e.name) {
          case 'chop': this.audio.play('chop'); break;
          case 'crit': this.audio.play('crit'); break;
          case 'hurt': this.audio.play('hurt'); break;
          case 'coin': this.audio.play('coin'); break;
          case 'levelup': this.audio.play('levelup'); break;
          case 'evolve': this.audio.play('evolve'); break;
          case 'buy': this.audio.play('buy'); break;
          case 'whirl': this.audio.play('whirl'); break;
          case 'bomb': this.audio.play('bomb'); break;
          case 'charge': this.audio.play('charge'); break;
          case 'chargeWarn': this.audio.play('chargeWarn'); break;
          case 'roar': this.audio.play('roar'); break;
          case 'stun': this.audio.play('stun'); break;
          case 'treefall': this.audio.play('treefall'); break;
          case 'motherDown': this.audio.play('motherDown'); break;
          case 'win': this.audio.play('win'); break;
          case 'lose': this.audio.play('lose'); break;
          case 'revive': this.audio.play('levelup'); break;
        }
      }
    }

    /* -------------------------------------------------------------- runs */

    startRun(mode, level) {
      this.mode = mode;
      this.level = level || 1;
      this.adsUsed = 0;
      this.runSettled = false;
      this.resultMods = { fullKeep: false, double: false };
      this.skillQueued = false;
      this.resetJoystick();
      const pity = mode === 'campaign' ? this.currentPity(this.level) : 0;
      this.world = new CL.World({
        mode,
        level: this.level,
        meta: this.meta,
        pity,
        seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
      });
      this.renderer.setWorld(this.world);
      this.state = 'playing';
      this.ui.hide();
      this.ui.setHudVisible(true);
      this.ui.setHint(true);
      if (pity > 0) {
        setTimeout(() => this.ui.toast(`森林之友：攻击与生命 +${pity * 10}%`), 700);
      }
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => this.ui.setHint(false), 6500);
      this.ui.updateHud(this.world);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.keys.clear();
      this.resetJoystick();
      this.ui.pause(this.world);
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.ui.hide();
      this.lastTs = performance.now();
    }

    openLevelUp() {
      this.state = 'levelup';
      this.resetJoystick();
      this.ui.levelUp(this.world);
    }

    pickSkill(id) {
      if (!this.world || this.state !== 'levelup') return;
      const ok = this.world.applySkill(id);
      if (!ok) return;
      if (this.world.choiceQueue.length) {
        this.ui.levelUp(this.world);
      } else {
        this.state = 'playing';
        this.ui.hide();
        this.lastTs = performance.now();
      }
    }

    rerollSkill() {
      if (!this.world || this.state !== 'levelup') return;
      this.ui.showAd(2, '刷新技能', () => {
        if (this.world.choiceQueue.length) {
          this.world.choiceQueue[0] = this.world.rollChoices();
          this.ui.levelUp(this.world);
        }
      });
    }

    openRunShop() {
      if (this.state !== 'playing') return;
      this.state = 'runshop';
      this.resetJoystick();
      this.ui.runShop(this.world);
    }

    closeRunShop() {
      if (this.state !== 'runshop') return;
      this.state = 'playing';
      this.ui.hide();
      this.lastTs = performance.now();
    }

    buyRunItem(id) {
      if (!this.world) return;
      if (this.world.buyRunItem(id)) {
        this.ui.runShop(this.world);
      } else {
        this.ui.toast('金币不足');
      }
    }

    /* -------------------------------------------------------------- ending */

    onRunEnd() {
      if (this.state === 'result') return;
      this.state = 'result';
      this.resetJoystick();
      this.resultMods = { fullKeep: false, double: false };
      this.ui.result(this.buildResultView());
    }

    buildResultView() {
      const r = this.world.getResult();
      const keep = r.win ? 1 : this.resultMods.fullKeep ? 1 : 0.5;
      let gold = Math.floor(r.goldEarned * keep) + r.clearBonus;
      if (this.resultMods.double) gold *= 2;
      return {
        result: r,
        keep,
        gold: Math.max(0, gold),
        double: this.resultMods.double,
        fullKeep: this.resultMods.fullKeep,
        adsUsed: this.adsUsed,
        canRevive: r.dead && this.adsUsed < 2,
        canExtend: r.reason === 'time' && this.adsUsed < 2,
      };
    }

    adRevive() {
      if (this.adsUsed >= 2) return;
      this.ui.showAd(3, '复活', () => {
        this.adsUsed++;
        this.world.revive();
        this.resultMods = { fullKeep: false, double: false };
        this.state = 'playing';
        this.ui.hide();
        this.lastTs = performance.now();
        this.ui.toast('已复活 · 3 秒无敌');
      });
    }

    adExtendTime() {
      if (this.adsUsed >= 2) return;
      this.ui.showAd(3, '增加时间', () => {
        this.adsUsed++;
        this.world.extendTime(30);
        this.resultMods = { fullKeep: false, double: false };
        this.state = 'playing';
        this.ui.hide();
        this.lastTs = performance.now();
        this.ui.toast('时间 +30 秒');
      });
    }

    adFullKeep() {
      this.ui.showAd(2, '保留全部金币', () => {
        this.resultMods.fullKeep = true;
        this.ui.result(this.buildResultView());
      });
    }

    adDouble() {
      this.ui.showAd(2, '双倍金币', () => {
        this.resultMods.double = true;
        this.ui.result(this.buildResultView());
      });
    }

    settleRewards() {
      if (this.runSettled || !this.world) return;
      const view = this.buildResultView();
      const r = view.result;
      this.meta.gold += view.gold;
      this.meta.runs = (this.meta.runs || 0) + 1;
      if (r.win) {
        this.meta.wins = (this.meta.wins || 0) + 1;
        if (r.mode === 'campaign') {
          this.meta.cleared[r.level] = true;
          this.meta.maxLevel = Math.max(this.meta.maxLevel, Math.min(30, r.level + 1));
          if (this.meta.failStreak) this.meta.failStreak[r.level] = 0;
        }
      } else if (r.mode === 'campaign') {
        if (!this.meta.failStreak) this.meta.failStreak = {};
        this.meta.failStreak[r.level] = (this.meta.failStreak[r.level] || 0) + 1;
      }
      if (r.mode === 'endless') {
        this.meta.endlessBest = Math.max(this.meta.endlessBest || 0, r.score);
      }
      this.runSettled = true;
      CL.Save.save(this.meta);
    }

    resultRetry() {
      this.settleRewards();
      this.startRun(this.mode, this.level);
    }

    resultNext() {
      this.settleRewards();
      if (this.mode === 'campaign' && this.level < 30) this.startRun('campaign', this.level + 1);
      else this.toLobby();
    }

    resultLobby() {
      this.settleRewards();
      this.toLobby();
    }

    restartRun() {
      this.settleRewards();
      this.startRun(this.mode, this.level);
    }

    abandonRun() {
      if (this.world && !this.world.finished) {
        // 中途退出按失败结算一半，避免无损刷金币
        this.resultMods = { fullKeep: false, double: false };
      }
      this.settleRewards();
      this.toLobby();
    }

    toLobby() {
      this.state = 'lobby';
      this.world = null;
      this.ui.hide();
      this.ui.setHudVisible(false);
      this.renderer.setWorld(this.demoWorld);
      this.ui.lobby(this.meta);
      this.resetJoystick();
    }

    /* ------------------------------------------------------------- screens */

    openLevels() {
      this.state = 'levels';
      this.ui.levels(this.meta);
    }

    openShop(tab) {
      this.state = 'shop';
      this.ui.shop(this.meta, tab || 'weapon');
    }

    openDaily() {
      this.state = 'daily';
      this.ui.daily(this.meta);
    }

    openSettings() {
      this.state = 'settings';
      this.ui.settings(this.meta);
    }

    openHelp() {
      this.state = 'help';
      this.ui.help();
    }

    claimDaily() {
      if (this.meta.dailyDate === CL.Save.todayKey()) return;
      this.meta.dailyDate = CL.Save.todayKey();
      this.meta.gold += 150;
      CL.Save.save(this.meta);
      this.ui.daily(this.meta);
      this.ui.toast('+150 金币');
    }

    toggleSound() {
      this.meta.sound = !this.meta.sound;
      this.audio.setEnabled(this.meta.sound);
      CL.Save.save(this.meta);
      this.ui.settings(this.meta);
    }

    resetSave() {
      if (!global.confirm('确定要清除所有进度吗？金币、装备和关卡进度都会重置。')) return;
      this.meta = CL.Save.reset();
      this.audio.setEnabled(this.meta.sound);
      this.state = 'lobby';
      this.ui.lobby(this.meta);
      this.ui.toast('存档已重置');
    }

    /* --------------------------------------------------------------- shop */

    buyWeapon(id) {
      const w = CFG.WEAPONS.find((x) => x.id === id);
      if (!w || this.meta.ownedWeapons.includes(id) || this.meta.gold < w.cost) return;
      this.meta.gold -= w.cost;
      this.meta.ownedWeapons.push(id);
      this.meta.weapon = id;
      CL.Save.save(this.meta);
      this.ui.shop(this.meta, 'weapon');
      this.ui.toast('已购买 ' + w.name);
    }

    equip(kind, id) {
      if (kind === 'weapon' && !this.meta.ownedWeapons.includes(id)) return;
      if (kind === 'armor' && !this.meta.ownedArmors.includes(id)) return;
      if (kind === 'boots' && !this.meta.ownedBoots.includes(id)) return;
      this.meta[kind] = id;
      CL.Save.save(this.meta);
      this.ui.shop(this.meta, this.ui.shopTab);
    }

    buyArmor(id) {
      const a = CFG.ARMORS.find((x) => x.id === id);
      if (!a || this.meta.ownedArmors.includes(id) || this.meta.gold < a.cost) return;
      this.meta.gold -= a.cost;
      this.meta.ownedArmors.push(id);
      this.meta.armor = id;
      CL.Save.save(this.meta);
      this.ui.shop(this.meta, 'armor');
    }

    buyBoots(id) {
      const b = CFG.BOOTS.find((x) => x.id === id);
      if (!b || this.meta.ownedBoots.includes(id) || this.meta.gold < b.cost) return;
      this.meta.gold -= b.cost;
      this.meta.ownedBoots.push(id);
      this.meta.boots = id;
      CL.Save.save(this.meta);
      this.ui.shop(this.meta, 'boots');
    }

    buyAux(id) {
      const a = CFG.AUX.find((x) => x.id === id);
      if (!a || this.meta.aux[id] || this.meta.gold < a.cost) return;
      this.meta.gold -= a.cost;
      this.meta.aux[id] = true;
      CL.Save.save(this.meta);
      this.ui.shop(this.meta, 'aux');
      this.ui.toast('已购买 ' + a.name);
    }

    upgradeWeapon() {
      const cost = 120 * (this.meta.weaponUpgrade + 1);
      if (this.meta.weaponUpgrade >= 10 || this.meta.gold < cost) return;
      this.meta.gold -= cost;
      this.meta.weaponUpgrade++;
      CL.Save.save(this.meta);
      this.ui.shop(this.meta, 'weapon');
      this.ui.toast('武器强化 +1');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      global.game = new Game();
    });
  } else {
    global.game = new Game();
  }
})(typeof window !== 'undefined' ? window : globalThis);
