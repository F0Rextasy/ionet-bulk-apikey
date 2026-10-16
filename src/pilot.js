'use strict';
/*
 * io.net pilot — id.io.net signup via e-mail OTP, through a proxied Chrome.
 *
 *   node src/pilot.js --proxy "socks5://1.2.3.4:1080" [--port 9341]
 *        [--email you@x.tld | --pool-take | --broker-create] [--until auth|key|verify]
 *
 * Everything the run sees lands in outputs/pilot-<ts>/: events.jsonl, net.jsonl,
 * console.jsonl, shot-*.png and (when the pass-through worked) key.txt.
 * Never falls back to the host line: the browser context and every HTTP call
 * go through the given exit.
 */
const fs = require('fs');
const path = require('path');
const B = require('./browser');
const gs = require('./gsfetch');
const {
  parseProxy,
  browserUrl,
  attachProxyAuth,
  fetchText,
  createAgent,
} = require('./proxy.js');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const flag = (n) => argv.includes('--' + n);

const PROXY_LINE = arg('proxy', '');
const PORT = parseInt(arg('port', '9341'), 10);
const UNTIL = arg('until', 'verify'); // auth | key | verify
const GOTO = arg('goto', 'https://id.io.net/login');
const EMAIL_OVERRIDE = arg('email', '');
const EMAIL_TOKEN = arg('email-token', '');
const BROKER = arg('broker', 'http://127.0.0.1:9700');
const POOL_FILE = path.join(ROOT, 'inbox-pool.jsonl');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
let RUN_DIR = null;
function initRunDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  RUN_DIR = path.join(ROOT, 'outputs', `pilot-${stamp}`);
  fs.mkdirSync(RUN_DIR, { recursive: true });
}
function log(stage, msg) {
  const line = `${ts()} [${stage}] ${msg}`;
  console.log(line);
  if (RUN_DIR) fs.appendFileSync(path.join(RUN_DIR, 'run.log'), line + '\n');
}
function ev(obj) {
  if (RUN_DIR) fs.appendFileSync(path.join(RUN_DIR, 'events.jsonl'), JSON.stringify({ at: ts(), ...obj }) + '\n');
}

// ---------- mailbox ----------
async function takeFromPool() {
  const raw = fs.readFileSync(POOL_FILE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const idx = raw.findIndex((b) => !b.used);
  if (idx === -1) return null;
  raw[idx].used = true;
  raw[idx].takenBy = 'ionet-pilot';
  raw[idx].takenAt = new Date().toISOString();
  fs.writeFileSync(POOL_FILE, raw.map((b) => JSON.stringify(b)).join('\n') + '\n');
  return { address: raw[idx].address, token: String(raw[idx].token), source: 'pool' };
}
async function brokerCreate() {
  log('mail', 'broker /create (can walk a proxy chain; up to ~2 min)…');
  const text = await fetchText(null, `${BROKER}/create`, { method: 'POST', body: {}, timeoutMs: 130000 });
  const j = JSON.parse(text);
  if (!j.address || !j.token) throw new Error('broker create odd reply: ' + String(text).slice(0, 150));
  const box = { address: j.address, token: String(j.token), source: 'broker' };
  fs.appendFileSync(path.join(ROOT, 'outputs', 'inboxes.jsonl'), JSON.stringify({ ...box, at: new Date().toISOString() }) + '\n');
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
async function waitForOtp(box, { timeoutMs = 180000, before = 0, tag = 'otp' } = {}) {
  const deadline = Date.now() + timeoutMs;
  const seen = new Set();
  while (Date.now() < deadline) {
    let list = [];
    try {
      list = await brokerList(box.token);
    } catch (e) {
      log(tag, `list error: ${e.message}`);
    }
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      let full = m;
      try {
        full = await brokerRead(m.id, box.token);
      } catch (e) {
        log(tag, `read error: ${e.message}`);
      }
      const blob = [full.subject, full.text, full.html, full.body, JSON.stringify(full).slice(0, 4000)]
        .filter(Boolean)
        .join('\n');
      fs.appendFileSync(path.join(RUN_DIR, 'mail.jsonl'), JSON.stringify({ at: ts(), id: m.id, subject: full.subject, from: full.from, blob: blob.slice(0, 6000) }) + '\n');
      const subj = String(full.subject || '');
      const code6 = (blob.match(/\b(\d{6})\b/) || [])[1];
      const codeAny = (blob.match(/\b(\d{4,8})\b/) || [])[1];
      const code = code6 || codeAny;
      log(tag, `mail from=${String(full.from || '').slice(0, 40)} subj=${subj.slice(0, 80)} code=${code || '-'}`);
      if (code) return { code, subject: subj, from: full.from, receivedAt: new Date().toISOString() };
    }
    await sleep(4000);
  }
  throw new Error('otp-timeout after ' + Math.round(timeoutMs / 1000) + 's');
}

// ---------- browser helpers ----------
function makeNetLogger(cdp, sessionId, dir) {
  const netFile = fs.createWriteStream(path.join(dir, 'net.jsonl'), { flags: 'a' });
  const interesting = (u) => /io\.solutions|io\.net|recaptcha|gstatic|google\.com\/recaptcha|grecaptcha/i.test(u);
  const reqs = new Map();
  cdp.on(
    'Network.requestWillBeSent',
    (p) => {
      if (!p.request.url || p.request.url.startsWith('data:')) return;
      const rec = { t: 'req', id: p.requestId, m: p.request.method, url: p.request.url.slice(0, 500) };
      if (p.request.postData) rec.post = p.request.postData.slice(0, 2000);
      reqs.set(p.requestId, rec);
      if (interesting(p.request.url)) netFile.write(JSON.stringify(rec) + '\n');
    },
    sessionId
  );
  cdp.on(
    'Network.responseReceived',
    (p) => {
      if (!p.response || !p.response.url) return;
      if (interesting(p.response.url)) {
        netFile.write(JSON.stringify({ t: 'res', id: p.requestId, status: p.response.status, mime: p.response.mimeType, url: p.response.url.slice(0, 500) }) + '\n');
      }
      if (interesting(p.response.url) && (p.response.status >= 400 || /passwordless|otp|login|captcha|api-keys|keys|verify/i.test(p.response.url))) {
        cdp
          .send('Network.getResponseBody', { requestId: p.requestId }, sessionId)
          .then((r) => {
            netFile.write(JSON.stringify({ t: 'body', status: p.response.status, url: p.response.url.slice(0, 300), body: String(r.body || '').slice(0, 4000) }) + '\n');
          })
          .catch(() => {});
      }
    },
    sessionId
  );
  cdp.on(
    'Network.loadingFailed',
    (p) => {
      const rec = reqs.get(p.requestId);
      if (rec) netFile.write(JSON.stringify({ t: 'fail', id: p.requestId, err: p.errorText, url: rec.url }) + '\n');
    },
    sessionId
  );
  return netFile;
}

function makeConsoleLogger(cdp, sessionId, dir) {
  const file = fs.createWriteStream(path.join(dir, 'console.jsonl'), { flags: 'a' });
  cdp.on(
    'Runtime.consoleAPICalled',
    (p) => {
      try {
        const args = (p.args || []).map((a) => a.value !== undefined ? a.value : a.description || a.type).join(' ');
        file.write(JSON.stringify({ t: 'console', level: p.type, text: String(args).slice(0, 1000) }) + '\n');
      } catch {}
    },
    sessionId
  );
  cdp.on(
    'Runtime.exceptionThrown',
    (p) => {
      const d = p.exceptionDetails || {};
      file.write(JSON.stringify({ t: 'exception', text: String(d.text || '') + ' ' + String((d.exception && d.exception.description) || '').slice(0, 600) }) + '\n');
    },
    sessionId
  );
  return file;
}

const DOM_SNAP = `(() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const rect = (e) => { const r = e.getBoundingClientRect(); return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; };
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return st.display!=='none' && st.visibility!=='hidden' && st.opacity!=='0' && r.width>2 && r.height>2; };
  return {
    url: location.href, title: document.title, ready: document.readyState,
    inputs: q('input').filter(vis).slice(0,30).map(i=>({type:i.type,name:i.name,id:i.id,ph:(i.placeholder||'').slice(0,50),ml:i.maxLength,val:(i.type==='password'?'*'.repeat(6):String(i.value||'').slice(0,40)),rect:rect(i)})),
    buttons: q('button, a, [role=button], input[type=submit], input[type=button]').filter(vis).slice(0,90).map(e=>({tag:e.tagName,text:((e.innerText||e.value||e.getAttribute('aria-label')||'').trim()).slice(0,70),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true',href:(e.getAttribute&&e.getAttribute('href')||'').slice(0,80),rect:rect(e)})),
    iframes: q('iframe').filter(vis).map(f=>({src:(f.src||'').slice(0,180),t:f.title||'',rect:rect(f)})),
    grecaptcha: { fn: typeof window.grecaptcha, cfg: window.___grecaptcha_cfg ? typeof window.___grecaptcha_cfg.clients : null },
    recaptchaResp: (()=>{ const t=q('textarea[name="g-recaptcha-response"], #g-recaptcha-response')[0]; return t? {len:(t.value||'').length}:null })(),
    bodyText: (document.body?document.body.innerText:'').slice(0,1400)
  };
})()`;

async function snap(cdp, sessionId, tag, { shot = true } = {}) {
  const dom = await B.evalJs(cdp, sessionId, DOM_SNAP).catch((e) => ({ err: e.message }));
  ev({ t: 'snap', tag, dom });
  if (shot) {
    try {
      await B.screenshot(cdp, sessionId, path.join(RUN_DIR, `shot-${tag}.png`));
    } catch (e) {
      ev({ t: 'shot-err', tag, err: e.message });
    }
  }
  log('dom', `${tag}: url=${(dom.url || '').slice(0, 110)} inputs=${dom.inputs ? dom.inputs.length : '?'} btns=${dom.buttons ? dom.buttons.length : '?'} iframes=${dom.iframes ? dom.iframes.length : '?'} gresp=${dom.recaptchaResp ? dom.recaptchaResp.len : '-'}`);
  if (dom.bodyText) log('dom', `  text: ${String(dom.bodyText).replace(/\s+/g, ' ').slice(0, 260)}`);
  return dom;
}

async function clickRect(cdp, sessionId, r, tag) {
  const x = r.x + Math.max(2, Math.min(r.w - 2, r.w / 2));
  const y = r.y + Math.max(2, Math.min(r.h - 2, r.h / 2));
  log('click', `${tag} at ${Math.round(x)},${Math.round(y)} (rect ${JSON.stringify(r)})`);
  await B.clickAt(cdp, sessionId, x, y);
}

async function findClickable(cdp, sessionId, regexSource, { tag = null, exclude = null } = {}) {
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
      if (re.test(t)) { const r = e.getBoundingClientRect(); return { text: t.slice(0, 80), tag: e.tagName, rect: {x:r.x, y:r.y, w:r.width, h:r.height} }; }
    }
    return null;
  })()`;
  return B.evalJs(cdp, sessionId, expr).catch(() => null);
}

async function setInput(cdp, sessionId, selectorExpr, value, tag) {
  // selectorExpr = JS expression returning an element (or use finders below)
  const rect = await B.evalJs(
    cdp,
    sessionId,
    `(() => { const e = (${selectorExpr}); if (!e) return null; e.scrollIntoView({block:'center'}); e.focus(); e.select && e.select(); const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`
  ).catch(() => null);
  if (!rect) return false;
  await B.clickAt(cdp, sessionId, rect.x + Math.min(rect.w / 2, 120), rect.y + rect.h / 2);
  await sleep(150);
  await B.evalJs(cdp, sessionId, `(() => { const e = (${selectorExpr}); e.focus(); e.select && e.select(); return true; })()`).catch(() => {});
  await cdp.send('Input.insertText', { text: value }, sessionId);
  await sleep(120);
  const got = await B.evalJs(cdp, sessionId, `(() => { const e = (${selectorExpr}); return e ? String(e.value||'') : null; })()`).catch(() => null);
  log('type', `${tag}: set "${value.length > 30 ? value.slice(0, 26) + '…' : value}" -> field="${got}"`);
  return got !== null;
}

const EMAIL_SELECTOR = `[...document.querySelectorAll('input')].filter(i => { const r=i.getBoundingClientRect(); const st=getComputedStyle(i); return st.display!=='none' && r.width>2; }).find(i => (i.type==='email') || /e-?mail/i.test(i.name+i.id+i.placeholder+i.autocomplete)) || [...document.querySelectorAll('input[type=text]')].filter(i=>{const r=i.getBoundingClientRect();return r.width>2})[0] || null`;

async function pressEnter(cdp, sessionId) {
  for (const type of ['keyDown', 'char', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: type === 'char' ? '\r' : undefined }, sessionId);
    await sleep(40);
  }
}

async function captchaState(cdp, sessionId) {
  return B.evalJs(
    cdp,
    sessionId,
    `(() => {
      const q = (s) => [...document.querySelectorAll(s)];
      const vis = (e) => { const r=e.getBoundingClientRect(); const st=getComputedStyle(e); return st.display!=='none' && st.visibility!=='hidden' && r.width>2 && r.height>2; };
      const anchor = q('iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"]').filter(vis)[0];
      const bframe = q('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"]').filter(vis)[0];
      const ta = q('textarea[name="g-recaptcha-response"], #g-recaptcha-response')[0];
      const badge = q('.grecaptcha-badge').filter(vis)[0];
      const r = anchor ? anchor.getBoundingClientRect() : null;
      return {
        anchorRect: r ? {x:r.x,y:r.y,w:r.width,h:r.height} : null,
        bframe: bframe ? true : false,
        tokenLen: ta ? (ta.value||'').length : null,
        badge: badge ? true : false,
        grecaptcha: typeof window.grecaptcha,
        cfgClients: window.___grecaptcha_cfg ? Object.keys(window.___grecaptcha_cfg.clients||{}).length : null
      };
    })()`
  ).catch((e) => ({ err: e.message }));
}

// ---------- main ----------
(async () => {
  initRunDir();
  log('run', `dir=${RUN_DIR}`);
  if (!PROXY_LINE) throw new Error('--proxy <line> is required (host line must never be used)');
  const proxy = parseProxy(PROXY_LINE);
  if (!proxy) throw new Error('bad proxy line');
  proxy.connectTimeoutMs = 8000;
  proxy.timeoutMs = 30000;
  const proxyServer = browserUrl(proxy);
  log('run', `proxy=${proxyServer} (scheme ${proxy.protocol}) until=${UNTIL}`);
  ev({ t: 'start', proxy: PROXY_LINE, until: UNTIL, port: PORT });

  // Chrome
  let launched = null;
  try {
    await B.waitPort(PORT, 1200);
    log('run', `reusing Chrome on :${PORT}`);
  } catch {
    launched = B.launchChrome(PORT, arg('tag', 'ionet'));
    log('run', `chrome pid=${launched.pid} profile=${launched.profileDir}`);
  }
  const cdp = await B.connect(PORT);
  const { sessionId, browserContextId } = await B.openContext(cdp, { proxyServer });
  const teardownAuth = await attachProxyAuth(cdp, sessionId, proxy);
  const netFile = makeNetLogger(cdp, sessionId, RUN_DIR);
  const conFile = makeConsoleLogger(cdp, sessionId, RUN_DIR);
  log('run', `context ready (${browserContextId.slice(0, 8)}…)`);

  // gstatic interception: the reCAPTCHA implementation (the only large, poorly
  // reachable dependency) is fetched by Node from the pool and served to the
  // page from cache — the browser then only needs id.io.net + www.google.com.
  const pausedHandler = async (p) => {
    const url = p.request.url || '';
    let handled = false;
    try {
      const r = await gs.get(url, { batch: 4, rounds: 8, timeoutMs: 12000, log: (m) => log('gsfetch', m) });
      if (r.ok) {
        await cdp.send(
          'Fetch.fulfillRequest',
          {
            requestId: p.requestId,
            responseCode: 200,
            responsePhrase: 'OK',
            responseHeaders: [
              { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
              { name: 'Cache-Control', value: 'public, max-age=86400' },
              { name: 'Access-Control-Allow-Origin', value: '*' },
            ],
            body: r.body.toString('base64'),
          },
          sessionId
        );
        handled = true;
        log('gsfetch', `served ${url.slice(60, 150)} (${r.body.length}B from ${r.from === 'cache' ? 'cache' : 'proxy'})`);
      }
    } catch (e) {
      log('gsfetch', `handler error ${e.message}`);
    }
    if (!handled) {
      try {
        await cdp.send('Fetch.continueRequest', { requestId: p.requestId }, sessionId);
      } catch {}
      log('gsfetch', `network fallback for ${url.slice(60, 150)}`);
    }
  };
  cdp.on('Fetch.requestPaused', pausedHandler, sessionId);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*://*.gstatic.com/recaptcha/*', requestStage: 'Request' }] }, sessionId);
  log('run', 'gstatic interception enabled');
  const implPrefetch = await gs
    .get('https://www.gstatic.com/recaptcha/releases/nY0xPItgwtlvjEjk2TqdwOQz/recaptcha__tr.js', { batch: 4, rounds: 6, timeoutMs: 12000, log: (m) => log('gsfetch', m) })
    .catch((e) => ({ ok: false, error: e.message }));
  log('gsfetch', `impl prefetch: ${implPrefetch.ok ? implPrefetch.body.length + 'B from ' + implPrefetch.from : 'FAILED ' + implPrefetch.error}`);

  // mailbox timing: create lazily, right before we need the address
  let box = null;
  const ensureBox = async () => {
    if (box) return box;
    if (EMAIL_OVERRIDE) {
      box = { address: EMAIL_OVERRIDE, token: null, source: 'cli' };
      log('mail', `using cli email ${box.address}`);
      return box;
    }
    if (!flag('no-pool')) {
      box = await takeFromPool().catch(() => null);
      if (box) log('mail', `pool inbox ${box.address}`);
    }
    if (!box) box = await brokerCreate();
    return box;
  };

  let landed = false;
  try {
    log('nav', `goto ${GOTO}`);
    await cdp.send('Page.navigate', { url: GOTO }, sessionId);
    await B.waitLoad(cdp, sessionId, 60000);
    // readyState can hang on third-party resources through a slow exit — poll the DOM.
    for (const w of [4000, 4000, 5000, 6000, 8000, 8000]) {
      await sleep(w);
      const ready = await B.evalJs(cdp, sessionId, `({ready:document.readyState, root:(document.getElementById('root')||document.getElementById('app')||{}).childElementCount||0, inputs:document.querySelectorAll('input').length, url:location.href, title:document.title})`).catch((e) => ({ err: e.message }));
      log('nav', `probe ${JSON.stringify(ready)}`);
      if (ready && ready.root > 0 && (ready.inputs > 0 || ready.ready !== 'loading')) break;
    }
    await snap(cdp, sessionId, '01-landing');

    // Step: make sure the reCAPTCHA implementation itself is really loaded. The app
    // queues grecaptcha work on a stub while gstatic is unreachable; injecting the
    // explicit loader lets the queue flush once (and only once) the line carries it.
    const recState = await B.evalJs(
      cdp,
      sessionId,
      `({ fn: typeof window.grecaptcha, render: typeof (window.grecaptcha && window.grecaptcha.render), fns: window.___grecaptcha_cfg ? (window.___grecaptcha_cfg.fns || []).length : null })`
    ).catch(() => ({}));
    log('captcha', `initial grecaptcha ${JSON.stringify(recState)}`);
    if (!recState || recState.render !== 'function') {
      log('captcha', 'grecaptcha.render missing — injecting the explicit api.js loader');
      await B.evalJs(
        cdp,
        sessionId,
        `(() => {
           if (document.getElementById('ionet-recaptcha-inject')) return 'already';
           const s = document.createElement('script');
           s.id = 'ionet-recaptcha-inject';
           s.src = 'https://www.google.com/recaptcha/api.js?onload=onloadcallback&render=explicit';
           s.async = true; s.defer = true;
           document.head.appendChild(s);
           return 'injected';
         })()`
      ).catch((e) => log('captcha', `inject err ${e.message}`));
    }
    for (let i = 0; i < 12; i++) {
      const now = await B.evalJs(
        cdp,
        sessionId,
        `({ render: typeof (window.grecaptcha && window.grecaptcha.render), fns: window.___grecaptcha_cfg ? (window.___grecaptcha_cfg.fns || []).length : null, clients: window.___grecaptcha_cfg ? Object.keys(window.___grecaptcha_cfg.clients || {}).length : null })`
      ).catch(() => ({}));
      if (i === 0 || i === 5 || i === 11) log('captcha', `wait-impl ${i}: ${JSON.stringify(now)}`);
      if (now && now.render === 'function') break;
      await sleep(2500);
    }

    // Step: open the auth surface. /login shows the provider list; when the modal
    // is closed (or we landed elsewhere) a nav "Login"/"Sign Up" click opens it.
    const hasProviderList = async () => {
      const t = await B.evalJs(cdp, sessionId, `(document.body?document.body.innerText:'')`).catch(() => '');
      return /with email|log into your account|sign up|log ?in/i.test(t) && /google/i.test(t);
    };
    if (!(await hasProviderList())) {
      const c = await findClickable(cdp, sessionId, '^log ?in$|^sign ?in$|^sign ?up$|log ?in|sign ?in');
      if (c) { await clickRect(cdp, sessionId, c.rect, `open-auth("${c.text}")`); await sleep(2500); }
    }
    await snap(cdp, sessionId, '02-login-surface');

    // Prefer the signup variant so a fresh account is created deliberately.
    const toSignup = await findClickable(cdp, sessionId, '^sign ?up$', { tag: 'a' });
    if (toSignup) {
      await clickRect(cdp, sessionId, toSignup.rect, `to-signup("${toSignup.text}")`);
      await sleep(2000);
      await snap(cdp, sessionId, '02b-signup-variant');
    } else {
      log('flow', 'no in-modal "Sign Up" link found; continuing with the login variant');
    }

    // Step: choose the e-mail / OTP option from the provider list
    const emailOpt =
      (await findClickable(cdp, sessionId, 'sign ?up with email|log ?in with email')) ||
      (await findClickable(cdp, sessionId, 'with email')) ||
      (await findClickable(cdp, sessionId, 'e-?mail|otp|continue with mail|magic'));
    if (emailOpt) {
      await clickRect(cdp, sessionId, emailOpt.rect, `email-option("${emailOpt.text}")`);
      await sleep(2200);
    } else {
      log('flow', 'no explicit e-mail option; assuming a direct email field');
    }
    await snap(cdp, sessionId, '03-after-email-option');

    // Step: type the address
    box = await ensureBox();
    const typed = await setInput(cdp, sessionId, EMAIL_SELECTOR, box.address, 'email');
    if (!typed) {
      await snap(cdp, sessionId, '03b-no-email-field');
      throw new Error('email field not found — need manual adaptation');
    }
    await sleep(600);
    await snap(cdp, sessionId, '04-email-typed', { shot: true });

    // Step: captcha pre-pass — the v2 checkbox renders in the e-mail step and the
    // Continue button stays disabled until the token is set.
    let capPre = null;
    for (let i = 0; i < 6; i++) {
      capPre = await captchaState(cdp, sessionId);
      const domPre = await B.evalJs(cdp, sessionId, DOM_SNAP).catch(() => ({}));
      const btns = (domPre.buttons || []).map((b) => `${b.text}${b.disabled ? '(d)' : ''}`).join(' | ');
      log('captcha', `pre-pass ${i}: ${JSON.stringify(capPre)} btns=${btns.slice(0, 200)}`);
      if (capPre.anchorRect || (capPre.tokenLen !== null && capPre.tokenLen !== undefined)) break;
      await sleep(2000);
    }
    if (capPre && capPre.anchorRect) {
      const r = capPre.anchorRect;
      log('captcha', `v2 anchor visible at ${JSON.stringify(r)} — clicking checkbox`);
      for (let k = 0; k < 3; k++) {
        await B.clickAt(cdp, sessionId, r.x + Math.min(30, r.w / 2), r.y + Math.min(34, r.h - 4));
        await sleep(5000);
        const cap2 = await captchaState(cdp, sessionId);
        log('captcha', `post-click ${k + 1}: ${JSON.stringify(cap2)}`);
        if (cap2.bframe) { log('captcha', 'IMAGE CHALLENGE presented'); break; }
        if (cap2.tokenLen && cap2.tokenLen > 20) { log('captcha', `token acquired (${cap2.tokenLen} chars)`); break; }
      }
      await snap(cdp, sessionId, '04b-captcha-clicked');
    } else {
      log('captcha', 'no v2 checkbox rendered on the e-mail step');
    }

    // Step: submit
    const NAV_EXCL = '^(login|sign ?up|docs|dashboard|cloud|docs)$';
    const btn =
      (await findClickable(cdp, sessionId, '^continue$', { exclude: NAV_EXCL })) ||
      (await findClickable(cdp, sessionId, 'continue|send|get code|receive|next|submit', { exclude: NAV_EXCL }));
    if (btn) {
      await clickRect(cdp, sessionId, btn.rect, `submit("${btn.text}")`);
    } else {
      log('flow', 'no submit button found; pressing Enter in the email field');
      await B.evalJs(cdp, sessionId, `(() => { const e = (${EMAIL_SELECTOR}); e && e.focus(); return true; })()`);
      await pressEnter(cdp, sessionId);
    }
    await sleep(3000);

    // Step: watch for captcha / OTP screen / error over the next ~40s
    let outcome = null;
    for (let i = 0; i < 10; i++) {
      await sleep(4000);
      const cap = await captchaState(cdp, sessionId);
      const dom = await B.evalJs(cdp, sessionId, DOM_SNAP).catch(() => ({}));
      const text = String(dom.bodyText || '').replace(/\s+/g, ' ');
      const otpInputs = (dom.inputs || []).filter((x) => x.ml === 1 && x.type !== 'checkbox').length;
      const errMatch = text.match(/(captcha[^.]{0,80}|verification failed[^.]{0,80}|too many[^.]{0,80}|try again[^.]{0,60}|something went wrong[^.]{0,60}|invalid[^.]{0,60}|rate limit[^.]{0,60}|blocked[^.]{0,60})/i);
      log('watch', `t+${(i + 1) * 4}s cap=${JSON.stringify(cap)} otpInputs=${otpInputs} url=${(dom.url || '').slice(0, 90)}`);
      if (i === 0 || errMatch || cap.anchorRect || cap.bframe) await snap(cdp, sessionId, `05-watch-${i}`);
      if (cap.bframe) { outcome = { kind: 'v2-image-challenge' }; break; }
      if (errMatch) { outcome = { kind: 'error-text', err: errMatch[1] }; break; }
      if (otpInputs >= 4 || /enter (the )?code|verification code|we (sent|emailed)|check your (inbox|email)|code (was )?sent|verify your email/i.test(text)) {
        outcome = { kind: 'otp-screen' };
        break;
      }
    }

    // Handle a v2 checkbox click if that's what appeared
    if (!outcome) {
      const cap = await captchaState(cdp, sessionId);
      if (cap.anchorRect) {
        log('captcha', 'v2 anchor visible — clicking the checkbox');
        const r = cap.anchorRect;
        for (let k = 0; k < 2; k++) {
          await B.clickAt(cdp, sessionId, r.x + 30, r.y + Math.min(34, r.h - 4));
          await sleep(6000);
          const cap2 = await captchaState(cdp, sessionId);
          log('captcha', `after click ${k + 1}: ${JSON.stringify(cap2)}`);
          if (cap2.bframe) { outcome = { kind: 'v2-image-challenge' }; break; }
          if (cap2.tokenLen && cap2.tokenLen > 20) { outcome = { kind: 'v2-token-acquired', tokenLen: cap2.tokenLen }; break; }
        }
        await snap(cdp, sessionId, '06-after-captcha-click');
      }
    }

    if (!outcome) {
      const dom = await B.evalJs(cdp, sessionId, DOM_SNAP).catch(() => ({}));
      const text = String(dom.bodyText || '');
      const post = (dom.inputs || []).length;
      outcome = { kind: 'unknown', inputsOnPage: post, textTail: text.slice(0, 400) };
    }
    log('flow', `outcome=${JSON.stringify(outcome)}`);
    ev({ t: 'outcome', outcome });
    await snap(cdp, sessionId, '07-outcome');

    if (UNTIL === 'auth') {
      log('run', 'stopping after auth phase (--until auth)');
      teardownAuth();
      cdp.close();
      return;
    }

    if (outcome.kind !== 'otp-screen' && outcome.kind !== 'v2-token-acquired') {
      log('run', `captcha/auth gate not passed (${outcome.kind}) — stopping before any key work`);
      teardownAuth();
      cdp.close();
      return;
    }

    // ---- OTP ----
    log('otp', 'waiting for the code in the mailbox…');
    const otp = await waitForOtp(box, { timeoutMs: 180000 });
    log('otp', `code=${otp.code}`);
    const codeInput = `[...document.querySelectorAll('input')].filter(i=>{const r=i.getBoundingClientRect();return r.width>2;}).find(i=>i.maxLength===1) || [...document.querySelectorAll('input')].filter(i=>{const r=i.getBoundingClientRect();return r.width>2;})[0] || null`;
    const okType = await setInput(cdp, sessionId, codeInput, otp.code, 'otp-code');
    if (!okType) throw new Error('otp input not found');
    await snap(cdp, sessionId, '08-code-typed');
    // submit code (button or Enter)
    const btn2 =
      (await findClickable(cdp, sessionId, '^verify( code)?$', { exclude: NAV_EXCL })) ||
      (await findClickable(cdp, sessionId, 'verify|confirm|^continue$|^submit$', { exclude: NAV_EXCL }));
    if (btn2) await clickRect(cdp, sessionId, btn2.rect, `otp-submit("${btn2.text}")`);
    else { const i2 = `(${codeInput})`; await B.evalJs(cdp, sessionId, `(() => { const e = ${i2}; if (e) e.focus(); e && e.select(); return true; })()`).catch(() => {}); await pressEnter(cdp, sessionId); }
    await sleep(8000);
    await snap(cdp, sessionId, '09-after-otp');

    const after = await B.evalJs(cdp, sessionId, `({url:location.href, text:(document.body?document.body.innerText:'').slice(0,600)})`).catch(() => ({}));
    log('flow', `after otp url=${after.url}`);
    ev({ t: 'after-otp', after });
    const loggedIn = !/id\.io\.net/i.test(after.url || '') && !/log ?in|sign ?up|verif/i.test(after.url || '');

    if (UNTIL === 'key' || !loggedIn) {
      log('run', loggedIn ? 'logged in; --until key stops here' : 'login not confirmed by URL — stopping');
      teardownAuth();
      cdp.close();
      return;
    }

    // ---- API key ----
    log('key', 'navigating to the API keys console');
    await cdp.send('Page.navigate', { url: 'https://ai.io.net/ai/api-keys' }, sessionId);
    await B.waitLoad(cdp, sessionId, 120000);
    await sleep(6000);
    await snap(cdp, sessionId, '10-apikeys');
    let createBtn = await findClickable(cdp, sessionId, 'create (new )?(api )?key|new (api )?key|create key|\\+ ?key');
    if (!createBtn) createBtn = await findClickable(cdp, sessionId, 'create|new key|add');
    if (createBtn) {
      await clickRect(cdp, sessionId, createBtn.rect, `create-key("${createBtn.text}")`);
      await sleep(2500);
      await snap(cdp, sessionId, '11-key-modal');
      // optional name field in modal
      const nameField = `[...document.querySelectorAll('input')].filter(i=>{const r=i.getBoundingClientRect();return r.width>2 && i.type!=='hidden';})[0] || null`;
      const domNow = await B.evalJs(cdp, sessionId, DOM_SNAP).catch(() => ({}));
      if ((domNow.inputs || []).length) {
        await setInput(cdp, sessionId, nameField, 'ionet-' + Date.now().toString(36), 'key-name').catch(() => {});
        await sleep(500);
      }
      const create2 = await findClickable(cdp, sessionId, 'create|generate|confirm|save|add key');
      if (create2) {
        await clickRect(cdp, sessionId, create2.rect, `key-create-confirm("${create2.text}")`);
      } else {
        log('key', 'no confirm button — submitting modal with Enter');
        await pressEnter(cdp, sessionId);
      }
      await sleep(6000);
      await snap(cdp, sessionId, '12-key-result', { shot: true });
    } else {
      log('key', 'no create-key button found on the console page');
    }

    // try to read the key from a captured POST response first
    await sleep(1500);
    let key = null;
    const netRaw = fs.readFileSync(path.join(RUN_DIR, 'net.jsonl'), 'utf8').split('\n').filter(Boolean);
    for (const line of netRaw.reverse()) {
      try {
        const j = JSON.parse(line);
        if (j.t === 'body' && /key/i.test(j.url) && /"?value"?\s*[:=]/.test(j.body || '')) {
          const m = j.body.match(/"(?:value|key|api_key|apiKey)"\s*:\s*"([^"]{20,})"/);
          if (m) { key = m[1]; log('key', `key from network body (${j.url.slice(0, 80)})`); break; }
        }
      } catch {}
    }
    if (!key) {
      const domKey = await B.evalJs(cdp, sessionId, `(() => { const t = document.body.innerText; const m = t.match(/[A-Za-z0-9_-]{28,}/g); return m ? m.filter(x=>!/(http|className|function|undefined)/.test(x)).slice(0,10) : []; })()`).catch(() => []);
      log('key', `text candidates: ${JSON.stringify(domKey)}`);
    }
    if (key) {
      fs.writeFileSync(path.join(RUN_DIR, 'key.txt'), key + '\n');
      fs.appendFileSync(path.join(ROOT, 'keys.pending.txt'), `${box.address}\t${key}\t${new Date().toISOString()}\n`);
      log('key', `key ${key.slice(0, 6)}…${key.slice(-4)} written to key.txt + keys.pending.txt`);

      if (UNTIL === 'verify') {
        // live verify through the same exit
        try {
          const models = await fetchText(proxy, 'https://api.intelligence.io.solutions/api/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
            timeoutMs: 40000,
          });
          const okModels = /"data"|"id"/.test(models);
          log('verify', `GET /models -> ${okModels ? 'JSON ok' : 'unexpected: ' + models.slice(0, 160)}`);
          const chat = await fetchText(proxy, 'https://api.intelligence.io.solutions/api/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: { model: 'meta-llama/Llama-3.3-70B-Instruct', messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 8 },
            timeoutMs: 60000,
          });
          log('verify', `chat -> ${chat.slice(0, 200).replace(/\s+/g, ' ')}`);
          ev({ t: 'verify', modelsOk: okModels, chatSnippet: chat.slice(0, 300), key: key.slice(0, 6) + '…' + key.slice(-4) });
          if (okModels && /"choices"|"content"/.test(chat)) {
            fs.appendFileSync(path.join(ROOT, 'keys.txt'), key + '\n');
            log('verify', 'KEY LIVE — appended to keys.txt');
          } else {
            log('verify', 'key NOT live (models/chat mismatch) — left in keys.pending.txt');
          }
        } catch (e) {
          log('verify', `verify error: ${e.message}`);
        }
      }
    }

    teardownAuth();
    cdp.close();
    log('run', 'done');
  } catch (e) {
    log('FAIL', e.stack || e.message);
    ev({ t: 'fail', err: String(e.message) });
    try { await snap(cdp, sessionId, '99-fail').catch(() => {}); } catch {}
    try { teardownAuth(); } catch {}
    try { cdp.close(); } catch {}
    process.exitCode = 1;
  } finally {
    try { netFile.end(); conFile.end(); } catch {}
    if (launched) log('run', `chrome left open on :${PORT} (pid ${launched.pid}) for inspection`);
  }
})();
