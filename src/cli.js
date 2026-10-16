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
  console.log('\nproxy pool:');
  console.log('  one exit per line in proxies.txt — scheme://host:port[#comment], user:pass@ supported');
  console.log('\nno options? run the interactive launcher:  node src/launcher.js');
}

const argv = process.argv.slice(2);
const task = argv[0];
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
