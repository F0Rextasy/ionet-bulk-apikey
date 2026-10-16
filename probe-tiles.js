'use strict';
// One-off diagnostic: how are reCAPTCHA tiles rendered (background vs img child)?
//   node src/probe-tiles.js --port 9411
const B = require('./browser');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PORT = parseInt(arg('port', '9411'), 10);

(async () => {
  const cdp = await B.connect(PORT);
  const targets = (await cdp.send('Target.getTargets')).targetInfos;
  const attach = async (id) => (await cdp.send('Target.attachToTarget', { targetId: id, flatten: true })).sessionId;
  const ev = async (sid, expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid);
    if (r.exceptionDetails) return { EXC: r.exceptionDetails.text };
    return r.result && r.result.value;
  };
  const page = targets.find((t) => t.type === 'page' && /io\.net/.test(t.url || ''));
  const psid = await attach(page.targetId);
  const frames = await ev(psid, `[...document.querySelectorAll('iframe')].map(f=>{const r=f.getBoundingClientRect();return {src:String(f.src).slice(0,60),x:r.x,y:r.y,w:r.width,h:r.height,vis:getComputedStyle(f).visibility,disp:getComputedStyle(f).display};})`);
  console.log('PAGE', page.url.slice(0, 70), 'viewport', await ev(psid, `({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,sx:scrollX,sy:scrollY})`));
  console.log('IFRAMES', JSON.stringify(frames, null, 1));
  const bf = targets.filter((t) => t.type === 'iframe' && /6Ld3OMEs/.test(t.url || '') && /bframe/.test(t.url)).pop();
  const sid = await attach(bf.targetId);
  const info = await ev(sid, `(() => {
    const ts=[...document.querySelectorAll('.rc-imageselect-tile')];
    const sample=ts.slice(0,3).map(t=>{
      const cs=getComputedStyle(t);
      const kids=[...t.children].map(k=>k.tagName+':'+String(k.src||k.style.backgroundImage||'').slice(0,70));
      return {cls:String(t.className).slice(0,80), bg:cs.backgroundImage.slice(0,90), bpos:cs.backgroundPosition, bsize:cs.backgroundSize, kids, html:t.innerHTML.slice(0,120)};
    });
    const imgs=[...document.querySelectorAll('img')].map(i=>({src:String(i.src).slice(0,90), w:i.naturalWidth, h:i.naturalHeight, disp:getComputedStyle(i).display, cls:String(i.className).slice(0,40)}));
    return {tileCount:ts.length, sample, imgs, vp:{w:innerWidth,h:innerHeight}, scroll:{x:scrollX,y:scrollY}};
  })()`);
  console.log(JSON.stringify(info, null, 1));
  try { cdp.close(); } catch {}
  process.exit(0);
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1); });
