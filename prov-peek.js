'use strict';
// READ-ONLY provenance probe: list grecaptcha clients (sitekeys) + textareas on
// the loaded id.io.net page.   node src/prov-peek.js --port 9401
const http = require('http');
const crypto = require('crypto');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PORT = arg('port', '9401');
function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 8000 }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' }, timeout: 10000 });
    req.on('upgrade', (res, socket) => resolve(socket));
    req.on('error', reject);
    req.end();
  });
}
function wsSend(socket, obj) {
  const data = Buffer.from(JSON.stringify(obj));
  const mask = crypto.randomBytes(4);
  const len = data.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, 0x80 | len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
  socket.write(Buffer.concat([header, mask, masked]));
}
function wsOnMessage(socket, cb) {
  let buf = Buffer.alloc(0);
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const len0 = buf[1] & 0x7f;
      let off = 2, len = len0;
      if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      try { cb(JSON.parse(payload.toString('utf8'))); } catch {}
    }
  });
}
(async () => {
  const targets = await get('/json');
  const page = (targets || []).find((t) => t.type === 'page' && /id\.io\.net/.test(t.url || '') && t.webSocketDebuggerUrl);
  if (!page) { console.log('no id.io.net page'); process.exit(1); }
  console.log('page:', page.url.slice(0, 70));
  const sock = await wsConnect(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  wsOnMessage(sock, (m) => { if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const call = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); wsSend(sock, { id: i, method, params }); });
  const expr = `(() => {
    const out = { clients: [], textareas: [] };
    try {
      const cfg = window.___grecaptcha_cfg || {};
      const clients = cfg.clients || {};
      const seen = new Set();
      const walk = (v, depth) => {
        if (!v || depth > 6 || seen.has(v)) return null;
        if (typeof v === 'string') { const m = v.match(/6[A-Za-z0-9_-]{30,}/); return m ? m[0] : null; }
        if (typeof v !== 'object') return null;
        seen.add(v);
        for (const k of Object.keys(v)) { const r = walk(v[k], depth + 1); if (r) return r; }
        return null;
      };
      for (const k of Object.keys(clients)) out.clients.push({ client: k, sitekey: walk(clients[k], 0) });
    } catch (e) { out.err = String(e).slice(0, 80); }
    [...document.querySelectorAll('textarea[name="g-recaptcha-response"]')].forEach((t, i) => {
      let near = null;
      try { near = t.closest('form') ? 'form' : (t.parentElement ? (t.parentElement.className || t.parentElement.tagName) : null); } catch {}
      out.textareas.push({ i, id: t.id || null, len: (t.value || '').length, near: String(near).slice(0, 40) });
    });
    return out;
  })()`;
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(r && r.result && r.result.result && r.result.result.value, null, 1));
  sock.end();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
