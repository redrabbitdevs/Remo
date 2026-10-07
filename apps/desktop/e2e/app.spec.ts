import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFakeAdapter } from './fake-adapter';

test('desktop app boots, relays requests over IPC and adds a LAN unit', async () => {
  const fake = await startFakeAdapter();
  test.skip(!fake.ip, 'No IPv4 address on this machine');
  const app = await electron.launch({
    args: [path.join(__dirname, '..'), '--no-sandbox'],
    // Allow the fake adapter's address even if it is not in a private range.
    env: { ...process.env, REMO_EXTRA_HOSTS: fake.ip, REMO_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'remo-e2e-')) },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await expect(page.getByRole('heading', { name: 'Welcome to Remo' })).toBeVisible();
    expect(await page.evaluate(() => typeof window.remoNative?.request)).toBe('function');

    const body = await page.evaluate(
      (url) => window.remoNative!.request({ method: 'GET', url }).then((r) => r.body),
      `http://${fake.host}/common/basic_info`,
    );
    expect(body).toContain('ret=OK');

    // Public hosts are refused by the main process.
    const refused = await page.evaluate(() => window.remoNative!.request({ method: 'GET', url: 'http://example.com/' }));
    expect(refused.error).toMatch(/not allowed/);

    await page.getByRole('button', { name: 'Find my units' }).click();
    await page.getByLabel('IP address or host name').fill(fake.host);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Living room' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('switch', { name: 'Power', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Power', exact: true })).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    fake.server.close();
  }
});
