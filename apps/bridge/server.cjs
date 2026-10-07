#!/usr/bin/env node
'use strict';
/**
 * Remo bridge
 * -----------
 * Browsers cannot talk to Daikin adapters directly (no CORS headers, plain HTTP, self-signed TLS,
 * UDP discovery). Run this bridge on any always-on machine in the same network (PC, Raspberry Pi,
 * NAS, Docker) and open http://<bridge-ip>:8732 on any device.
 *
 * Environment:
 *   PORT         listen port (default 8732)
 *   HOST         listen address (default 0.0.0.0)
 *   REMO_TOKEN   optional access token; when set every /api call needs "Authorization: Bearer <token>"
 *   REMO_ORIGINS optional comma separated list of extra origins allowed by CORS
 *   WEB_ROOT     directory with the built web app (default ../web/dist)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { request, discover } = require('@remo/node-transport');

const PORT = Number(process.env.PORT || 8732);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.REMO_TOKEN || '';
const ORIGINS = (process.env.REMO_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const WEB_ROOT = path.resolve(process.env.WEB_ROOT || path.join(__dirname, '..', 'web', 'dist'));
const MAX_REQUEST = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    // Chrome Private Network Access preflight
    res.setHeader('access-control-allow-private-network', 'true');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_REQUEST) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(WEB_ROOT, rel));
  if (!file.startsWith(WEB_ROOT)) {
    res.writeHead(403).end();
    return;
  }
  const send = (f) => {
    const ext = path.extname(f);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' || f.endsWith('sw.js') ? 'no-cache' : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(f).pipe(res);
  };
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return send(file);
    const index = path.join(WEB_ROOT, 'index.html');
    if (fs.existsSync(index)) return send(index); // SPA fallback
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Web app not built. Run "npm run build:web" first.');
  });
}

async function handle(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') {
    json(res, 200, { ok: true, name: 'remo-bridge', version: '1.0.0', auth: Boolean(TOKEN) });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (!authorized(req)) {
      json(res, 401, { error: 'Unauthorized', code: 'auth' });
      return;
    }
    if (url.pathname === '/api/request' && req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch (e) {
        json(res, 400, { error: `Bad request: ${e.message}`, code: 'protocol' });
        return;
      }
      try {
        const out = await request(payload);
        json(res, 200, out);
      } catch (e) {
        json(res, 200, { error: e.message, code: e.code === 'forbidden' ? 'unsupported' : e.code || 'network' });
      }
      return;
    }
    if (url.pathname === '/api/discover' && req.method === 'GET') {
      const timeout = Math.min(Math.max(Number(url.searchParams.get('timeout')) || 3000, 500), 10000);
      json(res, 200, await discover(timeout));
      return;
    }
    json(res, 404, { error: 'Not found' });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405).end();
}

function start(port = PORT, host = HOST) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => json(res, 500, { error: e.message }));
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

if (require.main === module) {
  start().then((server) => {
    const addr = server.address();
    console.log(`Remo bridge listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${addr.port}`);
    console.log(TOKEN ? 'Access token required (REMO_TOKEN).' : 'Tip: set REMO_TOKEN to require an access token.');
  });
}

module.exports = { start };
