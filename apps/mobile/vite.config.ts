import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `AFTERGLOW_BASE` lets the same build be hosted at a domain root (default) or
// under a repository subpath such as GitHub Pages (`/afterglow/`).
export default defineConfig({
  base: process.env.AFTERGLOW_BASE ?? '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
