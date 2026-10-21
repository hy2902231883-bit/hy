/*
 * 渲染层：像素风 2D 俯视角，地图预渲染 + 实体按 y 排序 + 粒子/伤害数字
 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});
  const CFG = CL.CFG;
  const T = CFG.TILE;
  const clamp = CL.util.clamp;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.world = null;
      this.ground = null;
      this.time = 0;
      this.rings = [];
      this.knownBlasts = new Set();
      this.fpsSmooth = 60;
    }

    setWorld(world) {
      this.world = world;
      this.buildGround();
      this.rings = [];
      this.knownBlasts = new Set();
    }

    buildGround() {
      const w = this.world;
      const W = w.cfg.mapW * T;
      const H = w.cfg.mapH * T;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;

      g.fillStyle = '#3d7037';
      g.fillRect(0, 0, W, H);

      // 大块草地色差
      for (let i = 0; i < 26; i++) {
        const x = ((i * 197) % W);
        const y = ((i * 331) % H);
        g.fillStyle = i % 2 ? 'rgba(58,105,52,0.35)' : 'rgba(82,135,66,0.25)';
        g.beginPath();
        g.arc(x, y, 30 + (i % 5) * 18, 0, Math.PI * 2);
        g.fill();
      }

      const pal = ['#3f7439', '#427a3c', '#3a6c35', '#457f3e'];
      for (let ty = 0; ty < w.cfg.mapH; ty++) {
        for (let tx = 0; tx < w.cfg.mapW; tx++) {
          const h = hash(tx, ty);
          g.fillStyle = pal[Math.floor(h * pal.length)];
          g.fillRect(tx * T, ty * T, T, T);

          if (h > 0.42) {
            // 草叶
            const n = 1 + Math.floor(hash(tx + 7, ty + 3) * 3);
            for (let i = 0; i < n; i++) {
              const x = tx * T + 3 + Math.floor(hash(tx * 3 + i, ty) * 18);
              const y = ty * T + 5 + Math.floor(hash(tx, ty * 5 + i) * 16);
              g.fillStyle = i % 2 ? '#4e8c44' : '#356331';
              g.fillRect(x, y, 1, 3);
              g.fillRect(x + 1, y + 1, 1, 2);
            }
          }
          if (h > 0.965) {
            const x = tx * T + 8 + Math.floor(hash(tx, ty + 11) * 8);
            const y = ty * T + 8 + Math.floor(hash(tx + 4, ty) * 8);
            g.fillStyle = h > 0.985 ? '#f2d36b' : '#e8e0d0';
            g.fillRect(x, y, 2, 2);
            g.fillStyle = '#2e5a2a';
            g.fillRect(x, y + 2, 2, 1);
          }
          if (h < 0.035) {
            const x = tx * T + 6 + Math.floor(hash(tx + 2, ty + 9) * 10);
            const y = ty * T + 10 + Math.floor(hash(tx + 8, ty + 2) * 8);
            g.fillStyle = '#8a8a80';
            g.fillRect(x, y, 3, 2);
            g.fillStyle = '#6b6b63';
            g.fillRect(x + 1, y + 2, 2, 1);
          }
        }
      }

      // 地图边缘
      g.strokeStyle = '#20381f';
      g.lineWidth = 10;
      g.strokeRect(0, 0, W, H);

      // 灌木与碎石点缀（避开树木一格范围）
      for (let i = 0; i < 64; i++) {
        const bx = (hash(i, 11) * W) | 0;
        const by = (hash(i, 23) * H) | 0;
        let near = false;
        for (const t of w.trees) {
          if (Math.abs(t.x - bx) < 26 && Math.abs(t.y - by) < 24) { near = true; break; }
        }
        if (near) continue;
        if (i % 3 === 0) {
          g.fillStyle = 'rgba(28, 58, 28, 0.55)';
          g.fillRect(bx - 6, by, 12, 6);
          g.fillStyle = '#2f6130';
          g.fillRect(bx - 5, by - 2, 10, 5);
          g.fillStyle = '#4a8a41';
          g.fillRect(bx - 3, by - 3, 6, 3);
          g.fillStyle = '#69a654';
          g.fillRect(bx - 2, by - 3, 3, 1);
        } else if (i % 3 === 1) {
          g.fillStyle = '#7d7d70';
          g.fillRect(bx - 3, by, 6, 4);
          g.fillStyle = '#a3a394';
          g.fillRect(bx - 2, by - 1, 4, 3);
          g.fillStyle = '#56564c';
          g.fillRect(bx - 3, by + 3, 6, 1);
        } else {
          g.fillStyle = '#3a7a3a';
          g.fillRect(bx - 1, by - 3, 2, 4);
          g.fillStyle = '#e8d36b';
          g.fillRect(bx - 2, by - 4, 2, 2);
          g.fillStyle = '#f3e6c8';
          g.fillRect(bx + 1, by - 3, 1, 1);
        }
      }

      this.ground = c;
    }

    camera(w) {
      const p = w.player;
      let x = clamp(p.x - CFG.VIEW_W / 2, 0, Math.max(0, w.cfg.mapW * T - CFG.VIEW_W));
      let y = clamp(p.y - CFG.VIEW_H / 2, 0, Math.max(0, w.cfg.mapH * T - CFG.VIEW_H));
      if (w.shake > 0.1) {
        x += Math.sin(this.time * 91) * w.shake * 0.7;
        y += Math.cos(this.time * 77) * w.shake * 0.7;
      }
      return { x, y };
    }

    draw(world, dt) {
      const w = world || this.world;
      if (!w) return;
      this.time += dt || 0;
      const ctx = this.ctx;
      const cam = this.camera(w);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
      ctx.fillStyle = '#152a1a';
      ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);

      if (this.ground && this.groundKey !== w.cfg.mapW + 'x' + w.cfg.mapH + ':' + w.seed) {
        this.groundKey = w.cfg.mapW + 'x' + w.cfg.mapH + ':' + w.seed;
      }
      if (this.ground) {
        ctx.drawImage(this.ground, Math.round(-cam.x), Math.round(-cam.y));
      }

      // 树桩
      for (const s of w.stumps) {
        const sx = s.x - cam.x;
        const sy = s.y - cam.y;
        if (sx < -30 || sy < -30 || sx > CFG.VIEW_W + 30 || sy > CFG.VIEW_H + 30) continue;
        const img = CL.Sprites.stumpSprite();
        ctx.globalAlpha = s.mother ? 1 : 0.9;
        ctx.drawImage(img, Math.round(sx - 8), Math.round(sy - 6));
        ctx.globalAlpha = 1;
      }

      // 实体按 y 排序
      const list = [];
      for (const t of w.trees) if (t.alive) list.push({ y: t.y, t });
      for (const b of w.bears) if (b.alive) list.push({ y: b.y, b });
      for (const n of w.nests) if (n.alive) list.push({ y: n.y, n });
      list.push({ y: w.player.y, p: true });
      list.sort((a, b) => a.y - b.y);

      for (const item of list) {
        const sx = (item.t ? item.t.x : item.b ? item.b.x : item.n ? item.n.x : w.player.x) - cam.x;
        const sy = (item.t ? item.t.y : item.b ? item.b.y : item.n ? item.n.y : w.player.y) - cam.y;
        if (item.t) {
          if (sx < -60 || sy < -90 || sx > CFG.VIEW_W + 60 || sy > CFG.VIEW_H + 40) continue;
          this.drawTree(item.t, sx, sy);
        } else if (item.b) {
          if (sx < -50 || sy < -50 || sx > CFG.VIEW_W + 50 || sy > CFG.VIEW_H + 50) continue;
          this.drawBear(item.b, sx, sy);
        } else if (item.n) {
          if (sx < -50 || sy < -50 || sx > CFG.VIEW_W + 50 || sy > CFG.VIEW_H + 50) continue;
          this.drawNest(item.n, sx, sy);
        } else {
          this.drawPlayer(w, sx, sy);
        }
      }

      this.drawBlasts(w, cam);
      this.drawParticles(w, cam);
      this.drawTexts(w, cam);
      this.drawEdgeMarkers(w, cam);

      // 轻微暗角
      const grd = ctx.createRadialGradient(180, 320, 180, 180, 320, 380);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(4,14,8,0.42)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    }

    /* --------------------------------------------------------------- trees */

    drawTree(t, sx, sy) {
      const ctx = this.ctx;
      const img = CL.Sprites.treeSprite(t.stage, t.variant, t.mother);
      const wob = t.shake > 0 ? Math.sin(this.time * 70 + t.id) * t.shake * 9 : 0;
      const sway = Math.sin(this.time * 1.4 + t.id * 0.7) * (t.mother ? 1.6 : 0.8);
      const x = Math.round(sx + wob + sway - img.width / 2);
      const y = Math.round(sy + (t.mother ? 10 : 6) - img.height);

      // 影子
      ctx.fillStyle = 'rgba(8,22,12,0.26)';
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(sy + 4), img.width * 0.36, img.width * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      if (t.mother) {
        const pulse = 0.35 + Math.sin(this.time * 2.4 + t.id) * 0.12;
        const g = ctx.createRadialGradient(sx, sy - 20, 6, sx, sy - 20, 64);
        g.addColorStop(0, 'rgba(200,74,74,' + (0.28 * pulse + 0.12) + ')');
        g.addColorStop(1, 'rgba(200,74,74,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 64, sy - 84, 128, 128);
        ctx.strokeStyle = 'rgba(224,82,82,' + (0.3 + pulse * 0.25) + ')';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.ellipse(sx, sy + 3, 25, 9, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.drawImage(img, x, y);

      if (t.flash > 0) {
        const white = CL.Sprites.tint(img, '#ffffff');
        ctx.globalAlpha = Math.min(0.7, t.flash * 5);
        ctx.drawImage(white, x, y);
        ctx.globalAlpha = 1;
      }

      if (t.mother) {
        this.bar(sx - 22, y - 9, 44, t.hp / t.maxHp, '#e05252', '#2a1010');
        ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#ffd9c8';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText('母树', sx, y - 13);
        ctx.fillText('母树', sx, y - 13);
        ctx.textAlign = 'left';
      } else if (t.hp < t.maxHp) {
        this.bar(sx - 14, y - 5, 28, t.hp / t.maxHp, '#8fd15a', '#1d2a14');
      }
    }

    /* ---------------------------------------------------------------- bear */

    drawBear(b, sx, sy) {
      const ctx = this.ctx;
      const base = CL.Sprites.bearSprite(b.type);
      const scale = b.type === 'king' ? 1.9 : b.type === 'giant' ? 1.45 : 1;
      const img = base;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const x = Math.round(sx - w / 2);
      const y = Math.round(sy + 6 - h);

      ctx.fillStyle = 'rgba(8,22,12,0.28)';
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(sy + 4), w * 0.42, w * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      if (b.state === 'charge') {
        ctx.globalAlpha = 0.22;
        for (let i = 1; i <= 3; i++) {
          ctx.drawImage(img, Math.round(x - b.dirX * i * 9), Math.round(y - b.dirY * i * 9), w, h);
        }
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(Math.round(sx), Math.round(sy));
      if (b.dirX < -0.05) ctx.scale(-1, 1);
      ctx.drawImage(img, Math.round(-w / 2), Math.round(6 - h), w, h);
      ctx.restore();

      if (b.flash > 0) {
        const white = CL.Sprites.tint(base, '#ffffff');
        ctx.globalAlpha = Math.min(0.75, b.flash * 5);
        ctx.save();
        ctx.translate(Math.round(sx), Math.round(sy));
        if (b.dirX < -0.05) ctx.scale(-1, 1);
        ctx.drawImage(white, Math.round(-w / 2), Math.round(6 - h), w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      if (b.state === 'windup') {
        const a = Math.atan2(b.chargeDirY, b.chargeDirX);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(224,82,82,0.16)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(120, -16);
        ctx.lineTo(120, 16);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,140,120,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(120, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillStyle = '#ff6b4a';
        ctx.textAlign = 'center';
        ctx.fillText('!', sx, y - 8);
        ctx.textAlign = 'left';
      }

      if (b.state === 'stun') {
        for (let i = 0; i < 3; i++) {
          const a = this.time * 6 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = '#ffe066';
          ctx.fillRect(Math.round(sx + Math.cos(a) * 10 * scale), Math.round(y + Math.sin(a) * 3 - 2), 2, 2);
        }
      }

      const hurt = b.hp < b.maxHp || b.state !== 'patrol';
      if (hurt && b.hp > 0) {
        this.bar(sx - 14 * scale, y - 7, 28 * scale, b.hp / b.maxHp, '#e0703c', '#2a1010');
      }
    }

    drawNest(n, sx, sy) {
      const ctx = this.ctx;
      const base = CL.Sprites.nestSprite();
      const w = base.width * 1.7;
      const h = base.height * 1.7;
      const x = Math.round(sx - w / 2);
      const y = Math.round(sy + 4 - h);
      ctx.fillStyle = 'rgba(8,22,12,0.28)';
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(sy + 3), w * 0.44, w * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      if (n.spawnT < 3) {
        const a = 0.15 + Math.sin(this.time * 8) * 0.1;
        ctx.fillStyle = 'rgba(230,120,60,' + a + ')';
        ctx.beginPath();
        ctx.arc(sx, sy - h * 0.4, w * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.drawImage(base, x, y, w, h);
      if (n.flash > 0) {
        const white = CL.Sprites.tint(base, '#ffffff');
        ctx.globalAlpha = Math.min(0.7, n.flash * 5);
        ctx.drawImage(white, x, y, w, h);
        ctx.globalAlpha = 1;
      }
      if (n.hp < n.maxHp) this.bar(sx - 16, y - 6, 32, n.hp / n.maxHp, '#c9a227', '#241a0d');
    }

    /* -------------------------------------------------------------- player */

    drawPlayer(w, sx, sy) {
      const ctx = this.ctx;
      const p = w.player;
      const moving = p.moving;
      const frame = moving ? (Math.floor(this.time * 8) % 2 === 0 ? 1 : 2) : 0;
      const img = CL.Sprites.playerSprite(frame);
      const bob = moving ? Math.abs(Math.sin(this.time * 12)) * 1.6 : Math.sin(this.time * 3) * 0.6;
      const x = Math.round(sx - 8);
      const y = Math.round(sy - 8 + bob);

      ctx.fillStyle = 'rgba(8,22,12,0.3)';
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(sy + 7), 8, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 护盾
      if (p.shield > 0) {
        const a = 0.18 + Math.sin(this.time * 4) * 0.05;
        ctx.strokeStyle = 'rgba(110,200,255,' + (a + 0.35) + ')';
        ctx.fillStyle = 'rgba(110,200,255,' + a + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy - 2, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.globalAlpha = p.invuln > 0 && Math.floor(this.time * 18) % 2 === 0 ? 0.45 : 1;
      if (p.faceX < -0.05) {
        ctx.save();
        ctx.translate(Math.round(sx) + 8, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y);
      }
      ctx.globalAlpha = 1;

      if (p.hurtFlash > 0) {
        const white = CL.Sprites.tint(img, '#ff6b5a');
        ctx.globalAlpha = Math.min(0.8, p.hurtFlash * 2.4);
        ctx.drawImage(white, x, y);
        ctx.globalAlpha = 1;
      }

      // 挥砍
      if (w.swingT > 0) {
        const k = 1 - w.swingT / 0.2;
        const ang = w.swingDir - 0.9 + k * 1.9;
        ctx.save();
        ctx.translate(sx, sy - 2);
        ctx.rotate(ang);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.65 * (1 - k)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 15, -0.9, 0.5);
        ctx.stroke();
        const axe = CL.Sprites.axeSprite();
        ctx.translate(13, -2);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(axe, -3, -5);
        ctx.restore();
      }

      // 旋风斩
      if (w.whirlT > 0) {
        const k = 1 - w.whirlT / 0.4;
        const r = 12 + k * 56;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - k)) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy - 2, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(242,193,78,' + (0.35 * (1 - k)) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy - 2, r - 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 环绕飞斧
      if (w.skills.orbit > 0) {
        const axes = 1 + (w.skills.orbit >= 3 ? 1 : 0) + (w.evolved.orbit ? 1 : 0);
        const radius = 44 + (w.evolved.orbit ? 12 : 0);
        for (let i = 0; i < axes; i++) {
          const a = w.orbitAngle + (Math.PI * 2 * i) / axes;
          const ax = sx + Math.cos(a) * radius;
          const ay = sy + Math.sin(a) * radius * 0.82 - 2;
          if (w.evolved.orbit) {
            ctx.fillStyle = 'rgba(255,230,120,0.25)';
            ctx.beginPath();
            ctx.arc(ax, ay, 7, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(a + Math.PI / 2);
          ctx.drawImage(CL.Sprites.axeSprite(), -4, -5);
          ctx.restore();
        }
      }
    }

    /* ----------------------------------------------------------------- fx */

    drawBlasts(w, cam) {
      const ctx = this.ctx;
      const current = new Set(w.blasts);
      for (const old of this.knownBlasts) {
        if (!current.has(old)) this.rings.push({ x: old.x, y: old.y, r: old.r, t: 0, color: old.kind === 'fire' ? '255,150,60' : '255,220,120' });
      }
      this.knownBlasts = current;
      for (const b of w.blasts) {
        const k = Math.min(1, b.t / b.delay);
        const sx = b.x - cam.x;
        const sy = b.y - cam.y;
        ctx.fillStyle = 'rgba(255,120,50,' + (0.12 + k * 0.15) + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,180,80,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(sx, sy, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const r of this.rings) {
        r.t += 1 / 60;
        const k = Math.min(1, r.t / 0.35);
        ctx.strokeStyle = 'rgba(' + r.color + ',' + (0.8 * (1 - k)) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(r.x - cam.x, r.y - cam.y, r.r * (0.6 + k * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      }
      this.rings = this.rings.filter((r) => r.t < 0.36);
    }

    drawParticles(w, cam) {
      const ctx = this.ctx;
      for (const p of w.particles) {
        const a = Math.max(0, Math.min(1, p.life / Math.max(0.001, p.maxLife)));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    drawTexts(w, cam) {
      const ctx = this.ctx;
      ctx.textAlign = 'center';
      for (const t of w.texts) {
        const a = Math.max(0, Math.min(1, t.life / t.maxLife));
        ctx.globalAlpha = a;
        ctx.font = t.big ? 'bold 12px "Microsoft YaHei", "Courier New", monospace' : 'bold 9px "Courier New", monospace';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(t.str, t.x - cam.x, t.y - cam.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, t.x - cam.x, t.y - cam.y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    drawEdgeMarkers(w, cam) {
      const ctx = this.ctx;
      for (const t of w.trees) {
        if (!t.alive || !t.mother) continue;
        const sx = t.x - cam.x;
        const sy = t.y - cam.y;
        if (sx > 12 && sx < CFG.VIEW_W - 12 && sy > 90 && sy < CFG.VIEW_H - 90) continue;
        const cx = CFG.VIEW_W / 2;
        const cy = CFG.VIEW_H / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const rx = Math.min(cx - 18, Math.abs(Math.cos(a)) > 0.001 ? (cx - 18) / Math.abs(Math.cos(a)) : 999);
        const ry = Math.min(cy - 100, Math.abs(Math.sin(a)) > 0.001 ? (cy - 100) / Math.abs(Math.sin(a)) : 999);
        const r = Math.min(rx, ry);
        const ex = cx + Math.cos(a) * r;
        const ey = cy + Math.sin(a) * r;
        const pulse = 0.6 + Math.sin(this.time * 5) * 0.25;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(224,82,82,' + pulse + ')';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    bar(x, y, w, pct, color, back) {
      const ctx = this.ctx;
      pct = Math.max(0, Math.min(1, pct));
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, 5);
      ctx.fillStyle = back;
      ctx.fillRect(Math.round(x), Math.round(y), w, 3);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w * pct), 3);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w * pct), 1);
    }

    drawMinimap(w, mini) {
      const g = mini.getContext('2d');
      const W = mini.width;
      const H = mini.height;
      const mapW = w.cfg.mapW * T;
      const mapH = w.cfg.mapH * T;
      const s = Math.min(W / mapW, H / mapH);
      const ox = (W - mapW * s) / 2;
      const oy = (H - mapH * s) / 2;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(10,24,15,0.82)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(58,105,52,0.35)';
      g.fillRect(ox, oy, mapW * s, mapH * s);
      g.strokeStyle = 'rgba(242,193,78,0.45)';
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, W - 1, H - 1);

      for (const t of w.trees) {
        if (!t.alive) continue;
        if (t.mother) continue;
        g.fillStyle = t.stage >= 2 ? '#6fae55' : '#4d8442';
        g.fillRect(ox + t.x * s - 0.5, oy + t.y * s - 0.5, 1.6, 1.6);
      }
      for (const t of w.trees) {
        if (!t.alive || !t.mother) continue;
        const pulse = 2.6 + Math.sin(this.time * 4) * 0.7;
        g.fillStyle = '#ff5a4a';
        g.beginPath();
        g.arc(ox + t.x * s, oy + t.y * s, pulse, 0, Math.PI * 2);
        g.fill();
      }
      for (const b of w.bears) {
        if (!b.alive) continue;
        g.fillStyle = '#ff9f43';
        g.fillRect(ox + b.x * s - 1.5, oy + b.y * s - 1.5, 3, 3);
      }
      for (const n of w.nests) {
        if (!n.alive) continue;
        g.fillStyle = '#c084fc';
        g.fillRect(ox + n.x * s - 1.5, oy + n.y * s - 1.5, 3, 3);
      }
      const p = w.player;
      g.fillStyle = '#ffffff';
      g.fillRect(ox + p.x * s - 1.5, oy + p.y * s - 1.5, 3, 3);

      const camX = clamp(p.x - CFG.VIEW_W / 2, 0, Math.max(0, mapW - CFG.VIEW_W));
      const camY = clamp(p.y - CFG.VIEW_H / 2, 0, Math.max(0, mapH - CFG.VIEW_H));
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 1;
      g.strokeRect(ox + camX * s + 0.5, oy + camY * s + 0.5, CFG.VIEW_W * s - 1, CFG.VIEW_H * s - 1);
    }
  }

  function hash(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  CL.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
