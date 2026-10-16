'use strict';
// Find a chat model that answers for a valid-but-credit-less io.net key.
//   node src/model-hunt.js --key <k> --proxy <line>
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const KEY = arg('key', '');
const PROXY_LINE = arg('proxy', '');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://api.intelligence.io.solutions/api/v1';
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
    const r = lib.request({ method, host: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: hs, agent: proxy ? createAgent(proxy) : undefined }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => (t += c));
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
  const m = await req(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  console.log(`models -> ${m.status} len=${m.body.length}`);
  let ids = [];
  try { const j = JSON.parse(m.body); ids = (j.data || []).map((x) => x.id); } catch {}
  fs.writeFileSync(path.join(ROOT, 'outputs', 'models-ionet.json'), m.body);
  console.log(`model ids (${ids.length}):`);
  for (const id of ids.slice(0, 200)) console.log('  ' + id);

  const prefer = ids.filter((id) => /(llama-3\.?[123].*(8B|3B|1B)|qwen.*(7B|4B|3B|1\.?5B)|mistral.*(7B|small)|gemma.*(2B|7B|9B)|phi|gemini.*flash|deepseek.*(1\.?5B|7B|8B)|gpt-4o-mini|llama-4)/i.test(id));
  const tried = new Set(candidates_prev());
  function candidates_prev() { return []; }
  const toTry = ids.filter((id) => !tried.has(id));
  console.log(`\nsweeping ${toTry.length} untested models in batches of 6 (stop at first 200)…`);
  const results = [];
  for (let i = 0; i < toTry.length; i += 6) {
    const batch = toTry.slice(i, i + 6);
    const rs = await Promise.all(batch.map(async (model) => {
      try {
        const c = await req(`${BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: { model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8 } });
        let note = '';
        if (c.status !== 200) { try { note = JSON.parse(c.body).detail || c.body.slice(0, 70); } catch { note = c.body.slice(0, 70); } }
        return { model, status: c.status, note };
      } catch (e) { return { model, status: 0, note: e.message }; }
    }));
    for (const r of rs) {
      results.push(r);
      if (r.status === 200) { console.log(`OK ${r.model}`); fs.writeFileSync(path.join(ROOT, 'outputs', 'model-hunt-results.json'), JSON.stringify({ results, freeFound: r.model }, null, 1)); console.log('FREE-LIVE-MODEL=' + r.model); return; }
      console.log(`   ${r.status} ${r.model} ${r.note}`);
    }
  }
  fs.writeFileSync(path.join(ROOT, 'outputs', 'model-hunt-results.json'), JSON.stringify({ results, freeFound: null }, null, 1));
  console.log('no free-tier model found in sweep');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
