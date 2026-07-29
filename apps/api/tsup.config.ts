import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace package has no build step of its own — bundle it in.
  noExternal: ['@onepct/shared'],
});
