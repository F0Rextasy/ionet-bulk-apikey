'use strict';
// Re-verify every key in keys.txt with a single GET /v1/models (cheap sweep).
//   node src/reverify.js [--proxy socks5://...]
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PROXY_LINE = arg('proxy', '');
const ROOT = path.resolve(__dirname, '..');
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
function req(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ method: 'GET', host: u.hostname, port: 443, path: u.pathname, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, agent: proxy ? createAgent(proxy) : undefined }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => (t += c)); res.on('end', () => resolve({ status: res.statusCode, body: t }));
    });
    r.setTimeout(45000, () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end();
  });
}
async function testKey(key) {
  for (let i = 0; i < 2; i++) {
    try {
      const m = await req('https://api.intelligence.io.solutions/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (m.status === 200) { let n = 0; try { n = (JSON.parse(m.body).data || []).length; } catch {} return { ok: true, models: n }; }
      if (m.status === 401 || m.status === 403) return { ok: false, status: m.status, note: m.body.slice(0, 90) };
      return { ok: false, status: m.status, note: m.body.slice(0, 90) };
    } catch (e) { if (i === 1) return { ok: false, status: 0, note: e.message.slice(0, 60) }; }
  }
}
(async () => {
  const keys = fs.readFileSync(path.join(ROOT, 'keys.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let ok = 0, bad = 0;
  const lines = [];
  for (const k of keys) {
    const t = await testKey(k);
    if (t.ok) ok++; else bad++;
    const row = `${t.ok ? 'OK ' : 'BAD'} ${k.slice(0, 14)}… owner=${(() => { try { return JSON.parse(Buffer.from(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).owner.slice(0, 8); } catch { return '?'; } })()} models=${t.models || '-'} ${t.ok ? '' : t.status + ' ' + (t.note || '')}`;
    console.log(row);
    lines.push(row);
    await new Promise((r) => setTimeout(r, 400));
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(ROOT, 'outputs', `reverify-${stamp}.log`), `keys=${keys.length} ok=${ok} bad=${bad}\n` + lines.join('\n'));
  console.log(`SUMMARY keys=${keys.length} ok=${ok} bad=${bad}`);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
