import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['../../tsconfig.base.json'] })],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['./__tests__/setup.ts'],
    // Integration tests share state (a real DB) — run serially to avoid races
    // between migrate/reset/seed.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Migration + seed can take a few seconds on a cold container.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
