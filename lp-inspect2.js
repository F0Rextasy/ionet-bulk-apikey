'use strict';
// Read-only: per-tile background sprite mapping (feeder-side).
const B = require('./browser');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PORT = parseInt(arg('port', '9421'), 10);
(async () => {
  const cdp = await B.connect(PORT);
  const targets = (await cdp.send('Target.getTargets')).targetInfos;
  const attach = async (id) => (await cdp.send('Target.attachToTarget', { targetId: id, flatten: true })).sessionId;
  const ev = async (sid, expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid); if (r.exceptionDetails) return { EXC: r.exceptionDetails.text }; return r.result && r.result.value; };
  const bf = targets.filter((t) => t.type === 'iframe' && /bframe/.test(t.url || '')).pop();
  if (!bf) { console.log('NO BFRAME'); process.exit(0); }
  const sid = await attach(bf.targetId);
  const info = await ev(sid, `(() => {
    const ts=[...document.querySelectorAll('.rc-imageselect-tile')];
    const tiles=ts.map((t,i)=>{const cs=getComputedStyle(t);const r=t.getBoundingClientRect();return {i,x:Math.round(r.x),y:Math.round(r.y),bg:cs.backgroundImage.slice(0,110),bp:cs.backgroundPosition,bs:cs.backgroundSize,cls:String(t.className).replace('rc-imageselect-tile','').slice(0,30)};});
    const imgs=[...document.querySelectorAll('img')].map(i=>{const r=i.getBoundingClientRect();return {src:String(i.src).slice(0,70),nw:i.naturalWidth,nh:i.naturalHeight,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};});
    const tcount=(document.querySelector('.rc-imageselect-desc')||{}).textContent;
    return {n:ts.length, head:tiles.slice(0,4), tail:tiles.slice(28), imgs, hscroll:document.documentElement.scrollWidth, vp:innerWidth};
  })()`);
  console.log(JSON.stringify(info, null, 1));
  try { cdp.close(); } catch {}
  process.exit(0);
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1); });
