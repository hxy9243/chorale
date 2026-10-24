import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// PDF.js decodes scanned CCITT/JBIG2/JPEG2000 images using these local files.
// Preserve their names because the worker resolves them relative to wasmUrl.
const pdfResources = ['jbig2.wasm', 'jbig2_nowasm_fallback.js', 'openjpeg.wasm', 'openjpeg_nowasm_fallback.js', 'qcms_bg.wasm',
  'LICENSE_JBIG2', 'LICENSE_OPENJPEG', 'LICENSE_PDFJS_JBIG2', 'LICENSE_PDFJS_OPENJPEG', 'LICENSE_PDFJS_QCMS', 'LICENSE_QCMS'];
const readPdfResource = (name: string) => readFileSync(new URL(`./node_modules/pdfjs-dist/wasm/${name}`, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: 'chorale-local-pdf-resources',
      generateBundle() {
        for (const name of pdfResources) this.emitFile({ type: 'asset', fileName: `pdfjs/${name}`, source: readPdfResource(name) });
      },
      configureServer(server) {
        server.middlewares.use('/pdfjs/', (request, response, next) => {
          const name = request.url?.split('?')[0].replace(/^\//, '') || '';
          if (!pdfResources.includes(name)) return next();
          response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'text/plain');
          response.end(readPdfResource(name));
        });
      },
    },
    {
      name: 'chorale-development-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html
          .replace(
            "connect-src 'self' https://paulrosen.github.io",
            "connect-src 'self' ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:* https://paulrosen.github.io",
          )
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
      },
    },
    react(),
  ],
  server: {
    proxy: {
      '/v1': {
        target: `http://127.0.0.1:${process.env.CHORALE_PORT || 1685}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (err && 'writeHead' in res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Chorale daemon offline' }));
            }
          });
        },
      },
      '/sse': {
        target: `http://127.0.0.1:${process.env.CHORALE_PORT || 1685}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (err && 'writeHead' in res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Chorale daemon offline' }));
            }
          });
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20000,
    exclude: [...configDefaults.exclude, '.agents/**', 'worktrees/**', 'dist-electron/**'],
  },
});
