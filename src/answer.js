'use strict';
/*
 * Writes an answer for the interactive CAPTCHA loop started by run-account.js.
 *
 *   node src/answer.js <solve-dir-name-or-tag> 0 4 8        -> clicks.json {tiles:[0,4,8],verify:true}
 *   node src/answer.js a1 --no-verify 1 2                   -> {tiles:[1,2],verify:false}
 *   node src/answer.js a1 --refresh                         -> {refresh:true}
 *   node src/answer.js a1 --none                            -> {tiles:[],verify:true} (verify only)
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const ref = argv[0];
if (!ref) { console.error('usage: node src/answer.js <tag|dir> [--refresh|--no-verify|--none] [tile...]'); process.exit(1); }
const ROOT = path.resolve(__dirname, '..');
const dirs = [
  path.join(ROOT, 'outputs', ref),
  path.join(ROOT, 'outputs', 'solve-' + ref),
].filter((d) => fs.existsSync(d));
const dir = dirs[0] || path.join(ROOT, 'outputs', ref.startsWith('solve-') ? ref : 'solve-' + ref);
const refresh = argv.includes('--refresh');
const noVerify = argv.includes('--no-verify');
const none = argv.includes('--none');
const tiles = argv.slice(1).filter((a) => !a.startsWith('--')).map((a) => parseInt(a, 10)).filter((n) => !Number.isNaN(n));

const payload = refresh ? { refresh: true } : { tiles: none ? [] : tiles, verify: !noVerify };
const out = path.join(dir, 'clicks.json');
fs.mkdirSync(dir, { recursive: true });
const tmp = out + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(payload));
fs.renameSync(tmp, out);
// state for the record
let state = null;
try { state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')); } catch {}
console.log(`answered ${dir} round=${state ? state.round : '?'} instr="${state ? String(state.instruction || '').split('\n')[0].slice(0, 70) : ''}" -> ${JSON.stringify(payload)}`);
