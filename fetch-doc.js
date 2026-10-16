// node src/fetch-doc.js <url> [--direct] — print a doc page (markdown preferred)
const https = require('https');
const http = require('http');
const { parseProxy, createAgent } = require('./proxy.js');
const url = process.argv[2];
const proxy = process.argv.includes('--direct') ? null : parseProxy('socks5://127.0.0.1:40000');
if (proxy) { proxy.connectTimeoutMs = 8000; proxy.timeoutMs = 30000; }
const u = new URL(url);
const lib = u.protocol === 'https:' ? https : http;
https.globalAgent = https.globalAgent;
const r = lib.get({ host: u.hostname, port: u.port || 443, path: u.pathname + u.search, agent: proxy ? createAgent(proxy) : undefined, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.41 Safari/537.36' }, timeout: 60000 }, (res) => {
  let t = '';
  res.setEncoding('utf8');
  res.on('data', (c) => (t += c));
  res.on('end', () => { console.log(`STATUS ${res.statusCode} LEN ${t.length}`); console.log(t.slice(0, 12000)); });
});
r.on('error', (e) => { console.log('ERR ' + e.message); process.exit(1); });
r.setTimeout(60000, () => r.destroy(new Error('timeout')));
