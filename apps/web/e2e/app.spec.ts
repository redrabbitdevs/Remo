import { expect, test, type Page } from '@playwright/test';

/** End-to-end smoke tests against the built app in demo mode (simulated adapters). */

async function startDemo(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/api\/health|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByRole('button', { name: 'Open Living room' })).toBeVisible();
  return errors;
}

test('dashboard lists demo units and toggles power', async ({ page }) => {
  const errors = await startDemo(page);
  await expect(page.getByRole('button', { name: 'Open Air purifier' })).toBeVisible();
  const power = page.getByRole('switch', { name: 'Living room power' });
  await expect(power).toBeEnabled();
  await power.click();
  await expect(power).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Open Living room' })).toContainText('Cool');
  expect(errors).toEqual([]);
});

test('unit control: mode, temperature, fan, special mode', async ({ page }) => {
  const errors = await startDemo(page);
  await page.getByRole('button', { name: 'Open Living room' }).click();
  await expect(page.getByRole('heading', { name: 'Living room' })).toBeVisible();
  await page.getByRole('radio', { name: 'Heat' }).click();
  await expect(page.getByRole('radio', { name: 'Heat' })).toHaveAttribute('aria-checked', 'true');
  const dial = page.getByRole('slider', { name: 'Set to' });
  await expect(dial).toHaveAttribute('aria-valuenow', '21');
  await page.getByRole('button', { name: 'Raise' }).click();
  await expect(dial).toHaveAttribute('aria-valuenow', '21.5');
  await page.waitForTimeout(1200); // commit delay + simulator latency
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(dial).toHaveAttribute('aria-valuenow', '21.5');
  await page.getByRole('radio', { name: '3', exact: true }).click();
  await expect(page.getByRole('radio', { name: '3', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('switch', { name: 'Streamer' }).click();
  await expect(page.getByRole('switch', { name: 'Streamer' })).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('energy page shows totals and a chart table', async ({ page }) => {
  const errors = await startDemo(page);
  await page.goto('/#/energy');
  await expect(page.getByText('Last 7 days')).toBeVisible();
  await page.getByRole('radio', { name: 'Year' }).click();
  await page.getByRole('button', { name: 'Show table' }).click();
  await expect(page.getByRole('table')).toContainText('Jan');
  expect(errors).toEqual([]);
});

test('schedule: view, add an action and save', async ({ page }) => {
  const errors = await startDemo(page);
  await page.goto('/#/unit/demo-living/schedule');
  await expect(page.getByRole('heading', { name: 'Monday' })).toBeVisible();
  await expect(page.getByRole('button', { name: /07:00/ }).first()).toBeVisible();
  const saturday = page.locator('.card', { has: page.getByRole('heading', { name: 'Saturday' }) });
  await saturday.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Schedule saved to the adapter')).toBeVisible();
  // Demo units live in memory, so leave and come back instead of reloading.
  await page.goto('/#/');
  await page.goto('/#/unit/demo-living/schedule');
  await expect(saturday.getByRole('button', { name: /07:00/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('purifier, holiday, settings and diagnostics render', async ({ page }) => {
  const errors = await startDemo(page);
  await page.goto('/#/unit/demo-purifier');
  await expect(page.getByText('PM2.5').first()).toBeVisible();
  await page.goto('/#/holiday');
  await page.getByRole('button', { name: 'Start holiday for all' }).click();
  await expect(page.getByRole('switch', { name: 'Holiday Bedroom' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/#/diagnostics?unit=demo-office');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('pre.code')).toContainText('"ret": "OK"');
  expect(errors).toEqual([]);
});
