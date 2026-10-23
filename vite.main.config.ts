import { defineConfig } from 'vite';

export const shouldEmptyElectronOutput = (arguments_: readonly string[] = process.argv) => (
  !arguments_.includes('--watch')
);

export default defineConfig({
  build: {
    ssr: 'electron/main.ts',
    outDir: 'dist-electron',
    emptyOutDir: shouldEmptyElectronOutput(),
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
