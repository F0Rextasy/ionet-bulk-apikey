'use strict';
// Hunt the exact POST /v1/api-keys/ body shape: value guesses first, then mine the
// ai.io.net UI bundle for the real request if guesses fail.
//   node src/key-shape.js --from-log <net.jsonl> --proxy <line> [--tag p1]
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
let TOKEN = arg('token', '');
const FROM_LOG = arg('from-log', '');
const TAG = arg('tag', 'p1');
const PROXY_LINE = arg('proxy', '');
const ROOT = path.resolve(__dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
if (!TOKEN && FROM_LOG) {
  for (const l of fs.readFileSync(FROM_LOG, 'utf8').split(/\r?\n/)) {
    if (!l.trim()) continue;
    let rec = null; try { rec = JSON.parse(l); } catch { continue; }
    if (typeof rec.body === 'string') { const m = rec.body.match(/"accessToken"\s*:\s*"([^"]+)"/); if (m) TOKEN = m[1]; }
  }
}
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }
if (!TOKEN) throw new Error('no token');

function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { 'User-Agent': UA, ...(TOKEN ? { Token: TOKEN } : {}), ...headers };
    if (payload) hs['Content-Type'] = 'application/json';
    const r = lib.request({ method, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: hs, agent: proxy ? createAgent(proxy) : undefined }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: t }));
    });
    r.setTimeout(timeoutMs, () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stamp = Date.now().toString(36);
  const nice = (s, n = 300) => String(s).replace(/\s+/g, ' ').slice(0, n);
  const base = { name: `k-${TAG}-${stamp}`, description: `k-${TAG}-${stamp}` };

  const tries = [
    { ...base, expires_at: '2026-11-13T00:00:00Z', project: 'default', scopes: [] },
    { ...base, expires_at: '2027-10-14T00:00:00Z', project: 'default', scopes: [] },
    { ...base, expires_at: '2027-04-14T00:00:00Z', project: 'default', scopes: [] },
    { ...base, expires_at: '2026-10-21T00:00:00Z', project: 'default', scopes: [] },
    { ...base, expires_at: '2026-11-13T00:00:00Z', project: 'io-intelligence', scopes: ['all'] },
    { ...base, expires_at: '2026-11-13T00:00:00Z', project: 'default', scopes: ['all'] },
  ];
  for (const t of tries) {
    const r = await req('https://api.io.solutions/v1/api-keys/', { method: 'POST', body: t });
    console.log(`POST project=${t.project} scopes=${JSON.stringify(t.scopes)} -> ${r.status} ${nice(r.body, 400)}`);
    fs.appendFileSync(path.join(ROOT, 'outputs', `keyshape-${TAG}.log`), JSON.stringify({ at: new Date().toISOString(), t, status: r.status, body: r.body.slice(0, 3000) }) + '\n');
    if (r.status < 300) { console.log('CREATED: ' + nice(r.body, 800)); return; }
    await sleep(400);
  }

  // Value guesses failed — mine the UI bundle for the real request shape.
  console.log('--- mining ai.io.net bundle ---');
  const page = await req('https://ai.io.net/ai/api-keys', { headers: { Accept: 'text/html' } });
  console.log(`page -> ${page.status} len=${page.body.length}`);
  const srcs = [...page.body.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
  console.log('js assets: ' + srcs.slice(0, 12).join(' '));
  for (const s of srcs.slice(0, 12)) {
    const u = s.startsWith('http') ? s : new URL(s, 'https://ai.io.net').href;
    let js;
    try { js = await req(u, { headers: { Accept: 'application/javascript' } }); } catch (e) { continue; }
    if (js.status !== 200) continue;
    const hits = [];
    for (const kw of ['expires_at', 'scopes', 'api-keys']) {
      let idx = 0;
      while ((idx = js.body.indexOf(kw, idx)) !== -1 && hits.length < 12) { hits.push(js.body.slice(Math.max(0, idx - 300), idx + 300)); idx += kw.length; }
    }
    if (hits.length) {
      console.log(`\n== ${u.slice(-60)} (${js.body.length}B) hits=${hits.length}`);
      for (const h of hits.slice(0, 6)) console.log('  …' + h.replace(/\s+/g, ' ') + '…');
      fs.writeFileSync(path.join(ROOT, 'outputs', `keyshape-bundle-${stamp}.txt`), `URL ${u}\n\n` + hits.join('\n\n---\n\n'));
    }
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
