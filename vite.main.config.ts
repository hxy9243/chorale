import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'electron/main.ts',
    outDir: 'dist-electron',
    emptyOutDir: true,
    sourcemap: true,
    target: 'node22',
    rollupOptions: {
      external: ['electron'],
      output: {
        entryFileNames: 'main.js',
        format: 'es',
      },
    },
  },
});
