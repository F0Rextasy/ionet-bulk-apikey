'use strict';
/**
 * Failover relay v2 for the io.net pilot (adapted from sv-relay.js):
 * Chrome talks plain HTTP CONNECT to 127.0.0.1:PORT; for every CONNECT this
 * races up to BATCH upstream exits and the first tunnel wins. Dead upstreams
 * take a 90 s (600 s after 3 in a row) cooldown, so a long browser phase keeps
 * moving while the free pool's half-life eats individual lines.
 *
 * Egress stays proxy-only — there is no direct fallback, ever.
 *
 * Usage: node src/relay.js [port=8899] [candidateFile=outputs/cand.txt]
 */
const net = require('net');
const fs = require('fs');
const path = require('path');
const { parseProxyText, openTunnel } = require('./proxy.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2] || '8899', 10);
const LIST = process.argv[3] || path.join(ROOT, 'outputs', 'cand.txt');
const OUT_WARM = path.join(ROOT, 'outputs', 'relay-warm.txt');
const CONNECT_TIMEOUT_MS = 8000;
const BUDGET_MS = 25000;
const BATCH = 4;

const list = parseProxyText(fs.readFileSync(LIST, 'utf8'));
if (!list.length) throw new Error(`no proxies in ${LIST}`);
const state = list.map((p) => ({ p, cooldownUntil: 0, fails: 0, oks: 0 }));
let cursor = 0;

function candidates() {
  const now = Date.now();
  const warm = [];
  const cold = [];
  let i = 0;
  for (const s of state) {
    const idx = i++;
    if (s.cooldownUntil > now) continue;
    if (s.oks > 0) warm.push(idx);
    else cold.push(idx);
  }
  warm.sort((a, b) => state[b].oks - state[a].oks);
  return [cursor, ...warm, ...cold].filter((v, i2, arr) => arr.indexOf(v) === i2 && state[v] && state[v].cooldownUntil <= now);
}

function note(idx, ok) {
  const s = state[idx];
  if (ok) {
    s.oks++;
    s.fails = 0;
    cursor = idx;
    writeWarm();
  } else {
    s.fails++;
    s.oks = Math.max(0, s.oks - 1);
    s.cooldownUntil = Date.now() + (s.fails >= 3 ? 600000 : 90000);
  }
}

let warmWrittenAt = 0;
function writeWarm() {
  if (Date.now() - warmWrittenAt < 5000) return;
  warmWrittenAt = Date.now();
  const warm = state.filter((s) => s.oks > 0 && s.cooldownUntil <= Date.now()).map((s) => s.p.raw);
  try {
    fs.writeFileSync(OUT_WARM, warm.join('\n') + (warm.length ? '\n' : ''));
  } catch (e) {}
}

async function raceTunnel(host, port) {
  const deadline = Date.now() + BUDGET_MS;
  const tried = new Set();
  let lastErr = null;
  while (Date.now() < deadline) {
    const order = candidates().filter((i) => !tried.has(i));
    if (!order.length) break;
    const batch = order.slice(0, BATCH);
    batch.forEach((i) => tried.add(i));
    const attempts = batch.map((i) =>
      openTunnel(state[i].p, { host, port, timeoutMs: CONNECT_TIMEOUT_MS }).then(
        (sock) => ({ idx: i, sock }),
        (err) => {
          note(i, false);
          throw err;
        }
      )
    );
    try {
      const winner = await Promise.any(attempts);
      attempts.forEach((p) => p.then((r) => { if (r.sock !== winner.sock) r.sock.destroy(); }).catch(() => {}));
      note(winner.idx, true);
      return { sock: winner.sock, proxy: state[winner.idx].p };
    } catch (e) {
      lastErr = e instanceof AggregateError ? e.errors[e.errors.length - 1] : e;
    }
  }
  throw lastErr || new Error('all upstreams failed');
}

const server = net.createServer((client) => {
  client.once('error', () => {});
  let buf = Buffer.alloc(0);
  let done = false;
  const onData = async (chunk) => {
    if (done) return;
    buf = Buffer.concat([buf, chunk]);
    const end = buf.indexOf('\r\n\r\n');
    if (end === -1) {
      if (buf.length > 65536) client.destroy();
      return;
    }
    done = true;
    client.removeListener('data', onData);
    const head = buf.slice(0, end).toString('latin1');
    const m = head.match(/^CONNECT ([^\s:]+):(\d+)/i);
    if (!m) {
      client.write('HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n');
      return client.destroy();
    }
    const host = m[1];
    const port = parseInt(m[2], 10);
    try {
      const { sock, proxy } = await raceTunnel(host, port);
      console.log(`${new Date().toISOString().slice(11, 19)} CONNECT ${host}:${port} -> ${proxy.raw}`);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = buf.slice(end + 4);
      if (rest.length) sock.write(rest);
      client.pipe(sock);
      sock.pipe(client);
      const kill = () => { client.destroy(); sock.destroy(); };
      client.on('error', kill);
      sock.on('error', kill);
      client.on('close', () => sock.destroy());
      sock.on('close', () => client.destroy());
    } catch (e) {
      console.log(`${new Date().toISOString().slice(11, 19)} CONNECT ${host}:${port} FAILED ${String(e.message).slice(0, 70)}`);
      client.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
      client.destroy();
    }
  };
  client.on('data', onData);
});

setInterval(() => {
  const warm = state.filter((s) => s.oks > 0 && s.cooldownUntil <= Date.now()).length;
  const cold = state.filter((s) => s.cooldownUntil > Date.now()).length;
  console.log(`[stats] warm=${warm} cooling=${cold} never=${state.length - warm - cold}`);
}, 30000).unref();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`relay on 127.0.0.1:${PORT} · ${list.length} upstreams · batch ${BATCH} · proxy-only`);
});
