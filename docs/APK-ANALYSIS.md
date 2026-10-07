# Analysis of DAIKIN Mobile Controller 4.11.2

Source: `daikin-mobile-controller.xapk` (split APK bundle: `ao.daikin.remoapp.apk` base + `config.en` + `config.hdpi`).

| Item | Value |
|---|---|
| Package | `ao.daikin.remoapp` |
| Version | 4.11.2 (version code 114) |
| SDK | min 27 (Android 8.1), target 35 |
| Permissions | INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, POST_NOTIFICATIONS, GET_TASKS, AD_ID, C2DM (FCM), install referrer |
| Architecture | One activity (`ao.daikin.remoapp.MainActivity`) with fragments; networking library `jp.co.daikin.dknetlib`; UI package `jp.co.daikin.wwapp` |
| Code | R8-obfuscated, ~3,900 classes after decompilation (jadx 1.5.0) |
| Third party | Firebase Analytics + Messaging, Gson, OkHttp, Kotlin coroutines |

> Note: the first file supplied (`uptodown-ao.daikin.remoapp.apk`) was actually the
> Uptodown store client (`com.uptodown` 7.40), not the Daikin app, and was not used.

## Network architecture

The app talks to three kinds of endpoints:

1. **Wi-Fi adapter on the LAN ("In-Home")**
   * Classic API, `GET http://<adapter>/<group>/<command>?k=v` → `ret=OK,k=v,…`
     (BRP069Axx/Bxx, BRP072A).
   * Same API over HTTPS with a self-signed certificate plus a registered terminal UUID in the
     `X-Daikin-uuid` header (BRP072Cxx). Registration: `/common/register_terminal?key=<13-digit key>`.
     The CA `ca.daikindev.com.crt` ships in the app's assets.
   * Optional local password (`lpw`, the "child lock" code) sent as query parameter or
     `Authorization: Basic`.
   * JSON "dsiot" API, `POST /dsiot/multireq` (`{"requests":[{op,to,pc}]}`), for BRP084 and
     every adapter on firmware ≥ 2.8.
   * UDP discovery: broadcast `DAIKIN_UDP/common/basic_info` to port 30050.
2. **Daikin cloud ("Out-of-Home")**
   * GPF/dsiot cloud `proddit.ditdeneb.com` (demo: `scr.dspsph.com`, energy:
     `proddit-energy.ditdeneb.com`): OAuth password grant at `/premise/dsiot/login`, refresh at
     `/premise/dsiot/token`, logout at `/premise/dsiot/logout`; then JSON multireq addressed to
     `/dsiot/edges/<edgeId>/…`, push subscriptions, terminals, notification history, account close.
   * Legacy Daikin Online Controller `sha2.daikinonlinecontroller.com`: form login at
     `/common/login` (`scope=smart_app`), then the classic API relayed with `port=<assigned port>`.
   * Japanese services `daikinsmartdb.jp`.
   * The app embeds an OAuth client id/secret for the cloud. **Remo does not copy them**; users
     supply their own.
3. **Firebase Cloud Messaging** for push notifications (Bills-on-Demand alerts, news).

## Endpoints found

Classic API (all reachable in Remo through typed helpers or the diagnostics console):

* `/common/`: `basic_info, get_remote_method, set_remote_method, get_holiday, set_holiday,
  get_notify, set_notify, get_push_notice, set_push_notice, get_group, set_group,
  get_network_setting, set_network_setting, get_wifi_setting, start_wifi_scan,
  get_wifi_scan_result, start_wifi_connection, permit_wifi_connection, get_datetime,
  notify_date_time, set_timezone, set_name, set_icon, set_led, set_location, set_lpw,
  register_terminal, unregister_terminal, get_message, get_message_exist, set_message_read,
  get_progsum, port_assign, port_assign_acc, get_spw, add_account_pp, change_password_pp,
  set_account, create_onetime_key_ex, device_list, device_list_all, device_list_intime,
  look_adapter, stop_look_adapter, reboot, erase_device, system/fwupdate, login, revoke`
* `/aircon/`: `get|set_control_info, get_sensor_info, get_model_info, set_special_mode,
  get|set_timer, get|set_program, get|set_target, get|set_price, get|set_demand_control,
  get|set_scdltimer, get|set_scdltimer_info, get|set_scdltimer_body, get_day_power_ex,
  get_week_power[_ex], get_year_power[_ex]`
* `/cleaner/` (air purifiers, "CJ"): `get|set_control_info, get_sensor_info, get_model_info,
  get_unit_info, get|set_linkage_info, get|set_scdltimer_info, get|set_scdltimer_body,
  get_day_snsr_count, get_week_snsr_count`
* Firmware upload paths: `/common/system/fwupdate`, `/dkac/system/fwupdate`,
  `/gainspan/system/fwuploc`, `/config/firmware/update` (per Wi-Fi chipset: GainSpan, Marvell,
  Realtek, STMicro – firmware images are bundled in `assets/`).

### Schedule timer encoding

Reverse engineered from `dknetlib.dk.data.s` (encoder/decoder): per day `<dd>c` = count and
`<dd>N` = 18-character entry `[en][pow][mode][temp×4][HHMM][fan][dir][hum×3][adv][advflag]`.
Implemented in `packages/core/src/schedule.ts` with round-trip tests.

## Screens (from 238 layouts)

Unit list (groups, EU/JP/CJ variants) · unit control (temperature arc, mode, fan rate, air-flow
direction incl. 3D/positions, humidity, special functions: powerful/econo/streamer, comfort,
outdoor quiet) · air purifier control (course, air volume, humidify, UV clean, PM2.5/dust/odour,
history graphs, linkage, filter replacement notice) · schedule timer (3 programs, time line,
apply to week) · on/off timer · consumption graphs (day/week/year, per unit/group/all, cooling vs
heating, electricity price, monthly target, Bills on Demand) · power saving (demand control with
schedule) · holiday mode · edit units & groups (name, icon, order) · add adapter (discovery, SU/CG
flows) · Wi-Fi setup (AP mode, WPS, SSID scan, manual SSID, static IP/proxy, chipset specific
guides) · network detail settings · out-of-home settings (login ID/password, change password) ·
child lock · time zone / clock · firmware update · adapter register/unregister · notifications &
news · application region · manuals/FAQ/licences/terms.

The full parity matrix is in [FEATURES.md](FEATURES.md).
