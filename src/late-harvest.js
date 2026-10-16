'use strict';
/* Late-harvest: recover io.net keys whose live-test failed at create time due to
 * provisioning lag (measured ~1 h once) — re-test every created key found in the
 * outputs' create-artifacts and append the now-live ones (one per account/owner).
 *
 *   node src/late-harvest.js [--proxy socks5://...] [--dry]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const DRY = argv.includes('--dry');
const PROXY_LINE = arg('proxy', '');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');
const MODELS_BASE = 'https://api.intelligence.io.solutions/api/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { 'User-Agent': UA, ...headers };
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-type')) hs['Content-Type'] = 'application/json';
    if (payload) hs['Content-Length'] = payload.length;
    const r = lib.request({ method, host: u.hostname, port: 443, path: u.pathname + u.search, headers: hs, agent: proxy ? createAgent(proxy) : undefined }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode, body: t }));
    });
    r.setTimeout(timeoutMs, () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}
function ownerOf(key) {
  try {
    const p = JSON.parse(Buffer.from(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return p.owner || null;
  } catch { return null; }
}
async function testLive(key) {
  try {
    const m = await req(`${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (m.status !== 200) return { live: false, note: `models ${m.status}` };
    let n = null; try { const j = JSON.parse(m.body); if (Array.isArray(j.data)) n = j.data.length; } catch {}
    const c = await req(`${MODELS_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { model: 'google/gemma-4-26b-a4b-it', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64 } });
    let chat = null; try { const cj = JSON.parse(c.body); const msg = cj.choices && cj.choices[0] && cj.choices[0].message; chat = msg ? (msg.content || msg.reasoning_content || 'ok') : null; } catch {}
    return { live: !!chat, note: `chat ${c.status}`, models: n, chat };
  } catch (e) { return { live: false, note: 'err ' + e.message }; }
}

(async () => {
  const keysFile = path.join(ROOT, 'keys.txt');
  const known = new Set();
  const knownOwners = new Set();
  try {
    for (const l of fs.readFileSync(keysFile, 'utf8').split(/\r?\n/)) {
      const k = l.trim();
      if (!k) continue;
      known.add(k);
      const o = ownerOf(k); if (o) knownOwners.add(o);
    }
  } catch {}
  console.log(ts(), `known keys=${known.size} owners=${knownOwners.size}`);

  const dirs = fs.readdirSync(OUT).filter((d) => d.startsWith('http-') || d.startsWith('scope-'));
  const candidates = new Map(); // key -> source
  for (const d of dirs) {
    for (const f of ['apikey-create.jsonl', 'creates.jsonl']) {
      const fp = path.join(OUT, d, f);
      let text = null;
      try { text = fs.readFileSync(fp, 'utf8'); } catch { continue; }
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let rec = null; try { rec = JSON.parse(line); } catch { continue; }
        const res = typeof rec.res === 'string' ? rec.res : (typeof rec.body === 'string' ? rec.body : '');
        const m = res.match(/"value"\s*:\s*"(io-v2-[A-Za-z0-9._-]+)"/);
        if (m && !known.has(m[1]) && !candidates.has(m[1])) candidates.set(m[1], `${d}/${f}`);
      }
    }
  }
  console.log(ts(), `candidates not in keys.txt: ${candidates.size}`);

  let appended = 0;
  const seenOwners = new Set(knownOwners);
  for (const [key, src] of candidates) {
    const owner = ownerOf(key);
    if (!owner) continue;
    if (seenOwners.has(owner)) continue; // one key per account
    const t = await testLive(key);
    console.log(ts(), `test ${key.slice(0, 12)}… owner=${owner.slice(0, 8)} -> live=${t.live} ${t.note} (${src})`);
    if (t.live) {
      if (!DRY) {
        fs.appendFileSync(keysFile, key + '\n');
        fs.appendFileSync(path.join(ROOT, 'accounts.json'), JSON.stringify({ tag: 'late-harvest', key, keyMasked: `${key.slice(0, 12)}…${key.slice(-4)}`, owner, at: new Date().toISOString(), proxy: PROXY_LINE, models: t.models, chat: t.chat ? String(t.chat).slice(0, 40) : null, live: true, via: 'late-harvest', source: src }) + '\n');
      }
      seenOwners.add(owner);
      appended++;
      console.log(ts(), `APPENDED (${appended}) ${key.slice(0, 12)}…`);
    }
    await sleep(600);
  }
  console.log(ts(), `late-harvest done: appended=${appended}${DRY ? ' (dry)' : ''}`);
})().catch((e) => { console.error(ts(), 'FAIL', e.message); process.exit(1); });
