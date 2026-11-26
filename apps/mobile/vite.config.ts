import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

/**
 * Writes sw.js from sw/sw.template.js with the exact list of this build's files and
 * a version from their names, so the service worker caches the whole app at install.
 */
function serviceWorker(): Plugin {
  return {
    name: 'afterglow-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const fromPublic = readdirSync(new URL('./public', import.meta.url));
      const files = ['./', 'index.html', ...new Set([...built, ...fromPublic])].filter(
        (f) => f !== 'sw.js',
      );
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./sw/sw.template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__PRECACHE__', JSON.stringify(files))
          .replace('__VERSION__', JSON.stringify(version)),
      });
    },
  };
}

// `AFTERGLOW_BASE` lets the same build be hosted at a domain root (default) or
// under a repository subpath such as GitHub Pages (`/afterglow/`).
export default defineConfig({
  base: process.env.AFTERGLOW_BASE ?? '/',
  plugins: [react(), serviceWorker()],
  // The Cognito SRP client pulls in a Buffer polyfill that expects Node's `global`.
  // The production bundle resolves it; the dev server's dependency pre-bundling needs this.
  optimizeDeps: {
    esbuildOptions: { define: { global: 'globalThis' } },
  },
  server: {
    port: 5173,
    host: true,
  },
});
