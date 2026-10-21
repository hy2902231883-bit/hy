/* 存档：localStorage，带默认值与版本合并 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});
  const KEY = 'crazy-lumberjack-save-v1';

  const DEFAULTS = {
    version: 1,
    gold: 0,
    weapon: 'axe_old',
    weaponUpgrade: 0,
    armor: 'none',
    boots: 'none',
    aux: { orbit: false, robot: false, core: false },
    ownedWeapons: ['axe_old'],
    ownedArmors: ['none'],
    ownedBoots: ['none'],
    maxLevel: 1,
    cleared: {},
    failStreak: {},
    endlessBest: 0,
    dailyDate: '',
    sound: true,
    runs: 0,
    wins: 0,
  };

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function load() {
    const def = clone(DEFAULTS);
    try {
      const raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return def;
      const data = JSON.parse(raw);
      const meta = Object.assign(def, data);
      meta.aux = Object.assign({ orbit: false, robot: false, core: false }, data.aux || {});
      if (!Array.isArray(meta.ownedWeapons) || !meta.ownedWeapons.length) meta.ownedWeapons = ['axe_old'];
      if (!Array.isArray(meta.ownedArmors) || !meta.ownedArmors.length) meta.ownedArmors = ['none'];
      if (!Array.isArray(meta.ownedBoots) || !meta.ownedBoots.length) meta.ownedBoots = ['none'];
      meta.gold = Math.max(0, meta.gold | 0);
      meta.weaponUpgrade = Math.max(0, Math.min(10, meta.weaponUpgrade | 0));
      meta.maxLevel = Math.max(1, Math.min(30, meta.maxLevel | 0));
      if (!meta.cleared || typeof meta.cleared !== 'object') meta.cleared = {};
      if (!meta.failStreak || typeof meta.failStreak !== 'object') meta.failStreak = {};
      return meta;
    } catch (e) {
      return def;
    }
  }

  function save(meta) {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(meta));
    } catch (e) {
      /* 隐私模式 / file:// 限制时静默失败，游戏内存档仍然有效 */
    }
  }

  function reset() {
    try {
      if (global.localStorage) global.localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
    return clone(DEFAULTS);
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  CL.Save = { load, save, reset, DEFAULTS, todayKey };
})(typeof window !== 'undefined' ? window : globalThis);
