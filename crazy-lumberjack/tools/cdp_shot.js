/*
 * 用 Chrome DevTools Protocol 截图 / 执行脚本 / 收集控制台错误。
 * 用法：node tools/cdp_shot.js <url> <out.png> [--width 390] [--height 844]
 *        [--dpr 2] [--wait 1200] [--eval "js"] [--click "selector"]
 */
'use strict';
const fs = require('fs');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const url = process.argv[2];
const out = process.argv[3];
const width = +arg('width', 390);
const height = +arg('height', 844);
const dpr = +arg('dpr', 2);
const waitMs = +arg('wait', 1200);
const evalScript = arg('eval', '');
const evalFile = arg('eval-file', '');
const clickSel = arg('click', '');
const port = +arg('port', 9222);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const errors = [];
  const logs = [];

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      logs.push(`${e.level}: ${e.text}`);
      if (e.level === 'error') errors.push(e.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dpr, mobile: true,
    screenWidth: width, screenHeight: height,
  });
  const loaded = new Promise((resolve) => {
    const h = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', h);
        resolve();
      }
    };
    ws.addEventListener('message', h);
  });
  await send('Page.navigate', { url });
  await Promise.race([loaded, sleep(6000)]);
  await sleep(waitMs);

  if (evalFile) {
    const code = fs.readFileSync(evalFile, 'utf8');
    const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (r.result && r.result.value !== undefined) console.log('EVAL:', JSON.stringify(r.result.value));
  }
  if (evalScript) {
    const r = await send('Runtime.evaluate', { expression: evalScript, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) errors.push(r.exceptionDetails.text);
    if (r.result && r.result.value !== undefined) console.log('EVAL:', JSON.stringify(r.result.value));
  }
  if (clickSel) {
    const r = await send('Runtime.evaluate', {
      expression: `(function(){const el=document.querySelector(${JSON.stringify(clickSel)}); if(!el) return 'no el'; el.click(); return 'clicked';})()`,
      returnByValue: true,
    });
    console.log('CLICK:', r.result && r.result.value);
    await sleep(600);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT:', out, width + 'x' + height, 'dpr', dpr);
  if (errors.length) {
    console.log('ERRORS:');
    for (const e of errors.slice(0, 20)) console.log(' -', e);
  } else {
    console.log('ERRORS: none');
  }
  if (logs.length) {
    console.log('LOGS:');
    for (const l of logs.slice(0, 10)) console.log(' -', l);
  }
  ws.close();
}

main().catch((e) => {
  console.error('CDP FAIL', e.message);
  process.exit(1);
});
