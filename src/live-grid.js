'use strict';
/*
 * Live challenge dump for the captcha feeder.
 *
 * The round-N.png the driver writes is the big <img>'s pixels at dump time; on the
 * dynamic review/replacement stage tiles get swapped after selections and that PNG
 * goes stale (measured: identical sha across a whole captcha session). Each tile
 * carries its OWN <img>, so this tool stitches the true grid from the per-tile imgs
 * inside the bframe and also reports the live sel bits.
 *
 *   node src/live-grid.js --port 9411 --tag LW-5 [--label after-r10]
 *
 * Writes outputs/solve-<TAG>/live-<LABEL>.png (true grid, native tile res) and prints
 * one JSON blob: instr/err/cols/sel/tiles/imgSha/shot.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const B = require('./browser');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const PORT = parseInt(arg('port', '9411'), 10);
const TAG = arg('tag', 'LW-5');
const LABEL = arg('label', 'live');

const OUTDIR = path.join(ROOT, 'outputs', `solve-${TAG}`);

// Stitch the true grid from the per-tile <img> elements.
const DUMP = `(async () => {
  const instr=(document.querySelector('.rc-imageselect-desc-wrapper, .rc-imageselect-desc-no-canonical, .rc-imageselect-desc')||{}).innerText||null;
  const errEl=document.querySelector('.rc-imageselect-error-select-more, .rc-imageselect-error');
  const ts=[...document.querySelectorAll('.rc-imageselect-tile')];
  const tiles=ts.map(t=>{const r=t.getBoundingClientRect();const im=t.querySelector('img');return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),sel:/selected/.test(t.className||''),src:im?String(im.src):null,sw:im?im.naturalWidth:0,sh:im?im.naturalHeight:0,img:im};});
  const imgs=tiles.map(t=>t.img).filter(Boolean);
  try { await Promise.all(imgs.map(i=>i.decode().catch(()=>null))); } catch(e) {}
  const W=Math.max(...imgs.filter(Boolean).map(i=>i.naturalWidth||0), 1);
  const H=Math.max(...imgs.filter(Boolean).map(i=>i.naturalHeight||0), 1);
  const xs=[...new Set(tiles.map(t=>t.x))].sort((a,b)=>a-b);
  const ys=[...new Set(tiles.map(t=>t.y))].sort((a,b)=>a-b);
  const cols=xs.length||3, rows=ys.length||3;
  const c=document.createElement('canvas'); c.width=cols*120; c.height=rows*120;
  const g=c.getContext('2d'); g.fillStyle='#333'; g.fillRect(0,0,c.width,c.height);
  let drawn=0;
  tiles.forEach(t=>{ if(!t.img) return;
    const ci=xs.indexOf(t.x), ri=ys.indexOf(t.y); if(ci<0||ri<0) return;
    const ir=t.img.getBoundingClientRect();
    const host=(t.img.closest('.rc-image-tile-wrapper')||t.img.parentElement||t.img).getBoundingClientRect();
    const l=Math.max(ir.left,host.left), tp=Math.max(ir.top,host.top), r=Math.min(ir.right,host.right), b=Math.min(ir.bottom,host.bottom);
    if (r<=l||b<=tp) return;
    const sx=(t.img.naturalWidth||1)/(ir.width||1), sy=(t.img.naturalHeight||1)/(ir.height||1);
    g.drawImage(t.img, (l-ir.left)*sx, (tp-ir.top)*sy, (r-l)*sx, (b-tp)*sy, ci*120, ri*120, 120, 120);
    drawn++;
  });
  const vb=document.querySelector('#recaptcha-verify-button');
  const vbr=vb? vb.getBoundingClientRect():null;
  const big=[...document.querySelectorAll('img')].sort((a,b)=>(b.naturalWidth*b.naturalHeight)-(a.naturalWidth*a.naturalHeight))[0];
  let bigData=null;
  try{ if(big&&big.naturalWidth){const c2=document.createElement('canvas');c2.width=big.naturalWidth;c2.height=big.naturalHeight;c2.getContext('2d').drawImage(big,0,0);bigData=c2.toDataURL('image/png');} }catch(e){}
  const out={instr, err: errEl? errEl.innerText : null, cols, rows, drawn, W, H,
    tiles: tiles.map(t=>({x:t.x,y:t.y,w:t.w,h:t.h,sel:t.sel,src:t.src?t.src.slice(0,80):null,sw:t.sw,sh:t.sh})),
    verify: vbr? {x:Math.round(vbr.x+vbr.width/2), y:Math.round(vbr.y+vbr.height/2)}:null,
    bigW: big?big.naturalWidth:0, bigH: big?big.naturalHeight:0, bigData,
    grid: c.toDataURL('image/png')};
  return out;
})()`;

(async () => {
  const cdp = await B.connect(PORT);
  const targets = (await cdp.send('Target.getTargets')).targetInfos;
  const attach = async (id) => {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: id, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);
    return sessionId;
  };
  const bfs = targets.filter((t) => t.type === 'iframe' && /6Ld3OMEs/.test(t.url || '') && /bframe/.test(t.url));
  if (!bfs.length) { console.log(JSON.stringify({ error: 'no bframe target' })); process.exit(2); }
  fs.mkdirSync(OUTDIR, { recursive: true });

  let best = null;
  for (const bf of bfs) {
    const sid = await attach(bf.targetId);
    const r = await cdp.send('Runtime.evaluate', { expression: DUMP, returnByValue: true, awaitPromise: true }, sid);
    if (r.exceptionDetails) { console.log('exc in ' + bf.targetId.slice(0, 20) + ': ' + r.exceptionDetails.text); continue; }
    const d = r.result && r.result.value;
    if (!d) continue;
    const score = (d.tiles || []).length + (d.drawn || 0);
    if (!best || score > best.score) best = { score, d, bf };
  }
  if (!best) { console.log(JSON.stringify({ error: 'no dump' })); process.exit(2); }
  const d = best.d;
  const save = (name, dataUrl) => {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const p = path.join(OUTDIR, name);
    fs.writeFileSync(p, buf);
    return { p, sha: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12) };
  };
  const grid = save(`live-${LABEL}.png`, d.grid);
  const big = save(`live-big-${LABEL}.png`, d.bigData);
  console.log(
    JSON.stringify(
      {
        instr: d.instr && d.instr.split('\n')[0],
        err: d.err,
        cols: d.cols,
        rows: d.rows,
        drawn: d.drawn,
        W: d.W,
        H: d.H,
        sel: (d.tiles || []).map((t, i) => (t.sel ? i : null)).filter((v) => v !== null),
        tiles: (d.tiles || []).length,
        tileSrcs: [...new Set((d.tiles || []).map((t) => t.src))],
        bigW: d.bigW,
        bigH: d.bigH,
        grid: grid && grid.p,
        gridSha: grid && grid.sha,
        big: big && big.p,
        bigSha: big && big.sha,
      },
      null,
      1,
    ),
  );
  try { cdp.close(); } catch {}
  process.exit(0);
})().catch((e) => {
  console.log('ERR ' + e.message);
  process.exit(1);
});
