/*
 * 像素素材：全部用代码生成，不依赖外部图片（离线可跑，也方便以后替换成美术资源）
 */
(function (global) {
  'use strict';
  const CL = (global.CL = global.CL || {});

  const cache = new Map();

  function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1442695040;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /** 用字符画生成精灵；palette: { 字符: 颜色 } */
  function fromRows(rows, palette, scale = 1) {
    const w = rows[0].length;
    const h = rows.length;
    const c = canvas(w * scale, h * scale);
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        const col = palette[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  function roundedGlow(c, color) {
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  function tint(src, color) {
    const key = 'tint:' + color + ':' + src._id;
    if (cache.has(key)) return cache.get(key);
    const c = canvas(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    cache.set(key, c);
    return c;
  }

  let idCounter = 1;
  function tag(c) {
    c._id = idCounter++;
    return c;
  }

  /* --------------------------------------------------------------- player */

  const PLAYER_PALETTE = {
    H: '#7a4a22',
    h: '#9c6531',
    S: '#f2c79a',
    E: '#2b1b10',
    B: '#5c3a1e',
    R: '#c0392b',
    r: '#a52f24',
    W: '#f0e6d2',
    P: '#3b5875',
    K: '#2a1f16',
    A: '#c8d0d8',
    a: '#8a939c',
  };

  const PLAYER_ROWS = [
    '................',
    '......HHHH......',
    '.....HhHHhH.....',
    '....HHHHHHHH....',
    '....HSSSSSSH....',
    '....SSSSSSSS....',
    '....SESSSSES....',
    '....SSSSSSSS....',
    '.....BBBBBB.....',
    '....RRRRRRRR....',
    '...RRRWRRWRRR...',
    '...RrRWRRWRrR...',
    '....RRRRRRRR....',
    '....PPPPPPPP....',
    '....PPP..PPP....',
    '....KKK..KKK....',
  ];

  const PLAYER_WALK_A = [
    '................',
    '......HHHH......',
    '.....HhHHhH.....',
    '....HHHHHHHH....',
    '....HSSSSSSH....',
    '....SSSSSSSS....',
    '....SESSSSES....',
    '....SSSSSSSS....',
    '.....BBBBBB.....',
    '....RRRRRRRR....',
    '...RRRWRRWRRR...',
    '...RrRWRRWRrR...',
    '....RRRRRRRR....',
    '....PPPPPPPP....',
    '...PPP....PPP...',
    '...KKK....KKK...',
  ];

  const PLAYER_WALK_B = [
    '................',
    '......HHHH......',
    '.....HhHHhH.....',
    '....HHHHHHHH....',
    '....HSSSSSSH....',
    '....SSSSSSSS....',
    '....SESSSSES....',
    '....SSSSSSSS....',
    '.....BBBBBB.....',
    '....RRRRRRRR....',
    '...RRRWRRWRRR...',
    '...RrRWRRWRrR...',
    '....RRRRRRRR....',
    '....PPPPPPPP....',
    '....PPP..PPP....',
    '....KKK..KKK....',
  ];

  function playerSprite(frame) {
    const key = 'player' + frame;
    if (cache.has(key)) return cache.get(key);
    const rows = frame === 1 ? PLAYER_WALK_A : frame === 2 ? PLAYER_WALK_B : PLAYER_ROWS;
    const c = tag(fromRows(rows, PLAYER_PALETTE));
    cache.set(key, c);
    return c;
  }

  /* ----------------------------------------------------------------- bear */

  const BEAR_ROWS = [
    '................',
    '...FF......FF...',
    '..FFFF....FFFF..',
    '..FFFFFFFFFFFF..',
    '.FFFFFFFFFFFFFF.',
    '.FFFFFFFFFFFDFF.',
    '.FFFFFDFFFFFFFF.',
    '.FFFFNNNNFFFFFF.',
    '.FFFNNNNNNFFFFF.',
    '.FFFFFFFFFFFFFF.',
    '..FFFFFFFFFFFF..',
    '..FF.FFFFFF.FF..',
    '..FF..FFFF..FF..',
    '..FF..F..F..FF..',
  ];

  const BEAR_PALETTES = {
    brown: { F: '#7a5230', D: '#3a2415', N: '#2a1a0f' },
    black: { F: '#3b3430', D: '#1c1917', N: '#0f0d0c' },
    giant: { F: '#8a5a34', D: '#4a2c18', N: '#2a1a0f' },
    king: { F: '#c9a227', D: '#7a5a12', N: '#3a2a08' },
  };

  function bearSprite(type) {
    const key = 'bear:' + type;
    if (cache.has(key)) return cache.get(key);
    const c = tag(fromRows(BEAR_ROWS, BEAR_PALETTES[type] || BEAR_PALETTES.brown));
    cache.set(key, c);
    return c;
  }

  /* ----------------------------------------------------------------- nest */

  const NEST_ROWS = [
    '................',
    '.....BBBBBB.....',
    '...BBBBBBBBBB...',
    '..BBBB.DD.BBBB..',
    '..BBB.DDDD.BBB..',
    '.BBBB.DDDD.BBBB.',
    '.BBBBBBBBBBBBBB.',
    '.BBB.BBBBBB.BBB.',
    '..BBBBBBBBBBBB..',
    '...BBBBBBBBBB...',
  ];

  const NEST_PALETTE = { B: '#6b4a2c', D: '#241811' };

  function nestSprite() {
    if (cache.has('nest')) return cache.get('nest');
    const c = tag(fromRows(NEST_ROWS, NEST_PALETTE));
    cache.set('nest', c);
    return c;
  }

  /* ----------------------------------------------------------------- tree */

  const TREE_SPEC = [
    { w: 26, h: 34, trunk: 3, trunkH: 9, pal: ['#1d4a2b', '#2a6636', '#3c8443', '#5aa552', '#7cc463'] },
    { w: 34, h: 42, trunk: 4, trunkH: 11, pal: ['#1b4729', '#286435', '#3a8342', '#57a350', '#7bc463'] },
    { w: 42, h: 52, trunk: 5, trunkH: 13, pal: ['#194326', '#256033', '#387f40', '#549f4e', '#78c060'] },
    { w: 52, h: 64, trunk: 7, trunkH: 16, pal: ['#173d23', '#22592f', '#34783c', '#4f984a', '#73bb5d'] },
  ];

  const MOTHER_PAL = ['#20283a', '#2f3a52', '#44506b', '#66738c', '#d84a4a'];

  function makeCanopy(w, h, seed, pal, mother) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    const mask = new Uint8Array(w * h);

    const cx = w / 2;
    const cy = h * 0.44;
    const rx = w * 0.47;
    const ry = h * 0.42;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const n = hash2(x, y, seed) * 0.22 + hash2(x >> 1, y >> 1, seed + 9) * 0.12;
        const v = Math.sqrt(dx * dx + dy * dy) + n - 0.12;
        if (v < 1) {
          mask[y * w + x] = 1;
          // 光影：左上亮、下方暗
          const light = -dx * 0.55 - dy * 0.7 + 0.35 + hash2(x, y, seed + 3) * 0.35;
          let idx = light > 0.85 ? 4 : light > 0.45 ? 3 : light > 0.05 ? 2 : light > -0.35 ? 1 : 0;
          if (mother) {
            if (idx > 3) idx = 3;
            if (hash2(x, y, seed + 77) > 0.965) idx = 4;
          }
          const hex = pal[idx];
          const r = parseInt(hex.slice(1, 3), 16);
          const gg = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const p = (y * w + x) * 4;
          d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
        }
      }
    }

    // 边缘描边
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const edge = !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w];
        if (edge) {
          const p = i * 4;
          d[p] = 12; d[p + 1] = 32; d[p + 2] = 18; d[p + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function treeSprite(stage, variant, mother) {
    const key = `tree:${stage}:${variant}:${mother ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key);
    if (mother) {
      const w = 62, h = 78;
      const c = canvas(w, h);
      const g = c.getContext('2d');
      // 树干
      g.fillStyle = '#4a3a2e';
      g.fillRect(w / 2 - 6, h - 26, 12, 26);
      g.fillStyle = '#5c4a3a';
      g.fillRect(w / 2 - 4, h - 26, 4, 26);
      g.fillStyle = '#2e241c';
      g.fillRect(w / 2 - 10, h - 6, 20, 4);
      const canopy = makeCanopy(w - 4, h - 20, 700 + variant, MOTHER_PAL, true);
      g.drawImage(canopy, 2, 0);
      tag(c);
      cache.set(key, c);
      return c;
    }
    const spec = TREE_SPEC[stage] || TREE_SPEC[0];
    const { w, h, trunk, trunkH, pal } = spec;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#4a3320';
    g.fillRect(w / 2 - trunk / 2, h - trunkH, trunk, trunkH);
    g.fillStyle = '#5e422a';
    g.fillRect(w / 2 - trunk / 2, h - trunkH, Math.max(1, trunk - 2), trunkH);
    g.fillStyle = '#33220f';
    g.fillRect(w / 2 - trunk / 2 - 2, h - 4, trunk + 4, 4);
    const canopy = makeCanopy(w, h - 6, 100 + stage * 31 + variant * 7, pal, false);
    g.drawImage(canopy, 0, 0);
    tag(c);
    cache.set(key, c);
    return c;
  }

  /* ---------------------------------------------------------------- stump */

  function stumpSprite() {
    if (cache.has('stump')) return cache.get('stump');
    const c = canvas(16, 10);
    const g = c.getContext('2d');
    g.fillStyle = '#4a3320';
    g.fillRect(4, 4, 8, 5);
    g.fillStyle = '#6b4c2c';
    g.fillRect(4, 3, 8, 2);
    g.fillStyle = '#a87a4a';
    g.fillRect(6, 3, 4, 1);
    g.fillStyle = '#2e1f10';
    g.fillRect(3, 8, 10, 2);
    tag(c);
    cache.set('stump', c);
    return c;
  }

  function axeSprite() {
    if (cache.has('axe')) return cache.get('axe');
    const rows = [
      '..AAA...',
      '..AAA...',
      '..AAA...',
      '..AAA...',
      '.AAAA...',
      '.AAA....',
      'AAAA....',
      'AAA.....',
      'AA......',
    ];
    const c = tag(fromRows(rows, { A: '#c8d0d8' }, 1));
    cache.set('axe', c);
    return c;
  }

  function coinIcon() {
    if (cache.has('coin')) return cache.get('coin');
    const c = canvas(12, 12);
    const g = c.getContext('2d');
    g.fillStyle = '#b8860b';
    g.fillRect(1, 2, 10, 8);
    g.fillRect(2, 1, 8, 10);
    g.fillStyle = '#f2c14e';
    g.fillRect(2, 2, 8, 6);
    g.fillStyle = '#ffe9a3';
    g.fillRect(3, 2, 3, 2);
    tag(c);
    cache.set('coin', c);
    return c;
  }

  CL.Sprites = {
    playerSprite,
    bearSprite,
    treeSprite,
    nestSprite,
    stumpSprite,
    axeSprite,
    coinIcon,
    tint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
