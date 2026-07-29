import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    server: {
      deps: {
        // The repo lives in a folder containing '%' ("1%"). vite-node builds
        // file:// URLs for externalized deps without percent-encoding, which
        // throws "URIError: URI malformed". Inlining routes deps through the
        // Vite transform pipeline (plain fs paths) instead.
        inline: true,
      },
    },
  },
});
