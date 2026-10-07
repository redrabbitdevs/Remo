import http from 'node:http';
import os from 'node:os';
import { SimulatorTransport } from '@remo/core';

/** Serves the Remo simulator over real HTTP so the Electron/Node transport can be tested end to end. */
export async function startFakeAdapter() {
  const sim = new SimulatorTransport();
  sim.latencyMs = 0;
  const server = http.createServer(async (req, res) => {
    const r = await sim.request({ method: 'GET', url: `http://demo-living${req.url}` });
    res.writeHead(r.status, { 'content-type': 'text/plain' });
    res.end(r.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const port = (server.address() as { port: number }).port;
  const ip =
    Object.values(os.networkInterfaces())
      .flat()
      .find((a) => a && a.family === 'IPv4' && !a.internal)?.address ?? '';
  return { server, host: `${ip}:${port}`, ip, port };
}
