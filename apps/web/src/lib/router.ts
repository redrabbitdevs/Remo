import { useSyncExternalStore } from 'react';

/** Tiny hash router: works on file:// (Electron), in the Android WebView and on static hosting. */
export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path = '/', qs = ''] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}

let current = parse();
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  subs.forEach((s) => s());
  window.scrollTo({ top: 0 });
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}

export function navigate(path: string) {
  location.hash = path;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else navigate(fallback);
}
