'use strict';
/*
 * Verify io.net / IO Intelligence keys the way a user would: GET /models and a
 * real mini chat completion, through a live exit when one is given (direct
 * otherwise).
 *
 *   node src/verify.js --keys keys.txt [--proxy "socks5://…"] [--models models.json]
 */
const fs = require('fs');
/** keys-dead.txt standard: key \t reason \t ISO, reason in 401|403|quota|ban.
 * 429/5xx/transport are transient (retry them — the same key may answer later): never dead. */
function deadReason(status, text = '') {
  const s = `${status == null ? '' : status} ${text || ''}`;
  if (/\b429\b|rate.?limit|\b5\d\d\b|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|transport|network/i.test(s)) return null;
  if (/\b401\b|unauthor/i.test(s)) return '401';
  if (/\b403\b|forbidden/i.test(s)) return '403';
  if (/\b402\b|quota|insufficient|no credit|out of credit|balance|exhaust/i.test(s)) return 'quota';
  if (/banned|suspend|deactivat|disabled/i.test(s)) return 'ban';
  return null;
}
/** The standard line (key \t reason \t ISO), or null when the reason is not final. */
const deadLine = (key, reason) => (reason ? [key, reason, new Date().toISOString()].join('\t') : null);
/** The key side of a standard line (dedupe helper). */
const deadKeyOf = (line) => String(line).split(String.fromCharCode(9))[0];
const path = require('path');
const { parseProxy, fetchText } = require('./proxy.js');

const ROOT = path.resolve(__dirname, '..');
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
  const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
  if (PROXY_LINE && !proxy) throw new Error('bad proxy line');
  if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 40000; }

  const keys = fs.readFileSync(KEYS_FILE, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  console.log(`[verify] ${keys.length} key(s) via ${proxy ? PROXY_LINE : 'direct (no proxy)'} on ${BASE}`);
  const results = [];
  const dead = [];
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
    // A 401/403 is the key's own verdict; a transport failure is not.
    if (row.verdict !== 'LIVE') {
      const reason = deadReason(null, `${row.err || ''} ${row.chat || ''}`);
      if (reason) dead.push({ key, reason });
    }
    console.log(`[verify] ${row.key} models=${row.models} chat=${row.chat} -> ${row.verdict}${row.err ? ' err=' + row.err : ''}`);
    results.push(row);
  }
  const live = results.filter((r) => r.verdict === 'LIVE');
  console.log(`[verify] ${live.length}/${results.length} live`);
  const outDir = path.join(ROOT, 'outputs');
  fs.mkdirSync(outDir, { recursive: true });
  const deadFile = path.join(ROOT, 'keys-dead.txt');
  // keys-dead.txt standard: key \t reason(401|403|quota|ban) \t new Date().toISOString()

  const deadLines = dead.map((d) => deadLine(d.key, d.reason)).filter(Boolean);
  fs.writeFileSync(deadFile, deadLines.join('\n') + (deadLines.length ? '\n' : ''));
  console.log(`[verify] dead keys ${dead.length} -> ${deadFile}`);
  fs.writeFileSync(path.join(outDir, `verify-${Date.now()}.json`), JSON.stringify(results, null, 2));
})();
