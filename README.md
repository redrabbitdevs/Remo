# Remo

**A modern, open-source controller for Daikin Wi-Fi air conditioners and air purifiers – on the web, Windows and Android.**

Remo rebuilds every feature of the official *DAIKIN Mobile Controller* app (v4.11.2), adds the things
it was missing, and runs everywhere from one code base.

| | Web | Windows | Android |
|---|---|---|---|
| Package | PWA / GitHub Pages / Docker bridge | NSIS installer (x64, arm64) + portable `.exe` | APK + AAB |
| Talks to adapters through | Remo bridge on your LAN | Electron main process | Native Capacitor plugin |
| Auto discovery | ✅ (via bridge) | ✅ | ✅ |

> Remo is not affiliated with Daikin. "Daikin" is a trademark of Daikin Industries, Ltd.

## Features

Everything from the official app – unit control (power, mode, temperature, fan, swing, humidity,
powerful/econo/streamer, comfort, outdoor quiet), air purifiers (course, air volume, humidify,
UV clean, PM2.5/dust/odour history, linkage, filter), weekly schedule timer (3 programs), timers,
energy (day/week/year, cooling vs heating, price), power saving (demand control), holiday mode,
groups/names/icons, discovery and manual add, BRP072C key registration, Wi-Fi setup (AP/WPS,
static IP, proxy), LED, clock/time zone, child lock, Out-of-Home, notifications, firmware state,
reboot and reset – plus scenes, all-off, cost estimates, CSV export, backup/restore, dark mode,
°F, keyboard shortcuts, accessibility, a diagnostics console and demo mode.

See **[docs/FEATURES.md](docs/FEATURES.md)** for the full parity matrix and
**[docs/APK-ANALYSIS.md](docs/APK-ANALYSIS.md)** for how the original app works.

Supported adapters: BRP069A/B, BRP072A, BRP072C (HTTPS + key), BRP084 and any adapter on
firmware ≥ 2.8 (JSON API).

## Getting it

Download the latest build from **Releases** (tag `v*`) or from the artifacts of the **CI** workflow:

* **Windows** – `Remo-<version>-setup-x64.exe` (installer; `-arm64` for ARM PCs) or `Remo-<version>-portable.exe`.
* **Android** – `Remo.apk` (sideload) or `Remo.aab` (Play Store).
* **Web** – open the GitHub Pages site for the demo, or run the bridge at home (below).

## Web app + bridge

Browsers can't talk to Daikin adapters directly, so the web app uses a tiny bridge on your network:

```bash
npm ci
npm run build:web
REMO_TOKEN=choose-a-secret npm run bridge     # http://<this-machine>:8732
# or
docker build -t remo . && docker run -d --network host -e REMO_TOKEN=choose-a-secret remo
```

Details: [docs/BRIDGE.md](docs/BRIDGE.md).

## Development

Requirements: Node 22+, for Android JDK 21 + Android SDK 36, for Windows builds Windows or Wine.

```bash
npm ci
npm test                 # protocol unit tests
npm run typecheck
npm run dev              # web app with hot reload (http://localhost:5173), Demo mode works without hardware
npm run bridge           # LAN bridge for the dev server (proxied at /api)
npm run desktop          # run the Windows/Electron app
npm run dist:win         # build Windows installer + portable exe
npm run android:sync     # copy the web build into the Android project
cd apps/mobile/android && ./gradlew assembleDebug
```

End-to-end tests: `npm run e2e -w @remo/web` (Chromium, desktop + mobile viewports) and
`npm run e2e -w @remo/desktop` (Electron against a fake adapter).

### Repository layout

```
packages/core            Protocol library (TypeScript): legacy, HTTPS+key, dsiot, cloud, schedules, energy, simulator
packages/node-transport  Node LAN transport (HTTP, legacy TLS, UDP discovery) shared by bridge and desktop
apps/web                 React UI (shared by all platforms)
apps/bridge              LAN bridge + static server for the web app
apps/desktop             Electron shell for Windows (tray, auto start, jump list)
apps/mobile              Capacitor Android project + DaikinNet native plugin
docs/                    Analysis, feature matrix, platform guides
.github/workflows        CI (tests, e2e, Windows, Android, Docker), Pages, Release
```

## CI / CD

* **CI** (every push/PR): unit tests, type check, web build, Playwright e2e, Electron e2e on
  Windows, Windows installer + portable build, Android APK/AAB build + lint, Docker image smoke test.
* **Pages** (main): deploys the web app to GitHub Pages.
* **Release** (`v*` tag push, or Actions → Release → Run workflow with a version): builds everything and attaches the binaries to a GitHub release.

Optional secrets: `CSC_LINK`/`CSC_KEY_PASSWORD` (Windows code signing),
`ANDROID_KEYSTORE_BASE64`/`ANDROID_KEYSTORE_PASSWORD`/`ANDROID_KEY_ALIAS`/`ANDROID_KEY_PASSWORD`
(Android release signing – see [docs/ANDROID.md](docs/ANDROID.md)).

## Privacy & security

No analytics, advertising IDs or Firebase. Local control needs no account and never leaves your
network. The bridge, desktop and Android transports only connect to private LAN addresses and the
Daikin cloud hosts; relaxed TLS checks apply only to LAN adapters (which use self-signed
certificates). Cloud API client credentials are never shipped with Remo.

## Licence

MIT – see [LICENSE](LICENSE).
