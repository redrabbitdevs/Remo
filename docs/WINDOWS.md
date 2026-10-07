# Windows

`apps/desktop` is an Electron shell around the web UI. Network access runs in the main process
(`lib/node-transport.cjs`), the renderer is sandboxed with context isolation and only sees the
`window.remoNative` API.

* Installer (per-user, choose folder) for x64 and arm64, plus a portable exe.
* System tray: unit list with on/off toggles, "All units off", quick open. Closing the window keeps
  Remo in the tray; Quit from the tray menu.
* Settings → Start with Windows (starts hidden in the tray).
* Jump list task "All units off".

```bash
npm ci && npm run desktop     # run
npm run dist:win              # build release/*.exe
```

Code signing: set `CSC_LINK` (base64 .pfx) and `CSC_KEY_PASSWORD` secrets for CI. Unsigned builds
show a SmartScreen warning on first start.
