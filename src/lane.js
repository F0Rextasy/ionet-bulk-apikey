'use strict';
/*
 * io.net lane driver: one account per attempt, browser phase (--until start,
 * captcha solved externally via outputs/solve-<tag>/clicks.json) then HTTP-only
 * finish (OTP -> verify -> key -> live check). Assumes a fresh Chrome per
 * browser phase, killed afterwards; respects the global chrome<=60 gate.
 *
 *   node src/lane.js --tag LW --port 9411 --target 6 --proxy socks5://127.0.0.1:40000
 *   node src/lane.js --tag LP --port 9421 --target 8 --pick
 *   node src/lane.js --tag LD --port 9431 --target 2 --direct
 *
 * The proxy is OPTIONAL: with --proxy (one fixed exit) or --pick (a fresh exit
 * from the pool per attempt) every attempt runs on an exit; --pick turns into
 * DIRECT mode on its own when no pool file carries a single line, and --direct
 * forces it. Direct attempts spawn run-account.js / http-finish.js with no
 * --proxy at all, so the whole run leaves this machine directly.
 * Records every attempt to outputs/lane-<TAG>.jsonl; live state in
 * outputs/lane-<TAG>.state.json. Exits 0 when --target live keys reached.
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// Keep the lane alive when a CDP socket dies mid-run.
process.on('uncaughtException', (e) => console.log(`WARN uncaught: ${String(e && e.message).slice(0, 180)}`));

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const ROOT = path.join(__dirname);
const TAG = arg('tag', 'L');
const PORT = parseInt(arg('port', '9411'), 10);
const TARGET = parseInt(arg('target', '5'), 10);
const MAX_ATTEMPTS = parseInt(arg('max-attempts', String(Math.max(TARGET * 3, TARGET + 6))), 10);

// Run-shape presets (operator standard v3): the browser lane is single-Chrome by
// design, so `--preset` sets the pacing gap between attempts (explicit `--gap`
// wins); with no `--preset` today's timing is untouched.
const { presetArgv, resolvePreset } = require('./preset');
const PRESET = resolvePreset({ preset: presetArgv(argv), gap: arg('gap', null) == null ? null : parseFloat(arg('gap', null)) });
const GAP_MS = PRESET.gap == null ? null : Math.max(0, PRESET.gap) * 1000;
/** Proxy line for the live console: credentials masked. */
const maskExit = (raw) => (raw ? String(raw).replace(/:[^:@/]+@/, ':***@') : 'direct');
const FIXED = arg('proxy', '');
const PICK = argv.includes('--pick') || !FIXED;
const DIRECT = argv.includes('--direct');
/** Lines the pool files carried on the last pick(); 0 means there is no pool. */
let POOL_LINES = 0;
const UNION = arg('union-file', path.join(__dirname, 'union-live.txt'));
const NEW = arg('new-file', path.join(__dirname, 'new-live.txt'));
const PICKE = path.join(__dirname, 'pickexits.js');
const BROKER = 'http://127.0.0.1:9700';
const { parseProxy, fetchText } = require('./proxy.js');
const OUTJSONL = path.join(ROOT, 'outputs', `lane-${TAG}.jsonl`);
const TRACE = path.join(ROOT, 'outputs', `lane-${TAG}-trace.log`);
const STATE = path.join(ROOT, 'outputs', `lane-${TAG}.state.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();
function log(...a) { const l = `${ts()} ${a.join(' ')}`; console.log(l); try { fs.appendFileSync(TRACE, l + '\n'); } catch {} }
function setState(o) { try { fs.writeFileSync(STATE, JSON.stringify({ tag: TAG, port: PORT, target: TARGET, ...o, updatedAt: ts() }, null, 1)); } catch {} }

function chromeCount() {
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'").Count`], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
    const n = parseInt(String(r.stdout || '').trim(), 10);
    return Number.isNaN(n) ? -1 : n;
  } catch { return -1; }
}
async function guardChrome() {
  for (let i = 0; i < 40; i++) {
    const n = chromeCount();
    if (n < 0 || n <= 95) { log(`chrome preflight ok (${n})`); return; }
    log(`chrome=${n} > 95 — waiting 30s`);
    await sleep(30000);
  }
  throw new Error('chrome pressure persists');
}

// Use-time preflight: the pick screen can be minutes stale and Vercel-walled
// exits (`Security Checkpoint`, Kod 11) pass it. Re-test at the moment of use.
async function preflight(line) {
  const proxy = parseProxy(line);
  if (!proxy) return { ok: false, why: 'parse' };
  proxy.connectTimeoutMs = 4000; proxy.timeoutMs = 8000;
  try {
    const id = await fetchText(proxy, 'https://id.io.net/login', { timeoutMs: 8000 });
    if (/Vercel|Security Checkpoint|doğrulanamadı|Just a moment|verify you are human/i.test(id)) return { ok: false, why: 'walled' };
    if (!/Log in|io\.net/i.test(id) || String(id).length < 200) return { ok: false, why: 'no login page' };
    const gg = await fetchText(proxy, 'https://www.google.com/recaptcha/api.js', { timeoutMs: 8000 });
    if (!/recaptcha|grecaptcha/i.test(gg)) return { ok: false, why: 'no recaptcha api' };
    return { ok: true };
  } catch (e) { return { ok: false, why: e.message.slice(0, 60) }; }
}

async function pick() {
  const seen = new Set();
  const lines = [];
  // Private list (env RESIDENTIAL_PROXIES or outputs/residential-proxies.txt) takes
  // priority when present; free pool is the fallback.
  const resFile = process.env.RESIDENTIAL_PROXIES || path.join(ROOT, 'outputs', 'residential-proxies.txt');
  try {
    if (fs.existsSync(resFile)) {
      for (const l of fs.readFileSync(resFile, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (t && !t.startsWith('#') && !seen.has(t)) { seen.add(t); lines.push(t); } }
      if (seen.size) log(`private pool: ${seen.size} line(s) from ${resFile}`);
    }
  } catch {}
  const freeStart = lines.length;
  for (const f of [UNION, NEW]) {
    try {
      for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (t && !t.startsWith('#') && !seen.has(t)) { seen.add(t); lines.push(t); } }
    } catch {}
  }
  // Shuffle only the free tail; private order is preserved at the front.
  const tail = lines.slice(freeStart);
  for (let i = tail.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tail[i], tail[j]] = [tail[j], tail[i]]; }
  const ordered = lines.slice(0, freeStart).concat(tail);
  POOL_LINES = ordered.length; // 0 = not one pool file carries a line
  // Exits that already produced a failed attempt for this lane are dead weight:
  // drop them so scans don't rediscover the same walls.
  let bad = new Set();
  try { bad = new Set(fs.readFileSync(path.join(ROOT, 'outputs', `lane-${TAG}-bad.txt`), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); } catch {}

  // Fast batch path (batch pull + burn): fresh private/untried lines are
  // preflighted one at a time, in order, right after the sync refreshed the
  // file. Failed lines are blacklisted immediately — never re-probed.
  const resFresh = ordered.slice(0, freeStart).filter((l) => !bad.has(l));
  if (resFresh.length) {
    const batchDeadline = Date.now() + 4 * 60 * 1000;
    let tested = 0, passed = false;
    for (const line of resFresh.slice(0, 25)) {
      if (Date.now() > batchDeadline) { log('pick: batch window spent — falling back to deep scan'); break; }
      tested++;
      const pf = await preflight(line);
      if (pf.ok) { passed = true; log(`picked ${line} (batch preflight ok)`); log(`batch: pulled=${resFresh.length} tested=${tested} passed=1`); return line; }
      log(`pick: batch ${line} failed preflight (${pf.why}) — blacklisting`);
      try { fs.appendFileSync(path.join(ROOT, 'outputs', `lane-${TAG}-bad.txt`), line + '\n'); } catch {}
    }
    log(`batch: pulled=${resFresh.length} tested=${tested} passed=${passed ? 1 : 0}`);
  }

  const filtered = ordered.filter((l) => !bad.has(l));
  const tmp = path.join(ROOT, 'outputs', `pool-${TAG}.txt`);
  log(`pick: ${filtered.length} pool lines (${freeStart} private first, ${bad.size} known-bad dropped) -> ${path.basename(tmp)}`);
  let pool = filtered.slice();
  const plan = [60, 120, 240, 400, 650, 900, 1200, 1200];
  for (let round = 0; round < 12 && pool.length; round++) {
    fs.writeFileSync(tmp, pool.join('\n') + '\n');
    const limit = plan[round % plan.length];
    log(`pick round ${round + 1}: limit=${limit} (pool=${pool.length})`);
    const r = spawnSync('node', [PICKE, '--file', tmp, '--want', '1', '--limit', String(limit), '--conc', '8'], { windowsHide: true, encoding: 'utf8', timeout: 360000, cwd: path.join(ROOT, 'src') });
    const m = String(r.stdout || '').match(/^WIN (\S+)\s+ip=(\S+)/m);
    if (!m) { log('pick: no winner in that round'); await sleep(4000); continue; }
    const pf = await preflight(m[1]);
    if (pf.ok) { log(`picked ${m[1]} ip=${m[2]} (preflight ok)`); return m[1]; }
    log(`pick: ${m[1]} failed preflight (${pf.why}) — excluding and scanning deeper`);
    pool = pool.filter((l) => l !== m[1]);
    await sleep(2000);
  }
  return null;
}

function runC(cmd, args, { timeoutMs, logFile }) {
  return new Promise((resolve) => {
    // Child writes DIRECTLY to the trace file: no pipe to block on if this
    // driver's event loop ever stalls mid-child (froze two runs tonight).
    let out = null;
    let lastSize = 0;
    try { out = fs.openSync(logFile, 'a'); fs.writeSync(out, `\n=== ${ts()} ${cmd} ${args.join(' ')}\n`); lastSize = fs.statSync(logFile).size; } catch {}
    let done = false;
    const c = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', out || 'ignore', out || 'ignore'], windowsHide: true });
    let lastChange = Date.now();
    const wd = setInterval(() => {
      try {
        const s = fs.statSync(logFile).size;
        if (s !== lastSize) { lastSize = s; lastChange = Date.now(); }
        if (Date.now() - lastChange > 420000) {
          try { fs.appendFileSync(logFile, `\n=== STALL 420s without output — killing child\n`); } catch {}
          try { c.kill(); } catch {}
        }
      } catch {}
    }, 60000);
    const tmr = setTimeout(() => { try { fs.appendFileSync(logFile, `\n=== TIMEOUT after ${timeoutMs}ms — killing\n`); } catch {} try { c.kill(); } catch {} }, timeoutMs);
    const fin = (code, err) => {
      if (done) return;
      done = true;
      clearTimeout(tmr); clearInterval(wd);
      if (out != null) { try { fs.closeSync(out); } catch {} }
      resolve({ code, err });
    };
    c.on('exit', (code) => fin(code == null ? -1 : code));
    c.on('error', (e) => fin(-1, e.message));
  });
}

function killChrome() {
  try { spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'kill-chrome.ps1'), '-Port', String(PORT)], { encoding: 'utf8', timeout: 60000, windowsHide: true }); } catch {}
}
function newestDir(prefix) {
  try {
    const outs = path.join(ROOT, 'outputs');
    const ds = fs.readdirSync(outs).filter((d) => d.startsWith(prefix)).sort();
    return ds.length ? path.join(outs, ds[ds.length - 1]) : null;
  } catch { return null; }
}

(async () => {
  fs.appendFileSync(TRACE, `\n===== LANE ${TAG} start ${ts()} port=${PORT} target=${TARGET} mode=${DIRECT ? 'direct (forced)' : PICK ? 'pick' : 'fixed:' + FIXED} =====\n`);
  let live = 0;
  let attempts = 0;
  let direct = DIRECT; // flips on by itself when no pool file carries a line
  setState({ phase: 'boot', live, attempts });
  while (live < TARGET && attempts < MAX_ATTEMPTS) {
    attempts++;
    const tag = `${TAG}-${attempts}`;
    setState({ phase: 'gate', current: tag, live, attempts });
    try { await guardChrome(); } catch (e) { log('guard: ' + e.message); break; }
    setState({ phase: 'pick', current: tag, live, attempts });
    let proxy = null;
    if (!direct) {
      proxy = FIXED || await pick();
      if (!proxy) {
        if (!FIXED && POOL_LINES === 0) {
          direct = true;
          log('no pool file carries a line — switching to DIRECT mode (no proxy at all)');
        } else {
          log('NO EXIT AVAILABLE — backing off'); await sleep(20000); continue;
        }
      }
    }

    setState({ phase: 'browser', current: tag, proxy, live, attempts });
    killChrome(); // sweep any stale chrome from a crashed attempt on this port
    await sleep(1000);
    log(`[${tag}] browser phase via ${proxy || 'direct (no proxy)'}`);
    console.log(`… #${attempts} başladı (${maskExit(proxy)})`);
    const bp = await runC('node', ['src/run-account.js', '--tag', tag, '--port', String(PORT), ...(proxy ? ['--proxy', proxy] : []), '--until', 'start', '--solve-dir', `solve-${tag}`, '--solve-budget-ms', '840000', '--round-wait-ms', '360000'], { timeoutMs: 22 * 60 * 1000, logFile: TRACE });
    const runDir = newestDir(`run-${tag}-`);
    let handoff = null;
    try { handoff = JSON.parse(fs.readFileSync(path.join(runDir, 'handoff.json'), 'utf8')); } catch {}
    killChrome();
    let box = handoff;
    if (!box && runDir) {
      // Browser died before handoff — but if sendCode already fired, the OTP is
      // in the attempt's broker box (recover via inboxes.jsonl by tag).
      try {
        const net = fs.readFileSync(path.join(runDir, 'net.jsonl'), 'utf8');
        if (net.includes('magic-auth/start')) {
          const rows = fs.readFileSync(path.join(ROOT, 'outputs', 'inboxes.jsonl'), 'utf8').trim().split('\n');
          for (let i = rows.length - 1; i >= 0; i--) {
            try {
              const r = JSON.parse(rows[i]);
              if (r.tag === tag) { box = { email: r.address, boxToken: r.token }; log(`[${tag}] recovery: sendCode fired before browser death — finishing via box ${r.address}`); break; }
            } catch {}
          }
          if (box) {
            // False-positive guard: the request being SENT does not mean the
            // server processed it (measured: sent, no mail, 5-min burn). Only
            // commit to the HTTP leg if a mail actually lands within 90 s.
            let got = false;
            const dl = Date.now() + 90000;
            while (Date.now() < dl && !got) {
              try {
                const t = await fetchText(null, `${BROKER}/list?token=${encodeURIComponent(box.boxToken)}`, { timeoutMs: 30000 });
                const j = JSON.parse(t);
                const list = Array.isArray(j) ? j : (j && (j.messages || j.data)) || [];
                if (list.length) got = true;
              } catch {}
              if (!got) await sleep(5000);
            }
            if (!got) { log(`[${tag}] recovery gate: no mail in 90 s — treating as no-handoff`); box = null; }
          }
        }
      } catch {}
    }
    if (!box) {
      log(`[${tag}] no handoff (browser exit=${bp.code}) — attempt failed`);
      try { if (proxy) fs.appendFileSync(path.join(ROOT, 'outputs', `lane-${TAG}-bad.txt`), proxy + '\n'); } catch {}
      fs.appendFileSync(OUTJSONL, JSON.stringify({ tag, attempt: attempts, proxy, ok: false, err: 'no-handoff', exit: bp.code, at: ts() }) + '\n');
      setState({ phase: 'fail', current: tag, proxy, live, attempts });
      await sleep(3000);
      continue;
    }
    setState({ phase: 'http', current: tag, proxy, live, attempts });
    log(`[${tag}] http finish (box ${box.email})`);
    const hfr = await runC('node', ['src/http-finish.js', '--tag', tag, '--email', box.email, '--box-token', box.boxToken, ...(proxy ? ['--proxy', proxy] : [])], { timeoutMs: 7 * 60 * 1000, logFile: TRACE });
    const hdir = newestDir(`http-${tag}-`);
    let result = null;
    try { result = JSON.parse(fs.readFileSync(path.join(hdir, 'result.json'), 'utf8')); } catch {}
    const ok = !!(result && result.ok);
    if (ok) live++;
    else { try { if (proxy) fs.appendFileSync(path.join(ROOT, 'outputs', `lane-${TAG}-bad.txt`), proxy + '\n'); } catch {} }
    fs.appendFileSync(OUTJSONL, JSON.stringify({ tag, attempt: attempts, proxy, ok, live, keyMasked: result ? result.keyMasked : null, models: result ? result.models : null, exit: hfr.code, at: ts() }) + '\n');
    setState({ phase: ok ? 'live' : 'fail', current: tag, proxy, live, attempts });
    log(`[${tag}] ${ok ? 'LIVE KEY' : 'failed'} — lane live=${live}/${TARGET}`);
    if (ok) console.log(`✓ #${attempts} KEY ALINDI: ${(result && result.keyMasked) || '(key)'}   [${live} ok / ${attempts} deneme]`);
    else console.log(`✗ #${attempts} key yok: ${(result && (result.error || result.note)) || 'no key'}`);
    await sleep(2000);
    if (GAP_MS) await sleep(GAP_MS);
  }
  setState({ phase: 'done', live, attempts, finishedAt: ts() });
  log(`LANE ${TAG} DONE live=${live} attempts=${attempts}`);
  console.log(`LANE ${live}/${TARGET} OK`);
  process.exit(live >= TARGET ? 0 : 3);
})().catch((e) => { log('LANE CRASH ' + ((e && e.message) || e)); setState({ phase: 'crash' }); process.exit(1); });
