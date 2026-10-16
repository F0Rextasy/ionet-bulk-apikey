'use strict';
/*
 * Point-of-use probe for io.net hosts.
 *
 *   node src/pou.js --host id.io.net [--offset 0 --limit 80 --conc 8]
 *   node src/pou.js --host api.intelligence.io.solutions --path /api/v1/models
 *
 * Pool: union-live.txt (comment-free). Every exit is verified
 * against the REAL host with a tunnel-CONNECT (8 s) budget and a TLS+HTTP
 * budget of 30 s — an exit only counts when the target actually answers.
 * Outputs: outputs/pou-<host>-<ts>.jsonl and outputs/pou-<host>-live-<ts>.txt
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  parseProxy,
  createAgent,
  openTunnel,
} = require('./proxy.js');
const tls = require('tls');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');
const POOL = path.join(ROOT, 'union-live.txt');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : argv[i + 1];
};
const HOST = arg('host', 'id.io.net');
const PATHNAME = arg('path', '/');
const OFFSET = parseInt(arg('offset', '0'), 10);
const LIMIT = parseInt(arg('limit', '80'), 10);
const CONC = Math.min(parseInt(arg('conc', '8'), 10), 8);
const TIMEOUT = parseInt(arg('timeout', '30000'), 10);

const ts = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(OUT, { recursive: true });

const lines = fs
  .readFileSync(POOL, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

const slice = lines.slice(OFFSET, OFFSET + LIMIT);
console.log(`[pou] host=${HOST}${PATHNAME} pool=${lines.length} slice=${OFFSET}..${OFFSET + slice.length} conc=${CONC}`);

function tlsProbe(proxy) {
  return new Promise((resolve) => {
    const started = Date.now();
    let tunnel = null;
    const done = (ok, error) => {
      try { tunnel && tunnel.destroy(); } catch {}
      resolve({ ok, ms: Date.now() - started, error });
    };
    const timer = setTimeout(() => done(false, 'tls-timeout'), TIMEOUT);
    openTunnel(proxy, { host: HOST, port: 443, timeoutMs: 8000 })
      .then((t) => {
        tunnel = t;
        const s = tls.connect({ socket: t, servername: HOST });
        s.once('secureConnect', () => {
          clearTimeout(timer);
          s.destroy();
          done(true);
        });
        s.once('error', (e) => {
          clearTimeout(timer);
          done(false, 'tls:' + e.message);
        });
      })
      .catch((e) => {
        clearTimeout(timer);
        done(false, 'tunnel:' + e.message);
      });
  });
}

function httpGet(proxy, url, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const u = new URL(url);
    const req = https.request(
      {
        method: 'GET',
        host: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        agent: createAgent(proxy),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          Accept: 'text/html,application/json,*/*',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ ok: true, status: res.statusCode, ms: Date.now() - started, body, headers: res.headers })
        );
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('http-timeout-' + timeoutMs)));
    req.on('error', (e) => resolve({ ok: false, ms: Date.now() - started, error: e.message }));
    req.end();
  });
}

async function runOne(line) {
  const proxy = parseProxy(line, {});
  if (!proxy) return { line, ok: false, error: 'parse-fail' };
  proxy.connectTimeoutMs = 8000;
  proxy.timeoutMs = TIMEOUT;

  const t = await tlsProbe(proxy);
  if (!t.ok) return { line, tls: t, ok: false, error: t.error };

  const h = await httpGet(proxy, `https://${HOST}${PATHNAME}`, TIMEOUT);
  const title = h.body ? (h.body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null : null;
  const signature = new RegExp(HOST.replace(/\./g, '\\.'), 'i').test(h.body || '');
  const cf = h.headers && (h.headers['cf-mitigated'] || h.headers['server']);
  return {
    line,
    ok: !!h.ok && h.status >= 200 && h.status < 500,
    tlsMs: t.ms,
    ms: h.ms,
    status: h.status || null,
    bytes: h.body ? h.body.length : 0,
    title,
    signature,
    server: cf || null,
    snippet: (h.body || '').slice(0, 160).replace(/\s+/g, ' '),
    error: h.error || null,
  };
}

(async () => {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: CONC }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= slice.length) return;
      const r = await runOne(slice[idx]);
      results[idx] = r;
      console.log(
        `[${idx + 1}/${slice.length}] ${slice[idx]} -> ${r.ok ? 'OK ' + r.status + ' ' + r.ms + 'ms ' + r.bytes + 'B' : 'FAIL ' + (r.error || '')}` +
          (r.title ? ' title=' + r.title.slice(0, 40) : '')
      );
    }
  });
  await Promise.all(workers);

  const jsonl = path.join(OUT, `pou-${HOST.replace(/[^\w.-]/g, '_')}-${OFFSET}-${ts}.jsonl`);
  fs.writeFileSync(jsonl, results.filter(Boolean).map((r) => JSON.stringify(r)).join('\n') + '\n');

  const live = results.filter((r) => r && r.ok && r.signature);
  const liveFile = path.join(OUT, `pou-${HOST.replace(/[^\w.-]/g, '_')}-live-${OFFSET}-${ts}.txt`);
  fs.writeFileSync(liveFile, live.map((r) => r.line).join('\n') + '\n');

  const nonSig = results.filter((r) => r && r.ok && !r.signature);
  console.log(`\n[pou] ${live.length}/${results.filter(Boolean).length} live+signature -> ${liveFile}`);
  if (nonSig.length) {
    console.log(`[pou] ${nonSig.length} answered but NO host signature (possible interception):`);
    nonSig.slice(0, 8).forEach((r) => console.log(`  ${r.line} ${r.status} ${r.ms}ms ${r.bytes}B t=${r.title || '-'} s=${JSON.stringify(r.snippet).slice(0, 90)}`));
  }
  const statuses = {};
  results.filter(Boolean).forEach((r) => { const k = r.ok ? 's' + r.status : 'err:' + String(r.error).split(':')[0]; statuses[k] = (statuses[k] || 0) + 1; });
  console.log('[pou] status histogram:', JSON.stringify(statuses));
})();
