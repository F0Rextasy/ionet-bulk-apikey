'use strict';
/*
 * HTTP-only completion for io.net accounts. After the browser phase POSTs
 * magic-auth/start (see run-account.js --until start + handoff.json), the rest
 * is plain HTTP through the same lane proxy:
 *
 *   OTP read (broker box) -> magic-auth/verify -> accessToken -> create API key
 *   (api.io.solutions, header "Token:") -> live verify (models + chat) ->
 *   keys.txt / accounts.json.
 *
 *   node src/http-finish.js --tag l1 --email <box> --box-token <id> [--proxy <line>]
 *   node src/http-finish.js --tag p1 --from-log <net.jsonl> [--proxy <line>]   (token already captured)
 *   node src/http-finish.js --tag p1 --token <accessToken> [--proxy <line>]
 *
 * Exit code 0 only when a live key was recorded.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };

const ROOT = path.join(__dirname);
const TAG = arg('tag', 'h');
const PROXY_LINE = arg('proxy', '');
const BROKER = arg('broker', 'http://127.0.0.1:9700');
const EMAIL = arg('email', '');
const BOX_TOKEN = arg('box-token', '');
const FROM_LOG = arg('from-log', '');
const KEY_NAME = arg('name', `k-${TAG}-${Date.now().toString(36)}`);
const OTP_TIMEOUT_MS = parseInt(arg('otp-timeout-ms', '300000'), 10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36';
const API_BASE = 'https://api.io.solutions/v1';
const MODELS_BASE = 'https://api.intelligence.io.solutions/api/v1';
const FRONTEND_VER = '1.150.0';
const CHAT_MODEL = arg('model', 'google/gemma-4-26b-a4b-it');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const mask = (k) => (k ? k.slice(0, 5) + '…' + k.slice(-4) : null);

const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (PROXY_LINE && !proxy) throw new Error('bad proxy line');
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }

function req(url, { method = 'GET', headers = {}, body = null, timeoutMs = 90000 } = {}) {
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

async function readOtp() {
  const deadline = Date.now() + OTP_TIMEOUT_MS;
  const seen = new Map(); // id -> code|null
  const t0 = Date.now();
  while (Date.now() < deadline) {
    let list = [];
    try { list = await brokerList(BOX_TOKEN); } catch (e) { console.log(ts(), `[otp] list error: ${e.message}`); }
    for (const m of list) {
      if (seen.has(m.id)) continue;
      let full = m;
      try { full = await brokerRead(m.id, BOX_TOKEN); } catch {}
      const blob = [full.subject, full.text, full.html, full.body, JSON.stringify(full).slice(0, 6000)].filter(Boolean).join('\n');
      const code = (blob.match(/\b(\d{6})\b/) || [])[1] || (blob.match(/\b(\d{4,8})\b/) || [])[1];
      seen.set(m.id, code || null);
      if (code) console.log(ts(), `[otp] mail id=${m.id} latency=${Math.round((Date.now() - t0) / 1000)}s code=${code}`);
    }
    const cands = [...seen.entries()].filter(([, c]) => c)
      .sort((a, b) => { try { return BigInt(String(b[0])) > BigInt(String(a[0])) ? 1 : -1; } catch { return String(b[0]) > String(a[0]) ? 1 : -1; } })
      .map(([id, code]) => ({ id, code }));
    if (cands.length) return cands;
    await sleep(2000);
  }
  throw new Error(`otp timeout after ${Math.round(OTP_TIMEOUT_MS / 1000)}s`);
}

// Find an accessToken-ish string anywhere in a cookie header array.
function tokenFromSetCookie(setCookie) {
  for (const c of setCookie || []) {
    const m = String(c).match(/^(ionet_authentication[^=]*)=([^;]+)/);
    if (!m) continue;
    try {
      const j = JSON.parse(decodeURIComponent(m[2]));
      const v = j && (j.state || j);
      const t = v && (v.token || v.accessToken);
      if (t && String(t).length > 20) return String(t);
    } catch {}
  }
  return null;
}
// Generic walk: any string value under a token-ish key, or a JWT-looking string.
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
function extractKeyCandidates(obj) {
  const out = [];
  const seen = new Set();
  const walk = (v, k) => {
    if (v == null) return;
    if (typeof v === 'string') { if (v.length >= 16 && v.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(v) && !/^https?:/.test(v) && !seen.has(v)) { seen.add(v); out.push({ k, v }); } return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, k)); return; }
    if (typeof v === 'object') { for (const kk of Object.keys(v)) walk(v[kk], kk); }
  };
  walk(obj, '');
  return out;
}

async function verifyKeyLive(key) {
  let models = null;
  for (let i = 0; i < 4; i++) {
    try {
      const m = await req(`${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 60000 });
      if (m.status === 200) { try { const j = JSON.parse(m.body); if (Array.isArray(j.data)) { models = j.data.length; break; } } catch {} }
      console.log(ts(), `[verify] models attempt ${i + 1}: ${m.status} ${String(m.body).slice(0, 120)}`);
    } catch (e) { console.log(ts(), `[verify] models error: ${e.message}`); }
    await sleep(4000);
  }
  let chat = null;
  try {
    const c = await req(`${MODELS_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { model: CHAT_MODEL, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64 }, timeoutMs: 90000 });
    try { const cj = JSON.parse(c.body); const msg = cj && cj.choices && cj.choices[0] && cj.choices[0].message; chat = msg ? (msg.content || msg.reasoning_content || 'ok') : null; } catch {}
    console.log(ts(), `[verify] chat -> ${c.status} ${String(c.body).slice(0, 160).replace(/\s+/g, ' ')}`);
  } catch (e) { console.log(ts(), `[verify] chat error: ${e.message}`); }
  return { live: models !== null && !!chat, models, chat };
}

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const RUN_DIR = path.join(ROOT, 'outputs', `http-${TAG}-${stamp}`);
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const log = (s) => { const l = `${ts()} ${s}`; console.log(l); try { fs.appendFileSync(path.join(RUN_DIR, 'http.log'), l + '\n'); } catch {} };

  log(`http-finish tag=${TAG} proxy=${PROXY_LINE || 'DIRECT'} email=${EMAIL || '-'} fromLog=${FROM_LOG || '-'}`);

  let token = arg('token', '');
  const TOKEN_FILE = arg('token-file', '');
  if (!token && TOKEN_FILE) {
    try { token = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); log(`token from file (${TOKEN_FILE}) len=${token.length}`); } catch (e) { log(`token-file error: ${e.message}`); }
  }
  let verifyArtifact = null;

  if (!token && FROM_LOG) {
    const lines = fs.readFileSync(FROM_LOG, 'utf8').split(/\r?\n/);
    let last = null;
    for (const l of lines) {
      if (!l.trim()) continue;
      let rec = null; try { rec = JSON.parse(l); } catch { continue; }
      if (typeof rec.body !== 'string') continue;
      const m = rec.body.match(/"accessToken"\s*:\s*"([^"]+)"/);
      if (m) last = { t: m[1], url: rec.url };
    }
    if (last) { token = last.t; log(`token from log (${last.url.slice(0, 70)}) len=${token.length}`); }
  }

  if (!token && EMAIL && BOX_TOKEN) {
    const cands = await readOtp();
    for (const otp of cands.slice(0, 3)) {
      const vr = await req('https://id.io.net/api/workos/magic-auth/verify', {
        method: 'POST',
        headers: { Origin: 'https://id.io.net', Referer: 'https://id.io.net/login', Accept: 'application/json' },
        body: { email: EMAIL, code: otp.code },
      });
      verifyArtifact = { code: otp.code, status: vr.status, body: vr.body.slice(0, 4000), cookies: (vr.headers['set-cookie'] || []).map((c) => String(c).slice(0, 300)) };
      fs.appendFileSync(path.join(RUN_DIR, 'verify.jsonl'), JSON.stringify({ at: ts(), ...verifyArtifact }) + '\n');
      log(`verify code=${otp.code} -> ${vr.status} ${String(vr.body).slice(0, 200)}`);
      if (vr.status < 400) {
        try { const j = JSON.parse(vr.body); token = findToken(j); } catch {}
        if (!token) token = tokenFromSetCookie(vr.headers['set-cookie']);
        if (token) { log(`accessToken len=${token.length} (${mask(token)})`); break; }
        // No token in the verify reply — mint one from the refresh endpoint with verify's cookies.
        const jar = (vr.headers['set-cookie'] || []).map((c) => String(c).split(';')[0]).join('; ');
        if (jar) {
          try {
            const rr = await req('https://cloud.io.net/api/workos/refresh', { headers: { Cookie: jar, Accept: 'application/json' } });
            log(`refresh -> ${rr.status} ${String(rr.body).slice(0, 160)}`);
            try { const j = JSON.parse(rr.body); token = findToken(j); } catch {}
            if (!token) token = tokenFromSetCookie(rr.headers['set-cookie']);
            if (token) { log(`accessToken len=${token.length} (${mask(token)}) via refresh`); break; }
          } catch (e) { log(`refresh error: ${e.message}`); }
        }
      }
      await sleep(500);
    }
  }

  if (!token) throw new Error('no accessToken (none in log, none from verify)');
  try { fs.writeFileSync(path.join(RUN_DIR, 'token.txt'), token); } catch {}

  let key = null;
  const headers = { Token: token, 'Frontend-Version': FRONTEND_VER, Accept: 'application/json', Origin: 'https://ai.io.net', Referer: 'https://ai.io.net/' };
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const variants = [
    { scopes: [], project: 'io-intelligence' },
    { scopes: ['all'], project: 'io-intelligence' },
    { scopes: [''], project: 'io-intelligence' },
    { scopes: [], project: 'default' },
    { scopes: ['models'], project: 'io-intelligence' },
    { scopes: ['all'], project: 'default' },
  ];
  const testKeyQuick = async (k) => {
    try {
      const m = await req(`${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${k}` }, timeoutMs: 30000 });
      if (m.status !== 200) return { live: false, note: `models ${m.status} ${String(m.body).slice(0, 80)}` };
      let n = null; try { const j = JSON.parse(m.body); if (Array.isArray(j.data)) n = j.data.length; } catch {}
      const c = await req(`${MODELS_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${k}` }, body: { model: CHAT_MODEL, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 64 }, timeoutMs: 60000 });
      let chat = null; try { const cj = JSON.parse(c.body); const msg = cj.choices && cj.choices[0] && cj.choices[0].message; chat = msg ? (msg.content || msg.reasoning_content || 'ok') : null; } catch {}
      return { live: !!chat, note: `chat ${c.status}`, models: n, chat };
    } catch (e) { return { live: false, note: 'err ' + e.message }; }
  };
  for (const v of variants) {
    try {
      const scopes = typeof v.scopes === 'string' ? [v.scopes] : v.scopes;
      const b = { name: KEY_NAME, description: KEY_NAME, expires_at: iso(30), project: v.project, scopes };
      const r = await req(`${API_BASE}/api-keys/`, { method: 'POST', headers, body: b });
      log(`POST /api-keys/ scopes=${JSON.stringify(scopes)} proj=${v.project} -> ${r.status} ${String(r.body).slice(0, 240)}`);
      fs.appendFileSync(path.join(RUN_DIR, 'apikey-create.jsonl'), JSON.stringify({ at: ts(), body: b, status: r.status, res: r.body.slice(0, 4000) }) + '\n');
      if (r.status === 401 || r.status === 403) { log('token rejected — aborting key creation'); break; }
      if (r.status < 300) {
        const km = String(r.body).match(/"value"\s*:\s*"([^"]+)"/);
        if (km) {
          const t = await testKeyQuick(km[1]);
          log(`  test ${mask(km[1])} -> live=${t.live} ${t.note}`);
          if (t.live) { key = km[1]; break; }
        } else {
          let j = null; try { j = JSON.parse(r.body); } catch {}
          for (const c of (j ? extractKeyCandidates(j) : [])) {
            if (c.v.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(c.v)) continue;
            const t = await testKeyQuick(c.v);
            log(`  test ${mask(c.v)} -> live=${t.live} ${t.note}`);
            if (t.live) { key = c.v; break; }
          }
          if (key) break;
        }
      }
      await sleep(400);
    } catch (e) { log(`create error: ${e.message}`); }
  }

  if (!key) {
    fs.writeFileSync(path.join(RUN_DIR, 'result.json'), JSON.stringify({ tag: TAG, ok: false, tokenLen: token.length, at: new Date().toISOString() }, null, 1));
    log('FAIL: no live key obtained');
    process.exit(2);
  }

  const v = await verifyKeyLive(key);
  const rec = {
    tag: TAG, address: EMAIL || null, boxToken: BOX_TOKEN || null, key, keyMasked: mask(key),
    at: new Date().toISOString(), proxy: PROXY_LINE, models: v.models, chat: v.chat ? String(v.chat).slice(0, 40) : null,
    live: v.live, via: 'http-finish',
  };
  fs.appendFileSync(path.join(ROOT, 'accounts.json'), JSON.stringify(rec) + '\n');
  if (v.live) { fs.appendFileSync(path.join(ROOT, 'keys.txt'), key + '\n'); log(`KEY LIVE — appended to keys.txt (${mask(key)})`); }
  else { fs.appendFileSync(path.join(ROOT, 'keys.pending.txt'), `${EMAIL || TAG}\t${key}\t${new Date().toISOString()}\n`); log('key NOT live — keys.pending.txt'); }
  fs.writeFileSync(path.join(RUN_DIR, 'result.json'), JSON.stringify({ ...rec, ok: v.live }, null, 1));
  log(`RESULT ${JSON.stringify({ ok: v.live, key: mask(key), models: v.models, chat: v.chat })}`);
  process.exit(v.live ? 0 : 2);
})().catch((e) => { console.error(ts(), 'FAIL', (e && e.message) || e); process.exit(1); });
