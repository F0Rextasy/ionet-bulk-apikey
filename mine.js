'use strict';
// Ad-hoc miner: print ±N chars around matches in a minified bundle.
const fs = require('fs');
const file = process.argv[2];
const out = process.argv[3];
const patterns = process.argv[4]
  ? process.argv[4].split('||')
  : [
      'PASSWORDLESS_CAPTCHA_ENABLED',
      'passwordless',
      'PasswordLess',
      'recaptcha',
      'grecaptcha',
      'Captcha',
      'captcha',
      'otp',
    ];
const span = parseInt(process.env.SPAN || '420', 10);
const js = fs.readFileSync(file, 'utf8');
const lines = [];
for (const pat of patterns) {
  const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let m;
  let count = 0;
  while ((m = re.exec(js)) && count < 40) {
    count++;
    const a = Math.max(0, m.index - span);
    const b = Math.min(js.length, m.index + pat.length + span);
    lines.push(`\n===== "${pat}" @${m.index} =====\n` + js.slice(a, b));
  }
  lines.push(`\n### pattern "${pat}": ${count} shown`);
}
fs.writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out} (${lines.length} blocks)`);
