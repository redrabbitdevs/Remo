import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { screenshot: 'off', trace: 'retain-on-failure' },
});
