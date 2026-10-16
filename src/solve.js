'use strict';
/*
 * Interactive reCAPTCHA v2 solver loop (agent-in-the-loop), OOPIF-native.
 *
 * The challenge panel lives in its own iframe target, and Chrome still routes
 * Input events to an OOPIF even when the host has it parked off-screen — so the
 * whole solve runs through the iframe's own CDP session and never depends on
 * host-side visibility (measured: host keeps the bframe at y=-9999, clicks via
 * its session register fine).
 *
 *   node src/solve.js --port 9343
 *
 * Protocol with the agent:
 *   round:  outputs/solve/round-<n>.png   (payload image)
 *           outputs/solve/state.json      (instruction/grid/verify rect)
 *   answer: outputs/solve/clicks.json     ({"tiles":[...row-major...] ,"verify":true})
 *           or {"refresh":true}           (ask for a fresh challenge)
 *   done:   outputs/solve/DONE
 */
const fs = require('fs');
const path = require('path');
const B = require('./browser');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const PORT = parseInt(arg('port', '9343'), 10);
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs', 'solve');
const CLICKS = path.join(OUT, 'clicks.json');
const STATE = path.join(OUT, 'state.json');
const DONE = path.join(OUT, 'DONE');
const FAILED = path.join(OUT, 'FAILED');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const cdp = await B.connect(PORT);
  const listTargets = async () => (await cdp.send('Target.getTargets')).targetInfos;
  const attach = async (targetId) => {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    return sessionId;
  };
  const evalIn = async (sessionId, expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error('eval: ' + r.exceptionDetails.text);
    return r.result && r.result.value;
  };
  const clickIn = async (sessionId, x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    await sleep(70);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
    await sleep(50);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
  };

  const hostTarget = (await listTargets()).filter((t) => t.type === 'page' && /io\.net/.test(t.url))[0];
  if (!hostTarget) throw new Error('no io.net page');
  const hostSession = await attach(hostTarget.targetId);
  const hostToken = () => evalIn(hostSession, `(() => { const t=document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response'); return t? (t.value||'').length : 0; })()`);

  const v2Frame = (t) => t.type === 'iframe' && /6Ld3OMEs/.test(t.url || '');
  const clickAnchor = async () => {
    const an = (await listTargets()).find((t) => v2Frame(t) && /anchor/.test(t.url));
    if (!an) throw new Error('no v2 anchor target');
    const sid = await attach(an.targetId);
    const rect = await evalIn(sid, `(() => { const cb=document.querySelector('.recaptcha-checkbox'); if(!cb) return null; const r=cb.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,cls:cb.className}; })()`);
    if (!rect) throw new Error('no checkbox in anchor');
    console.log(`anchor click at ${Math.round(rect.x)},${Math.round(rect.y)} (state ${String(rect.cls).slice(0, 80)})`);
    await clickIn(sid, rect.x, rect.y);
  };

  const dumpChallenge = async (bfTarget) => {
    const sid = await attach(bfTarget.targetId);
    const d = await evalIn(sid, `(() => {
      const instr=(document.querySelector('.rc-imageselect-desc-wrapper, .rc-imageselect-desc-no-canonical, .rc-imageselect-desc')||{}).innerText||null;
      const errEl=document.querySelector('.rc-imageselect-error-select-more, .rc-imageselect-error');
      const err=errEl? errEl.innerText : null;
      const tiles=[...document.querySelectorAll('.rc-imageselect-tile')].map(t=>{const r=t.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),sel:/selected/.test(t.className||'')};});
      const vb=document.querySelector('#recaptcha-verify-button');
      const vbr=vb? vb.getBoundingClientRect():null;
      const big=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0];
      let data=null;
      try{ if(big){const c=document.createElement('canvas');c.width=big.naturalWidth;c.height=big.naturalHeight;c.getContext('2d').drawImage(big,0,0);data=c.toDataURL('image/png');} }catch(e){data=null}
      return {instr, err, tiles, verify: vbr? {x:Math.round(vbr.x+vbr.width/2), y:Math.round(vbr.y+vbr.height/2)}:null, img: data, imgW: big?big.naturalWidth:0, imgH: big?big.naturalHeight:0, imgKey: big? big.src.slice(60,120):null};
    })()`);
    return { sid, d };
  };

  let round = 0;
  let lastKey = null;
  let stale = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      if (fs.existsSync(DONE)) break;
      const tok = await hostToken();
      if (tok > 20) { fs.writeFileSync(DONE, JSON.stringify({ tokenLen: tok, at: new Date().toISOString() })); console.log('TOKEN acquired len=' + tok); break; }

      let bfs = (await listTargets()).filter((t) => v2Frame(t) && /bframe/.test(t.url));
      if (!bfs.length) {
        console.log('no bframe targets — clicking anchor');
        await clickAnchor();
        await sleep(4000);
        continue;
      }
      const bf = bfs[bfs.length - 1];
      const { sid, d } = await dumpChallenge(bf);
      if (!d || !d.tiles || !d.tiles.length) {
        console.log('bframe has no tiles — clicking anchor for a fresh challenge');
        await clickAnchor();
        await sleep(4000);
        continue;
      }
      const key = `${d.instr}|${d.imgKey}|${d.tiles.length}`;
      if (key === lastKey) {
        stale++;
        if (stale >= 2) {
          console.log('challenge unchanged twice — refreshing via anchor');
          lastKey = null; stale = 0;
          await clickAnchor();
          await sleep(4000);
          continue;
        }
      } else {
        stale = 0;
        lastKey = key;
      }

      round++;
      const shot = path.join(OUT, `round-${round}.png`);
      if (d.img && d.img.startsWith('data:')) fs.writeFileSync(shot, Buffer.from(d.img.split(',')[1], 'base64'));
      const cols = [...new Set(d.tiles.map((t) => t.x))].length || 3;
      fs.writeFileSync(
        STATE,
        JSON.stringify(
          {
            round, at: new Date().toISOString(), instruction: d.instr, error: d.err,
            imgW: d.imgW, imgH: d.imgH, shot: path.basename(shot), cols,
            tiles: d.tiles.map((t, i) => ({ i, r: Math.floor(i / cols), c: i % cols, x: t.x, y: t.y, w: t.w, h: t.h, sel: t.sel })),
            verify: d.verify,
          },
          null,
          1
        )
      );
      console.log(`round ${round}: "${String(d.instr || '').split('\n')[0]}" cols=${cols} tiles=${d.tiles.length} err=${JSON.stringify(d.err)} -> ${path.basename(shot)}; waiting for clicks.json`);

      if (fs.existsSync(CLICKS)) fs.unlinkSync(CLICKS);
      let clicks = null;
      for (let i = 0; i < 60; i++) {
        await sleep(2000);
        if (fs.existsSync(CLICKS)) {
          try { clicks = JSON.parse(fs.readFileSync(CLICKS, 'utf8')); } catch { clicks = null; }
          if (clicks) break;
        }
      }
      if (!clicks) { console.log('no answer in 120s; refreshing challenge'); await clickAnchor(); await sleep(4000); continue; }
      if (clicks.refresh) { console.log('agent asked for refresh'); await clickAnchor(); await sleep(4000); continue; }

      for (const idx of clicks.tiles || []) {
        const t = d.tiles[idx];
        if (!t) continue;
        console.log(`  click tile ${idx} at ${t.x + Math.round(t.w / 2)},${t.y + Math.round(t.h / 2)}`);
        await clickIn(sid, t.x + t.w / 2, t.y + t.h / 2);
        await sleep(350);
      }
      if (clicks.verify !== false && d.verify) {
        await sleep(400);
        console.log(`  verify at ${d.verify.x},${d.verify.y}`);
        await clickIn(sid, d.verify.x, d.verify.y);
      }
      await sleep(3500);
      const tok2 = await hostToken();
      console.log('  after solve: token=' + tok2);
      if (tok2 > 20) { fs.writeFileSync(DONE, JSON.stringify({ tokenLen: tok2, at: new Date().toISOString() })); console.log('TOKEN acquired len=' + tok2); break; }
    } catch (e) {
      console.log('round error:', e.message);
      await sleep(2000);
    }
  }
  if (!fs.existsSync(DONE) && !fs.existsSync(FAILED)) fs.writeFileSync(FAILED, 'loop ended without token');
  process.exit(0);
})();
