'use strict';
/*
 * Verify io.net / IO Intelligence keys the way a user would: GET /models and a
 * real mini chat completion, through a live exit (never the host line).
 *
 *   node src/verify.js --keys keys.txt --proxy "socks5://…" [--models models.json]
 */
const fs = require('fs');
const path = require('path');
const { parseProxy, fetchText } = require('./proxy.js');

const ROOT = path.join(__dirname);
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i === -1 ? d : argv[i + 1];
};
const KEYS_FILE = arg('keys', path.join(ROOT, 'keys.txt'));
const PROXY_LINE = arg('proxy', '');
const MODELS_OUT = arg('models', '');
const BASE = arg('base', 'https://api.intelligence.io.solutions/api/v1');
const MODEL = arg('model', 'meta-llama/Llama-3.3-70B-Instruct');

const mask = (k) => k.slice(0, 4) + '…' + k.slice(-4);

(async () => {
  if (!PROXY_LINE) throw new Error('--proxy required');
  const proxy = parseProxy(PROXY_LINE);
  proxy.connectTimeoutMs = 8000;
  proxy.timeoutMs = 40000;

  const keys = fs.readFileSync(KEYS_FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  console.log(`[verify] ${keys.length} key(s) via ${PROXY_LINE} on ${BASE}`);
  const results = [];
  for (const key of keys) {
    const row = { key: mask(key), models: null, chat: null, verdict: 'fail', err: null };
    try {
      const models = await fetchText(proxy, `${BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, timeoutMs: 45000 });
      let mj = null;
      try { mj = JSON.parse(models); } catch {}
      row.models = mj && Array.isArray(mj.data) ? mj.data.length : /"data"/.test(models) ? 'json' : models.slice(0, 120);
      if (MODELS_OUT && mj && Array.isArray(mj.data)) fs.writeFileSync(MODELS_OUT, JSON.stringify(mj, null, 2));
      const chat = await fetchText(proxy, `${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: { model: MODEL, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 8 },
        timeoutMs: 60000,
      });
      let cj = null;
      try { cj = JSON.parse(chat); } catch {}
      const content = cj && cj.choices && cj.choices[0] && cj.choices[0].message && cj.choices[0].message.content;
      row.chat = content ? content.slice(0, 40) : chat.slice(0, 140);
      row.verdict = cj && cj.choices ? 'LIVE' : 'fail';
    } catch (e) {
      row.err = e.message;
    }
    console.log(`[verify] ${row.key} models=${row.models} chat=${row.chat} -> ${row.verdict}${row.err ? ' err=' + row.err : ''}`);
    results.push(row);
  }
  const live = results.filter((r) => r.verdict === 'LIVE');
  console.log(`[verify] ${live.length}/${results.length} live`);
  const outDir = path.join(ROOT, 'outputs');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `verify-${Date.now()}.json`), JSON.stringify(results, null, 2));
})();
