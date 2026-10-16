'use strict';
// Hunt valid io.net API-key scope values + service expectations.
//   node src/scope-hunt.js --proxy <line>
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PROXY_LINE = arg('proxy', '');
const ROOT = path.resolve(__dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }
function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { 'User-Agent': UA, ...headers };
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
const ctx = (s, kw, before = 300, after = 420, max = 8) => {
  const out = []; let i = 0;
  while ((i = s.indexOf(kw, i)) !== -1 && out.length < max) { out.push(s.slice(Math.max(0, i - before), i + after)); i += kw.length; }
  return out;
};
(async () => {
  const outDir = path.join(ROOT, 'outputs', `scopehunt-${Date.now().toString(36)}`);
  fs.mkdirSync(outDir, { recursive: true });
  const lines = [];
  const say = (s) => { console.log(s); lines.push(s); };

  for (const url of [
    'https://api.intelligence.io.solutions/openapi.json',
    'https://api.intelligence.io.solutions/api/v1/openapi.json',
    'https://api.intelligence.io.solutions/api/openapi.json',
  ]) {
    try { const r = await req(url); say(`${url} -> ${r.status} ${String(r.body).slice(0, 200).replace(/\s+/g, ' ')}`); if (r.status === 200 && r.body.length > 500) fs.writeFileSync(path.join(outDir, 'intelligence-openapi.json'), r.body); } catch (e) { say(`${url} ERR ${e.message}`); }
  }
  for (const url of [
    'https://io.net/docs/guides/intelligence/api-keys-and-secrets',
    'https://docs.io.net/guides/intelligence/api-keys-and-secrets',
  ]) {
    try { const r = await req(url, { timeoutMs: 45000 }); const txt = String(r.body).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); say(`\n#### ${url} -> ${r.status} len=${r.body.length}\n${txt.slice(0, 3000)}`); } catch (e) { say(`\n#### ${url} ERR ${e.message}`); }
  }
  try {
    const js = await req('https://ai.io.net/index-34a635ed-05dec66-ea9f96647bad9dcc1838b59c69d2459125172f75.js', { headers: { Accept: 'application/javascript' } });
    say(`\nbundle ${js.status} ${js.body.length}B`);
    for (const kw of ['scope', 'Scope', 'service', 'Service', 'Valid for', 'allowed_models', 'credit_limit', 'Never expires', '90 days', '30 days', 'Generate']) {
      const hits = ctx(js.body, kw);
      say(`\n##### ${kw}: ${hits.length}`);
      for (const h of hits.slice(0, 4)) say('  …' + h.replace(/\s+/g, ' ') + '…');
    }
  } catch (e) { say('bundle ERR ' + e.message); }
  fs.writeFileSync(path.join(outDir, 'scope-hunt.log'), lines.join('\n'));
  say('outDir=' + outDir);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
