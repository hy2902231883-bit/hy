/*
 * 疯狂伐木工 — 纯逻辑模拟层（不依赖 DOM，可在 Node 中直接跑自动化测试）
 *
 * 对应 GDD：核心循环、树木生长/扩散、母树、熊 AI 与冲锋、熊窝、
 * 局内金币商店、经验与三选一技能、倒计时、胜负判定、结算。
 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});
  const CFG = CL.CFG;
  const { clamp, dist, dist2, angle } = CL.util;
  const T = CFG.TILE;

  let idSeq = 1;

  class World {
    constructor(opts = {}) {
      this.mode = opts.mode === 'endless' ? 'endless' : 'campaign';
      this.level = opts.level || 1;
      this.meta = opts.meta || {};
      this.pity = Math.max(0, Math.min(2, opts.pity | 0 || 0));
      this.seed = (opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed) >>> 0;
      this.rng = new CL.RNG(this.seed);
      this.fxRng = new CL.RNG((this.seed ^ 0x5bf03635) >>> 0);
      this.cfg = this.mode === 'endless' ? CFG.endlessConfig() : CFG.levelConfig(this.level);
      this.reset();
    }

    /* ---------------------------------------------------------------- setup */

    reset() {
      const s = this.cfg;
      this.trees = [];
      this.bears = [];
      this.nests = [];
      this.particles = [];
      this.texts = [];
      this.blasts = [];
      this.stumps = [];
      this.events = [];
      this.occ = new Set();
      this.chargeSeq = 0;

      this.elapsed = 0;
      this.timeLeft = s.time;
      this.finished = false;
      this.win = false;
      this.dead = false;
      this.failReason = null;

      this.gold = 0;
      this.xp = 0;
      this.playerLevel = 1;
      this.skills = { orbit: 0, power: 0, fire: 0, shield: 0, berserk: 0 };
      this.evolved = { orbit: false, power: false, fire: false, shield: false, berserk: false };
      this.choiceQueue = [];

      this.attackTimer = 0;
      this.swingT = 0;
      this.swingDir = 0;
      this.whirlCd = 0;
      this.whirlT = 0;
      this.fireCd = 0;
      this.robotCd = 0;
      this.freezeT = 0;
      this.rageT = 0;
      this.berserkStacks = 0;
      this.berserkStackT = 0;
      this.sinceHurt = 99;
      this.shake = 0;
      this.levelFlash = 0;
      this.growAcc = 0;
      this.cleanAcc = 0;
      this.bearSpawnT = 18;
      this.motherRespawnT = 55;
      this.orbitAngle = 0;
      this.stats = { chopped: 0, knocked: 0, cleared: 0, bears: 0, nests: 0, mothers: 0, gold: 0, xp: 0 };

      this.player = {
        x: s.mapW * T * 0.5,
        y: s.mapH * T * 0.58,
        r: 7,
        hp: 100,
        maxHp: 100,
        shield: 0,
        invuln: 0,
        faceX: 0,
        faceY: -1,
        moving: false,
        hurtFlash: 0,
      };

      this.applyMeta();
      this.generateMap();
      this.emit('start');
    }

    applyMeta() {
      const meta = this.meta || {};
      const weapon = CFG.WEAPONS.find((w) => w.id === meta.weapon) || CFG.WEAPONS[0];
      const armor = CFG.ARMORS.find((a) => a.id === meta.armor) || CFG.ARMORS[0];
      const boots = CFG.BOOTS.find((b) => b.id === meta.boots) || CFG.BOOTS[0];
      const upg = Math.max(0, Math.min(10, meta.weaponUpgrade | 0)) || 0;

      this.base = {
        maxHp: (CFG.PLAYER.hp + armor.hp) * (1 + 0.1 * this.pity),
        dr: armor.dr,
        speed: CFG.PLAYER.speed * (1 + boots.spd) * T,
        atkDmg: (weapon.dmg + upg * 2) * (1 + 0.1 * this.pity),
        interval: weapon.interval,
        range: CFG.PLAYER.range * T,
        crit: CFG.PLAYER.crit,
        critMul: CFG.PLAYER.critMul,
      };

      this.player.maxHp = this.base.maxHp;
      this.player.hp = this.base.maxHp;

      const aux = meta.aux || {};
      if (aux.orbit) this.skills.orbit = 1;
      if (aux.core) this.player.shield = 25;
      this.hasRobot = !!aux.robot;
      this.weaponName = weapon.name;
    }

    generateMap() {
      const s = this.cfg;
      const p = this.player;
      const px = p.x, py = p.y;

      for (let i = 0; i < s.trees; i++) this.spawnRandomTree(3);
      for (let i = 0; i < s.mothers; i++) this.spawnMother(i);
      for (let i = 0; i < s.bears; i++) {
        const t = this.randomFreeTile(7);
        if (t) this.spawnBear(this.pickBearType(this.mode === 'endless' ? 0 : this.level * 14), t.x, t.y);
      }
      for (let i = 0; i < s.nests; i++) {
        const t = this.randomFreeTile(7);
        if (t) this.spawnNest(t.x, t.y);
      }
      // 出生点周围留空
      for (const t of this.trees) {
        if (dist(t.x, t.y, px, py) < T * 2.2) this.removeTreeSilently(t);
      }
      this.bears.forEach((b) => {
        if (dist(b.x, b.y, px, py) < T * 5) this.placeEntityAway(b, 6);
      });
    }

    randomFreeTile(minTiles, maxTries = 60) {
      const s = this.cfg;
      for (let i = 0; i < maxTries; i++) {
        const tx = this.rng.int(1, s.mapW - 2);
        const ty = this.rng.int(1, s.mapH - 2);
        if (this.occ.has(ty * s.mapW + tx)) continue;
        const x = tx * T + T / 2;
        const y = ty * T + T / 2;
        if (dist(x, y, this.player.x, this.player.y) < minTiles * T) continue;
        return { x, y, tx, ty };
      }
      return null;
    }

    spawnRandomTree(minDist = 2) {
      const s = this.cfg;
      const spot = this.randomFreeTile(minDist);
      if (!spot) return null;
      return this.addTree(spot.tx, spot.ty, this.rollStage(), false);
    }

    rollStage() {
      const r = this.rng.next();
      let stage = r < 0.42 ? 0 : r < 0.78 ? 1 : 2;
      if (this.cfg.giants && this.rng.chance(0.08)) stage = 3;
      return stage;
    }

    spawnMother(index) {
      const s = this.cfg;
      const spot = this.randomFreeTile(7, 200);
      if (!spot) return null;
      // 母树尽量彼此拉开
      if (index > 0) {
        const others = this.trees.filter((t) => t.mother);
        for (const o of others) {
          if (dist(o.x, o.y, spot.x, spot.y) < T * 4) return this.spawnMother(index);
        }
      }
      return this.addTree(spot.tx, spot.ty, 0, true);
    }

    hpMul() {
      return this.mode === 'endless' ? 1 + Math.min(1.4, this.elapsed / 260) : 1 + 0.04 * (this.level - 1);
    }

    addTree(tx, ty, stage, mother) {
      const s = this.cfg;
      const def = mother ? CFG.MOTHER : CFG.TREE_STAGES[stage];
      const hpMul = this.hpMul();
      const maxHp = (mother ? CFG.MOTHER.hp * CFG.MOTHER_HP_SCALE * (1 + 0.05 * (this.level - 1)) : def.hp) * (mother ? 1 : hpMul);
      const tree = {
        id: idSeq++,
        kind: 'tree',
        tx, ty,
        x: tx * T + T / 2,
        y: ty * T + T / 2,
        stage,
        mother: !!mother,
        name: def.name,
        r: mother ? CFG.MOTHER.radius : (def.radius || 9),
        maxHp: Math.round(maxHp),
        hp: Math.round(maxHp),
        growT: 0,
        shake: 0,
        flash: 0,
        alive: true,
        spawnT: 5,
        variant: this.rng.int(0, 3),
        burnT: 0,
        burnDps: 0,
        lastCharge: -1,
        orbitCd: 0,
      };
      this.trees.push(tree);
      this.occ.add(ty * s.mapW + tx);
      return tree;
    }

    spawnBear(typeId, x, y) {
      const def = CFG.BEARS[typeId] || CFG.BEARS.brown;
      if (typeId === 'king' && this.bears.some((b) => b.alive && b.type === 'king')) return null;
      if (this.bears.filter((b) => b.alive).length >= this.cfg.maxBears) return null;
      const scale = this.mode === 'endless' ? 1 + Math.min(1.6, this.elapsed / 150) : 1 + Math.min(1.4, 0.045 * (this.level - 1));
      const b = {
        id: idSeq++,
        kind: 'bear',
        type: def.id,
        name: def.name,
        x, y,
        r: def.radius,
        maxHp: Math.round(def.hp * scale),
        hp: Math.round(def.hp * scale),
        dmg: Math.round(def.dmg * (0.8 + 0.2 * scale)),
        chargeDmg: Math.round(def.charge * (0.8 + 0.2 * scale)),
        speed: def.speed * (0.92 + 0.08 * scale),
        aggro: def.aggro,
        gold: def.gold,
        xp: def.xp,
        state: 'patrol',
        stateT: 0,
        wx: x,
        wy: y,
        dirX: 1,
        dirY: 0,
        atkCd: 0,
        chargeCd: this.rng.range(1.5, 4),
        flash: 0,
        hitT: 0,
        chargeDirX: 1,
        chargeDirY: 0,
        chargeId: 0,
        alive: true,
        burnT: 0,
        burnDps: 0,
        orbitCd: 0,
      };
      this.bears.push(b);
      return b;
    }

    spawnNest(x, y) {
      const nest = {
        id: idSeq++,
        kind: 'nest',
        x, y,
        r: 15,
        maxHp: 300,
        hp: 300,
        spawnT: 6,
        alive: true,
        flash: 0,
      };
      this.nests.push(nest);
      return nest;
    }

    placeEntityAway(e, tiles) {
      for (let i = 0; i < 30; i++) {
        const x = this.rng.range(T, this.cfg.mapW * T - T);
        const y = this.rng.range(T, this.cfg.mapH * T - T);
        if (dist(x, y, this.player.x, this.player.y) >= tiles * T) {
          e.x = x; e.y = y;
          if (e.wx !== undefined) { e.wx = x; e.wy = y; }
          return;
        }
      }
    }

    pickBearType(elapsed) {
      const types = this.cfg.bearTypes || ['brown'];
      if (this.level >= 16 && this.mode === 'campaign' && types.includes('king') && !this.bears.some((b) => b.alive && b.type === 'king') && this.rng.chance(0.35)) return 'king';
      if (this.mode === 'endless' && elapsed > 220 && !this.bears.some((b) => b.alive && b.type === 'king') && this.rng.chance(0.25)) return 'king';
      if (elapsed > 120 && types.includes('giant') && this.rng.chance(0.3)) return 'giant';
      if (elapsed > 40 && types.includes('black') && this.rng.chance(0.45)) return 'black';
      return types.includes('brown') ? 'brown' : types[0];
    }

    /* --------------------------------------------------------------- helpers */

    aliveTrees() {
      let n = 0;
      for (const t of this.trees) if (t.alive && !t.mother) n++;
      return n;
    }

    aliveMothers() {
      let n = 0;
      for (const t of this.trees) if (t.alive && t.mother) n++;
      return n;
    }

    aliveBears() {
      let n = 0;
      for (const b of this.bears) if (b.alive) n++;
      return n;
    }

    emit(name, data) {
      this.events.push({ name, data });
    }

    drainEvents() {
      const e = this.events;
      this.events = [];
      return e;
    }

    /* ---------------------------------------------------------------- update */

    update(dt, input) {
      if (this.finished) return;
      dt = Math.min(dt || 0, 0.05);
      if (dt <= 0) return;
      this.elapsed += dt;

      if (this.mode === 'campaign') {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.finish(false, 'time');
          return;
        }
      }

      this.player.invuln = Math.max(0, this.player.invuln - dt);
      this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
      this.swingT = Math.max(0, this.swingT - dt);
      this.whirlT = Math.max(0, this.whirlT - dt);
      this.whirlCd = Math.max(0, this.whirlCd - dt);
      this.levelFlash = Math.max(0, this.levelFlash - dt);
      this.sinceHurt += dt;
      this.freezeT = Math.max(0, this.freezeT - dt);
      this.rageT = Math.max(0, this.rageT - dt);
      if (this.berserkStackT > 0) {
        this.berserkStackT -= dt;
        if (this.berserkStackT <= 0) this.berserkStacks = 0;
      }

      this.updatePlayer(dt, input || {});
      this.updateSkills(dt);
      this.updateBears(dt);
      this.updateNests(dt);
      this.updateGrowth(dt);
      this.updateBlasts(dt);
      this.updateFx(dt);
      if (this.mode === 'endless') this.updateEndless(dt);
      this.checkWin();
    }

    updatePlayer(dt, input) {
      const p = this.player;
      let ix = +input.x || 0;
      let iy = +input.y || 0;
      const len = Math.hypot(ix, iy);
      if (len > 0.001) {
        ix /= len; iy /= len;
        if (Math.abs(ix) > 0.05 || Math.abs(iy) > 0.05) {
          p.faceX = ix; p.faceY = iy;
        }
        p.moving = true;
        const spd = this.currentSpeed();
        p.x = clamp(p.x + ix * spd * dt, 8, this.cfg.mapW * T - 8);
        p.y = clamp(p.y + iy * spd * dt, 8, this.cfg.mapH * T - 8);
      } else {
        p.moving = false;
      }

      // 脱战缓慢回复（试玩调参项，GDD 未规定）
      if (this.sinceHurt > CFG.PLAYER.regenDelay && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + CFG.PLAYER.regen * dt);
      }

      // 护盾再生
      const lv = this.skills.shield;
      if (lv > 0) {
        const cap = this.shieldCap();
        if (p.shield < cap && this.sinceHurt > 6 - 0.5 * lv) {
          p.shield = Math.min(cap, p.shield + (cap / 6) * dt);
        }
      }

      // 主动技能：旋风斩
      if (input.skill) this.castWhirlwind();

      // 普通攻击（靠近自动攻击）
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        const targets = this.pickTargets(this.cleaveCount());
        if (targets.length) {
          this.attackTimer = this.currentInterval();
          this.swingT = 0.2;
          this.swingDir = angle(p.x, p.y, targets[0].e.x, targets[0].e.y);
          for (const { e, kind } of targets) {
            const crit = this.rng.chance(this.base.crit);
            const dmg = this.currentDamage() * (crit ? this.base.critMul : 1);
            if (kind === 'tree') this.damageTree(e, dmg, { crit, source: 'melee' });
            else if (kind === 'bear') this.damageBear(e, dmg, { crit });
            else this.damageNest(e, dmg, { crit });
          }
          this.emit('swing');
        }
      }
    }

    currentSpeed() {
      let mul = 1 + 0.02 * this.skills.berserk;
      if (this.evolved.berserk) mul += 0.1;
      return this.base.speed * mul;
    }

    currentDamage() {
      return this.base.atkDmg * (1 + 0.15 * this.skills.power);
    }

    currentInterval() {
      let spd = 1;
      spd += 0.08 * this.skills.berserk;
      if (this.evolved.berserk) spd += 0.15;
      spd += this.berserkStacks * 0.04;
      if (this.rageT > 0) spd += 0.5;
      if (this.evolved.power) spd += 0.1;
      return this.base.interval / spd;
    }

    cleaveCount() {
      if (this.skills.power >= 3) return 2 + (this.evolved.power ? 2 : 0);
      return 1;
    }

    shieldCap() {
      return this.skills.shield * 20 + (this.meta && this.meta.aux && this.meta.aux.core ? 25 : 0);
    }

    pickTargets(count) {
      const p = this.player;
      const range = this.base.range;
      const trees = [];
      const bears = [];
      const nests = [];

      // 贴身撕咬的熊优先反击，否则严格遵循“树木优先”
      for (const b of this.bears) {
        if (b.alive && dist(p.x, p.y, b.x, b.y) < b.r + p.r + 6) {
          bears.push({ e: b, kind: 'bear', d: dist(p.x, p.y, b.x, b.y) });
        }
      }
      if (bears.length) {
        bears.sort((a, b) => a.d - b.d);
        return bears.slice(0, count);
      }

      for (const t of this.trees) {
        if (!t.alive) continue;
        const d = dist(p.x, p.y, t.x, t.y) - t.r;
        if (d <= range) trees.push({ e: t, kind: 'tree', d });
      }
      if (trees.length) {
        trees.sort((a, b) => {
          const am = a.e.mother ? 0 : 1;
          const bm = b.e.mother ? 0 : 1;
          return am - bm || a.d - b.d;
        });
        return trees.slice(0, count);
      }
      for (const b of this.bears) {
        if (!b.alive) continue;
        const d = dist(p.x, p.y, b.x, b.y) - b.r;
        if (d <= range) bears.push({ e: b, kind: 'bear', d });
      }
      if (bears.length) {
        bears.sort((a, b) => a.d - b.d);
        return bears.slice(0, count);
      }
      for (const n of this.nests) {
        if (!n.alive) continue;
        const d = dist(p.x, p.y, n.x, n.y) - n.r;
        if (d <= range) nests.push({ e: n, kind: 'nest', d });
      }
      nests.sort((a, b) => a.d - b.d);
      return nests.slice(0, count);
    }

    /* ---------------------------------------------------------------- combat */

    damageTree(t, dmg, opts = {}) {
      if (!t.alive) return;
      t.hp -= dmg;
      t.flash = 0.12;
      if (!opts.quiet) {
        t.shake = Math.min(0.4, (t.shake || 0) + 0.18);
        const crit = !!opts.crit;
        this.addText(t.x + this.fxRng.range(-6, 6), t.y - t.r - 4, Math.max(1, Math.round(dmg)), crit ? '#ffd166' : '#ffffff', crit);
        if (crit) this.emit('crit'); else this.emit('chop');
        this.addParticles(t.x, t.y - t.r * 0.5, crit ? 6 : 3, {
          color: ['#c8a26a', '#8a6a3a', '#6b8f3a'],
          spd: 60,
          life: 0.5,
          size: 2,
          gravity: 140,
        });
      }
      if (t.hp <= 0) this.killTree(t, opts);
    }

    killTree(t, opts = {}) {
      if (!t.alive) return;
      t.alive = false;
      t.hp = 0;
      this.occ.delete(t.ty * this.cfg.mapW + t.tx);
      this.stats.cleared++;
      this.addParticles(t.x, t.y - t.r * 0.4, t.mother ? 22 : 8, {
        color: ['#3d6f37', '#5c8f45', '#7fae55', '#8a6a3a'],
        spd: t.mother ? 130 : 80,
        life: 0.8,
        size: 2,
        gravity: 90,
      });

      if (t.mother) {
        this.stumps.push({ x: t.x, y: t.y, stage: 3, mother: true });
        this.stats.mothers++;
        this.emit('motherDown');
        this.shake = Math.max(this.shake, 7);
        this.addText(t.x, t.y - 24, '母树倒下!', '#ff8a5c', true);
        if (!opts.silent) {
          this.gainGold(CFG.MOTHER.gold, t.x, t.y);
          this.gainXp(CFG.MOTHER.xp);
        }
        return;
      }

      if (opts.byBear) {
        this.stats.knocked++;
        this.stumps.push({ x: t.x, y: t.y, stage: t.stage, mother: false });
        this.emit('treefall');
        return;
      }
      this.stats.chopped++;
      this.stumps.push({ x: t.x, y: t.y, stage: t.stage, mother: false });
      if (this.stumps.length > 90) this.stumps.shift();
      if (!opts.silent) {
        const def = CFG.TREE_STAGES[t.stage];
        this.gainGold(def.gold, t.x, t.y);
        this.gainXp(def.xp);
      }
    }

    removeTreeSilently(t) {
      t.alive = false;
      this.occ.delete(t.ty * this.cfg.mapW + t.tx);
    }

    damageBear(b, dmg, opts = {}) {
      if (!b.alive) return;
      b.hp -= dmg;
      b.flash = 0.12;
      if (b.state !== 'charge' && b.state !== 'stun') b.state = 'chase';
      if (!opts.quiet) {
        this.addText(b.x + this.fxRng.range(-6, 6), b.y - b.r - 6, Math.max(1, Math.round(dmg)), opts.crit ? '#ffd166' : '#ffe8e0', opts.crit);
        this.addParticles(b.x, b.y, 3, { color: ['#8b2f2f', '#c0392b'], spd: 50, life: 0.4, size: 2, gravity: 120 });
      }
      if (b.hp <= 0) this.killBear(b);
    }

    killBear(b) {
      if (!b.alive) return;
      b.alive = false;
      this.stats.bears++;
      this.gainGold(b.gold, b.x, b.y);
      this.gainXp(b.xp);
      this.berserkStacks = Math.min(this.evolved.berserk ? 7 : 5, this.berserkStacks + 1);
      this.berserkStackT = 6;
      this.addParticles(b.x, b.y, 14, { color: ['#6b4a2f', '#8b2f2f', '#3a2a1a'], spd: 110, life: 0.7, size: 2, gravity: 100 });
      this.emit('bearDie');
      this.shake = Math.max(this.shake, 3);
    }

    damageNest(n, dmg, opts = {}) {
      if (!n.alive) return;
      n.hp -= dmg;
      n.flash = 0.12;
      this.addText(n.x, n.y - 20, Math.round(dmg), '#ffe8e0', !!opts.crit);
      this.addParticles(n.x, n.y - 4, 3, { color: ['#8a6a3a', '#5c4a2a'], spd: 60, life: 0.4, size: 2, gravity: 120 });
      this.emit('chop');
      if (n.hp <= 0) {
        n.alive = false;
        this.stats.nests++;
        this.gainGold(40, n.x, n.y);
        this.gainXp(25);
        this.addParticles(n.x, n.y, 16, { color: ['#8a6a3a', '#a8814a'], spd: 100, life: 0.7, size: 2, gravity: 80 });
        this.emit('nestDown');
        this.shake = Math.max(this.shake, 4);
      }
    }

    hurtPlayer(amount, source) {
      const p = this.player;
      if (p.invuln > 0 || this.dead || this.finished) return;
      let dmg = amount * (1 - this.base.dr);
      const incoming = dmg;
      if (p.shield > 0) {
        const absorbed = Math.min(p.shield, dmg);
        p.shield -= absorbed;
        dmg -= absorbed;
      }
      p.hp -= dmg;
      p.invuln = CFG.PLAYER.invuln;
      p.hurtFlash = 0.35;
      this.sinceHurt = 0;
      this.shake = Math.max(this.shake, 4);
      this.emit('hurt');
      if (this.evolved.shield) {
        for (const b of this.bears) {
          if (b.alive && dist(b.x, b.y, p.x, p.y) < 60) this.damageBear(b, incoming * 0.35, {});
        }
        for (const n of this.nests) if (n.alive && dist(n.x, n.y, p.x, p.y) < 60) this.damageNest(n, incoming * 0.35, {});
      }
      if (p.hp <= 0) {
        p.hp = 0;
        this.die();
      }
    }

    die() {
      if (this.finished) return;
      this.dead = true;
      this.berserkStacks = 0;
      this.emit('lose');
      this.finish(false, 'dead');
    }

    finish(win, reason) {
      if (this.finished) return;
      this.finished = true;
      this.win = !!win;
      this.failReason = reason || null;
      if (win) {
        this.emit('win');
        this.addParticles(this.player.x, this.player.y, 30, { color: ['#f2c14e', '#ffe8a0', '#8fd15a'], spd: 160, life: 1.2, size: 2, gravity: 60 });
      }
    }

    revive() {
      if (!this.finished || !this.dead) return false;
      this.finished = false;
      this.dead = false;
      this.failReason = null;
      this.player.hp = this.player.maxHp;
      this.player.shield = 0;
      this.player.invuln = 3;
      for (const b of this.bears) {
        if (b.alive && dist(b.x, b.y, this.player.x, this.player.y) < 90) this.placeEntityAway(b, 7);
        b.state = 'patrol';
        b.stateT = 0;
      }
      this.emit('revive');
      return true;
    }

    extendTime(sec) {
      if (!this.finished || this.failReason !== 'time') return false;
      this.finished = false;
      this.failReason = null;
      this.timeLeft += sec;
      this.player.invuln = Math.max(this.player.invuln, 2);
      this.emit('revive');
      return true;
    }

    castWhirlwind() {
      if (this.whirlCd > 0 || this.finished) return false;
      this.whirlCd = 8;
      this.whirlT = 0.4;
      this.shake = Math.max(this.shake, 3);
      const p = this.player;
      const dmg = this.currentDamage() * 3;
      const r = 64;
      for (const t of this.trees) {
        if (t.alive && dist(p.x, p.y, t.x, t.y) - t.r < r) this.damageTree(t, dmg, { crit: false, source: 'whirl' });
      }
      for (const b of this.bears) {
        if (b.alive && dist(p.x, p.y, b.x, b.y) - b.r < r) {
          this.damageBear(b, dmg, {});
          const a = angle(p.x, p.y, b.x, b.y);
          b.x += Math.cos(a) * 14;
          b.y += Math.sin(a) * 14;
          if (b.state !== 'stun') { b.state = 'stun'; b.stateT = 0.45; }
        }
      }
      for (const n of this.nests) {
        if (n.alive && dist(p.x, p.y, n.x, n.y) - n.r < r) this.damageNest(n, dmg, {});
      }
      this.addParticles(p.x, p.y, 14, { color: ['#e8e0d0', '#c8d0d8'], spd: 130, life: 0.4, size: 2, gravity: 0 });
      this.emit('whirl');
      return true;
    }

    /* ---------------------------------------------------------------- skills */

    updateSkills(dt) {
      const p = this.player;

      // 金属疲劳：飞斧环绕
      const orbitLv = this.skills.orbit;
      if (orbitLv > 0) {
        this.orbitAngle += dt * (3.4 + 0.12 * orbitLv);
        const axes = 1 + (orbitLv >= 3 ? 1 : 0) + (this.evolved.orbit ? 1 : 0);
        const radius = 44 + (this.evolved.orbit ? 12 : 0);
        const dmg = 4 + 2 * orbitLv;
        for (let i = 0; i < axes; i++) {
          const a = this.orbitAngle + (Math.PI * 2 * i) / axes;
          const ax = p.x + Math.cos(a) * radius;
          const ay = p.y + Math.sin(a) * radius * 0.82;
          if (this.fxRng.chance(0.5)) {
            this.particles.push({ x: ax, y: ay, vx: 0, vy: 0, life: 0.22, maxLife: 0.22, color: '#ffd166', size: 1, gravity: 0 });
          }
          for (const t of this.trees) {
            if (!t.alive || t.orbitCd > 0) continue;
            if (dist(ax, ay, t.x, t.y) < t.r + 10) {
              t.orbitCd = 0.45;
              this.damageTree(t, dmg, { source: 'orbit' });
            }
          }
          for (const b of this.bears) {
            if (!b.alive || b.orbitCd > 0) continue;
            if (dist(ax, ay, b.x, b.y) < b.r + 10) {
              b.orbitCd = 0.45;
              this.damageBear(b, dmg, {});
            }
          }
        }
      }

      // 燃烧弹
      const fireLv = this.skills.fire;
      if (fireLv > 0) {
        this.fireCd -= dt;
        if (this.fireCd <= 0) {
          if (this.throwFireBomb()) this.fireCd = 6 - 0.6 * fireLv;
          else this.fireCd = 0.5;
        }
      }

      // 伐木机器人（永久辅助装备）
      if (this.hasRobot) {
        this.robotCd -= dt;
        if (this.robotCd <= 0) {
          this.robotCd = 2.6;
          const t = this.nearestTree(p.x, p.y, 120);
          if (t) {
            this.damageTree(t, 8, { source: 'robot' });
            this.addParticles(t.x, t.y, 2, { color: ['#c8d0d8'], spd: 40, life: 0.3, size: 1, gravity: 0 });
          }
        }
      }
    }

    nearestTree(x, y, maxDist) {
      let best = null;
      let bd = maxDist * maxDist;
      for (const t of this.trees) {
        if (!t.alive) continue;
        const d = dist2(x, y, t.x, t.y);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }

    throwFireBomb() {
      const p = this.player;
      let target = null;
      let best = Infinity;
      for (const b of this.bears) {
        if (!b.alive) continue;
        const d = dist2(p.x, p.y, b.x, b.y);
        if (d < best && d < 150 * 150) { best = d; target = b; }
      }
      if (!target) {
        const t = this.nearestTree(p.x, p.y, 130);
        if (t) target = t;
      }
      if (!target) return false;
      const lv = this.skills.fire;
      this.blasts.push({
        x: target.x,
        y: target.y,
        r: 38 + 5 * lv + (this.evolved.fire ? 20 : 0),
        dmg: 18 + 9 * lv,
        burn: this.evolved.fire ? 10 : 5,
        t: 0,
        delay: 0.45,
        kind: 'fire',
      });
      this.emit('throw');
      return true;
    }

    updateBlasts(dt) {
      for (const bl of this.blasts) {
        bl.t += dt;
      }
      const ready = this.blasts.filter((b) => b.t >= b.delay);
      this.blasts = this.blasts.filter((b) => b.t < b.delay);
      for (const bl of ready) {
        this.explode(bl);
      }
    }

    explode(bl) {
      const p = this.player;
      for (const t of this.trees) {
        if (t.alive && dist(bl.x, bl.y, t.x, t.y) < bl.r + t.r * 0.6) {
          this.damageTree(t, bl.dmg, { source: 'fire' });
          if (t.alive) { t.burnT = 3; t.burnDps = bl.burn; }
        }
      }
      for (const b of this.bears) {
        if (b.alive && dist(bl.x, bl.y, b.x, b.y) < bl.r + b.r) {
          this.damageBear(b, bl.dmg, {});
          if (b.alive) { b.burnT = 3; b.burnDps = bl.burn; }
        }
      }
      for (const n of this.nests) {
        if (n.alive && dist(bl.x, bl.y, n.x, n.y) < bl.r + n.r) this.damageNest(n, bl.dmg * 0.7, {});
      }
      this.addParticles(bl.x, bl.y, 18, { color: ['#ff9f43', '#ff6b35', '#ffd166', '#5c4a2a'], spd: 140, life: 0.7, size: 3, gravity: 20 });
      this.shake = Math.max(this.shake, 5);
      // 火海
      if (this.evolved.fire) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          this.particles.push({ x: bl.x + Math.cos(a) * bl.r * 0.6, y: bl.y + Math.sin(a) * bl.r * 0.6, vx: 0, vy: -10, life: 1.2, maxLife: 1.2, color: '#ff6b35', size: 3, gravity: -10 });
        }
      }
      this.emit('bomb');
    }

    /* ----------------------------------------------------------------- bears */

    updateBears(dt) {
      const p = this.player;
      const mapW = this.cfg.mapW * T;
      const mapH = this.cfg.mapH * T;

      for (const b of this.bears) {
        if (!b.alive) continue;
        b.flash = Math.max(0, b.flash - dt);
        b.orbitCd = Math.max(0, b.orbitCd - dt);
        b.atkCd = Math.max(0, b.atkCd - dt);
        b.chargeCd = Math.max(0, b.chargeCd - dt);
        if (b.burnT > 0) {
          b.burnT -= dt;
          this.damageBear(b, b.burnDps * dt, { quiet: true });
          if (!b.alive) continue;
        }
        const d = dist(b.x, b.y, p.x, p.y);

        if (b.state === 'patrol') {
          const dd = dist(b.x, b.y, b.wx, b.wy);
          if (dd < 4) {
            b.wx = clamp(b.x + this.rng.range(-90, 90), 20, mapW - 20);
            b.wy = clamp(b.y + this.rng.range(-90, 90), 20, mapH - 20);
          }
          this.moveToward(b, b.wx, b.wy, b.speed * 0.42, dt);
          if (d < b.aggro) b.state = 'chase';
        } else if (b.state === 'chase') {
          if (d > b.aggro * 1.7) {
            b.state = 'patrol';
            b.wx = b.x; b.wy = b.y;
          } else {
            this.moveToward(b, p.x, p.y, b.speed, dt);
            if (d < b.r + p.r + 4 && b.atkCd <= 0) {
              b.atkCd = 1.2;
              this.hurtPlayer(b.dmg, b);
            }
            if (d < 105 && d > 30 && b.chargeCd <= 0) {
              b.state = 'windup';
              b.stateT = 0.55;
              b.chargeDirX = (p.x - b.x) / (d || 1);
              b.chargeDirY = (p.y - b.y) / (d || 1);
              this.emit('chargeWarn');
            }
          }
        } else if (b.state === 'windup') {
          b.stateT -= dt;
          b.chargeDirX = (p.x - b.x) / (dist(b.x, b.y, p.x, p.y) || 1);
          b.chargeDirY = (p.y - b.y) / (dist(b.x, b.y, p.x, p.y) || 1);
          if (b.stateT <= 0) {
            b.state = 'charge';
            b.stateT = 0.42;
            b.chargeId = ++this.chargeSeq;
            this.emit('charge');
          }
        } else if (b.state === 'charge') {
          b.stateT -= dt;
          const spd = b.speed * 3.2;
          b.x += b.chargeDirX * spd * dt;
          b.y += b.chargeDirY * spd * dt;
          this.resolveChargeTrees(b);
          if (dist(b.x, b.y, p.x, p.y) < b.r + p.r + 2) {
            this.hurtPlayer(b.chargeDmg, b);
            b.stateT = Math.min(b.stateT, 0.1);
          }
          if (b.stateT <= 0) {
            b.state = 'chase';
            b.chargeCd = 4.2;
          }
        } else if (b.state === 'stun') {
          b.stateT -= dt;
          if (b.stateT <= 0) b.state = 'chase';
        }

        if (b.state === 'charge') {
          b.dirX = b.chargeDirX;
          b.dirY = b.chargeDirY;
        } else {
          b.dirX = p.x - b.x;
          b.dirY = p.y - b.y;
        }
        b.x = clamp(b.x, 16, mapW - 16);
        b.y = clamp(b.y, 16, mapH - 16);
      }

      this.bears = this.bears.filter((b) => b.alive);
    }

    resolveChargeTrees(b) {
      for (const t of this.trees) {
        if (!t.alive) continue;
        if (t.lastCharge === b.chargeId) continue;
        if (dist(b.x, b.y, t.x, t.y) < b.r + t.r * 0.85) {
          t.lastCharge = b.chargeId;
          if (t.mother || t.stage >= 3) {
            b.state = 'stun';
            b.stateT = 1.8;
            b.chargeCd = 4.5;
            this.addText(b.x, b.y - b.r - 8, '眩晕!', '#ffe066', true);
            this.addParticles(b.x, b.y, 10, { color: ['#ffe066', '#ffffff'], spd: 80, life: 0.6, size: 2, gravity: 0 });
            this.emit('stun');
          } else {
            this.knockTree(t, b);
          }
        }
      }
    }

    knockTree(t, b) {
      if (!t.alive) return;
      t.alive = false;
      this.occ.delete(t.ty * this.cfg.mapW + t.tx);
      this.stats.cleared++;
      this.stats.knocked++;
      this.stumps.push({ x: t.x, y: t.y, stage: t.stage, mother: false });
      if (this.stumps.length > 90) this.stumps.shift();
      this.addParticles(t.x, t.y, 10, { color: ['#3d6f37', '#5c8f45', '#8a6a3a'], spd: 100, life: 0.7, size: 2, gravity: 120 });
      this.addText(t.x, t.y - 10, '撞倒', '#b8c7a0', false);
      this.emit('treefall');
    }

    moveToward(e, tx, ty, spd, dt) {
      const a = angle(e.x, e.y, tx, ty);
      e.x += Math.cos(a) * spd * dt;
      e.y += Math.sin(a) * spd * dt;
    }

    updateNests(dt) {
      for (const n of this.nests) {
        if (!n.alive) continue;
        n.flash = Math.max(0, n.flash - dt);
        n.spawnT -= dt;
        if (n.spawnT <= 0) {
          n.spawnT = 14;
          if (this.aliveBears() < Math.min(3, this.cfg.maxBears)) {
            const type = this.mode === 'endless' && this.elapsed > 120 ? 'black' : 'brown';
            this.spawnBear(type, n.x + this.rng.range(-20, 20), n.y + this.rng.range(10, 26));
            this.emit('roar');
          }
        }
      }
      this.nests = this.nests.filter((n) => n.alive);
    }

    /* ---------------------------------------------------------------- growth */

    updateGrowth(dt) {
      this.growAcc += dt;
      if (this.growAcc < 0.5) return;
      this.growAcc -= 0.5;
      if (this.freezeT > 0) return;

      const trees = this.trees;
      const n = trees.length;
      for (let i = 0; i < n; i++) {
        const t = trees[i];
        if (!t.alive || t.mother) continue;
        t.growT += 0.5;
        const def = CFG.TREE_STAGES[t.stage];
        if (t.stage < 3 && t.growT >= def.grow) {
          if (t.stage === 2 && !this.cfg.giants) {
            t.growT = 0;
            continue;
          }
          const ratio = t.maxHp > 0 ? t.hp / t.maxHp : 1;
          t.stage++;
          t.growT = 0;
          const nd = CFG.TREE_STAGES[t.stage];
          t.r = nd.radius;
          t.maxHp = Math.round(nd.hp * this.hpMul());
          t.hp = Math.max(1, Math.round(t.maxHp * Math.max(0.15, ratio)));
          t.variant = this.rng.int(0, 3);
          this.emit('grow');
        }
      }

      if (this.aliveTrees() >= this.cfg.treeCap) return;

      // 母树繁殖
      for (const t of trees) {
        if (!t.alive || !t.mother) continue;
        t.spawnT -= 0.5;
        if (t.spawnT <= 0) {
          t.spawnT = 5.5;
          this.spawnNear(t, 3.2);
        }
      }

      // 现有树木向周围空地扩散（低概率 + 密集加成 + 总量上限）
      for (const t of trees) {
        if (!t.alive || t.mother || t.stage < 2) continue;
        const p = 0.0016 * (1 + Math.min(1.5, this.densityNear(t) / 12));
        if (this.rng.chance(p)) this.spawnNear(t, 2.2);
        if (this.aliveTrees() >= this.cfg.treeCap) break;
      }
    }

    densityNear(t) {
      let c = 0;
      for (const o of this.trees) {
        if (o.alive && o !== t && dist(o.x, o.y, t.x, t.y) < T * 3) c++;
      }
      return c;
    }

    spawnNear(t, radiusTiles) {
      const s = this.cfg;
      const cx = Math.round((t.x - T / 2) / T);
      const cy = Math.round((t.y - T / 2) / T);
      const rad = Math.ceil(radiusTiles);
      for (let i = 0; i < 12; i++) {
        const tx = cx + this.rng.int(-rad, rad);
        const ty = cy + this.rng.int(-rad, rad);
        if (tx < 1 || ty < 1 || tx > s.mapW - 2 || ty > s.mapH - 2) continue;
        if (this.occ.has(ty * s.mapW + tx)) continue;
        const x = tx * T + T / 2;
        const y = ty * T + T / 2;
        if (dist(x, y, this.player.x, this.player.y) < T * 1.5) continue;
        this.addTree(tx, ty, 0, false);
        return true;
      }
      return false;
    }

    updateEndless(dt) {
      this.bearSpawnT -= dt;
      if (this.bearSpawnT <= 0) {
        this.bearSpawnT = Math.max(8, 24 - this.elapsed / 18);
        if (this.aliveBears() < this.cfg.maxBears) {
          const edge = this.rng.int(0, 3);
          const s = this.cfg;
          let x, y;
          if (edge === 0) { x = this.rng.range(20, s.mapW * T - 20); y = 16; }
          else if (edge === 1) { x = s.mapW * T - 16; y = this.rng.range(20, s.mapH * T - 20); }
          else if (edge === 2) { x = this.rng.range(20, s.mapW * T - 20); y = s.mapH * T - 16; }
          else { x = 16; y = this.rng.range(20, s.mapH * T - 20); }
          this.spawnBear(this.pickBearType(this.elapsed), x, y);
          this.emit('roar');
        }
      }

      this.motherRespawnT -= dt;
      if (this.motherRespawnT <= 0) {
        this.motherRespawnT = 55;
        if (this.aliveMothers() < 3) {
          const t = this.spawnMother(0);
          if (t) this.addText(t.x, t.y - 30, '新的母树!', '#ff8a5c', true);
        }
      }

      if (this.aliveTrees() < 24 && this.rng.chance(dt * 0.9)) {
        this.spawnRandomTree(2);
      }
    }

    /* ------------------------------------------------------------------- xp */

    gainGold(n, x, y) {
      this.gold += n;
      this.stats.gold += n;
      if (x != null) this.addText(x + this.fxRng.range(-5, 5), y - 8, '+' + n, '#f2c14e', false);
      this.emit('coin');
    }

    gainXp(n) {
      this.xp += n;
      this.stats.xp += n;
      let guard = 0;
      while (this.playerLevel < 40 && this.xp >= CFG.XP.toNext(this.playerLevel) && guard++ < 20) {
        this.xp -= CFG.XP.toNext(this.playerLevel);
        this.playerLevel++;
        this.levelFlash = 0.8;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 10);
        this.choiceQueue.push(this.rollChoices());
        this.emit('levelup');
        this.addParticles(this.player.x, this.player.y, 16, { color: ['#f2c14e', '#ffffff', '#8fd15a'], spd: 120, life: 0.8, size: 2, gravity: -30 });
      }
    }

    rollChoices() {
      const pool = Object.keys(this.skills).filter((id) => this.skills[id] < CFG.SKILLS[id].max);
      const picks = this.rng.shuffle(pool).slice(0, 3);
      const out = picks.slice();
      while (out.length < 3) {
        const pseudo = this.rng.chance(0.5) ? 'heal' : 'gold';
        if (!out.includes(pseudo)) out.push(pseudo);
        else out.push(out.includes('heal') ? 'gold' : 'heal');
      }
      return out;
    }

    applySkill(id) {
      if (!this.choiceQueue.length) return false;
      if (id === 'heal') {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
        this.addText(this.player.x, this.player.y - 20, '+35 HP', '#8fd15a', true);
      } else if (id === 'gold') {
        this.gainGold(40, this.player.x, this.player.y);
      } else if (this.skills[id] != null && this.skills[id] < CFG.SKILLS[id].max) {
        this.skills[id]++;
        if (this.skills[id] >= CFG.SKILLS[id].max) {
          this.evolved[id] = true;
          this.emit('evolve');
          this.addText(this.player.x, this.player.y - 26, CFG.SKILLS[id].evo + '!', '#ffd166', true);
        }
      } else {
        return false;
      }
      this.choiceQueue.shift();
      this.emit('pick');
      return true;
    }

    /* ----------------------------------------------------------------- shop */

    buyRunItem(itemId) {
      const item = CFG.RUN_ITEMS.find((i) => i.id === itemId);
      if (!item || this.gold < item.cost) return false;
      this.gold -= item.cost;
      switch (itemId) {
        case 'potion':
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
          break;
        case 'rage':
          this.rageT = 10;
          break;
        case 'bomb': {
          const p = this.player;
          for (const t of this.trees) if (t.alive && dist(p.x, p.y, t.x, t.y) < 90) this.damageTree(t, 150, { source: 'bomb' });
          for (const b of this.bears) if (b.alive && dist(p.x, p.y, b.x, b.y) < 90) this.damageBear(b, 150, {});
          for (const n of this.nests) if (n.alive && dist(p.x, p.y, n.x, n.y) < 90) this.damageNest(n, 150, {});
          this.addParticles(p.x, p.y, 20, { color: ['#ff9f43', '#ff6b35', '#ffd166'], spd: 150, life: 0.6, size: 3, gravity: 40 });
          this.shake = Math.max(this.shake, 6);
          break;
        }
        case 'shield':
          this.player.shield = Math.min(this.shieldCap() || 50, this.player.shield + 50);
          break;
        case 'inhibit':
          this.freezeT = 20;
          this.addText(this.player.x, this.player.y - 20, '生长停止 20s', '#8fd7ff', true);
          break;
      }
      this.emit('buy');
      return true;
    }

    /* ------------------------------------------------------------------ fx */

    addText(x, y, str, color, big) {
      if (this.texts.length > 60) this.texts.shift();
      this.texts.push({ x, y, str: String(str), color: color || '#fff', life: big ? 1.0 : 0.7, maxLife: big ? 1.0 : 0.7, big: !!big, vy: big ? -26 : -34 });
    }

    addParticles(x, y, n, opts) {
      const o = opts || {};
      for (let i = 0; i < n; i++) {
        if (this.particles.length > 240) break;
        const a = this.fxRng.range(0, Math.PI * 2);
        const spd = (o.spd || 80) * this.fxRng.range(0.3, 1);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - (o.gravity ? 40 : 0),
          life: (o.life || 0.6) * this.fxRng.range(0.7, 1.2),
          maxLife: o.life || 0.6,
          color: Array.isArray(o.color) ? this.fxRng.pick(o.color) : (o.color || '#fff'),
          size: o.size || 2,
          gravity: o.gravity || 0,
        });
      }
    }

    updateFx(dt) {
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.gravity || 0) * dt;
        p.vx *= 0.96;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const t of this.texts) {
        t.life -= dt;
        t.y += t.vy * dt;
        t.vy *= 0.92;
      }
      this.texts = this.texts.filter((t) => t.life > 0);
      this.shake = Math.max(0, this.shake - dt * 22);

      for (const t of this.trees) {
        t.shake = Math.max(0, (t.shake || 0) - dt * 2.2);
        t.flash = Math.max(0, (t.flash || 0) - dt);
        t.orbitCd = Math.max(0, (t.orbitCd || 0) - dt);
        if (t.alive && t.burnT > 0) {
          t.burnT -= dt;
          this.damageTree(t, t.burnDps * dt, { source: 'burn', quiet: true });
          if (this.fxRng.chance(0.25)) {
            this.particles.push({ x: t.x + this.fxRng.range(-6, 6), y: t.y - 4, vx: 0, vy: -18, life: 0.4, maxLife: 0.4, color: '#ff6b35', size: 2, gravity: -20 });
          }
        }
      }
      for (const n of this.nests) n.flash = Math.max(0, (n.flash || 0) - dt);
      this.cleanAcc += dt;
      if (this.cleanAcc > 0.5) {
        this.cleanAcc = 0;
        if (this.trees.some((t) => !t.alive)) this.trees = this.trees.filter((t) => t.alive);
      }
    }

    checkWin() {
      if (this.mode !== 'campaign' || this.finished) return;
      if (this.aliveMothers() === 0 && this.aliveTrees() === 0) {
        this.finish(true, 'clear');
      }
    }

    /* -------------------------------------------------------------- results */

    getResult() {
      const base = this.stats.gold;
      const clearBonus = this.mode === 'campaign' && this.win ? 30 + this.level * 10 : 0;
      const score = this.mode === 'endless'
        ? Math.round(this.elapsed * 10 + this.stats.chopped * 5 + this.stats.bears * 30 + this.stats.mothers * 100)
        : Math.round(this.stats.chopped * 5 + this.stats.bears * 20 + this.stats.mothers * 150 + Math.max(0, this.timeLeft) * 2);
      return {
        mode: this.mode,
        level: this.level,
        win: this.mode === 'endless' ? !this.dead : this.win,
        dead: this.dead,
        reason: this.failReason,
        goldEarned: base,
        clearBonus,
        score,
        timeUsed: Math.round(this.elapsed),
        timeLeft: Math.max(0, Math.round(this.timeLeft)),
        chopped: this.stats.chopped,
        knocked: this.stats.knocked,
        bears: this.stats.bears,
        nests: this.stats.nests,
        mothers: this.stats.mothers,
        playerLevel: this.playerLevel,
        xp: this.stats.xp,
      };
    }
  }

  CL.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
