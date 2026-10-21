/* 在 Node 中加载浏览器端脚本（无 DOM 依赖） */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadGame() {
  const sandbox = {
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
    performance: { now: () => Date.now() },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['config.js', 'rng.js', 'world.js']) {
    const full = path.join(ROOT, 'src', f);
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
  }
  return sandbox.CL;
}

module.exports = { loadGame };
