'use strict';
/* Scope brute-forcer: one command that finishes an io.net login over pure HTTP and
 * then tries POST /api-keys/ across candidate scope/project values, live-testing
 * every created key. On the first LIVE key: appends keys.txt + accounts.json.
 *
 *   node src/scope-try.js --email <box> --box-token <id> --proxy <line> [--tag p1d]
 *   node src/scope-try.js --token-file <path> --proxy <line> [--tag p1d]
 *
 * Token TTL is 5 min — the whole loop (verify + N creates + N tests) must fit.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const ROOT = path.resolve(__dirname, '..');
const TAG = arg('tag', 'st');
const PROXY_LINE = arg('proxy', '');
const BROKER = arg('broker', 'http://127.0.0.1:9700');
const EMAIL = arg('email', '');
const BOX_TOKEN = arg('box-token', '');
const TOKEN_FILE = arg('token-file', '');
const OTP_TIMEOUT_MS = parseInt(arg('otp-timeout-ms', '240000'), 10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
const API_BASE = 'https://api.io.solutions/v1';
const MODELS_BASE = 'https://api.intelligence.io.solutions/api/v1';
const FRONTEND_VER = '1.150.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const mask = (k) => (k ? k.slice(0, 10) + '…' + k.slice(-4) : null);

const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (PROXY_LINE && !proxy) throw new Error('bad proxy');
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }

function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const isLocal = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
    const payload = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { 'User-Agent': UA, ...headers };
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-type')) hs['Content-Type'] = 'application/json';
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-length')) hs['Content-Length'] = payload.length;
    const r = lib.request({ method, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, headers: hs, agent: (proxy && !isLocal) ? createAgent(proxy) : undefined }, (res) => {
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
async function brokerList(token) {
  const t = await req(`${BROKER}/list?token=${encodeURIComponent(token)}`, { timeoutMs: 60000 });
  const j = JSON.parse(t.body);
  return Array.isArray(j) ? j : (j && (j.messages || j.data)) || [];
}
async function brokerRead(id, token) {
  const t = await req(`${BROKER}/read?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, { timeoutMs: 60000 });
  return JSON.parse(t.body);
}
async function readOtpCandidates() {
  const deadline = Date.now() + OTP_TIMEOUT_MS;
  const seen = new Map();
  while (Date.now() < deadline) {
    let list = [];
    try { list = await brokerList(BOX_TOKEN); } catch (e) { console.log(ts(), `[otp] list error: ${e.message}`); }
    for (const m of list) {
      if (seen.has(m.id)) continue;
      let full = m;
      try { full = await brokerRead(m.id, BOX_TOKEN); } catch {}
      const blob = [full.subject, full.text, full.html, full.body, JSON.stringify(full).slice(0, 6000)].filter(Boolean).join('\n');
      const code = (blob.match(/\b(\d{6})\b/) || [])[1];
      seen.set(m.id, code && !/^0+$/.test(code) ? code : null);
      if (code) console.log(ts(), `[otp] mail id=${m.id} code=${code}${/^0+$/.test(code) ? ' (skipped, all-zero)' : ''}`);
    }
    const cands = [...seen.entries()].filter(([, c]) => c)
      .sort((a, b) => { try { return BigInt(String(b[0])) > BigInt(String(a[0])) ? 1 : -1; } catch { return String(b[0]) > String(a[0]) ? 1 : -1; } })
      .map(([id, code]) => ({ id, code }));
    if (cands.length) return cands;
    await sleep(2000);
  }
  throw new Error('otp timeout');
}
function findToken(obj) {
  let best = null;
  const walk = (v, k) => {
    if (best) return;
    if (typeof v === 'string') {
      if (v.length > 40 && /^eyJ[A-Za-z0-9_-]+\./.test(v)) best = v;
      else if (v.length > 20 && /token/i.test(k) && v.length < 4000) best = v;
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, k)); return; }
    if (v && typeof v === 'object') { for (const kk of Object.keys(v)) walk(v[kk], kk); }
  };
  walk(obj, '');
  return best;
}
function tokenFromSetCookie(setCookie) {
  for (const c of setCookie || []) {
    const m = String(c).match(/^(ionet_authentication[^=]*)=([^;]+)/);
    if (!m) continue;
    try { const j = JSON.parse(decodeURIComponent(m[2])); const v = j && (j.state || j); const t = v && (v.token || v.accessToken); if (t && String(t).length > 20) return String(t); } catch {}
  }
  return null;
}

(async () => {
  const RUN_DIR = path.join(ROOT, 'outputs', `scope-${TAG}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const log = (s) => { const l = `${ts()} ${s}`; console.log(l); try { fs.appendFileSync(path.join(RUN_DIR, 'scope.log'), l + '\n'); } catch {} };

  let token = '';
  if (TOKEN_FILE) { try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch {} }
  if (!token && EMAIL && BOX_TOKEN) {
    const cands = await readOtpCandidates();
    for (const otp of cands.slice(0, 3)) {
      const vr = await req('https://id.io.net/api/workos/magic-auth/verify', {
        method: 'POST',
        headers: { Origin: 'https://id.io.net', Referer: 'https://id.io.net/login', Accept: 'application/json' },
        body: { email: EMAIL, code: otp.code },
      });
      log(`verify code=${otp.code} -> ${vr.status} ${String(vr.body).slice(0, 160)}`);
      if (vr.status < 400) {
        try { const j = JSON.parse(vr.body); token = findToken(j); } catch {}
        if (!token) token = tokenFromSetCookie(vr.headers['set-cookie']);
        if (token) break;
      }
    }
  }
  if (!token) throw new Error('no accessToken');
  fs.writeFileSync(path.join(RUN_DIR, 'token.txt'), token, { mode: 0o600 });
  log(`token len=${token.length} (${mask(token)}) — TTL 5 min; brute-forcing scopes`);

  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const headers = { Token: token, 'Frontend-Version': FRONTEND_VER, Accept: 'application/json', Origin: 'https://ai.io.net', Referer: 'https://ai.io.net/' };
  const variants = [
    { scopes: ['all'], project: 'default' },
    { scopes: ['models'], project: 'default' },
    { scopes: ['intelligence'], project: 'default' },
    { scopes: ['*'], project: 'default' },
    { scopes: ['inference'], project: 'default' },
    { scopes: ['chat'], project: 'default' },
    { scopes: ['models', 'agents'], project: 'default' },
    { scopes: ['default'], project: 'default' },
    { scopes: ['read'], project: 'default' },
    { scopes: [], project: 'intelligence' },
    { scopes: ['all'], project: 'intelligence' },
    { scopes: [], project: 'io-intelligence' },
  ];

  const testQuick = async (key) => {
    try {
      const m = await req(`${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 30000 });
      if (m.status !== 200) return { live: false, note: `models ${m.status} ${String(m.body).slice(0, 80)}` };
      let n = null; try { const j = JSON.parse(m.body); if (Array.isArray(j.data)) n = j.data.length; } catch {}
      const c = await req(`${MODELS_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { model: 'meta-llama/Llama-3.3-70B-Instruct', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8 }, timeoutMs: 60000 });
      let chat = null; try { const cj = JSON.parse(c.body); chat = cj.choices && cj.choices[0] && cj.choices[0].message && cj.choices[0].message.content; } catch {}
      return { live: !!chat, note: `chat ${c.status}`, models: n, chat };
    } catch (e) { return { live: false, note: 'err ' + e.message }; }
  };

  for (const v of variants) {
    if (Date.now() > 0) {
      // token expiry guard: JWTs are 5 min; parse exp from the bearer token itself
      try {
        const p = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        if (p.exp && Date.now() / 1000 > p.exp - 20) { log('token near expiry — stopping variant loop'); break; }
      } catch {}
    }
    const name = `k-${TAG}-${Date.now().toString(36)}`;
    const body = { name, description: name, expires_at: iso(30), project: v.project, scopes: v.scopes };
    let r;
    try { r = await req(`${API_BASE}/api-keys/`, { method: 'POST', headers, body }); } catch (e) { log(`create(${JSON.stringify(v.scopes)}/${v.project}) err ${e.message}`); continue; }
    log(`create scopes=${JSON.stringify(v.scopes)} proj=${v.project} -> ${r.status} ${String(r.body).slice(0, 160)}`);
    fs.appendFileSync(path.join(RUN_DIR, 'creates.jsonl'), JSON.stringify({ at: ts(), variant: v, status: r.status, res: r.body.slice(0, 2000) }) + '\n');
    if (r.status === 401 || r.status === 403) { log('token rejected — abort'); break; }
    if (r.status < 300) {
      const km = String(r.body).match(/"value"\s*:\s*"([^"]+)"/);
      const key = km ? km[1] : null;
      if (!key) { log('201 but no value field'); continue; }
      const t = await testQuick(key);
      log(`  test ${mask(key)} -> live=${t.live} ${t.note}`);
      if (!t.live) {
        // propagation chance: one retry after a short wait
        await sleep(12000);
        const t2 = await testQuick(key);
        log(`  retest ${mask(key)} -> live=${t2.live} ${t2.note}`);
        if (t2.live) {
          fs.appendFileSync(path.join(ROOT, 'keys.txt'), key + '\n');
          fs.appendFileSync(path.join(ROOT, 'accounts.json'), JSON.stringify({ tag: TAG, address: EMAIL || null, boxToken: BOX_TOKEN || null, key, keyMasked: mask(key), at: new Date().toISOString(), proxy: PROXY_LINE, models: t2.models, chat: t2.chat ? String(t2.chat).slice(0, 40) : null, live: true, via: 'scope-try', scopes: v.scopes, project: v.project }) + '\n');
          log(`KEY LIVE — appended (${mask(key)}) scopes=${JSON.stringify(v.scopes)}`);
          process.exit(0);
        }
        continue;
      }
      fs.appendFileSync(path.join(ROOT, 'keys.txt'), key + '\n');
      fs.appendFileSync(path.join(ROOT, 'accounts.json'), JSON.stringify({ tag: TAG, address: EMAIL || null, boxToken: BOX_TOKEN || null, key, keyMasked: mask(key), at: new Date().toISOString(), proxy: PROXY_LINE, models: t.models, chat: t.chat ? String(t.chat).slice(0, 40) : null, live: true, via: 'scope-try', scopes: v.scopes, project: v.project }) + '\n');
      log(`KEY LIVE — appended (${mask(key)}) scopes=${JSON.stringify(v.scopes)}`);
      process.exit(0);
    }
    await sleep(300);
  }
  log('no live key across variants');
  process.exit(2);
})().catch((e) => { console.error(ts(), 'FAIL', (e && e.message) || e); process.exit(1); });
