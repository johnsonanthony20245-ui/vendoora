import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['../../tsconfig.base.json'] })],
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // These are real-DB integration tests against one shared Postgres. Some touch
    // singleton rows (e.g. insurance_fund.balance in platform_config), so running
    // test files in parallel races on that shared state. Serialize files for
    // correctness — the suite is DB-bound, so the wall-clock cost is small.
    fileParallelism: false,
  },
});
