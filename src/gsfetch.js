'use strict';
/*
 * gstatic asset server of last resort.
 *
 * The reCAPTCHA widget cannot render without the ~0.85 MB implementation that
 * lives on www.gstatic.com — the single least-reachable dependency of the whole
 * io.net flow on the free pool (measured: exits that carry id.io.net die on
 * gstatic minutes later). So the browser stops fetching it: the pilot pauses
 * every `*.gstatic.com/recaptcha/*` request through CDP Fetch and answers it
 * from this cache, which Node fills by racing many exits (short budgets, many
 * attempts) — the one place where slow retries do not hurt the page.
 *
 * Disk cache: outputs/gstatic-cache/<basename>
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, 'outputs', 'gstatic-cache');
const CAND = path.join(ROOT, 'outputs', 'cand.txt');
const UNION = path.join(ROOT, 'union-live.txt');

function sanitize(u) {
  try {
    const url = new URL(u);
    return url.hostname.replace(/[^\w.-]/g, '_') + '_' + url.pathname.replace(/[^\w.-]/g, '_') + (url.search ? '_' + Buffer.from(url.search).toString('hex').slice(0, 24) : '');
  } catch {
    return String(u).replace(/[^\w.-]/g, '_').slice(0, 180);
  }
}

function cachePath(u) {
  return path.join(CACHE, sanitize(u));
}

function loadCandidates(limit) {
  const seen = new Set();
  const out = [];
  for (const file of [CAND, UNION]) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const l of text.split(/\r?\n/)) {
      const line = l.trim();
      if (!line || line.startsWith('#') || line.startsWith('//') || seen.has(line)) continue;
      seen.add(line);
      out.push(line);
      if (limit && out.length >= limit) return out;
    }
  }
  return out;
}

function getOnce(line, url, timeoutMs) {
  return new Promise((resolve) => {
    const proxy = parseProxy(line);
    if (!proxy) return resolve({ ok: false, error: 'parse' });
    proxy.connectTimeoutMs = 8000;
    proxy.timeoutMs = timeoutMs;
    const u = new URL(url);
    const started = Date.now();
    const req = https.request(
      {
        method: 'GET',
        host: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        agent: createAgent(proxy),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0', Accept: 'application/javascript,*/*', 'Accept-Encoding': 'identity' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({ ok: res.statusCode === 200 && body.length > 1000, status: res.statusCode, body, ms: Date.now() - started, proxy: line });
        });
        res.on('error', (e) => resolve({ ok: false, error: 'res:' + e.message }));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ ok: false, error: e.message, ms: Date.now() - started }));
    req.end();
  });
}

/**
 * Race the pool in batches until the asset is in hand. Returns
 * {ok, body, from: 'cache'|proxyLine, ms}.
 */
async function get(url, { batch = 4, rounds = 12, timeoutMs = 15000, log = () => {} } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = cachePath(url);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) {
    return { ok: true, body: fs.readFileSync(file), from: 'cache', ms: 0 };
  }
  const candidates = loadCandidates(400);
  log(`gstatic fetch ${url.slice(0, 110)} over ${candidates.length} candidates`);
  let idx = 0;
  for (let r = 0; r < rounds && idx < candidates.length; r++) {
    const slice = candidates.slice(idx, idx + batch);
    idx += batch;
    const results = await Promise.all(slice.map((l) => getOnce(l, url, timeoutMs)));
    const win = results.find((x) => x.ok);
    if (win) {
      fs.writeFileSync(file, win.body);
      log(`gstatic got ${win.body.length}B via ${win.proxy} in ${win.ms}ms`);
      return { ok: true, body: win.body, from: win.proxy, ms: win.ms };
    }
    const errs = results.map((x) => x.error || 's' + x.status).join(',');
    log(`gstatic round ${r + 1}: all failed (${slice.length}) e.g. ${errs.slice(0, 120)}`);
  }
  return { ok: false, error: 'exhausted candidates' };
}

module.exports = { get, cachePath, sanitize, CACHE };

if (require.main === module) {
  const url = process.argv[2] || 'https://www.gstatic.com/recaptcha/releases/nY0xPItgwtlvjEjk2TqdwOQz/recaptcha__tr.js';
  get(url, { log: (...a) => console.log(...a) }).then((r) => {
    console.log(r.ok ? `OK ${r.body.length}B from ${r.from}` : `FAIL ${r.error}`);
    process.exit(r.ok ? 0 : 1);
  });
}
