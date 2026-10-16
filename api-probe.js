'use strict';
// Discover io.solutions API shapes with an account accessToken (read-only probes).
//   node src/api-probe.js --token <t> --proxy <line> [--tag p1]
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
let TOKEN = arg('token', '');
const FROM_LOG = arg('from-log', '');
if (!TOKEN && FROM_LOG) {
  try {
    const lines = fs.readFileSync(FROM_LOG, 'utf8').split(/\r?\n/);
    for (const l of lines) { if (!l.trim()) continue; let rec = null; try { rec = JSON.parse(l); } catch { continue; } if (typeof rec.body === 'string') { const m = rec.body.match(/"accessToken"\s*:\s*"([^"]+)"/); if (m) TOKEN = m[1]; } }
  } catch (e) { console.error('token-from-log failed:', e.message); }
}
const PROXY_LINE = arg('proxy', '');
const TAG = arg('tag', 'probe');
const ROOT = path.join(__dirname);
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }

function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36', ...(TOKEN ? { Token: TOKEN } : {}), ...headers };
    if (payload) hs['Content-Type'] = 'application/json';
    const r = lib.request({ method, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: hs, agent: proxy ? createAgent(proxy) : undefined }, (res) => {
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
  const probes = [
    ['GET', 'https://api.io.solutions/openapi.json'],
    ['GET', 'https://api.io.solutions/v1/openapi.json'],
    ['GET', 'https://api.io.solutions/v1/projects/'],
    ['GET', 'https://api.io.solutions/v1/projects'],
    ['GET', 'https://api.io.solutions/v1/users/me'],
    ['GET', 'https://api.io.solutions/v1/me'],
    ['GET', 'https://api.io.solutions/v1/api-keys/'],
    ['GET', 'https://api.io.solutions/v1/scopes'],
    ['POST', 'https://api.io.solutions/v1/api-keys/', { name: 'probe-' + TAG, description: 'probe', expires_at: null, project: 'default', scopes: [] }],
    ['POST', 'https://api.io.solutions/v1/api-keys/', { name: 'probe-' + TAG, description: 'probe', expires_at: '2030-01-01T00:00:00Z', project: 0, scopes: ['all'] }],
  ];
  const outDir = path.join(ROOT, 'outputs', `probe-${TAG}-${Date.now().toString(36)}`);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [m, url, body] of probes) {
    let line;
    try {
      const r = await req(url, { method: m, body });
      line = `${m} ${url} -> ${r.status} ${String(r.body).slice(0, 400).replace(/\s+/g, ' ')}`;
      if (url.endsWith('openapi.json') && r.status === 200) {
        fs.writeFileSync(path.join(outDir, 'openapi.json'), r.body);
        let n = 0; try { const j = JSON.parse(r.body); n = Object.keys(j.paths || {}).length; } catch {}
        line += ` [saved openapi.json paths=${n}]`;
      }
      fs.appendFileSync(path.join(outDir, 'probe.log'), line + '\n');
    } catch (e) { line = `${m} ${url} -> ERR ${e.message}`; fs.appendFileSync(path.join(outDir, 'probe.log'), line + '\n'); }
    console.log(line);
  }
  console.log('outDir=' + outDir);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
