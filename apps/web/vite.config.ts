import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

// `base: './'` keeps asset URLs relative so the same build works when served by the bridge,
// from GitHub Pages under /<repo>/, inside Electron (file://) and inside the Android WebView.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // During development, run `npm run bridge` and the dev server forwards /api to it.
      '/api': 'http://localhost:8732',
    },
  },
});
