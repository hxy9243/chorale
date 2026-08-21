import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
