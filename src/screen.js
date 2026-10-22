'use strict';
/*
 * Stability screen for io.net pilot lines — the browser phase needs the exit to
 * carry the app AND Google's reCAPTCHA assets for minutes, not seconds.
 *
 *   node src/screen.js --offset 0 --limit 120 --rounds 3 --gap 60
 *
 * Stage A (cheap):  id.io.net shell + www.google.com/recaptcha/api.js
 * Stage B:          www.gstatic.com recaptcha impl (≈0.85 MB)
 * An exit survives a round only if every stage passes; the warm list keeps
 * exits that pass `--need` rounds (default: all).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const ROOT = path.resolve(__dirname, '..');
const POOL = path.join(ROOT, 'union-live.txt');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const OFFSET = parseInt(arg('offset', '0'), 10);
const LIMIT = parseInt(arg('limit', '120'), 10);
const ROUNDS = parseInt(arg('rounds', '3'), 10);
const GAP = parseInt(arg('gap', '60'), 10) * 1000;
const CONC = Math.min(parseInt(arg('conc', '8'), 10), 8);
const NEED = parseInt(arg('need', String(ROUNDS)), 10);
const T = parseInt(arg('timeout', '25000'), 10);
const IN = arg('in', '');

const ENDPOINTS = [
  { name: 'id', url: 'https://id.io.net/', check: (s, b) => s === 200 && /io\.net/i.test(b) },
  { name: 'gapi', url: 'https://www.google.com/recaptcha/api.js?render=6LeJO8IpAAAAAAVEbi1p8k98zPCyErzsMwrXTNil', check: (s, b) => s === 200 && /grecaptcha/.test(b) },
  { name: 'gstatic', url: 'https://www.gstatic.com/recaptcha/releases/nY0xPItgwtlvjEjk2TqdwOQz/recaptcha__tr.js', check: (s, b) => (s === 200 || s === 206) && b.length > 10000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();

function get(proxy, url, timeoutMs) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const started = Date.now();
    const req = https.request(
      {
        method: 'GET',
        host: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        agent: createAgent(proxy),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0', Accept: '*/*', 'Accept-Encoding': 'identity' },
      },
      (res) => {
        let n = 0;
        let first = '';
        res.on('data', (c) => {
          n += c.length;
          if (first.length < 3000) first += c.toString('utf8', 0, Math.min(c.length, 3000 - first.length));
        });
        res.on('end', () => resolve({ ok: true, status: res.statusCode, bytes: n, first, ms: Date.now() - started }));
        res.on('error', (e) => resolve({ ok: false, error: 'res:' + e.message }));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout-' + timeoutMs)));
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

async function probeRound(proxy) {
  const out = {};
  for (const ep of ENDPOINTS) {
    if (ep.name === 'gstatic' && out.id && !out.id.ok) break; // cheap-first: skip heavy probe if app itself is dead
    if (ep.name === 'gstatic' && out.gapi && !out.gapi.ok) break;
    const r = await get(proxy, ep.url, T);
    out[ep.name] = r.ok ? { ...r, pass: ep.check(r.status, r.first) } : { ok: false, pass: false, error: r.error };
  }
  const pass = ENDPOINTS.every((ep) => out[ep.name] && out[ep.name].pass);
  return { pass, detail: out };
}

(async () => {
  const lines = (IN ? fs.readFileSync(IN, 'utf8') : fs.readFileSync(POOL, 'utf8'))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
  const slice = IN ? lines : lines.slice(OFFSET, OFFSET + LIMIT);
  console.log(`[screen] candidates=${slice.length} rounds=${ROUNDS} gap=${GAP / 1000}s need=${NEED} conc=${CONC}`);

  const state = new Map(); // line -> { passes, rounds: [] }
  slice.forEach((l) => state.set(l, { passes: 0, rounds: [] }));

  for (let r = 0; r < ROUNDS; r++) {
    if (r > 0) await sleep(GAP);
    const targets = r === 0 ? slice : slice.filter((l) => state.get(l).rounds[r - 1] && state.get(l).rounds[r - 1].pass);
    let i = 0;
    const workers = Array.from({ length: CONC }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= targets.length) return;
        const line = targets[idx];
        const proxy = parseProxy(line);
        if (!proxy) continue; // a line that cannot be parsed is not a reason to stop screening the rest
        proxy.connectTimeoutMs = 8000;
        proxy.timeoutMs = T;
        const res = await probeRound(proxy);
        const st = state.get(line);
        st.rounds[r] = res;
        if (res.pass) st.passes++;
        console.log(
          `[r${r + 1}] ${line} ${res.pass ? 'PASS' : 'fail'} (${st.passes}/${r + 1}) ` +
            Object.entries(res.detail).map(([k, v]) => `${k}:${v.pass ? 'ok' + (v.ms ? '@' + v.ms : '') : (v.error || 's' + v.status)}`).join(' ')
        );
      }
    });
    await Promise.all(workers);
    const aliveCount = [...state.values()].filter((s) => s.rounds[r] && s.rounds[r].pass).length;
    console.log(`[screen] round ${r + 1}/${ROUNDS} done; alive=${aliveCount}`);
    if (aliveCount === 0) break;
  }

  const warm = slice.filter((l) => state.get(l).passes >= NEED);
  const outDir = path.join(ROOT, 'outputs');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = ts().replace(/[:.]/g, '-');
  const jsonl = path.join(outDir, `screen-${OFFSET}-${stamp}.jsonl`);
  fs.writeFileSync(
    jsonl,
    slice.map((l) => JSON.stringify({ line: l, passes: state.get(l).passes, rounds: state.get(l).rounds })).join('\n') + '\n'
  );
  const warmFile = path.join(outDir, `warm-${OFFSET}-${stamp}.txt`);
  fs.writeFileSync(warmFile, warm.join('\n') + '\n');
  console.log(`\n[screen] warm ${warm.length}/${slice.length} (>=${NEED} passes) -> ${warmFile}`);
  warm.forEach((l) => console.log('  ' + l));
  process.exit(0);
})();
