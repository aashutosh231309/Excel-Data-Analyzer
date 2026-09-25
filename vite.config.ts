import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Content Security Policy for the packaged renderer.
 *
 * It is injected at build time rather than written into `index.html` so that the
 * Vite development server (which relies on inline scripts for hot reload) keeps
 * working. The shipped application is locked down: scripts, styles and fonts come
 * from the bundle only and no network connection is permitted.
 */
const PRODUCTION_CSP = [
  // The packaged renderer is served from the privileged `app://bundle/` origin
  // (see electron/main.ts), so 'self' is a real, unambiguous origin here.
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function injectContentSecurityPolicy(): Plugin {
  return {
    name: 'excel-data-analyzer:content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const metaTag = `    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`;
      return html.replace('  </head>', `${metaTag}\n  </head>`);
    },
  };
}

export default defineConfig({
  root: path.resolve(__dirname),
  // Relative asset paths so the packaged app can load the SPA from file://.
  base: './',
  plugins: [react(), injectContentSecurityPolicy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Types and format rules shared with the Electron main process.
      '@shared': path.resolve(__dirname, 'electron/shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5273,
    strictPort: true,
    // The renderer may be opened through a hosted preview URL during review.
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome130',
  },
});
