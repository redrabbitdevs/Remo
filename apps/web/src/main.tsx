import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline app shell for the hosted / bridge-served web app (not inside Electron or Android).
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.remoNative && !window.Capacitor?.isNativePlatform?.() && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
