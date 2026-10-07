'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { request, isAllowedTarget, parseKV } = require('./index.cjs');

test('target allow-list', () => {
  assert.equal(isAllowedTarget('http://192.168.1.20/common/basic_info'), true);
  assert.equal(isAllowedTarget('https://10.0.0.3/x'), true);
  assert.equal(isAllowedTarget('https://proddit.ditdeneb.com/dsiot/multireq'), true);
  assert.equal(isAllowedTarget('http://proddit.ditdeneb.com/x'), false);
  assert.equal(isAllowedTarget('http://example.com/'), false);
  assert.equal(isAllowedTarget('http://127.0.0.1:8080/'), false);
  assert.equal(isAllowedTarget('file:///etc/passwd'), false);
});

test('parseKV', () => {
  assert.deepEqual(parseKV('ret=OK,mac=AA'), { ret: 'OK', mac: 'AA' });
});

test('request relays GET with headers', async () => {
  const srv = http.createServer((req, res) => res.end(`ret=OK,uuid=${req.headers['x-daikin-uuid']}`));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  const res = await request({ method: 'GET', url: `http://127.0.0.1:${port}/common/basic_info`, headers: { 'X-Daikin-uuid': 'abc' } }, { allowAnyHost: true });
  assert.equal(res.status, 200);
  assert.equal(res.body, 'ret=OK,uuid=abc');
  srv.close();
});
