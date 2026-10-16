'use strict';
/*
 * Fetch id.io.net HTML + main bundle through a live exit and mine it for the
 * passwordless/OTP + captcha wiring.
 *
 *   node src/bundle.js --proxy "socks5://…" [--url https://id.io.net/]
 */
const fs = require('fs');
const path = require('path');
const { parseProxy, fetchText } = require('./proxy.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const PROXY_LINE = arg('proxy', '');
const URL_ = arg('url', 'https://id.io.net/');

(async () => {
  const proxy = parseProxy(PROXY_LINE);
  if (!proxy) throw new Error('--proxy required');
  proxy.connectTimeoutMs = 8000;
  proxy.timeoutMs = 40000;

  const outDir = path.join(ROOT, 'outputs', 'bundle');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[bundle] GET ${URL_}`);
  const html = await fetchText(proxy, URL_, { timeoutMs: 45000 });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`[bundle] html ${html.length}B`);
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  console.log(`[bundle] scripts: ${scripts.length}`);
  for (const s of scripts) console.log('  ' + s);

  let main = null;
  for (const s of scripts) {
    const abs = s.startsWith('http') ? s : new URL(s, URL_).href;
    if (!/\.js($|\?)/.test(abs)) continue;
    try {
      const js = await fetchText(proxy, abs, { timeoutMs: 60000 });
      const name = abs.split('/').pop().split('?')[0];
      fs.writeFileSync(path.join(outDir, name), js);
      console.log(`[bundle] ${name} -> ${js.length}B`);
      if (abs.includes('index') || js.length > 200000) main = path.join(outDir, name);
    } catch (e) {
      console.log(`[bundle] ${abs} FAIL ${e.message}`);
    }
  }
  if (!main) {
    console.log('[bundle] no obvious main bundle captured');
    return;
  }
  const js = fs.readFileSync(main, 'utf8');
  const probes = {
    'passwordless': /passwordless/gi,
    'PASSWORDLESS_CAPTCHA_ENABLED': /PASSWORDLESS_CAPTCHA_ENABLED/gi,
    'recaptcha-sitekey-v2': /RECAPTCHA_V2_SITE_KEY\s*:\s*"([^"]+)"/g,
    'recaptcha-sitekey-v3': /RECAPTCHA_SITE_KEY\s*:\s*"([^"]+)"/g,
    'api.io.solutions': /https?:\/\/api\.io\.solutions[^"'\s`)]*/g,
    'api.intelligence': /https?:\/\/api\.intelligence\.io\.solutions[^"'\s`)]*/g,
    'otp-paths': /["'`](\/(?:v\d\/)?[a-z0-9/_-]*(?:otp|passcode|verify|verification|passwordless|magic)[a-z0-9/_-]*)["'`]/gi,
    'auth-paths': /["'`](\/(?:v\d\/)?(?:auth|login|signup|register|session|token)[a-z0-9/_-]*)["'`]/gi,
    'grecaptcha-exec': /grecaptcha\.(?:execute|ready|render)/g,
    'captcha-action': /action\s*[:=]\s*["']([a-z_]{3,30})["']/gi,
  };
  const report = {};
  for (const [k, re] of Object.entries(probes)) {
    const hits = new Set();
    let m;
    while ((m = re.exec(js))) hits.add(m[1] || m[0]);
    report[k] = [...hits].slice(0, 20);
  }
  fs.writeFileSync(path.join(outDir, 'probe-report.json'), JSON.stringify(report, null, 2));
  console.log('[bundle] probe report:');
  console.log(JSON.stringify(report, null, 2).slice(0, 3000));
})();
