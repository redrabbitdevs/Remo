'use strict';
/**
 * Remo for Windows (Electron main process).
 * The UI is the same web app; network access to adapters (HTTP, legacy TLS, UDP discovery)
 * happens here and is exposed to the sandboxed renderer through a narrow IPC API.
 */
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell, screen } = require('electron');
const transport = require('./lib/node-transport.cjs');

const isDev = !app.isPackaged;
// Separate profile (used by tests and for running several configurations side by side).
if (process.env.REMO_USER_DATA) app.setPath('userData', process.env.REMO_USER_DATA);
let win;
let tray;
let quitting = false;
let trayUnits = [];

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('io.github.redrabbitdevs.remo');

function loadBounds() {
  try {
    const b = JSON.parse(require('node:fs').readFileSync(path.join(app.getPath('userData'), 'window.json'), 'utf8'));
    const visible = screen.getAllDisplays().some((d) => b.x >= d.bounds.x - 50 && b.y >= d.bounds.y - 50 && b.x < d.bounds.x + d.bounds.width && b.y < d.bounds.y + d.bounds.height);
    return visible ? b : { width: b.width, height: b.height };
  } catch {
    return { width: 1180, height: 800 };
  }
}

function saveBounds() {
  if (!win || win.isMinimized() || win.isMaximized()) return;
  try {
    require('node:fs').writeFileSync(path.join(app.getPath('userData'), 'window.json'), JSON.stringify(win.getBounds()));
  } catch {
    /* ignore */
  }
}

function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 560,
    title: 'Remo',
    icon: path.join(__dirname, 'lib', 'icon.png'),
    backgroundColor: '#0e1621',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win.show();
  });
  win.on('close', (e) => {
    saveBounds();
    if (!quitting && tray) {
      e.preventDefault();
      win.hide();
    }
  });
  // Never navigate away from the bundled app; open links in the default browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void win.loadFile(path.join(__dirname, 'web', 'index.html'));
  if (isDev && process.env.REMO_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
}

function showWindow(hash) {
  if (!win) createWindow();
  if (hash) void win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function send(action, id) {
  win?.webContents.send('remo:tray-action', action, id);
}

function buildTrayMenu() {
  if (!tray) return;
  const unitItems = trayUnits.slice(0, 12).map((u) => ({
    label: u.name,
    type: 'checkbox',
    checked: u.on,
    click: () => send('toggle', u.id),
  }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Remo', click: () => showWindow() },
      { type: 'separator' },
      ...(unitItems.length ? unitItems : [{ label: 'No units', enabled: false }]),
      { type: 'separator' },
      { label: 'All units off', click: () => send('all-off') },
      { label: 'Energy', click: () => showWindow('#/energy') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  const on = trayUnits.filter((u) => u.on).length;
  tray.setToolTip(`Remo – ${on} of ${trayUnits.length} units on`);
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'lib', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.on('click', () => showWindow());
  buildTrayMenu();
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('remo:request', async (_e, req) => {
  try {
    return await transport.request(req);
  } catch (err) {
    return { status: 0, body: '', error: err.message, code: err.code === 'forbidden' ? 'unsupported' : err.code || 'network' };
  }
});
ipcMain.handle('remo:discover', (_e, timeoutMs) => transport.discover(Math.min(Math.max(Number(timeoutMs) || 3000, 500), 10000)));
ipcMain.on('remo:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) void shell.openExternal(url);
});
ipcMain.on('remo:set-tray', (_e, state) => {
  if (state && Array.isArray(state.units)) {
    trayUnits = state.units.map((u) => ({ id: String(u.id), name: String(u.name).slice(0, 60), on: Boolean(u.on) }));
    buildTrayMenu();
  }
});
ipcMain.handle('remo:auto-launch', (_e, enabled) => {
  if (typeof enabled === 'boolean') app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
  return app.getLoginItemSettings().openAtLogin;
});

// ------------------------------------------------------------------ lifecycle
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();
  app.setJumpList?.([
    {
      type: 'tasks',
      items: [{ type: 'task', title: 'All units off', program: process.execPath, args: '--all-off', iconPath: process.execPath, iconIndex: 0, description: 'Switch every unit off' }],
    },
  ]);
  if (process.argv.includes('--all-off')) setTimeout(() => send('all-off'), 3000);
});

app.on('second-instance', (_e, argv) => {
  if (argv.includes('--all-off')) send('all-off');
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('activate', () => showWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit();
});

// Harden: no webviews, no new windows with node.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});
