'use strict';
// Runs the shared LAN transport tests with Electron's embedded Node (BoringSSL instead of
// OpenSSL), which is what the Windows app actually uses. Catches TLS options that work in
// plain Node but fail inside Electron.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const testFile = path.resolve(__dirname, '..', '..', '..', 'packages', 'node-transport', 'test.cjs');
const res = spawnSync(electron, [testFile], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
process.exit(res.status ?? 1);
