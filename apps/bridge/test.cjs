'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('bridge health, auth and target filtering', async () => {
  process.env.REMO_TOKEN = 'secret';
  delete require.cache[require.resolve('./server.cjs')];
  const { start } = require('./server.cjs');
  const server = await start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.ok, true);
  assert.equal((await fetch(`${base}/api/request`, { method: 'POST', body: '{}' })).status, 401);
  const res = await fetch(`${base}/api/request`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'GET', url: 'http://example.com/' }),
  });
  const body = await res.json();
  assert.match(body.error, /not allowed/);
  server.close();
});
