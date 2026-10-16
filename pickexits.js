'use strict';
/*
 * Point-of-use egress picker for io.net: a line is usable only if it carries
 * id.io.net AND www.google.com (reCAPTCHA script host) right now — static
 * "live" lists go stale in minutes (measured: half-life < 30 min).
 *
 *   node src/pickexits.js --file ../../out/union-live.txt --want 4 [--limit 80] [--conc 8]
 *   node src/pickexits.js --line socks5://...   (test one)
 *
 * Prints winners (one per line) to stdout and outputs/pick-<stamp>.txt
 */
const fs = require('fs');
const path = require('path');
const { parseProxy, fetchText } = require('./proxy.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const FILE = arg('file', '');
const LINE = arg('line', '');
const WANT = parseInt(arg('want', '4'), 10);
const LIMIT = parseInt(arg('limit', '80'), 10);
const CONC = parseInt(arg('conc', '8'), 10);
const TO = parseInt(arg('timeout-ms', '10000'), 10);

const ROOT = path.join(__dirname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function test(line) {
  const proxy = parseProxy(line);
  if (!proxy) return { line, ok: false, err: 'parse' };
  proxy.connectTimeoutMs = TO; proxy.timeoutMs = TO;
  const t0 = Date.now();
  try {
    const ip = (await fetchText(proxy, 'https://api.ipify.org', { timeoutMs: TO })).trim();
    const id = await fetchText(proxy, 'https://id.io.net/login', { timeoutMs: TO });
    const idOk = /<html|io\.net|Log in/i.test(id) && id.length > 200;
    const gg = await fetchText(proxy, 'https://www.google.com/recaptcha/api.js', { timeoutMs: TO });
    const ggOk = /grecaptcha|recaptcha/i.test(gg);
    const ok = Boolean(ip) && idOk && ggOk;
    return { line, ok, ip, idOk, ggOk, ms: Date.now() - t0 };
  } catch (e) {
    return { line, ok: false, err: e.message.slice(0, 60), ms: Date.now() - t0 };
  }
}

(async () => {
  let lines = [];
  if (LINE) lines = [LINE];
  else if (FILE) lines = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).slice(0, LIMIT);
  else throw new Error('--file or --line required');
  console.log(`[pick] testing ${lines.length} exits, conc=${CONC}, timeout=${TO}ms`);
  const winners = [];
  let idx = 0;
  const worker = async () => {
    while (idx < lines.length && winners.length < WANT) {
      const line = lines[idx++];
      const r = await test(line);
      console.log(`[pick] ${r.ok ? 'OK  ' : 'fail'} ${r.ip || r.err || ''} ${r.line.slice(0, 50)} ${r.ms}ms`);
      if (r.ok) winners.push(r);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(ROOT, 'outputs', `pick-${stamp}.txt`);
  fs.writeFileSync(out, winners.map((w) => `${w.line}\t${w.ip}`).join('\n') + '\n');
  console.log(`[pick] ${winners.length} winner(s) -> ${out}`);
  for (const w of winners) console.log('WIN ' + w.line + ' ip=' + w.ip);
})().catch((e) => { console.error('[pick] FAIL', e.message); process.exit(1); });
