'use strict';
// Static checks for the Electron shell (runs without Electron).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.cjs'), 'utf8');

test('renderer is sandboxed and isolated', () => {
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /nodeIntegration: false/);
});

test('external navigation is blocked', () => {
  assert.match(main, /will-navigate/);
  assert.match(main, /setWindowOpenHandler/);
});

test('preload exposes only the remoNative API', () => {
  assert.equal((preload.match(/exposeInMainWorld/g) || []).length, 1);
  assert.doesNotMatch(preload, /require\('(fs|child_process|node:fs)'/);
});
