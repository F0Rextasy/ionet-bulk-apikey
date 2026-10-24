#!/usr/bin/env node
'use strict';

/**
 * Command dispatcher for ionet-bulk-apikey.
 *
 *   node src/cli.js mint     create fresh accounts and mint one key each
 *   node src/cli.js finish   log in to accounts already created and finish their key
 *   node src/cli.js verify   re-check keys that are already on disk
 *   node src/cli.js screen   keep only proxy exits that reach the provider
 *   node src/cli.js help
 *
 * Every task spawns the matching module in this folder, so a crash in one run
 * never leaves state behind in this process.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const { connectKeysFile, parseRouterArgs } = require('./connect-9router.js');

const TASKS = {
  mint: { file: 'lane.js', note: 'create fresh accounts and mint one key each' },
  finish: { file: 'http-finish.js', note: 'log in to accounts already created and finish their key' },
  verify: { file: 'verify.js', note: 're-check keys that are already on disk' },
  screen: { file: 'screen.js', note: 'keep only proxy exits that reach the provider' },
};

function help() {
  console.log('ionet-bulk-apikey — one account per key\n');
  console.log('usage: node src/cli.js <task> [options]\n');
  console.log('tasks:');
  for (const [name, t] of Object.entries(TASKS)) console.log('  ' + name.padEnd(9) + ' ' + t.note);
  console.log('\noptions: every task takes its own flags — ask it directly:');
  console.log('  node src/<task-file> --help');
  console.log('  --connect-9router  register the keys in keys.txt with 9Router when the task finishes');
  console.log('\nrun-shape presets (forwarded to the task as-is):');
  console.log('  --preset=turbo|balanced|safe   lane pacing gap (turbo = 3 s, recommended)');
  console.log('\nproxy pool (optional):');
  console.log('  one exit per line in proxies.txt — scheme://host:port[#comment], user:pass@ supported');
  console.log('  requests go through your proxy list when one is provided (--pool / env); without a pool the tool connects directly');
  console.log('\nno options? run the interactive launcher:  node src/launcher.js');
  console.log('  --count N     keys to mint (the one-command path: node src/cli.js --count N)');
  console.log('  --auto        no captcha on this provider — accepted for the one-command menu (default)');
  console.log('  --dry         print the resolved plan, write nothing, send nothing');
  console.log('  keys-dead.txt keys verify called dead (401/403) are written to the repo root');
}


/**
 * `--dry`: the resolved plan, then exit 0. The dispatcher never spawns a task
 * module, so nothing is written and no request is sent.
 */
if (process.argv.includes('--dry')) {
  const dryArgv = process.argv.slice(2);
  const val = (name, dflt) => {
    const i = dryArgv.indexOf(name);
    return i >= 0 && dryArgv[i + 1] && !dryArgv[i + 1].startsWith('--') ? dryArgv[i + 1] : dflt;
  };
  const poolFile = process.env.IONET_POOL || 'proxies.txt';
  const exits = (() => {
    try {
      return require('fs').readFileSync(path.resolve(__dirname, '..', poolFile), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).length;
    } catch (e) {
      return 0;
    }
  })();
  console.log('ionet dry run — nothing is written and no request is sent.');
  console.log(`  task     ${dryArgv[0] && !dryArgv[0].startsWith('--') ? dryArgv[0] : 'mint'}`);
  console.log(`  count    ${val('--count', '5')} key(s), preset ${val('--preset', 'balanced')}`);
  console.log(`  pool     ${exits ? `${exits} exit(s) from ${poolFile}` : `direct (no usable exit in ${poolFile})`}`);
  console.log('  solver   none — this provider signs up over plain HTTP that carries no captcha');
  console.log('  keys     keys.txt · verify writes dead keys to keys-dead.txt');
  process.exit(0);
}
const argv = process.argv.slice(2);
const task = argv[0] && argv[0].startsWith('--') && !['--help', '-h', 'help'].includes(argv[0]) ? 'mint' : argv[0];
if (!task || task === 'help' || task === '--help' || task === '-h') {
  help();
  process.exit(0);
}
const entry = TASKS[task];
if (!entry) {
  console.error('unknown task: ' + task + '\n');
  help();
  process.exit(1);
}
const LINK = '--connect-9router';
const taskArgs = argv.slice(1).filter((a) => a !== LINK);
// `--count N` is the one-command spelling; the mint task itself takes `--target N`.
if (task === 'mint') {
  const ci = taskArgs.indexOf('--count');
  if (ci >= 0 && taskArgs[ci + 1] && !taskArgs[ci + 1].startsWith('--')) taskArgs.splice(ci, 2, '--target', taskArgs[ci + 1]);
}
const child = spawnSync(process.execPath, [path.join(__dirname, entry.file), ...taskArgs], {
  windowsHide: true,
  stdio: 'inherit',
  env: process.env,
});
const status = child.status === null ? 1 : child.status;
if (!argv.includes(LINK)) process.exit(status);
connectKeysFile(parseRouterArgs(taskArgs)).then(
  () => { process.exitCode = status; },
  (e) => {
    console.error('[9router] ' + ((e && e.message) || e));
    process.exitCode = 1;
  }
);
