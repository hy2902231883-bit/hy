/* 确定性随机数（mulberry32），便于复现与自动化测试 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});

  class RNG {
    constructor(seed) {
      this.s = (seed >>> 0) || 0x9e3779b9;
      this.spare = null;
    }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  const angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

  CL.RNG = RNG;
  CL.util = { clamp, dist, dist2, angle };
})(typeof window !== 'undefined' ? window : globalThis);
