'use strict';
// Mine the ai.io.net bundle + docs for the exact createKey payload shape.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PROXY_LINE = arg('proxy', '');
const ROOT = path.join(__dirname);
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
const ctx = (s, kw, before = 350, after = 500, max = 6) => {
  const out = [];
  let i = 0;
  while ((i = s.indexOf(kw, i)) !== -1 && out.length < max) { out.push(s.slice(Math.max(0, i - before), i + after)); i += kw.length; }
  return out;
};
(async () => {
  const outLines = [];
  const say = (x) => { console.log(x); outLines.push(x); };
  const js = await req('https://ai.io.net/index-34a635ed-05dec66-ea9f96647bad9dcc1838b59c69d2459125172f75.js', { headers: { Accept: 'application/javascript' } });
  say(`bundle ${js.status} ${js.body.length}B`);
  const b = js.body;
  for (const kw of ['createKey:', 'createKey(', 'expires_at', 'scopes', 'validity', 'expiry', 'expiration', 'value:30', "value:'", 'apiKeyPayload', 'getKeyPayload', 'project:']) {
    const hits = ctx(b, kw);
    if (!hits.length) { say(`\n##### ${kw}: 0`); continue; }
    say(`\n##### ${kw}: ${hits.length}`);
    for (const h of hits) say('  …' + h.replace(/\s+/g, ' ') + '…');
  }
  for (const u of ['https://io.net/docs/guides/intelligence/api-keys-and-secrets', 'https://docs.io.net/guides/intelligence/api-keys-and-secrets']) {
    try { const d = await req(u, { timeoutMs: 30000 }); say(`\n#### docs ${u} -> ${d.status} len=${d.body.length}\n` + d.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2500)); } catch (e) { say(`\n#### docs ${u} -> ERR ${e.message}`); }
  }
  fs.writeFileSync(path.join(ROOT, 'outputs', `keyshape-mine-${Date.now().toString(36)}.txt`), outLines.join('\n'));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
