#!/usr/bin/env node
'use strict';

/**
 * Interactive launcher for ionet-bulk-apikey — a menu over the task modules.
 * Settings persist in launcher.config.json in the checkout root.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { connectKeysFile, connect9Router } = require('./connect-9router.js');

const HERE = __dirname;                     // src/ — the task modules
const ROOT = path.resolve(HERE, '..');      // checkout root — user-facing files
const CONFIG = path.join(ROOT, 'launcher.config.json');
const POOL = path.join(ROOT, 'proxies.txt');
const KEYS = path.join(ROOT, 'keys.txt');

const defaults = { count: 30, conc: 2, routerBase: 'http://localhost:20128', routerPassword: '123456' };
let cfg = { ...defaults };
try { Object.assign(cfg, JSON.parse(fs.readFileSync(CONFIG, 'utf8'))); } catch (e) {}
const save = () => fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
const ARGS = {"mint":["--target","count"],"finish":[],"verify":["--keys","keys.txt"],"screen":[]};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, fb) => new Promise((r) => rl.question(q + (fb !== undefined ? ' [' + fb + ']' : '') + ': ', (a) => r(String(a).trim() || fb)));

const LOGO = String.raw`
  ██╗ ██████╗     ███╗   ██╗███████╗████████╗
  ██║██╔═══██╗    ████╗  ██║██╔════╝╚══██╔══╝
  ██║██║   ██║    ██╔██╗ ██║█████╗     ██║
  ██║██║   ██║    ██║╚██╗██║██╔══╝     ██║
  ██║╚██████╔╝    ██║ ╚████║███████╗   ██║
  ╚═╝ ╚═════╝     ╚═╝  ╚═══╝╚══════╝   ╚═╝`;

function banner() {
  const w = 78;
  const box = (s) => '  │ ' + s.padEnd(w) + ' │';
  console.log(LOGO);
  console.log('  ┌' + '─'.repeat(w + 2) + '┐');
  console.log(box('ionet-bulk-apikey  ·  one account per key'));
  console.log(box('open source · MIT · ionet-bulk-apikey contributors'));
  console.log('  └' + '─'.repeat(w + 2) + '┘\n');
}

const count = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length; } catch (e) { return 0; } };

function run(args) {
  console.log('\n▶ node src/' + args.join(' ') + '\n');
  const r = spawnSync(process.execPath, [path.join(HERE, args[0]), ...args.slice(1)], { windowsHide: true, cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) console.log('\n⚠ exited with code ' + r.status);
}

function argsFor(task) {
  const spec = ARGS[task] || [];
  return spec.map((v) => (v === 'count' ? String(cfg.count) : v === 'conc' ? String(cfg.conc) : v));
}

async function settings() {
  console.log('\nSettings');
  console.log('  1) count      ' + cfg.count);
  console.log('  2) conc       ' + cfg.conc);
  console.log('  0) back');
  const p = await ask('choose', '0');
  if (p === '1') cfg.count = parseInt(await ask('count', cfg.count), 10) || cfg.count;
  if (p === '2') cfg.conc = parseInt(await ask('concurrency', cfg.conc), 10) || cfg.conc;
  save();
}

async function nineRouter() {
  console.log('\n9Router — register the keys in keys.txt as one connection each');
  const base = await ask('9Router base URL', cfg.routerBase);
  const password = await ask('9Router password', cfg.routerPassword);
  cfg.routerBase = base;
  cfg.routerPassword = password;
  save();
  try {
    const conns = await connectKeysFile({ base, password });
    conns.forEach((c, i) => console.log('  key ' + (i + 1) + '/' + conns.length + ' → ' + ((c && c.name) || 'registered')));
  } catch (e) {
    if (!/no API keys/.test(String(e.message))) throw e;
    console.log('  ⚠ ' + e.message);
    const apiKey = await ask('API key', '');
    if (!apiKey) return;
    const conn = await connect9Router({ base, password, apiKey });
    console.log('  key 1/1 → ' + ((conn && conn.name) || 'registered'));
  }
}

async function main() {
  process.stdout.write('\x1b[2J\x1b[H');
  banner();
  console.log('  proxy exits: ' + (count(POOL) || 'none — put exits in proxies.txt') + '     keys on disk: ' + count(KEYS) + '\n');
  console.log('  1) mint      create fresh accounts and mint one key each');
  console.log('  2) finish    log in to accounts already created and finish their key');
  console.log('  3) verify    re-check keys that are already on disk');
  console.log('  4) screen    keep only proxy exits that reach the provider');
  console.log('  5) Settings');
  console.log('  6) Connect to 9Router   register every key in keys.txt with a 9Router instance');
  console.log('  0) Exit\n');
  const choice = await ask('choose', '1');
  if (choice === '1') {
    run(['lane.js', ...argsFor('mint')]);
  }
  else if (choice === '2') {
    run(['http-finish.js', ...argsFor('finish')]);
  }
  else if (choice === '3') {
    run(['verify.js', ...argsFor('verify')]);
  }
  else if (choice === '4') {
    run(['screen.js', ...argsFor('screen')]);
  }
  else if (choice === '5') {
    await settings();
  }
  else if (choice === '6') {
    await nineRouter();
  } else {
    rl.close();
    return;
  }
  await ask('\npress enter for the menu', '');
  return main();
}

main().catch((e) => { console.error('launcher failed:', e.stack || e.message); process.exit(1); });
