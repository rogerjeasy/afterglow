import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { applyMode } from './night-shell/theme';
import { redirectLegacy } from './router';
// Self-hosted type (the CSP allows fonts from our own origin only): Atkinson Hyperlegible
// Next for reading in the dark, its Mono for clocks, Fraunces for display lines.
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-600.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-800.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-500.css';
import '@fontsource/atkinson-hyperlegible-mono/latin-700.css';
import '@fontsource-variable/fraunces/opsz.css';
import './styles/tailwind.css';

// Resolve the initial mode's tokens before first paint so there is never a
// flash of unstyled (or light) content. theme.ts has already read the saved hue
// (red, or amber; NS-22), so an amber choice paints amber from the first frame.
applyMode('ember');
// `#/cold`, `?tour=1` and other links from before real paths keep working.
redirectLegacy();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// Offline first: the service worker caches the whole app (production builds only, so
// the dev server always serves fresh code).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
