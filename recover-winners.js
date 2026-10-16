'use strict';
/* One-time strict-regex recovery of io.net winners from the feed log into our
 * OWN inject source (never writes any shared/Main file).
 *
 *   node src/recover-winners.js            (dry: list)
 *   node src/recover-winners.js --apply    (writes outputs/residential-inject.txt)
 *
 * Only the anchored pattern `<ip:port> via id.io.net/login` is accepted, and
 * every token must pass the same strict validator the syncer uses.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname);
const LOGF = path.join(__dirname, 'screen-ionet-feed.log');
const SAFE = path.join(__dirname, 'ionet-winners-safe.txt');
const INJECT = path.join(ROOT, 'outputs', 'residential-inject.txt');
const APPLY = process.argv.includes('--apply');
const isProxy = (t) => /^(https?|socks[45]):\/\/[A-Za-z0-9.\-_]+:\d+$/.test(t) || /^([0-9]{1,3}\.){3}[0-9]{1,3}:\d+$/.test(t);

const out = new Set();
try {
  for (const l of fs.readFileSync(LOGF, 'utf8').split(/\r?\n/)) {
    const m = l.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3}:\d{2,5}) via id\.io\.net\/login/);
    if (m && isProxy(m[1])) out.add('http://' + m[1]);
  }
} catch (e) { console.error('log read:', e.message); }
try {
  for (const l of fs.readFileSync(SAFE, 'utf8').split(/\r?\n/)) {
    const t = l.trim();
    if (t && isProxy(t)) out.add(t);
  }
} catch {}
const list = [...out];
console.log(`recovered ${list.length} valid lines (log-anchored + safe)`);
for (const t of list.slice(0, 12)) console.log('  ' + t);
if (APPLY) {
  fs.writeFileSync(INJECT, list.join('\n') + '\n');
  console.log('written -> ' + INJECT);
}
