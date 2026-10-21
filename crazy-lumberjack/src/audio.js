/* 极简合成音效（无音频素材） */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});

  const Audio = {
    ctx: null,
    master: null,
    enabled: true,
    last: {},

    init() {
      if (this.ctx) return;
      try {
        const C = global.AudioContext || global.webkitAudioContext;
        if (!C) return;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    },

    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setEnabled(v) {
      this.enabled = !!v;
    },

    tone(freq, dur, type, gain, slideTo) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    },

    noise(dur, gain, freq) {
      if (!this.ctx || !this.enabled) return;
      const t0 = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq || 900;
      bp.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.value = gain || 0.3;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.master);
      src.start(t0);
    },

    play(name) {
      if (!this.enabled) return;
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      const now = performance.now();
      if (this.last[name] && now - this.last[name] < 45) return;
      this.last[name] = now;
      switch (name) {
        case 'chop':
          this.noise(0.07, 0.22, 700);
          this.tone(150, 0.08, 'square', 0.12, 90);
          break;
        case 'crit':
          this.noise(0.09, 0.26, 500);
          this.tone(220, 0.1, 'square', 0.14, 120);
          break;
        case 'hurt':
          this.tone(220, 0.18, 'sawtooth', 0.22, 90);
          this.noise(0.1, 0.18, 300);
          break;
        case 'coin':
          this.tone(880, 0.07, 'square', 0.1);
          this.tone(1320, 0.08, 'square', 0.08);
          break;
        case 'levelup':
          [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.12), i * 70));
          break;
        case 'evolve':
          [784, 988, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.14), i * 80));
          break;
        case 'buy':
          this.tone(660, 0.06, 'square', 0.1);
          this.tone(880, 0.08, 'square', 0.09);
          break;
        case 'whirl':
          this.noise(0.22, 0.2, 1400);
          this.tone(300, 0.2, 'sawtooth', 0.08, 600);
          break;
        case 'bomb':
          this.noise(0.35, 0.4, 220);
          this.tone(90, 0.3, 'sawtooth', 0.25, 40);
          break;
        case 'charge':
          this.tone(120, 0.3, 'sawtooth', 0.16, 60);
          this.noise(0.2, 0.14, 400);
          break;
        case 'chargeWarn':
          this.tone(180, 0.12, 'square', 0.08, 240);
          break;
        case 'roar':
          this.tone(110, 0.25, 'sawtooth', 0.14, 70);
          break;
        case 'stun':
          this.tone(700, 0.1, 'triangle', 0.1, 300);
          break;
        case 'treefall':
          this.noise(0.25, 0.22, 300);
          break;
        case 'motherDown':
          this.noise(0.5, 0.35, 180);
          this.tone(70, 0.5, 'sawtooth', 0.2, 35);
          break;
        case 'win':
          [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.14), i * 90));
          break;
        case 'lose':
          [440, 392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'triangle', 0.14), i * 130));
          break;
        case 'click':
          this.tone(520, 0.05, 'square', 0.08);
          break;
        case 'ad':
          this.tone(440, 0.1, 'square', 0.06);
          break;
      }
    },
  };

  CL.Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
