'use strict';
/*
 * Tiny CDP driver for the live pilot page — for the agent-in-the-loop part of
 * the reCAPTCHA image challenge (screenshot → read → click tiles).
 *
 *   node src/drive.js state            # bframe rect, token length, url, title
 *   node src/drive.js shot out.png     # full-page screenshot
 *   node src/drive.js click X Y        # mouse click at viewport coords
 *   node src/drive.js eval "expr"      # evaluate JS, print JSON
 *   node src/drive.js find             # list io.net page targets
 *
 * Port via --port (default 9343); target via --target <prefix> (optional).
 */
const fs = require('fs');
const B = require('./browser');

// A dead CDP socket must not take the driver down mid-click.
process.on('uncaughtException', (e) => console.log(`WARN uncaught: ${String(e && e.message).slice(0, 180)}`));

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const PORT = parseInt(arg('port', '9343'), 10);
const TARGET = arg('target', '');
const [action, a1, a2] = argv.filter((a, i) => {
  if (a === '--port' || a === '--target') return false;
  if (i > 0 && (argv[i - 1] === '--port' || argv[i - 1] === '--target')) return false;
  return true;
});

(async () => {
  const cdp = await B.connect(PORT);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const pages = targetInfos.filter((t) => t.type === 'page');
  if (action === 'find') {
    pages.forEach((t) => console.log(t.targetId.slice(0, 8), t.url.slice(0, 120)));
    process.exit(0);
  }
  const page = TARGET
    ? pages.find((t) => t.targetId.startsWith(TARGET))
    : pages.filter((t) => /io\.net/.test(t.url)).sort((a, b) => (b.lastActiveTime || 0) - (a.lastActiveTime || 0))[0] || pages[0];
  if (!page) throw new Error('no page target');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);

  if (action === 'state') {
    const st = await B.evalJs(
      cdp,
      sessionId,
      `(() => {
        const q = (s) => [...document.querySelectorAll(s)];
        const vis = (e) => { const r=e.getBoundingClientRect(); const st=getComputedStyle(e); return st.display!=='none' && st.visibility!=='hidden' && r.width>2 && r.height>2; };
        const bf = q('iframe[src*="recaptcha"]').filter(vis).map(f=>({src:(f.src||'').slice(0,110), rect:(r=>({x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}))(f.getBoundingClientRect())}));
        const ta = q('textarea[name="g-recaptcha-response"], #g-recaptcha-response')[0];
        const cont=[...document.querySelectorAll('button')].find(x=>/^continue$/i.test((x.innerText||'').trim()));
        return { url: location.href, title: document.title, frames: bf, token: ta? (ta.value||'').length : null, continueDisabled: cont? cont.disabled : null, scrollY: window.scrollY, w: innerWidth, h: innerHeight };
      })()`
    );
    console.log(JSON.stringify(st, null, 1));
    process.exit(0);
  }
  if (action === 'shot') {
    const file = a1 || 'drive-shot.png';
    await B.screenshot(cdp, sessionId, file);
    console.log('saved', file);
    process.exit(0);
  }
  if (action === 'click') {
    const x = parseFloat(a1);
    const y = parseFloat(a2);
    await B.clickAt(cdp, sessionId, x, y);
    console.log('clicked', x, y);
    process.exit(0);
  }
  if (action === 'type') {
    const text = a1;
    const info = await B.evalJs(
      cdp,
      sessionId,
      `(() => {
        const i=[...document.querySelectorAll('input')].filter(x=>{const r=x.getBoundingClientRect();return r.width>2 && getComputedStyle(x).display!=='none';})[0];
        if (!i) return null;
        i.focus(); i.select && i.select();
        const r=i.getBoundingClientRect();
        return {x:r.x+r.width/2, y:r.y+r.height/2, name:i.name};
      })()`
    );
    if (!info) throw new Error('no visible input');
    await B.clickAt(cdp, sessionId, info.x, info.y);
    await cdp.send('Input.insertText', { text }, sessionId);
    const got = await B.evalJs(cdp, sessionId, `(()=>{const i=[...document.querySelectorAll('input')].filter(x=>x.getBoundingClientRect().width>2)[0];return i?String(i.value||''):null;})()`);
    console.log(`typed into ${info.name||'?'} -> field="${got}"`);
    process.exit(0);
  }
  if (action === 'eval') {
    const r = await B.evalJs(cdp, sessionId, a1);
    console.log(JSON.stringify(r, null, 1));
    process.exit(0);
  }
  console.log('usage: state|shot|click X Y|eval expr|find');
  process.exit(1);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
