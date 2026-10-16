'use strict';
// Chrome + CDP plumbing for the io.net pilot. One Chrome per run, per-context proxy.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { CDP } = require('./cdp.js');

// Checkout root — runtime artefacts (logs/, outputs/) stay there, not in src/.
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

function httpJson(port, p) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, (res) => {
        let b = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(new Error('bad json from chrome'));
          }
        });
      })
      .on('error', reject);
  });
}

async function waitPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await httpJson(port, '/json/version');
    } catch (e) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`chrome debug port ${port} not up`);
}

function launchChrome(port, tag = 'ionet') {
  const profileDir = path.join(os.homedir(), `.ionet-chrome-${tag}-${Date.now().toString(36)}`);
  const { leanArgs } = require('./chrome-flags.js');
  const args = [
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profileDir,
    ...leanArgs({
      extra: [
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-client-side-phishing-detection',
        '--disable-breakpad',
        '--no-service-autorun',
        '--metrics-recording-only',
        '--password-store=basic',
        '--window-size=1280,900',
      ],
    }),
    'about:blank',
  ];
  const child = spawn(CHROME, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  const meta = { pid: child.pid, port, profileDir, at: new Date().toISOString() };
  try {
    fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'logs', `chrome-${port}.json`), JSON.stringify(meta, null, 2));
  } catch {}
  return meta;
}

async function connect(port) {
  const v = await waitPort(port);
  const cdp = new CDP(v.webSocketDebuggerUrl, { commandTimeoutMs: 60000 });
  await cdp.connect();
  return cdp;
}

async function openContext(cdp, { proxyServer, url = 'about:blank' } = {}) {
  const browserContextId = await cdp.createBrowserContext(proxyServer ? { proxyServer } : {});
  const { targetId, sessionId } = await cdp.newPage({ browserContextId, url: 'about:blank' });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  return { browserContextId, targetId, sessionId };
}

function evalJs(cdp, sessionId, expression, { awaitPromise = false } = {}) {
  return cdp
    .send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId)
    .then((r) => {
      if (r.exceptionDetails) {
        throw new Error(
          'eval: ' +
            r.exceptionDetails.text +
            ' ' +
            String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').slice(0, 300)
        );
      }
      return r.result.value;
    });
}

function waitLoad(cdp, sessionId, timeoutMs = 90000) {
  return cdp.waitFor('Page.loadEventFired', { timeoutMs, sessionId }).catch(() => null);
}

async function screenshot(cdp, sessionId, file) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

async function clickAt(cdp, sessionId, x, y, { moves = true } = {}) {
  if (moves) {
    // A couple of jitter moves first — some widgets ignore teleporting cursors.
    for (const [dx, dy] of [[-25, -12], [8, -4], [0, 0]]) {
      await cdp.send(
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x: Math.round(x + dx), y: Math.round(y + dy), button: 'none', modifiers: 0 },
        sessionId
      );
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 80));
    }
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }, sessionId);
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }, sessionId);
}

module.exports = { UA, CHROME, launchChrome, connect, openContext, evalJs, waitLoad, screenshot, waitPort, httpJson, clickAt };
