import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyMode } from './night-shell/theme';
import './night-shell/night-shell.css';

// Resolve the initial mode's tokens before first paint so there is never a
// flash of unstyled (or light) content.
applyMode('ember');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline first: the service worker caches the whole app (production builds only, so
// the dev server always serves fresh code).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
