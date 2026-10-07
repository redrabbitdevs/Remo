# Feature parity: DAIKIN Mobile Controller 4.11.2 → Remo

✅ implemented · 🆕 new in Remo · ⚙️ available as raw settings (generic editor / diagnostics) · ☁️ needs Out-of-Home sign-in

## Retained features

| Original feature | Remo | Where |
|---|---|---|
| Unit list with groups | ✅ grid/list, groups, per-group all on/off | Home |
| Power, mode (auto/cool/heat/dry/fan) | ✅ optimistic, rolls back on error | Unit |
| Target temperature arc (SeekArc) | ✅ drag, wheel, keys, ± buttons; one request per gesture | Unit |
| Fan rate (auto/quiet/1–5), model aware | ✅ | Unit |
| Air-flow direction (up-down, left-right, 3D) | ✅ incl. `f_dir_ud/f_dir_lr` models | Unit |
| Humidity target (Ururu/Sarara models) | ✅ auto / value / continuous | Unit |
| Powerful / Econo / Streamer | ✅ | Unit |
| Comfort airflow / Outdoor quiet (dsiot) | ✅ with remote-controller exclusivity rules | Unit |
| Indoor/outdoor temperature, humidity, error code | ✅ + compressor frequency + error hints | Unit |
| Air purifier (CJ): power, course, air volume, humidify, UV clean | ✅ | Purifier |
| PM2.5 / dust / odour readings and day/week history | ✅ | Purifier |
| Purifier ↔ air-conditioner linkage | ✅ | Purifier |
| Filter replacement notice, water tank | ✅ | Purifier |
| Schedule timer: 3 programs, active program, names | ✅ | Schedule |
| Per-day actions (time, power, mode, temp, fan, direction, humidity, advanced) | ✅ codec matches the app | Schedule |
| Apply to week | ✅ copy day → weekdays/weekend/any | Schedule |
| On/off timer, legacy program | ⚙️ | Timers |
| Auto-off notification (`get/set_notify`) | ⚙️ | Timers |
| Energy: day / week / year, cooling vs heating | ✅ | Energy |
| Energy per unit and all units | ✅ | Energy |
| Electricity price (`set_price`) | ✅ | Energy → Price |
| Demand control (power saving): manual / scheduled / auto, max power | ✅ (schedule ⚙️) | Power saving |
| Holiday mode (per unit / all) | ✅ | Holiday mode |
| Edit unit name (stored on adapter), icon, group, order | ✅ | Unit settings, Units & groups |
| Add adapter: UDP discovery, manual IP | ✅ | Add unit |
| BRP072C adapter key registration / unregistration | ✅ | Add unit, Unit settings |
| Wi-Fi setup: AP mode, SSID scan, password, security | ✅ | Wi-Fi setup |
| WPS guidance | ✅ | Wi-Fi setup |
| Static IP / DNS / proxy | ✅ | Wi-Fi setup → Advanced |
| Network detail settings | ✅ (read) | Unit settings |
| Adapter LED | ✅ | Unit settings |
| Clock sync / time zone / DST | ✅ | Unit settings |
| Child lock code | ✅ | Unit settings |
| Out-of-Home on/off (remote method) | ✅ | Unit settings |
| Out-of-Home account create / change password | ✅ | Unit settings |
| In-Home / Out-of-Home switch, cloud login, unit list | ✅ ☁️ (bring your own API client credentials) | Out-of-Home |
| Notification history (cloud) | ✅ ☁️ | Notifications |
| News / messages from adapter, mark read | ✅ | Notifications |
| Push notice settings | ⚙️ | Unit settings |
| Firmware update state | ✅ (read) | Unit settings |
| Reboot adapter, factory reset (erase), remove | ✅ with confirmations | Unit settings |
| Region, manuals, FAQ, IFTTT/voice links, licences | ✅ | Settings, Help |
| Bills on Demand (monthly target, alerts) | ⚙️ `get/set_target` + cloud history ☁️ | Timers/Diagnostics, Notifications |
| Demo mode | ✅ fully simulated units (works offline) | Settings |

## New in Remo 🆕

* **Three platforms from one code base**: web (PWA, installable, offline shell), Windows (installer + portable, tray, start with Windows, jump list "All units off"), Android (native LAN plugin, back-button navigation).
* **Scenes**: one tap to set many units ("Good night", "Leaving home").
* **All off** for the whole home or a group, with confirmation.
* **Dashboard at a glance**: live room temperature/humidity, error and offline badges, last-seen time.
* **Optimistic controls** with automatic roll-back and clear error toasts.
* **Energy cost estimates**, comparison with yesterday / last year, CSV export, accessible chart table.
* **Backup & restore** of units, groups, scenes and settings (JSON).
* **Dark mode**, °C/°F, 12/24 h clock, week starting Monday/Sunday.
* **Keyboard shortcuts** (`g h`, `g e`, `g s`, `r`, `?`) and full keyboard/screen-reader support (ARIA roles, focus management, reduced motion, forced colours).
* **Error code hints** and offline banners.
* **Diagnostics console**: call any adapter endpoint, inspect cached state.
* **Bridge** for browsers and a Docker image, with optional access token and a strict LAN/cloud allow-list.
* **Privacy**: no analytics, no ads ID, no Firebase. Local control needs no account.
* **Protocol auto-detection** (HTTP → HTTPS+key → dsiot).
* **Automated tests**: protocol unit tests, bridge/transport tests, browser e2e (desktop + mobile viewports) and Electron e2e with a fake adapter.

## Known limitations

* Push notifications via Firebase are not used; Remo shows in-app/system alerts while it runs.
* Cloud (Out-of-Home) access depends on Daikin's private API and an OAuth client you must supply.
* Firmware images are not bundled; adapters update themselves through the Daikin service.
* Purifier course/air-volume codes are mapped from the official app's labels and may differ on some models (raw values are visible in Diagnostics).
