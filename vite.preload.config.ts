import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    emptyOutDir: false,
    sourcemap: true,
    target: 'node22',
    lib: {
      entry: 'electron/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
});
