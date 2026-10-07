'use strict';
// Copies the built web app and the shared Node transport into the Electron app folder so the
// packaged app has no workspace dependencies.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const web = path.resolve(root, '..', 'web', 'dist');
if (!fs.existsSync(path.join(web, 'index.html'))) {
  console.error('Web app not built. Run "npm run build:web" in the repository root first.');
  process.exit(1);
}
fs.rmSync(path.join(root, 'web'), { recursive: true, force: true });
fs.cpSync(web, path.join(root, 'web'), { recursive: true });
fs.rmSync(path.join(root, 'web', 'sw.js'), { force: true });
fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.copyFileSync(path.resolve(root, '..', '..', 'packages', 'node-transport', 'index.cjs'), path.join(root, 'lib', 'node-transport.cjs'));
fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(root, 'lib', 'icon.png'));
console.log('Prepared desktop app resources.');
