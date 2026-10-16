'use strict';
// READ-ONLY peek at a live reCAPTCHA bframe payload image; tests whether the
// payload URL offers higher-resolution variants.
//   node src/payload-peek.js --port 9421 --proxy <line>
const http = require('http');
const https = require('https');
const { parseProxy, createAgent } = require('./proxy.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i === -1 ? d : argv[i + 1]; };
const PORT = arg('port', '9421');
const PROXY_LINE = arg('proxy', '');
const proxy = PROXY_LINE ? parseProxy(PROXY_LINE) : null;
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 20000; }

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, timeout: 8000 }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => (b += c)); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.get({ host: u.hostname, port: 443, path: u.pathname + u.search, agent: proxy ? createAgent(proxy) : undefined, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36' }, timeout: 30000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    r.setTimeout(30000, () => r.destroy(new Error('timeout')));
    r.on('error', reject);
  });
}
function pngSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`;
      i += 2 + len;
    }
  }
  return '?';
}

// minimal CDP over ws
const crypto = require('crypto');
const net = require('net');
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
  const targets = await get(PORT, '/json');
  const bf = (targets || []).find((t) => t.type === 'iframe' && /recaptcha\/api2\/bframe/.test(t.url || '') && t.webSocketDebuggerUrl);
  if (!bf) { console.log('no live bframe target'); process.exit(1); }
  console.log('bframe:', bf.url.slice(0, 90));
  const sock = await wsConnect(bf.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  wsOnMessage(sock, (m) => { if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const call = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); wsSend(sock, { id: i, method, params }); });
  const ev = await call('Runtime.evaluate', { expression: `(() => { const im=[...document.querySelectorAll('img')].sort((a,b)=>b.naturalWidth-a.naturalWidth)[0]; return im ? { src: im.src, nw: im.naturalWidth, nh: im.naturalHeight } : null; })()`, returnByValue: true });
  const info = ev && ev.result && ev.result.result && ev.result.result.value;
  console.log('img:', info);
  if (info && info.src) {
    const variants = [info.src, info.src + '&sz=s2', info.src + '&size=2', info.src.replace('payload', 'payload') + '&scale=2'];
    for (const u of [...new Set(variants)]) {
      try {
        const r = await fetchBuf(u);
        console.log(`fetch ${u.includes('sz=') || u.includes('scale=') ? u.slice(-18) : 'orig'} -> ${r.status} ${r.buf.length}B ${pngSize(r.buf)}`);
      } catch (e) { console.log('fetch err ' + e.message); }
    }
  }
  sock.end();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
