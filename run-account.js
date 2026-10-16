'use strict';
/*
 * io.net account runner — ONE account, end to end, in one process so the timing
 * discipline holds: captcha solved first, e-mail submitted with a fresh token,
 * OTP read from the mailbox and entered within its window, then one API key
 * created and live-verified.
 *
 *   node src/run-account.js --tag a1 --port 9401 --proxy socks5://127.0.0.1:40000
 *   node src/run-account.js --tag a1 --port 9401 --proxy socks5://127.0.0.1:40000 --attach   (resume: phase auto-detected)
 *
 * Phases: start (nav+auth modal) -> email (type+CAPTCHA solve+submit) -> otp (read+enter)
 *         -> key (create via api.io.solutions REST with page accessToken, UI fallback) -> verify
 *
 * The CAPTCHA is solved interactively: every challenge round is written to
 * outputs/<solve-dir>/ as round-N.png + state.json and the agent answers with
 * clicks.json ({"tiles":[...],"verify":true} or {"refresh":true}).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const B = require('./browser');
const gs = require('./gsfetch');
const { parseProxy, browserUrl, attachProxyAuth, fetchText, createAgent } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const flag = (n) => argv.includes('--' + n);

const ROOT = path.join(__dirname);
const PORT = parseInt(arg('port', '9401'), 10);
const TAG = arg('tag', 'a');
const PROXY_LINE = arg('proxy', '');
const BROKER = arg('broker', 'http://127.0.0.1:9700');
const SOLVE_DIR = path.join(ROOT, 'outputs', arg('solve-dir', 'solve-' + TAG));
const EMAIL_OVERRIDE = arg('email', '');
const EMAIL_TOKEN = arg('email-token', '');
const PHASE_OVERRIDE = arg('phase', 'auto'); // auto|start|email|otp|key
const UNTIL = arg('until', 'key'); // auth|otp|key
const ATTACH = flag('attach');
const KEEP = flag('keep-chrome') || ATTACH;
const SOLVE_BUDGET_MS = parseInt(arg('solve-budget-ms', '600000'), 10);
const OTP_TIMEOUT_MS = parseInt(arg('otp-timeout-ms', '300000'), 10);
const ROUND_WAIT_MS = parseInt(arg('round-wait-ms', '300000'), 10);
const API_BASE = 'https://api.io.solutions/v1';
const MODELS_BASE = 'https://api.intelligence.io.solutions/api/v1';
const FRONTEND_VER = '1.150.0';
const IMPL_URL = 'https://www.gstatic.com/recaptcha/releases/nY0xPItgwtlvjEjk2TqdwOQz/recaptcha__tr.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const mask = (k) => (k ? k.slice(0, 5) + '…' + k.slice(-4) : null);

let RUN_DIR = null;
const T = {}; // phase timings
function t0(k) { T[k] = T[k] || {}; T[k].start = Date.now(); }
function t1(k) { if (T[k]) { T[k].ms = Date.now() - T[k].start; } }
function initRunDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  RUN_DIR = path.join(ROOT, 'outputs', `run-${TAG}-${stamp}`);
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.mkdirSync(SOLVE_DIR, { recursive: true });
}
function log(stage, msg) {
  const line = `${ts()} [${stage}] ${msg}`;
  console.log(line);
  if (RUN_DIR) { try { fs.appendFileSync(path.join(RUN_DIR, 'run.log'), line + '\n'); } catch {} }
}
function ev(obj) {
  if (RUN_DIR) { try { fs.appendFileSync(path.join(RUN_DIR, 'events.jsonl'), JSON.stringify({ at: ts(), ...obj }) + '\n'); } catch {} }
}

// ---------- mailbox ----------
async function brokerCreate() {
  log('mail', 'broker /create (folder=ionet-bulk)…');
  const text = await fetchText(null, `${BROKER}/create`, { method: 'POST', body: { folder: 'ionet-bulk' }, timeoutMs: 150000 });
  const j = JSON.parse(text);
  if (!j.address || !j.token) throw new Error('broker create odd reply: ' + String(text).slice(0, 150));
  const box = { address: j.address, token: String(j.token), source: 'broker' };
  fs.appendFileSync(path.join(ROOT, 'outputs', 'inboxes.jsonl'), JSON.stringify({ ...box, tag: TAG, at: new Date().toISOString() }) + '\n');
  return box;
}
async function brokerList(token) {
  const text = await fetchText(null, `${BROKER}/list?token=${encodeURIComponent(token)}`, { timeoutMs: 90000 });
  const j = JSON.parse(text);
  return Array.isArray(j) ? j : (j && (j.messages || j.data)) || [];
}
async function brokerRead(id, token) {
  const text = await fetchText(null, `${BROKER}/read?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, { timeoutMs: 90000 });
  return JSON.parse(text);
}
const seenMail = new Set();
async function waitForCode(box, { timeoutMs = 300000, tag = 'otp' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let list = [];
    try { list = await brokerList(box.token); } catch (e) { log(tag, `list error: ${e.message}`); }
    for (const m of list) {
      if (seenMail.has(m.id)) continue;
      let full = m;
      try { full = await brokerRead(m.id, box.token); } catch (e) { log(tag, `read error: ${e.message}`); }
      const blob = [full.subject, full.text, full.html, full.body, JSON.stringify(full).slice(0, 4000)].filter(Boolean).join('\n');
      fs.appendFileSync(path.join(RUN_DIR, 'mail.jsonl'), JSON.stringify({ at: ts(), id: m.id, subject: full.subject, from: full.from, blob: blob.slice(0, 6000) }) + '\n');
      const code = (blob.match(/\b(\d{6})\b/) || [])[1] || (blob.match(/\b(\d{4,8})\b/) || [])[1];
      if (code) {
        seenMail.add(m.id);
        log(tag, `mail id=${m.id} subj=${String(full.subject || '').slice(0, 70)} code=${code}`);
        return { code, id: m.id, at: Date.now() };
      }
      seenMail.add(m.id);
    }
    await sleep(2000);
  }
  throw new Error(`otp-timeout after ${Math.round(timeoutMs / 1000)}s`);
}

// ---------- net/console logging ----------
function makeNetLogger(cdp, sessionId, dir) {
  const netFile = fs.createWriteStream(path.join(dir, 'net.jsonl'), { flags: 'a' });
  const net = { file: netFile, lines: [] };
  const interesting = (u) => /io\.solutions|io\.net|recaptcha|gstatic|google\.com\/recaptcha|grecaptcha/i.test(u);
  const bodyWorthy = (u, status) => interesting(u) && (status >= 400 || /passwordless|otp|login|captcha|api-keys|keys|verify|magic|workos|send|code|user/i.test(u));
  const push = (rec) => { const l = JSON.stringify(rec); netFile.write(l + '\n'); net.lines.push(rec); if (net.lines.length > 4000) net.lines.splice(0, 1000); };
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (p) => {
    if (!p.request.url || p.request.url.startsWith('data:')) return;
    const rec = { t: 'req', id: p.requestId, m: p.request.method, url: p.request.url.slice(0, 500), at: ts() };
    if (p.request.postData) rec.post = p.request.postData.slice(0, 3000);
    reqs.set(p.requestId, rec);
    if (interesting(p.request.url)) push(rec);
  }, sessionId);
  cdp.on('Network.responseReceived', (p) => {
    if (!p.response || !p.response.url) return;
    if (interesting(p.response.url)) {
      push({ t: 'res', id: p.requestId, status: p.response.status, mime: p.response.mimeType, url: p.response.url.slice(0, 500), at: ts() });
    }
    if (bodyWorthy(p.response.url, p.response.status)) {
      cdp.send('Network.getResponseBody', { requestId: p.requestId }, sessionId).then((r) => {
        push({ t: 'body', status: p.response.status, url: p.response.url.slice(0, 300), body: String(r.body || '').slice(0, 8000), at: ts() });
      }).catch(() => {});
    }
  }, sessionId);
  cdp.on('Network.loadingFailed', (p) => {
    const rec = reqs.get(p.requestId);
    if (rec) push({ t: 'fail', id: p.requestId, err: p.errorText, url: rec.url, at: ts() });
  }, sessionId);
  return net;
}
function makeConsoleLogger(cdp, sessionId, dir) {
  const file = fs.createWriteStream(path.join(dir, 'console.jsonl'), { flags: 'a' });
  cdp.on('Runtime.consoleAPICalled', (p) => {
    try {
      const args = (p.args || []).map((a) => (a.value !== undefined ? a.value : a.description || a.type)).join(' ');
      file.write(JSON.stringify({ t: 'console', level: p.type, text: String(args).slice(0, 1000) }) + '\n');
    } catch {}
  }, sessionId);
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    file.write(JSON.stringify({ t: 'exception', text: String(d.text || '') + ' ' + String((d.exception && d.exception.description) || '').slice(0, 600) }) + '\n');
  }, sessionId);
  return file;
}

// ---------- DOM helpers (proven in pilot.js) ----------
const DOM_SNAP = `(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const rect = (e) => { const r = e.getBoundingClientRect(); return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; };
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return st.display!=='none' && st.visibility!=='hidden' && st.opacity!=='0' && r.width>2 && r.height>2; };
  return {
    url: location.href, title: document.title, ready: document.readyState,
    inputs: q('input').filter(vis).slice(0,30).map(i=>({type:i.type,name:i.name,id:i.id,ph:(i.placeholder||'').slice(0,50),ml:i.maxLength,val:(i.type==='password'?'*'.repeat(6):String(i.value||'').slice(0,40)),rect:rect(i)})),
    buttons: q('button, a, [role=button], input[type=submit], input[type=button]').filter(vis).slice(0,90).map(e=>({tag:e.tagName,text:((e.innerText||e.value||e.getAttribute('aria-label')||'').trim()).slice(0,70),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',href:(e.getAttribute&&e.getAttribute('href')||'').slice(0,80),rect:rect(e)})),
    iframes: q('iframe').filter(vis).map(f=>({src:(f.src||'').slice(0,180),t:f.title||'',rect:rect(f)})),
    grecaptcha: { fn: typeof window.grecaptcha, render: typeof (window.grecaptcha && window.grecaptcha.render), cfgClients: window.___grecaptcha_cfg ? Object.keys(window.___grecaptcha_cfg.clients||{}).length : null },
    recaptchaResp: (()=>{ const t=q('textarea[name="g-recaptcha-response"], #g-recaptcha-response')[0]; return t? {len:(t.value||'').length}:null })(),
    cookieToken: (()=>{ try{ for(const c of document.cookie.split(/;\\s*/)){ const m=c.match(/^(ionet_authentication[^=]*)=(.*)$/); if(m){ const j=JSON.parse(decodeURIComponent(m[2])); const v=j&&(j.state||j); const t2=v&&(v.token||v.accessToken); if(t2) return String(t2).length; } } }catch(e){} return 0; })(),
    bodyText: (document.body?document.body.innerText:'').slice(0,1800)
  };
})()`;
async function snap(cdp, sessionId, tag, { shot = true } = {}) {
  const dom = await B.evalJs(cdp, sessionId, DOM_SNAP).catch((e) => ({ err: e.message }));
  ev({ t: 'snap', tag, dom: { url: dom.url, title: dom.title, inputs: dom.inputs, buttons: dom.buttons && dom.buttons.slice(0, 40), cookieToken: dom.cookieToken, bodyTail: String(dom.bodyText || '').slice(-400) } });
  if (shot) { try { await B.screenshot(cdp, sessionId, path.join(RUN_DIR, `shot-${tag}.png`)); } catch (e) { ev({ t: 'shot-err', tag, err: e.message }); } }
  log('dom', `${tag}: url=${(dom.url || '').slice(0, 110)} inputs=${dom.inputs ? dom.inputs.length : '?'} btns=${dom.buttons ? dom.buttons.length : '?'} iframes=${dom.iframes ? dom.iframes.length : '?'} gresp=${dom.recaptchaResp ? dom.recaptchaResp.len : '-'} cookieTok=${dom.cookieToken}`);
  if (dom.bodyText) log('dom', `  text: ${String(dom.bodyText).replace(/\s+/g, ' ').slice(0, 260)}`);
  return dom;
}
async function clickRect(cdp, sessionId, r, tag) {
  const x = r.x + Math.max(2, Math.min(r.w - 2, r.w / 2));
  const y = r.y + Math.max(2, Math.min(r.h - 2, r.h / 2));
  log('click', `${tag} at ${Math.round(x)},${Math.round(y)}`);
  await B.clickAt(cdp, sessionId, x, y);
}
async function findClickable(cdp, sessionId, regexSource, { tag = null, exclude = null, scroll = true } = {}) {
  const expr = `(() => {
    const re = new RegExp(${JSON.stringify(regexSource)}, 'i');
    const rx = ${exclude ? `new RegExp(${JSON.stringify(exclude)}, 'i')` : 'null'};
    const q = (s) => [...document.querySelectorAll(s)];
    const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return st.display!=='none' && st.visibility!=='hidden' && r.width>2 && r.height>2; };
    const els = q('button, a, [role=button], input[type=submit], input[type=button], div[role=button]');
    for (const e of els) {
      if (!vis(e)) continue;
      if (${tag ? `e.tagName !== ${JSON.stringify(tag.toUpperCase())}` : 'false'}) continue;
      const t = ((e.innerText || e.value || e.getAttribute('aria-label') || '')).trim();
      if (rx && rx.test(t)) continue;
      if (re.test(t)) { ${scroll ? "e.scrollIntoView({block:'center'});" : ''} const r = e.getBoundingClientRect(); return { text: t.slice(0, 80), tag: e.tagName, disabled: !!e.disabled, rect: {x:r.x, y:r.y, w:r.width, h:r.height} }; }
    }
    return null;
  })()`;
  return B.evalJs(cdp, sessionId, expr).catch(() => null);
}
async function setInput(cdp, sessionId, selectorExpr, value, tag) {
  const rect = await B.evalJs(cdp, sessionId, `(() => { const e = (${selectorExpr}); if (!e) return null; e.scrollIntoView({block:'center'}); e.focus(); e.select && e.select(); const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`).catch(() => null);
  if (!rect) { log('type', `${tag}: selector matched nothing`); return false; }
  await B.clickAt(cdp, sessionId, rect.x + Math.min(rect.w / 2, 120), rect.y + rect.h / 2);
  await sleep(150);
  await B.evalJs(cdp, sessionId, `(() => { const e = (${selectorExpr}); e.focus(); e.select && e.select(); return true; })()`).catch(() => {});
  await cdp.send('Input.insertText', { text: value }, sessionId);
  await sleep(180);
  const got = await B.evalJs(cdp, sessionId, `(() => { const e = (${selectorExpr}); return e ? String(e.value||'') : null; })()`).catch(() => null);
  log('type', `${tag}: set "${value.length > 30 ? value.slice(0, 26) + '…' : value}" -> field="${got}"`);
  return got !== null && got !== '';
}
const EMAIL_SELECTOR = `[...document.querySelectorAll('input')].filter(i => { const r=i.getBoundingClientRect(); const st=getComputedStyle(i); return st.display!=='none' && r.width>2; }).find(i => (i.type==='email') || /e-?mail/i.test(i.name+i.id+i.placeholder+i.autocomplete)) || [...document.querySelectorAll('input[type=text]')].filter(i=>{const r=i.getBoundingClientRect();return r.width>2})[0] || null`;
const CODE_SELECTOR = `document.querySelector('input[name="code"]') || [...document.querySelectorAll('input')].find(i=>i.maxLength===6||i.maxLength===1) || null`;
async function pressEnter(cdp, sessionId) {
  for (const type of ['keyDown', 'char', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: type === 'char' ? '\r' : undefined }, sessionId);
    await sleep(40);
  }
}
async function captchaState(cdp, sessionId) {
  return B.evalJs(cdp, sessionId, `(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    const vis = (e) => { const r=e.getBoundingClientRect(); const st=getComputedStyle(e); return st.display!=='none' && st.visibility!=='hidden' && r.width>2 && r.height>2; };
    const anchor = q('iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"]').filter(vis)[0];
    const bframe = q('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"]').filter(vis)[0];
    const ta = q('textarea[name="g-recaptcha-response"], #g-recaptcha-response')[0];
    const r = anchor ? anchor.getBoundingClientRect() : null;
    return { anchorRect: r ? {x:r.x,y:r.y,w:r.width,h:r.height} : null, bframe: !!bframe, tokenLen: ta ? (ta.value||'').length : null, grecaptcha: typeof window.grecaptcha };
  })()`).catch((e) => ({ err: e.message }));
}
async function hasCodeInput(cdp, sessionId) {
  return B.evalJs(cdp, sessionId, `!!(${CODE_SELECTOR})`).catch(() => false);
}

// ---------- net cursor helpers ----------
function netScan(net, fromIdx, pred) {
  const out = [];
  for (let i = fromIdx; i < net.lines.length; i++) { const l = net.lines[i]; if (pred(l)) out.push({ i, ...l }); }
  return out;
}

// ---------- interactive CAPTCHA solve loop (ports solve.js semantics) ----------
async function solveLoop(cdp, hostSession, hostTokenFn, { budgetMs = SOLVE_BUDGET_MS, net = null } = {}) {
  const DONE = path.join(SOLVE_DIR, 'DONE');
  const FAILED = path.join(SOLVE_DIR, 'FAILED');
  const STATE = path.join(SOLVE_DIR, 'state.json');
  const CLICKS = path.join(SOLVE_DIR, 'clicks.json');
  for (const f of [DONE, FAILED, CLICKS, STATE]) { try { fs.unlinkSync(f); } catch {} }
  const listTargets = async () => (await cdp.send('Target.getTargets')).targetInfos;
  const attach = async (targetId) => {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    return sessionId;
  };
  const evalIn = async (sessionId, expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error('evalIn: ' + r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  const clickIn = async (sessionId, x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    await sleep(70);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
    await sleep(50);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
  };
  const v2Frame = (t) => t.type === 'iframe' && /6Ld3OMEs/.test(t.url || '');
  const clickAnchor = async () => {
    const an = (await listTargets()).find((t) => v2Frame(t) && /anchor/.test(t.url));
    if (!an) { log('captcha', 'no anchor target to click'); return false; }
    const sid = await attach(an.targetId);
    const rect = await evalIn(sid, `(() => { const cb=document.querySelector('.recaptcha-checkbox'); if(!cb) return null; const r=cb.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,cls:String(cb.className).slice(0,60)}; })()`);
    if (!rect) { log('captcha', 'anchor has no checkbox element'); return false; }
    log('captcha', `anchor click at ${Math.round(rect.x)},${Math.round(rect.y)} (${rect.cls})`);
    await clickIn(sid, rect.x, rect.y);
    return true;
  };
  const dumpChallenge = async (bfTarget) => {
    const sid = await attach(bfTarget.targetId);
    const d = await evalIn(sid, `(() => {
      const instr=(document.querySelector('.rc-imageselect-desc-wrapper, .rc-imageselect-desc-no-canonical, .rc-imageselect-desc')||{}).innerText||null;
      const errEl=document.querySelector('.rc-imageselect-error-select-more, .rc-imageselect-error');
      const err=errEl? errEl.innerText : null;
      const tiles=[...document.querySelectorAll('.rc-imageselect-tile')].map(t=>{const r=t.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),sel:/selected/.test(t.className||'')};}).filter(t=>t.x <= (document.documentElement.clientWidth - 4) && t.w > 10 && t.h > 10);
      const vb=document.querySelector('#recaptcha-verify-button');
      const vbr=vb? vb.getBoundingClientRect():null;
      let sb=document.querySelector('#recaptcha-skip-button, .rc-imageselect-skip-button, button.rc-button-skip, #recaptcha-skip');
      if(!sb){ sb=[...document.querySelectorAll('button, div[role=button], a')].find(b=>/^(Atla|Skip)$/i.test((b.innerText||'').trim())); }
      const sbr=sb? sb.getBoundingClientRect():null;
      const big=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0];
      let data=null;
      try{ if(big){const c=document.createElement('canvas');c.width=big.naturalWidth;c.height=big.naturalHeight;c.getContext('2d').drawImage(big,0,0);data=c.toDataURL('image/png');} }catch(e){data=null}
      return {instr, err, tiles, verify: vbr? {x:Math.round(vbr.x+vbr.width/2), y:Math.round(vbr.y+vbr.height/2), disabled: !!(vb.disabled || /disabled/.test(vb.className||''))}:null, skip: sbr? {x:Math.round(sbr.x+sbr.width/2), y:Math.round(sbr.y+sbr.height/2)}:null, img: data, imgW: big?big.naturalWidth:0, imgH: big?big.naturalHeight:0};
    })()`);
    return { sid, d };
  };

  let round = 0, lastKey = null, stale = 0, emptyRounds = 0, brickStrikes = 0, verifyMisses = 0;
  const started = Date.now();
  for (let attempt = 0; attempt < 40; attempt++) {
    if (Date.now() - started > budgetMs) { fs.writeFileSync(FAILED, 'budget exceeded'); break; }
    try {
      const tok = await hostTokenFn();
      if (tok > 20) { fs.writeFileSync(DONE, JSON.stringify({ tokenLen: tok, at: new Date().toISOString() })); log('captcha', `TOKEN acquired len=${tok} after ${round} round(s), ${Math.round((Date.now() - started) / 1000)}s`); return { rounds: round, ms: Date.now() - started, tokenLen: tok }; }

      let bfs = (await listTargets()).filter((t) => v2Frame(t) && /bframe/.test(t.url));
      if (!bfs.length) {
        log('captcha', 'no bframe — clicking the anchor checkbox');
        await clickAnchor(); await sleep(4000); continue;
      }
      const bf = bfs[bfs.length - 1];
      const { sid, d } = await dumpChallenge(bf);
      if (!d || !d.tiles || !d.tiles.length) {
        emptyRounds++;
        log('captcha', `bframe without visible tiles (strike ${emptyRounds}) — re-clicking anchor`);
        if (emptyRounds >= 6) { log('captcha', 'challenge appears closed (no visible tiles x6) — failing attempt early'); fs.writeFileSync(FAILED, 'challenge closed'); break; }
        await clickAnchor(); await sleep(4000); continue;
      }
      emptyRounds = 0;
      if (!d.img || String(d.img).length < 8000 || d.imgW < 100) { log('captcha', 'challenge image not loaded yet — re-dumping shortly'); await sleep(2500); continue; }
      // Tiles and the verify/skip buttons animate into place; rects read
      // mid-animation send clicks to wrong coordinates (measured: verify
      // drifts ~31 px). Re-read everything once settled.
      await sleep(2000);
      try {
        const settled = await evalIn(sid, `(() => {
          const tiles=[...document.querySelectorAll('.rc-imageselect-tile')].map(t=>{const r=t.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),sel:/selected/.test(t.className||'')};}).filter(t=>t.x <= (document.documentElement.clientWidth - 4) && t.w > 10 && t.h > 10);
          const vb=document.querySelector('#recaptcha-verify-button'); const vbr=vb? vb.getBoundingClientRect():null;
          let sb=document.querySelector('#recaptcha-skip-button, .rc-imageselect-skip-button, button.rc-button-skip, #recaptcha-skip');
          if(!sb){ sb=[...document.querySelectorAll('button, div[role=button], a')].find(b=>/^(Atla|Skip)$/i.test((b.innerText||'').trim())); }
          const sbr=sb? sb.getBoundingClientRect():null;
          return { tiles, verify: vbr? {x:Math.round(vbr.x+vbr.width/2), y:Math.round(vbr.y+vbr.height/2), disabled: !!(vb.disabled || /disabled/.test(vb.className||''))}:null, skip: sbr? {x:Math.round(sbr.x+sbr.width/2), y:Math.round(sbr.y+sbr.height/2)}:null };
        })()`);
        if (settled) {
          if (settled.tiles && settled.tiles.length) d.tiles = settled.tiles;
          if (settled.verify) d.verify = settled.verify;
          if (settled.skip) d.skip = settled.skip;
        }
      } catch {}
      const key = `${d.instr}|${d.imgW}x${d.imgH}|${d.tiles.length}|${d.tiles[0].x},${d.tiles[0].y}|${(d.img || '').length}`;
      const disabledWithSel = !!(d.verify && d.verify.disabled && (d.tiles || []).some((t) => t.sel));
      if (disabledWithSel && key === lastKey) {
        brickStrikes++;
        log('captcha', `verify button disabled despite selections on an UNCHANGED round (strike ${brickStrikes})`);
        if (brickStrikes >= 3) { log('captcha', 'disabled widget persisted through wait+refresh — failing attempt early'); fs.writeFileSync(FAILED, 'bricked challenge'); break; }
        if (brickStrikes === 1) {
          log('captcha', 'grace wait 60 s for the hidden preload to finish (measured need 20-60 s on slow exits)');
          await sleep(60000);
          continue;
        }
        log('captcha', 'refresh-first after grace wait (measured recovery path)');
        lastKey = null; stale = 0;
        await clickAnchor(); await sleep(15000); continue;
      }
      if (!disabledWithSel) brickStrikes = 0;
      if (key === lastKey) { stale++; if (stale >= 2) { log('captcha', 'challenge unchanged twice — grace recheck before refreshing'); await sleep(6000); const tg = await hostTokenFn(); if (tg > 20) { fs.writeFileSync(DONE, JSON.stringify({ tokenLen: tg, at: new Date().toISOString() })); log('captcha', `TOKEN acquired len=${tg} on the grace recheck`); return { rounds: round, ms: Date.now() - started, tokenLen: tg }; } lastKey = null; stale = 0; await clickAnchor(); await sleep(4000); continue; } } else { stale = 0; lastKey = key; }

      round++;
      const shot = path.join(SOLVE_DIR, `round-${round}.png`);
      if (d.img && d.img.startsWith('data:')) fs.writeFileSync(shot, Buffer.from(d.img.split(',')[1], 'base64'));
      const cols = [...new Set(d.tiles.map((t) => t.x))].length || 3;
      fs.writeFileSync(STATE, JSON.stringify({ round, at: new Date().toISOString(), instruction: d.instr, error: d.err, imgW: d.imgW, imgH: d.imgH, shot: path.basename(shot), cols, tiles: d.tiles.map((t, i) => ({ i, r: Math.floor(i / cols), c: i % cols, x: t.x, y: t.y, w: t.w, h: t.h, sel: t.sel })), verify: d.verify, skip: d.skip }, null, 1));
      log('captcha', `ROUND ${round}: "${String(d.instr || '').split('\n')[0]}" cols=${cols} tiles=${d.tiles.length} err=${JSON.stringify(d.err)} -> ${path.basename(shot)}; waiting for clicks.json (<=${Math.round(ROUND_WAIT_MS / 1000)}s)`);

      try { fs.unlinkSync(CLICKS); } catch {}
      let clicks = null;
      const waitStart = Date.now();
      while (Date.now() - waitStart < ROUND_WAIT_MS) {
        await sleep(2000);
        if (fs.existsSync(CLICKS)) { try { clicks = JSON.parse(fs.readFileSync(CLICKS, 'utf8')); } catch { clicks = null; } if (clicks) break; }
      }
      if (!clicks) { log('captcha', 'no answer in time; refreshing challenge'); await clickAnchor(); await sleep(4000); continue; }
      if (clicks.refresh) { log('captcha', 'agent asked for refresh'); await clickAnchor(); await sleep(4000); continue; }
      if (clicks.abort) { log('captcha', 'agent asked to abort this attempt (hostile exit)'); fs.writeFileSync(FAILED, 'agent abort'); break; }
      if (clicks.skip && d.skip) {
        for (const idx of clicks.tiles || []) {
          const t = d.tiles[idx];
          if (!t) continue;
          log('captcha', `  pre-skip toggle tile ${idx}`);
          await clickIn(sid, t.x + t.w / 2, t.y + t.h / 2);
          await sleep(320);
        }
        if (d.tiles.some((t) => t.sel) && !(clicks.tiles || []).length) log('captcha', 'WARN: skip with non-empty selection — button may read DOĞRULA');
        await sleep(clicks.tiles && clicks.tiles.length ? 600 : 0);
        log('captcha', `  skip @ ${d.skip.x},${d.skip.y}`);
        await clickIn(sid, d.skip.x, d.skip.y);
      } else {
        for (const idx of clicks.tiles || []) {
          const t = d.tiles[idx];
          if (!t) continue;
          log('captcha', `  click tile ${idx} @ ${t.x + Math.round(t.w / 2)},${t.y + Math.round(t.h / 2)}`);
          await clickIn(sid, t.x + t.w / 2, t.y + t.h / 2);
          await sleep(650);
        }
        if (clicks.verify !== false && d.verify) {
          let vx = d.verify.x, vy = d.verify.y;
          try {
            const cur = await evalIn(sid, `(() => { const vb=document.querySelector('#recaptcha-verify-button'); if(!vb) return null; const r=vb.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; })()`);
            if (cur) { vx = cur.x; vy = cur.y; }
          } catch {}
          await sleep(200);
          await clickIn(sid, vx, vy); log('captcha', `  verify @ ${vx},${vy}`);
          await sleep(3000); // post-verify mint can lag on slow exits
        }
      }
      await sleep(3200);
      const tok2 = await hostTokenFn();
      log('captcha', `  after round ${round}: tokenLen=${tok2}`);
      if (tok2 > 20) { fs.writeFileSync(DONE, JSON.stringify({ tokenLen: tok2, at: new Date().toISOString() })); log('captcha', `TOKEN acquired len=${tok2} after ${round} round(s), ${Math.round((Date.now() - started) / 1000)}s`); return { rounds: round, ms: Date.now() - started, tokenLen: tok2 }; }
    } catch (e) {
      log('captcha', 'round error: ' + e.message);
      await sleep(2000);
    }
  }
  if (!fs.existsSync(FAILED)) fs.writeFileSync(FAILED, 'loop ended without token');
  throw new Error('captcha solve failed (budget/loop end)');
}

// ---------- phase: auth surface + email ----------
async function authSurface(cdp, sessionId) {
  log('nav', 'goto https://id.io.net/login');
  await cdp.send('Page.navigate', { url: 'https://id.io.net/login' }, sessionId);
  await B.waitLoad(cdp, sessionId, 60000);
  for (const w of [4000, 4000, 5000, 6000, 8000, 8000]) {
    await sleep(w);
    const ready = await B.evalJs(cdp, sessionId, `({ready:document.readyState, root:(document.getElementById('root')||document.getElementById('app')||{}).childElementCount||0, inputs:document.querySelectorAll('input').length, url:location.href, title:document.title})`).catch((e) => ({ err: e.message }));
    log('nav', `probe ${JSON.stringify(ready)}`);
    if (ready && ready.root > 0 && (ready.inputs > 0 || ready.ready !== 'loading')) break;
  }
  await snap(cdp, sessionId, '01-landing');

  const recState = await B.evalJs(cdp, sessionId, `({ render: typeof (window.grecaptcha && window.grecaptcha.render) })`).catch(() => ({}));
  log('captcha', `initial grecaptcha ${JSON.stringify(recState)}`);
  if (!recState || recState.render !== 'function') {
    log('captcha', 'injecting explicit api.js loader');
    await B.evalJs(cdp, sessionId, `(() => { if (document.getElementById('ionet-recaptcha-inject')) return 'already'; const s=document.createElement('script'); s.id='ionet-recaptcha-inject'; s.src='https://www.google.com/recaptcha/api.js?onload=onloadcallback&render=explicit'; s.async=true; s.defer=true; document.head.appendChild(s); return 'injected'; })()`).catch(() => {});
  }
  for (let i = 0; i < 12; i++) {
    const now = await B.evalJs(cdp, sessionId, `({ render: typeof (window.grecaptcha && window.grecaptcha.render), clients: window.___grecaptcha_cfg ? Object.keys(window.___grecaptcha_cfg.clients||{}).length : null })`).catch(() => ({}));
    if (i === 0 || i === 5 || i === 11) log('captcha', `wait-impl ${i}: ${JSON.stringify(now)}`);
    if (now && now.render === 'function') break;
    await sleep(2500);
  }

  const hasProviderList = async () => {
    const t = await B.evalJs(cdp, sessionId, `(document.body?document.body.innerText:'')`).catch(() => '');
    return /with email|log into your account|sign up|log ?in/i.test(t) && /google/i.test(t);
  };
  if (!(await hasProviderList())) {
    const c = await findClickable(cdp, sessionId, '^log ?in$|^sign ?in$|^sign ?up$|log ?in|sign ?in');
    if (c) { await clickRect(cdp, sessionId, c.rect, `open-auth("${c.text}")`); await sleep(2500); }
  }
  await snap(cdp, sessionId, '02-login-surface');
  const toSignup = await findClickable(cdp, sessionId, '^sign ?up$', { tag: 'a' });
  if (toSignup) { await clickRect(cdp, sessionId, toSignup.rect, `to-signup("${toSignup.text}")`); await sleep(2000); await snap(cdp, sessionId, '02b-signup-variant'); }
  else log('flow', 'no in-modal Sign Up link; continuing with login variant');
  const emailOpt = (await findClickable(cdp, sessionId, 'sign ?up with email|log ?in with email')) || (await findClickable(cdp, sessionId, 'with email')) || (await findClickable(cdp, sessionId, 'e-?mail|otp|magic'));
  if (emailOpt) { await clickRect(cdp, sessionId, emailOpt.rect, `email-option("${emailOpt.text}")`); await sleep(2200); }
  else log('flow', 'no explicit e-mail option; assuming a direct email field');
  await snap(cdp, sessionId, '03-after-email-option');
}

async function emailPhase(cdp, sessionId, net, box) {
  t0('email');
  const typed = await setInput(cdp, sessionId, EMAIL_SELECTOR, box.address, 'email');
  if (!typed) { await snap(cdp, sessionId, '03b-no-email-field'); throw new Error('email field not found'); }
  await sleep(400); await snap(cdp, sessionId, '04-email-typed');

  // CAPTCHA pre-pass: solve BEFORE submitting so the token is fresh at submit.
  let capPre = null;
  for (let i = 0; i < 6; i++) {
    capPre = await captchaState(cdp, sessionId);
    log('captcha', `pre-pass ${i}: ${JSON.stringify(capPre)}`);
    if (capPre.anchorRect) break;
    await sleep(2000);
  }
  t0('captcha');
  let cap = { rounds: 0, ms: 0, tokenLen: 0 };
  if (capPre && capPre.tokenLen > 20) {
    log('captcha', `token already fresh (${capPre.tokenLen}) — skipping solve`);
  } else if (capPre && capPre.anchorRect) {
    await clickAnchorAndSolve(cdp, sessionId, net);
    cap = lastSolve;
  } else {
    const tok = await hostTokenLen(cdp, sessionId);
    if (tok > 20) { log('captcha', `token already present (${tok})`); }
    else log('captcha', 'WARNING: no v2 anchor found on email step');
  }
  t1('captcha');
  await snap(cdp, sessionId, '04c-captcha-done');
  if (UNTIL === 'auth') { log('run', '--until auth: stopping after captcha'); return 'stop'; }

  // Submit; retry once if the backend rejects a stale token.
  for (let attempt = 0; attempt < 2; attempt++) {
    const cursor = net.lines.length;
    const NAV_EXCL = '^(login|sign ?up|docs|dashboard|cloud|docs)$';
    const btn = (await findClickable(cdp, sessionId, '^continue$', { exclude: NAV_EXCL })) || (await findClickable(cdp, sessionId, 'continue|send|get code|receive|next|submit', { exclude: NAV_EXCL }));
    if (btn && !btn.disabled) await clickRect(cdp, sessionId, btn.rect, `submit("${btn.text}")`);
    else { log('flow', btn ? `submit "${btn.text}" disabled — pressing Enter` : 'no submit button; pressing Enter'); await B.evalJs(cdp, sessionId, `(() => { const e=(${EMAIL_SELECTOR}); e && e.focus(); return true; })()`); await pressEnter(cdp, sessionId); }
    let outcome = null;
    for (let i = 0; i < 12; i++) {
      await sleep(4000);
      if (await hasCodeInput(cdp, sessionId)) { outcome = 'otp'; break; }
      const starts = netScan(net, cursor, (l) => l.t === 'body' && /magic-auth\/start/.test(l.url || ''));
      const lastStart = starts.length ? starts[starts.length - 1] : null;
      if (lastStart) {
        log('flow', `sendCode -> ${lastStart.status} ${String(lastStart.body).slice(0, 160)}`);
        if (lastStart.status >= 400) {
          const b = String(lastStart.body || '');
          if (/captcha|blocked|verify/i.test(b) && /captcha/i.test(b)) { outcome = 'captcha-stale'; break; }
          if (/too many|rate|limit/i.test(b)) throw new Error('sendCode rate-limited: ' + b.slice(0, 160));
          throw new Error('sendCode failed: ' + b.slice(0, 160));
        }
      }
      const txt = await B.evalJs(cdp, sessionId, `(document.body?document.body.innerText:'')`).catch(() => '');
      if (/enter (the )?code|otp sent|verification code|check your (inbox|email)|code (was )?sent/i.test(txt)) { outcome = 'otp'; break; }
    }
    if (outcome === 'otp') {
      await snap(cdp, sessionId, '05-otp-screen'); t1('email');
      if (UNTIL === 'start') {
        fs.writeFileSync(path.join(RUN_DIR, 'handoff.json'), JSON.stringify({ tag: TAG, email: box.address, boxToken: box.token, source: box.source, at: new Date().toISOString() }, null, 1));
        log('run', `--until start: handoff written (${box.address}) — closing Chrome`);
        return 'stop';
      }
      return 'otp';
    }
    if (outcome === 'captcha-stale' && attempt === 0) {
      log('flow', 'stale captcha at sendCode — re-solving');
      await clickAnchorAndSolve(cdp, sessionId, net);
      continue;
    }
    throw new Error('email submit did not reach OTP screen (outcome=' + outcome + ')');
  }
  throw new Error('email submit failed after retries');
}

let lastSolve = { rounds: 0, ms: 0, tokenLen: 0 };
async function hostTokenLen(cdp, sessionId) {
  return B.evalJs(cdp, sessionId, `(() => { const t=document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response'); return t? (t.value||'').length : 0; })()`).catch(() => 0);
}
async function clickAnchorAndSolve(cdp, sessionId, net) {
  const cap0 = await captchaState(cdp, sessionId);
  if (cap0.anchorRect && !cap0.bframe) {
    const r = cap0.anchorRect;
    await B.clickAt(cdp, sessionId, r.x + Math.min(30, r.w / 2), r.y + Math.min(34, r.h - 4));
    log('captcha', `checkbox clicked @ ${Math.round(r.x + 30)},${Math.round(r.y + 34)}`);
    await sleep(4500);
  }
  const st = await captchaState(cdp, sessionId);
  log('captcha', `post-checkbox: ${JSON.stringify(st)}`);
  lastSolve = await solveLoop(cdp, sessionId, () => hostTokenLen(cdp, sessionId), { net });
  ev({ t: 'solve', ...lastSolve });
  return lastSolve;
}

// ---------- phase: OTP ----------
async function otpPhase(cdp, sessionId, net, box) {
  t0('otp');
  for (let i = 0; i < 30; i++) { if (await hasCodeInput(cdp, sessionId)) break; await sleep(3000); }
  if (!(await hasCodeInput(cdp, sessionId))) throw new Error('OTP input never appeared');
  const cursor = net.lines.length;
  for (let attempt = 0; attempt < 3; attempt++) {
    const mailT0 = Date.now();
    const mail = await waitForCode(box, { timeoutMs: attempt === 0 ? OTP_TIMEOUT_MS : 150000 });
    log('otp', `code=${mail.code} latency=${Math.round((mail.at - mailT0) / 1000)}s (attempt ${attempt + 1})`);
    t0('otpCode');
    const ok = await setInput(cdp, sessionId, CODE_SELECTOR, mail.code, 'otp-code');
    if (!ok) throw new Error('otp input not found');
    await snap(cdp, sessionId, `06-code-typed-${attempt}`, { shot: attempt === 0 });
    const btn = (await findClickable(cdp, sessionId, '^verify code$')) || (await findClickable(cdp, sessionId, 'verify|confirm|continue|submit'));
    if (btn) await clickRect(cdp, sessionId, btn.rect, `otp-submit("${btn.text}")`);
    else { await B.evalJs(cdp, sessionId, `(() => { const e=(${CODE_SELECTOR}); if(e){e.focus(); e.select && e.select();} return true; })()`).catch(() => {}); await pressEnter(cdp, sessionId); }
    await sleep(12000);
    const ver = netScan(net, cursor, (l) => l.t === 'body' && /magic-auth\/verify/.test(l.url || ''));
    const last = ver.length ? ver[ver.length - 1] : null;
    const domNow = await snap(cdp, sessionId, `07-after-otp-${attempt}`, { shot: true });
    if (last) log('otp', `verify -> ${last.status} ${String(last.body).slice(0, 200)}`);
    const hasTok = domNow && domNow.cookieToken > 20;
    const txt = String((domNow && domNow.bodyText) || '');
    t1('otpCode');
    if ((last && last.status === 200) || hasTok) { t1('otp'); return 'key'; }
    if (/blocked/i.test(txt)) throw new Error('account blocked at OTP step');
    if (/too many/i.test(txt)) throw new Error('too many attempts at OTP');
    if (/invalid|expired|incorrect/i.test(txt) || !last) {
      log('otp', 'code not accepted — trying the resend path (OTP-step CAPTCHA + Resend)');
      try {
        await snap(cdp, sessionId, `07b-resend-pre-${attempt}`);
        await clickAnchorAndSolve(cdp, sessionId, net); // OTP-step v2, gates only Resend
        const rs = (await findClickable(cdp, sessionId, '^resend( otp| verification code)?$')) || (await findClickable(cdp, sessionId, 'resend'));
        if (rs) { await clickRect(cdp, sessionId, rs.rect, `resend("${rs.text}")`); await sleep(3000); log('otp', 'resend clicked'); }
        else log('otp', 'no resend button found');
      } catch (e) { log('otp', `resend path error: ${e.message}`); }
      continue;
    }
  }
  throw new Error('OTP verify failed after retries');
}

// ---------- phase: key ----------
function extractCandidates(obj) {
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
function fetchFull(proxy, url, { method = 'GET', headers = {}, body, timeoutMs = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined || body === null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const hs = { ...headers };
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-type')) hs['Content-Type'] = 'application/json';
    if (payload && !Object.keys(hs).some((h) => h.toLowerCase() === 'content-length')) hs['Content-Length'] = payload.length;
    const req = lib.request({ method, host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, agent: proxy ? createAgent(proxy) : undefined, headers: hs }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve({ status: res.statusCode, body: t }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
async function testKeyModel(proxy, key) {
  try {
    const r = await fetchFull(proxy, `${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 45000 });
    let ok = r.status === 200;
    let n = null;
    try { const j = JSON.parse(r.body); if (Array.isArray(j.data)) n = j.data.length; } catch {}
    return { ok, status: r.status, models: n, body: r.body.slice(0, 160) };
  } catch (e) { return { ok: false, status: 0, err: e.message }; }
}
async function keyPhase(cdp, sessionId, net, proxy) {
  t0('key');
  // 1) accessToken: from the verify network body first, then from the page cookie.
  let token = null;
  const bodies = netScan(net, 0, (l) => l.t === 'body' && /magic-auth\/verify/.test(l.url || '') && l.status === 200);
  for (const b of bodies) { const m = String(b.body).match(/"accessToken"\s*:\s*"([^"]+)"/); if (m) { token = m[1]; break; } }
  if (!token) {
    token = await B.evalJs(cdp, sessionId, `(() => {
      try{ for(const c of document.cookie.split(/;\\s*/)){ const m=c.match(/^(ionet_authentication[^=]*)=(.*)$/); if(m){ const j=JSON.parse(decodeURIComponent(m[2])); const v=j&&(j.state||j); const t=v&&(v.token||v.accessToken); if(t&&String(t).length>20) return t; } } }catch(e){}
      try{ for(const k of Object.keys(localStorage)){ try{ const j=JSON.parse(localStorage.getItem(k)); const v=j&&(j.state||j); const t=v&&(v.token||v.accessToken); if(t&&String(t).length>20) return t; }catch(e){} } }catch(e){}
      return null; })()`).catch(() => null);
  }
  log('key', `accessToken ${token ? mask(token) + ' len=' + token.length : 'NOT FOUND'}`);
  ev({ t: 'token', found: !!token, len: token ? token.length : 0 });

  let key = null;
  const name = `k-${TAG}-${Date.now().toString(36)}`;
  if (token) {
    const attempts = [
      { h: { Token: token, 'Frontend-Version': FRONTEND_VER, Accept: 'application/json' }, b: { name } },
      { h: { Token: token, 'Frontend-Version': FRONTEND_VER, Accept: 'application/json' }, b: { name, description: name } },
    ];
    for (const a of attempts) {
      try {
        const r = await fetchFull(proxy, `${API_BASE}/api-keys/`, { method: 'POST', headers: a.h, body: a.b });
        log('key', `POST /api-keys/ -> ${r.status} ${String(r.body).slice(0, 220)}`);
        fs.appendFileSync(path.join(RUN_DIR, 'apikey-create.jsonl'), JSON.stringify({ at: ts(), status: r.status, body: r.body.slice(0, 4000) }) + '\n');
        if (r.status < 300) {
          let j = null; try { j = JSON.parse(r.body); } catch {}
          const cands = j ? extractCandidates(j) : [];
          for (const c of cands) {
            const t = await testKeyModel(proxy, c.v);
            if (t.ok) { key = c.v; log('key', `candidate field "${c.k}" verified live (${t.models} models)`); break; }
          }
          if (key) break;
          const m = r.body.match(/[A-Za-z0-9_.-]{24,120}/g);
          for (const c of m || []) { const t = await testKeyModel(proxy, c); if (t.ok) { key = c; log('key', 'raw-body candidate verified live'); break; } }
          if (key) break;
          log('key', 'create succeeded but no live candidate extracted; falling back to UI');
          break;
        }
      } catch (e) { log('key', `create attempt error: ${e.message}`); }
    }
  }

  // 2) UI fallback: drive ai.io.net/ai/api-keys and capture the create call.
  if (!key) {
    const cursor = net.lines.length;
    log('key', 'UI fallback: navigating to ai.io.net/ai/api-keys');
    await cdp.send('Page.navigate', { url: 'https://ai.io.net/ai/api-keys' }, sessionId);
    await B.waitLoad(cdp, sessionId, 90000); await sleep(7000);
    await snap(cdp, sessionId, '10-apikeys');
    let createBtn = (await findClickable(cdp, sessionId, 'create (new )?(api )?key|new (api )?key|create key|\\+ ?key')) || (await findClickable(cdp, sessionId, 'create|new key|add'));
    if (createBtn) {
      await clickRect(cdp, sessionId, createBtn.rect, `create-key("${createBtn.text}")`);
      await sleep(2500); await snap(cdp, sessionId, '11-key-modal');
      const nameField = `[...document.querySelectorAll('input')].filter(i=>{const r=i.getBoundingClientRect();return r.width>2 && i.type!=='hidden';})[0] || null`;
      const domNow = await B.evalJs(cdp, sessionId, DOM_SNAP).catch(() => ({}));
      if ((domNow.inputs || []).length) { await setInput(cdp, sessionId, nameField, name, 'key-name').catch(() => {}); await sleep(500); }
      const create2 = await findClickable(cdp, sessionId, 'create|generate|confirm|save|add key');
      if (create2) await clickRect(cdp, sessionId, create2.rect, `key-create-confirm("${create2.text}")`);
      else { log('key', 'no confirm button; Enter'); await pressEnter(cdp, sessionId); }
      await sleep(6000); const domKey = await snap(cdp, sessionId, '12-key-result', { shot: true });
      const bodies2 = netScan(net, cursor, (l) => l.t === 'body' && /api-keys/.test(l.url || ''));
      for (const b of bodies2.reverse()) {
        const m = String(b.body).match(/"(?:value|key|api_key|apiKey|secret)"\s*:\s*"([^"]{16,})"/);
        if (m) { const t = await testKeyModel(proxy, m[1]); if (t.ok) { key = m[1]; log('key', `key from UI network body (${b.url.slice(0, 60)})`); break; } }
      }
      if (!key && domKey) {
        const cands = String(domKey.bodyText || '').match(/[A-Za-z0-9_.-]{28,120}/g) || [];
        for (const c of cands) { if (/^https|^[0-9a-f]{40}$/.test(c) === false) { const t = await testKeyModel(proxy, c); if (t.ok) { key = c; log('key', 'key from UI DOM text'); break; } } }
      }
    } else log('key', 'no create-key button found');
  }
  t1('key');
  if (!key) throw new Error('no live API key obtained');
  return { key, token };
}

// ---------- verify + writes ----------
async function verifyAndRecord(proxy, box, key, extra) {
  t0('verify');
  let modelsJson = null;
  for (let i = 0; i < 4; i++) {
    const m = await fetchFull(proxy, `${MODELS_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 60000 });
    if (m.status === 200) { try { modelsJson = JSON.parse(m.body); } catch {} if (modelsJson && Array.isArray(modelsJson.data)) { log('verify', `GET /models -> 200, ${modelsJson.data.length} models`); break; } }
    log('verify', `models attempt ${i + 1}: status=${m.status} ${String(m.body).slice(0, 120)}`);
    await sleep(4000);
  }
  const chat = await fetchFull(proxy, `${MODELS_BASE}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: { model: 'meta-llama/Llama-3.3-70B-Instruct', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8 }, timeoutMs: 90000 });
  let chatText = null;
  try { const cj = JSON.parse(chat.body); chatText = cj && cj.choices && cj.choices[0] && cj.choices[0].message && cj.choices[0].message.content; } catch {}
  log('verify', `chat -> ${chat.status} ${String(chat.body).slice(0, 200).replace(/\s+/g, ' ')}`);
  const live = chat.status === 200 && !!chatText;
  const rec = { tag: TAG, address: box.address, boxToken: box.token, key, keyMasked: mask(key), at: new Date().toISOString(), proxy: PROXY_LINE, models: modelsJson ? modelsJson.data.length : null, chat: chatText ? chatText.slice(0, 40) : null, live, timings: T, ...extra };
  fs.appendFileSync(path.join(ROOT, 'accounts.json'), JSON.stringify(rec) + '\n');
  if (modelsJson && Array.isArray(modelsJson.data)) {
    const mf = path.join(ROOT, 'models.json');
    try { const cur = JSON.parse(fs.readFileSync(mf, 'utf8')); if (!cur || !Array.isArray(cur.data) || cur.data.length < modelsJson.data.length) fs.writeFileSync(mf, JSON.stringify(modelsJson, null, 2)); } catch { fs.writeFileSync(mf, JSON.stringify(modelsJson, null, 2)); }
  }
  if (live) { fs.appendFileSync(path.join(ROOT, 'keys.txt'), key + '\n'); log('verify', `KEY LIVE — appended to keys.txt (${mask(key)})`); }
  else { fs.appendFileSync(path.join(ROOT, 'keys.pending.txt'), `${box.address}\t${key}\t${new Date().toISOString()}\n`); log('verify', 'key NOT live — keys.pending.txt'); }
  t1('verify');
  return live;
}

// ---------- chrome ----------
function killChrome(meta) {
  if (!meta) return;
  try { execSync(`taskkill /PID ${meta.pid} /T /F`, { stdio: 'ignore', windowsHide: true }); log('run', `chrome ${meta.pid} killed`); } catch (e) { log('run', `kill chrome ${meta.pid}: ${e.message.slice(0, 80)}`); }
}

// ---------- main ----------
(async () => {
  initRunDir();
  log('run', `dir=${RUN_DIR} tag=${TAG} port=${PORT} attach=${ATTACH}`);
  if (!PROXY_LINE) throw new Error('--proxy <line> required (host line never used)');
  const proxy = parseProxy(PROXY_LINE);
  if (!proxy) throw new Error('bad proxy line');
  proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000;
  log('run', `proxy=${browserUrl(proxy)}`);
  ev({ t: 'start', proxy: PROXY_LINE, until: UNTIL, phase: PHASE_OVERRIDE });

  const boxPromise = EMAIL_OVERRIDE ? Promise.resolve({ address: EMAIL_OVERRIDE, token: EMAIL_TOKEN || null, source: 'cli' })
    : brokerCreate().catch(async (e) => { log('mail', `create attempt1 failed: ${e.message.slice(0, 120)}`); await sleep(3000); return brokerCreate(); });

  let launched = null;
  if (!ATTACH) launched = B.launchChrome(PORT, TAG);
  else { try { await B.waitPort(PORT, 3000); } catch { throw new Error(`attach: chrome :${PORT} not up`); } }
  const cdp = await B.connect(PORT);
  // Janitor sweeps can kill Chrome mid-flow; don't die on the socket reset —
  // log it, let phase timeouts conclude, and let the finally block clean up.
  cdp.on('error', (e) => { try { log('run', 'cdp error: ' + ((e && e.message) || e)); } catch {} });
  process.on('unhandledRejection', (e) => { try { log('FAIL', 'unhandledRejection: ' + ((e && e.message) || e)); } catch {} });
  process.on('uncaughtException', (e) => { try { log('FAIL', 'uncaughtException: ' + ((e && e.stack) || e)); } catch {} });
  let sessionId, browserContextId = null, targetId = null;
  if (ATTACH) {
    const pages = (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page' && /io\.net/.test(t.url));
    if (!pages.length) throw new Error('attach: no io.net page open');
    const page = pages.sort((a, b) => (b.targetId > a.targetId ? 1 : -1))[0];
    targetId = page.targetId;
    const a = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = a.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    log('run', `attached to ${page.url.slice(0, 80)}`);
  } else {
    const ctx = await B.openContext(cdp, { proxyServer: browserUrl(proxy) });
    sessionId = ctx.sessionId; browserContextId = ctx.browserContextId; targetId = ctx.targetId;
  }
  const teardownAuth = await attachProxyAuth(cdp, sessionId, proxy);
  const net = makeNetLogger(cdp, sessionId, RUN_DIR);
  const conFile = makeConsoleLogger(cdp, sessionId, RUN_DIR);
  log('run', 'context ready');

  // gstatic interception (reCAPTCHA implementation from cache/pool)
  const pausedHandler = async (p) => {
    const url = p.request.url || '';
    let handled = false;
    try {
      const r = await gs.get(url, { batch: 4, rounds: 8, timeoutMs: 12000, log: (m) => log('gsfetch', m) });
      if (r.ok) {
        await cdp.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responsePhrase: 'OK', responseHeaders: [ { name: 'Content-Type', value: 'application/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'public, max-age=86400' }, { name: 'Access-Control-Allow-Origin', value: '*' } ], body: r.body.toString('base64') }, sessionId);
        handled = true;
        log('gsfetch', `served ${url.slice(60, 140)} (${r.body.length}B from ${r.from === 'cache' ? 'cache' : 'proxy'})`);
      }
    } catch (e) { log('gsfetch', `handler error ${e.message}`); }
    if (!handled) { try { await cdp.send('Fetch.continueRequest', { requestId: p.requestId }, sessionId); } catch {} log('gsfetch', `network fallback ${url.slice(60, 140)}`); }
  };
  cdp.on('Fetch.requestPaused', pausedHandler, sessionId);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*://*.gstatic.com/recaptcha/*', requestStage: 'Request' }] }, sessionId);
  log('run', 'gstatic interception enabled');
  gs.get(IMPL_URL, { batch: 4, rounds: 6, timeoutMs: 12000, log: (m) => log('gsfetch', m) }).then((r) => log('gsfetch', `impl prefetch: ${r.ok ? r.body.length + 'B from ' + r.from : 'FAILED'}`)).catch(() => {});

  let box = null, keyInfo = null, live = false, phase = PHASE_OVERRIDE;
  try {
    // phase detection / resume
    if (phase === 'auto') {
      const det = await B.evalJs(cdp, sessionId, DOM_SNAP).catch(() => ({}));
      const url = String(det.url || '');
      const hasCode = await hasCodeInput(cdp, sessionId);
      const hasEmail = await B.evalJs(cdp, sessionId, `!!(${EMAIL_SELECTOR})`).catch(() => false);
      log('run', `detect: url=${url.slice(0, 90)} email=${hasEmail} code=${hasCode} cookieTok=${det.cookieToken}`);
      if (hasCode) phase = 'otp';
      else if (hasEmail && /id\.io\.net\/login/.test(url)) phase = 'email';
      else if (!/id\.io\.net/.test(url) && (det.cookieToken > 20)) phase = 'key';
      else phase = 'start';
    }
    log('run', `phase=${phase}`);

    box = await boxPromise;
    log('mail', `box=${box.address} (${box.source})`);
    ev({ t: 'box', address: box.address, token: box.token, source: box.source });

    if (phase === 'start') { await authSurface(cdp, sessionId); phase = 'email'; }
    if (phase === 'email') { const next = await emailPhase(cdp, sessionId, net, box); if (next === 'stop') { log('run', `stopped by --until ${UNTIL}`); } else phase = next; }
    if (phase === 'otp') { if (UNTIL === 'otp') { log('run', '--until otp: stopping'); } else { phase = await otpPhase(cdp, sessionId, net, box); } }
    if (phase === 'key') {
      if (!box.token && !EMAIL_OVERRIDE) log('mail', 'WARNING: no box token for OTP (resume without --email-token?)');
      keyInfo = await keyPhase(cdp, sessionId, net, proxy);
      live = await verifyAndRecord(proxy, box, keyInfo.key, { captcha: lastSolve });
      await snap(cdp, sessionId, '13-final', { shot: true });
    }
    const summary = { tag: TAG, port: PORT, proxy: PROXY_LINE, phase, address: box.address, key: keyInfo ? mask(keyInfo.key) : null, live, captcha: lastSolve, timings: T, at: new Date().toISOString() };
    fs.writeFileSync(path.join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
    log('run', 'SUMMARY ' + JSON.stringify(summary));
  } catch (e) {
    log('FAIL', (e && e.stack) || String(e));
    ev({ t: 'fail', err: String(e && e.message) });
    try { await snap(cdp, sessionId, '99-fail'); } catch {}
    process.exitCode = 1;
  } finally {
    try { teardownAuth(); } catch {}
    try { cdp.close(); } catch {}
    try { net.file.end(); } catch {}
    try { conFile.end(); } catch {}
    if (launched && !KEEP) {
      await sleep(1500);
      killChrome(launched);
      try { fs.rmSync(launched.profileDir, { recursive: true, force: true, maxRetries: 2 }); } catch {}
    } else if (launched) { log('run', `chrome left open on :${PORT} (pid ${launched.pid})`); }
  }
  // Lingering sockets/timers otherwise keep node alive for minutes after the
  // phase is over and the lane waits out its full browser timeout for nothing.
  process.exit(process.exitCode || 0);
})();
