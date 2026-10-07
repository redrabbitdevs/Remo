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

test('discovery listens on port 30000 for adapter replies', async () => {
  const dgram = require('node:dgram');
  const { discover } = require('./index.cjs');
  // Fake adapter: answers on 30050 and replies to port 30000 like real Daikin adapters.
  const adapter = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise((r) => adapter.bind(30050, '127.0.0.1', r));
  adapter.on('message', (msg, rinfo) => {
    if (msg.toString() === 'DAIKIN_UDP/common/basic_info') {
      adapter.send(Buffer.from('ret=OK,type=aircon,mac=AABBCCDDEEFF,name=%4c%69%76%69%6e%67'), 30000, rinfo.address);
    }
  });
  const found = await discover(1200, ['127.0.0.1']);
  adapter.close();
  assert.equal(found.length, 1);
  assert.equal(found[0].info.mac, 'AABBCCDDEEFF');
});

test('lenient parser accepts malformed adapter headers', async () => {
  const net = require('node:net');
  const srv = net.createServer((c) => {
    // Control character inside a header value: rejected by Node's strict parser.
    c.once('data', () => c.end('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nServer: dk\x01ac\r\nContent-Length: 6\r\n\r\nret=OK'));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const res = await request({ method: 'GET', url: `http://127.0.0.1:${srv.address().port}/common/basic_info` }, { allowAnyHost: true });
    assert.equal(res.body, 'ret=OK');
  } finally {
    srv.close();
  }
});
