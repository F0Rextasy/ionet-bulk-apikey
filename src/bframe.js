'use strict';
/*
 * Dump the reCAPTCHA bframe challenge (instruction + tile geometry) via the
 * frame's own JS execution context — cross-origin-safe through CDP.
 *
 *   node src/bframe.js [--port 9343]
 */
const B = require('./browser');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const PORT = parseInt(arg('port', '9343'), 10);

(async () => {
  const cdp = await B.connect(PORT);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const page = targetInfos.filter((t) => t.type === 'page' && /io\.net/.test(t.url)).sort((a, b) => (b.lastActiveTime || 0) - (a.lastActiveTime || 0))[0];
  if (!page) throw new Error('no io.net page');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);

  // Collect execution contexts (they are pushed on Runtime.enable).
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', (p) => contexts.push(p.context), sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await new Promise((r) => setTimeout(r, 800));
  const { frameTree } = await cdp.send('Page.getFrameTree', {}, sessionId);
  const frames = [];
  const walk = (f) => {
    frames.push({ id: f.frame.id, url: f.frame.url, name: f.frame.name });
    (f.childFrames || []).forEach(walk);
  };
  walk(frameTree);

  const bframe = frames.find((f) => /bframe/.test(f.url));
  const anchor = frames.find((f) => /anchor/.test(f.url));
  console.log('frames:', frames.map((f) => f.url.slice(0, 90)).join('\n  '));

  const ctxFor = (frame) => contexts.find((c) => c.auxData && c.auxData.frameId === frame.id);
  const target = bframe ? ctxFor(bframe) : null;
  const anchorCtx = anchor ? ctxFor(anchor) : null;

  const dump = async (ctx, expr) => {
    if (!ctx) return null;
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, contextId: ctx.id }, null);
    if (r.exceptionDetails) return { err: r.exceptionDetails.text };
    return r.result.value;
  };

  if (target) {
    const out = await dump(
      target,
      `(() => {
        const instr = document.querySelector('.rc-imageselect-desc-wrapper, .rc-imageselect-desc-no-canonical, .rc-imageselect-desc');
        const tds = [...document.querySelectorAll('.rc-imageselect-table td')].map((td, i) => {
          const r = td.getBoundingClientRect();
          const cls = td.className || '';
          return { i, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), sel: /selected/.test(cls) };
        });
        const rows = document.querySelectorAll('.rc-imageselect-table tr').length;
        const btn = document.querySelector('#recaptcha-verify-button');
        return {
          instruction: instr ? instr.innerText.replace(/\\n/g, ' | ') : null,
          rows, cells: tds.length, cw: innerWidth, ch: innerHeight,
          verifyLabel: btn ? btn.innerText : null,
          grid: tds,
        };
      })()`
    );
    console.log('BFRAME:', JSON.stringify(out, null, 1));
  } else {
    console.log('no bframe context (contexts: ' + contexts.length + ')');
    // fall back: anchor context state
    const out = await dump(anchorCtx, `({ anchor: !!document.querySelector('.recaptcha-checkbox'), title: document.title })`);
    console.log('ANCHOR:', JSON.stringify(out));
  }
  process.exit(0);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
