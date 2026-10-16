'use strict';
// Scan outputs/http-*/ for accounts that completed verify (magic-auth 200) but
// never produced a created key (no 2xx in apikey-create.jsonl).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'outputs');
const rows = [];
for (const d of fs.readdirSync(OUT).filter((x) => x.startsWith('http-'))) {
  const dir = path.join(OUT, d);
  let verified = false, created = false, email = '';
  try {
    const v = fs.readFileSync(path.join(dir, 'verify.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
    for (const l of v) { try { const j = JSON.parse(l); if (j.status && j.status < 400) verified = true; } catch {} }
  } catch {}
  try {
    const a = fs.readFileSync(path.join(dir, 'apikey-create.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
    for (const l of a) { try { const j = JSON.parse(l); if (j.status && j.status < 300) created = true; } catch {} }
  } catch {}
  try {
    const h = fs.readFileSync(path.join(dir, 'http.log'), 'utf8').split(/\r?\n/)[0] || '';
    const m = h.match(/email=(\S+)/);
    if (m) email = m[1];
  } catch {}
  if (verified && !created) rows.push({ dir: d, email });
}
console.log(`verified-but-keyless: ${rows.length}`);
for (const r of rows) console.log(`  ${r.dir}  ${r.email}`);
