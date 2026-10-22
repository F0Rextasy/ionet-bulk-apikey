'use strict';
// Direct live test for an io.net API key: models + mini chat through the proxy.
//   node src/test-key.js --key io-v2-... --proxy <line> [--append] [--tag p1c]
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const KEY = arg('key', '');
const PROXY_LINE = arg('proxy', '');
const TAG = arg('tag', 't');
const MODEL = arg('model', 'google/gemma-4-26b-a4b-it');
const APPEND = argv.includes('--append');
const ROOT = path.resolve(__dirname, '..');
const MODELS_BASE = arg('models-base', 'https://api.intelligence.io.solutions/api/v1');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }

function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const isLocal = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { 'User-Agent': UA, ...headers };
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-type')) hs['Content-Type'] = 'application/json';
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-length')) hs['Content-Length'] = payload.length;
    const r = lib.request({ method, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: hs, agent: (proxy && !isLocal) ? createAgent(proxy) : undefined }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: t }));
    });
    r.setTimeout(timeoutMs, () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  if (!KEY) throw new Error('--key required');
  console.log(`key len=${KEY.length} ${KEY.slice(0, 10)}…${KEY.slice(-4)} base=${MODELS_BASE}`);
  let models = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await req(`${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
      console.log(`models[${i}] -> ${r.status} ${String(r.body).slice(0, 140).replace(/\s+/g, ' ')}`);
      if (r.status === 200) { try { const j = JSON.parse(r.body); if (Array.isArray(j.data)) models = j.data.length; } catch {} if (models) break; }
    } catch (e) { console.log(`models[${i}] err ${e.message}`); }
    await new Promise((r) => setTimeout(r, 3000));
  }
  let chat = null;
  try {
    const c = await req(`${MODELS_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: { model: MODEL, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64 } });
    console.log(`chat -> ${c.status} ${String(c.body).slice(0, 200).replace(/\s+/g, ' ')}`);
    try { const cj = JSON.parse(c.body); const msg = cj.choices && cj.choices[0] && cj.choices[0].message; chat = msg ? (msg.content || msg.reasoning_content || 'ok') : null; } catch {}
  } catch (e) { console.log(`chat err ${e.message}`); }
  const live = models !== null && !!chat;
  console.log(`RESULT live=${live} models=${models} chat=${chat}`);
  if (live && APPEND) {
    fs.appendFileSync(path.join(ROOT, 'keys.txt'), KEY + '\n', { mode: 0o600 });
    fs.appendFileSync(path.join(ROOT, 'accounts.json'), JSON.stringify({ tag: TAG, key: KEY, keyMasked: `${KEY.slice(0, 10)}…${KEY.slice(-4)}`, at: new Date().toISOString(), proxy: PROXY_LINE, models, chat: String(chat).slice(0, 40), live: true, via: 'http-finish' }) + '\n', { mode: 0o600 });
    console.log('APPENDED to keys.txt + accounts.json');
  }
  process.exit(live ? 0 : 2);
})().catch((e) => { console.error('FAIL', (e && e.message) || e); process.exit(1); });
