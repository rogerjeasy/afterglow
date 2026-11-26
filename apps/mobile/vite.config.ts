import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `AFTERGLOW_BASE` lets the same build be hosted at a domain root (default) or
// under a repository subpath such as GitHub Pages (`/afterglow/`).
export default defineConfig({
  base: process.env.AFTERGLOW_BASE ?? '/',
  plugins: [react()],
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
