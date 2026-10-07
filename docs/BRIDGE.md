# Remo bridge

The bridge serves the web app and relays its requests to Daikin adapters on your LAN. Run it on
any always-on device in the same network (PC, Raspberry Pi, NAS).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8732` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `REMO_TOKEN` | – | If set, every `/api` call needs `Authorization: Bearer <token>` (enter it in Settings → Bridge) |
| `REMO_ORIGINS` | – | Extra origins allowed by CORS (e.g. a hosted copy of the web app) |
| `REMO_EXTRA_HOSTS` | – | Extra adapter hosts outside private ranges (e.g. over a VPN) |
| `WEB_ROOT` | `apps/web/dist` | Built web app directory |

API: `GET /api/health`, `POST /api/request` (`{method,url,headers,body,insecureTls,timeoutMs}`),
`GET /api/discover?timeout=3000`.

Security model: only private IPv4 ranges (10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10),
`.local`/bare host names and the Daikin cloud hosts (HTTPS only) can be reached; loopback is
refused. Expose the bridge to the internet only behind a VPN or a reverse proxy with TLS, and set
`REMO_TOKEN`.

Docker: `docker run -d --network host -e REMO_TOKEN=secret remo` (host networking is needed for
UDP discovery).
