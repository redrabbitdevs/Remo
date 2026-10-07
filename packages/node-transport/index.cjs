'use strict';
/**
 * Node.js transport for Daikin adapters.
 *  - request(): plain HTTP, or HTTPS that tolerates the self-signed / legacy TLS of BRP072C adapters.
 *  - discover(): UDP broadcast "DAIKIN_UDP/common/basic_info" to port 30050.
 *
 * Shared by apps/bridge (web) and apps/desktop (Windows/Electron).
 */
const http = require('node:http');
const https = require('node:https');
const dgram = require('node:dgram');
const os = require('node:os');
const crypto = require('node:crypto');

const DISCOVERY_MSG = 'DAIKIN_UDP/common/basic_info';
const DISCOVERY_PORT = 30050;
const MAX_BODY = 2 * 1024 * 1024;

/** Agent for adapters: self-signed certs, legacy renegotiation, low security level ciphers. */
const legacyAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: false,
  ciphers: 'DEFAULT:@SECLEVEL=0',
  minVersion: 'TLSv1',
  // eslint-disable-next-line no-bitwise
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT | (crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION || 0),
});

/** Hosts a caller may reach. Cloud hosts are fixed; LAN targets must be private addresses. */
const CLOUD_HOSTS = new Set([
  'proddit.ditdeneb.com',
  'proddit-energy.ditdeneb.com',
  'scr.dspsph.com',
  'sha2.daikinonlinecontroller.com',
  'daikinsmartdb.jp',
]);

function isPrivateHost(hostname) {
  if (/^(localhost|127\.)/.test(hostname)) return false; // never relay to the bridge host itself
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)) return true; // CGNAT / Tailscale
  if (/\.local$/i.test(hostname)) return true;
  if (/^[a-z0-9-]+$/i.test(hostname)) return true; // bare LAN host name
  return false;
}

function isAllowedTarget(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  if (CLOUD_HOSTS.has(u.hostname)) return u.protocol === 'https:';
  return isPrivateHost(u.hostname);
}

/**
 * @param {{method:string,url:string,headers?:Record<string,string>,body?:string,insecureTls?:boolean,timeoutMs?:number}} req
 * @param {{allowAnyHost?: boolean}} [opts]
 * @returns {Promise<{status:number, body:string, headers:Record<string,string>}>}
 */
function request(req, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!opts.allowAnyHost && !isAllowedTarget(req.url)) {
      const err = new Error(`Target not allowed: ${req.url}`);
      err.code = 'forbidden';
      reject(err);
      return;
    }
    const u = new URL(req.url);
    const isHttps = u.protocol === 'https:';
    const lib = isHttps ? https : http;
    const headers = { ...(req.headers || {}) };
    if (req.body !== undefined && req.body !== null) headers['content-length'] = Buffer.byteLength(req.body);
    const r = lib.request(
      u,
      {
        method: req.method || 'GET',
        headers,
        agent: isHttps && (req.insecureTls || !CLOUD_HOSTS.has(u.hostname)) ? legacyAgent : undefined,
        timeout: req.timeoutMs || 8000,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > MAX_BODY) {
            r.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          const out = {};
          for (const [k, v] of Object.entries(res.headers)) out[k] = Array.isArray(v) ? v.join(', ') : String(v);
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8'), headers: out });
        });
      },
    );
    r.on('timeout', () => {
      const err = new Error('Request timed out');
      err.code = 'timeout';
      r.destroy(err);
    });
    r.on('error', (e) => {
      if (e.code !== 'timeout') e.code = 'network';
      reject(e);
    });
    if (req.body !== undefined && req.body !== null) r.write(req.body);
    r.end();
  });
}

function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      // eslint-disable-next-line no-bitwise
      out.add(ip.map((o, i) => (o | (~mask[i] & 255)) >>> 0).join('.'));
    }
  }
  return [...out];
}

function parseKV(body) {
  const out = {};
  for (const part of String(body).trim().split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/**
 * UDP discovery.
 * @param {number} [timeoutMs]
 * @returns {Promise<{ip:string, info:Record<string,string>}[]>}
 */
function discover(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => {
      try {
        sock.close();
      } catch {
        /* already closed */
      }
      resolve([...found.values()]);
    };
    sock.on('error', done);
    sock.on('message', (msg, rinfo) => {
      const info = parseKV(msg.toString('utf8'));
      if (info.ret !== 'OK' && !info.mac) return;
      found.set(info.mac || rinfo.address, { ip: rinfo.address, info });
    });
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const payload = Buffer.from(DISCOVERY_MSG);
      const send = () => {
        for (const addr of broadcastAddresses()) sock.send(payload, DISCOVERY_PORT, addr, () => {});
      };
      send();
      setTimeout(send, Math.min(800, timeoutMs / 3));
      setTimeout(done, timeoutMs);
    });
  });
}

module.exports = { request, discover, isAllowedTarget, parseKV, broadcastAddresses, CLOUD_HOSTS };
