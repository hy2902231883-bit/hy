/*
 * 疯狂伐木工 — 数值与内容配置
 * 所有可在试玩中调整的参数集中在这里（对应 GDD 第 13 节“待验证问题”）。
 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});

  const TILE = 24;
  const VIEW_W = 360;
  const VIEW_H = 640;

  /** 树木四阶段（GDD 第 4 节表格） */
  const TREE_STAGES = [
    { id: 'sapling', name: '树苗', hp: 10, gold: 1, xp: 1, radius: 7, grow: 35 },
    { id: 'small', name: '小树', hp: 30, gold: 3, xp: 2, radius: 9, grow: 42 },
    { id: 'big', name: '大树', hp: 100, gold: 10, xp: 5, radius: 11, grow: 50 },
    { id: 'giant', name: '巨树', hp: 300, gold: 30, xp: 15, radius: 13, grow: 60 },
  ];

  /** 母树（GDD: 生命较高、加速繁殖、小地图标记） */
  const MOTHER = { name: '母树', hp: 1000, gold: 100, xp: 50, radius: 17 };

  const PLAYER = {
    hp: 100,
    speed: 3,           // 单位/秒，1 单位 = 1 格
    attack: 12,
    interval: 0.8,      // 秒
    range: 1.6,          // 单位
    crit: 0.05,
    critMul: 1.5,
    invuln: 1,           // 受伤无敌（秒）
    regenDelay: 5,
    regen: 1.5,          // 每秒（脱战回复，试玩调参）
  };

  const WEAPONS = [
    { id: 'axe_old', name: '破旧斧头', dmg: 12, interval: 0.8, cost: 0, tier: 0 },
    { id: 'axe_iron', name: '铁斧', dmg: 16, interval: 0.75, cost: 300, tier: 1 },
    { id: 'axe_steel', name: '钢斧', dmg: 22, interval: 0.7, cost: 900, tier: 2 },
    { id: 'chainsaw', name: '电锯', dmg: 30, interval: 0.62, cost: 2000, tier: 3 },
    { id: 'chainsaw_gold', name: '黄金电锯', dmg: 38, interval: 0.58, cost: 4500, tier: 4 },
    { id: 'axe_legend', name: '传奇伐木斧', dmg: 50, interval: 0.52, cost: 9000, tier: 5 },
  ];

  const ARMORS = [
    { id: 'none', name: '布衣', hp: 0, dr: 0, cost: 0 },
    { id: 'leather', name: '皮甲', hp: 20, dr: 0.04, cost: 250 },
    { id: 'chain', name: '锁甲', hp: 40, dr: 0.08, cost: 800 },
    { id: 'plate', name: '板甲', hp: 70, dr: 0.12, cost: 2000 },
  ];

  const BOOTS = [
    { id: 'none', name: '草鞋', spd: 0, cost: 0 },
    { id: 'wind', name: '疾风靴', spd: 0.08, cost: 400 },
    { id: 'gale', name: '追风靴', spd: 0.16, cost: 1200 },
  ];

  const AUX = [
    { id: 'orbit', name: '旋转飞斧', cost: 800, desc: '开局自带 1 级旋转飞斧' },
    { id: 'robot', name: '伐木机器人', cost: 1200, desc: '每 2.6 秒自动砍最近的树' },
    { id: 'core', name: '护盾核心', cost: 1000, desc: '开局获得 25 点护盾' },
  ];

  const BEARS = {
    brown: { id: 'brown', name: '棕熊', hp: 160, dmg: 8, charge: 16, speed: 36, aggro: 105, radius: 11, gold: 8, xp: 8 },
    black: { id: 'black', name: '黑熊', hp: 130, dmg: 7, charge: 14, speed: 46, aggro: 120, radius: 10, gold: 10, xp: 9 },
    giant: { id: 'giant', name: '巨型熊', hp: 650, dmg: 18, charge: 35, speed: 28, aggro: 105, radius: 16, gold: 30, xp: 30 },
    king: { id: 'king', name: '熊王', hp: 2400, dmg: 25, charge: 50, speed: 34, aggro: 140, radius: 22, gold: 100, xp: 100 },
  };

  const SKILLS = {
    orbit: {
      id: 'orbit', name: '旋转飞斧', evo: '雷霆飞斧', icon: '🪓', max: 5,
      desc: '飞斧环绕身体，持续切割靠近的树木和熊。',
      evoDesc: '飞斧 +1，环绕范围扩大，命中时有小概率落雷。',
    },
    power: {
      id: 'power', name: '强力挥砍', evo: '伐木风暴', icon: '💥', max: 5,
      desc: '每次挥砍伤害提升，3 级后可以同时砍倒多棵树。',
      evoDesc: '挥砍目标 +2，攻击速度提升。',
    },
    fire: {
      id: 'fire', name: '燃烧弹', evo: '烈焰森林', icon: '🔥', max: 5,
      desc: '定期向附近目标投掷燃烧弹，造成范围伤害。',
      evoDesc: '爆炸范围扩大，并留下持续灼烧的火海。',
    },
    shield: {
      id: 'shield', name: '护盾', evo: '钢铁壁垒', icon: '🛡️', max: 5,
      desc: '获得可再生的护盾值，优先吸收伤害。',
      evoDesc: '护盾更厚，受伤时对周围敌人反伤。',
    },
    berserk: {
      id: 'berserk', name: '狂暴', evo: '极限狂暴', icon: '💢', max: 5,
      desc: '提升攻速和移速，击杀后短暂叠加狂暴。',
      evoDesc: '常驻大幅攻速加成，狂暴上限提高。',
    },
  };

  const RUN_ITEMS = [
    { id: 'potion', name: '生命药水', cost: 30, icon: '🧪', desc: '立刻回复 40 点生命' },
    { id: 'rage', name: '狂暴药剂', cost: 40, icon: '🍶', desc: '10 秒内攻速 +50%' },
    { id: 'bomb', name: '炸弹', cost: 50, icon: '💣', desc: '对身边 90 像素内目标造成 150 伤害' },
    { id: 'shield', name: '临时护盾', cost: 40, icon: '🔷', desc: '获得 50 点护盾' },
    { id: 'inhibit', name: '生长抑制剂', cost: 60, icon: '❄️', desc: '20 秒内树木停止生长和繁殖' },
  ];

  const XP = {
    toNext(level) {
      return Math.floor(6 + 4.2 * Math.pow(level, 1.18));
    },
  };

  /** 关卡配置：地图随关卡扩大，熊/熊窝逐级加入 */
  function levelConfig(level) {
    const lv = Math.max(1, Math.min(30, level | 0));
    const mapW = 18 + Math.min(8, Math.floor((lv - 1) / 3));
    const mapH = 28 + Math.min(14, Math.floor((lv - 1) / 2));
    const mothers = lv >= 11 ? 3 : lv >= 5 ? 2 : 1;
    const trees = Math.min(60, 12 + lv * 2);
    const bears = lv <= 2 ? 0 : lv <= 5 ? 1 : lv <= 9 ? 2 : 3;
    const nests = lv >= 12 ? 3 : lv >= 8 ? 2 : lv >= 5 ? 1 : 0;
    const time = 170 + Math.min(90, (lv - 1) * 6);
    const giants = lv >= 6;
    const elite = lv >= 10;
    const king = lv >= 16;
    return {
      level: lv, mapW, mapH, mothers, trees, bears, nests, time,
      giants, elite, king,
      bearTypes: king ? ['brown', 'black', 'giant', 'king'] : ['brown', 'black', 'giant'],
      treeCap: 46 + lv * 2,
      maxBears: 5 + Math.min(3, Math.floor(lv / 8)),
    };
  }

  function endlessConfig() {
    return {
      level: 1, mode: 'endless', mapW: 26, mapH: 40, mothers: 2, trees: 46,
      bears: 1, nests: 2, time: 0, giants: true, elite: true, king: false,
      bearTypes: ['brown', 'black', 'giant'], treeCap: 110, maxBears: 10,
    };
  }

  const COLORS = {
    grass: ['#3d6f37', '#41753a', '#396a34'],
    dirt: '#6b5136',
    gold: '#f2c14e',
  };

  CL.CFG = {
    TILE, VIEW_W, VIEW_H,
    TREE_STAGES, MOTHER, PLAYER, WEAPONS, ARMORS, BOOTS, AUX, BEARS, SKILLS,
    RUN_ITEMS, XP, levelConfig, endlessConfig, COLORS,
    // 首轮试玩后下调：1000 * 0.6 = 600，保证 3~5 分钟一局
    MOTHER_HP_SCALE: 0.6,
  };
})(typeof window !== 'undefined' ? window : globalThis);
