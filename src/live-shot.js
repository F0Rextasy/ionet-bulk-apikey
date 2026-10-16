'use strict';
// Live viewport/challenge capture for the feeder (works on sprite-based tile variants
// where live-grid.js cannot export canvases — cross-origin taint).
//
//   node src/live-shot.js --port 9421 --out outputs/solve-LP-11/shot.png
//     [--clip 0,100,450,470]   clip rect in page coords (x,y,w,h)
//
// Saves the page screenshot and prints the b-frame tile rects + their inner markup hints.
const fs = require('fs');
const path = require('path');
const B = require('./browser');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PORT = parseInt(arg('port', '9421'), 10);
const OUT = path.resolve(arg('out', path.join(ROOT, 'outputs', 'live-shot.png')));
const CLIP = arg('clip', '');

(async () => {
  const cdp = await B.connect(PORT);
  const targets = (await cdp.send('Target.getTargets')).targetInfos;
  const page = targets.find((t) => t.type === 'page' && /io\.net/.test(t.url || '')) || targets.find((t) => t.type === 'page');
  if (!page) { console.log('NO PAGE'); process.exit(1); }
  const psid = (await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })).sessionId;

  const args = { format: 'png', captureBeyondViewport: false };
  if (CLIP) {
    const [x, y, w, h] = CLIP.split(',').map(Number);
    args.clip = { x, y, width: w, height: h, scale: 1 };
  }
  const shot = await cdp.send('Page.captureScreenshot', args, psid);
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('shot ' + OUT + ' bytes=' + Buffer.from(shot.data, 'base64').length);

  const bf = targets.filter((t) => t.type === 'iframe' && /bframe/.test(t.url || '')).pop();
  if (!bf) { console.log('NO BFRAME'); try { cdp.close(); } catch {} process.exit(0); }
  const sid = (await cdp.send('Target.attachToTarget', { targetId: bf.targetId, flatten: true })).sessionId;
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid);
    if (r.exceptionDetails) return { EXC: r.exceptionDetails.text };
    return r.result && r.result.value;
  };
  const info = await ev(`(() => {
    const ts=[...document.querySelectorAll('.rc-imageselect-tile')];
    const rct=(el)=>{ if(!el) return null; const r=el.getBoundingClientRect(); return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), cx:Math.round(r.x+r.width/2), cy:Math.round(r.y+r.height/2), text:(el.innerText||'').trim().slice(0,20), vis:getComputedStyle(el).visibility, disp:getComputedStyle(el).display }; };
    const buttons={ verify: rct(document.querySelector('#recaptcha-verify-button')),
      reload: rct(document.querySelector('#recaptcha-reload-button')),
      anchor: rct(document.querySelector('.recaptcha-checkbox')),
      err: rct(document.querySelector('.rc-imageselect-error-select-more, .rc-imageselect-error')),
      scrollY: Math.round(window.scrollY), scrollX: Math.round(window.scrollX) };
    return { n: ts.length, vp:{w:innerWidth,h:innerHeight}, buttons,
      tiles: ts.map((t,i)=>{ const r=t.getBoundingClientRect(); const im=t.querySelector('img');
        const cs=getComputedStyle(t);
        return { i, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height),
          sel:/selected/.test(t.className||''),
          img: im? { src: String(im.src).slice(0,64), nw: im.naturalWidth, nh: im.naturalHeight, x: Math.round(im.getBoundingClientRect().x), y: Math.round(im.getBoundingClientRect().y), w: Math.round(im.getBoundingClientRect().width), h: Math.round(im.getBoundingClientRect().height) } : null,
          bg: cs.backgroundImage.slice(0,80), bp: cs.backgroundPosition }; }) };
  })()`);
  console.log(JSON.stringify(info));
  try { cdp.close(); } catch {}
  process.exit(0);
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1); });
