import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  const resolveConfig = {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  }

  const shared = {
    environment: 'node',
    globals: true,
    setupFiles: [],
    testTimeout: 30000,
    hookTimeout: 30000,
  }

  // Serialisation is a deliberate workaround for running this suite against
  // one shared live database. Every test file reads and writes the same
  // Postgres instance, so true isolation is achieved by never running two
  // files at once. fileParallelism: false on a single project enforces that.
  //
  // Cost: the suite is slower. That is the trade-off. A slow, trustworthy
  // suite is better than a fast one that returns different numbers each run.
  //
  // What would replace this: per-run isolation. Give each test run its own
  // database or schema (e.g. a test DB created from a template and torn down
  // after each run). That is not today's job, and it should not be removed
  // from this config without that isolation in place.
  //
  // moneyTestGlobs is kept for the guard test in tests/zzz-guard.test.ts,
  // which greps the list to detect money-touching test files that are not
  // classified as money-touching.
  const moneyTestGlobs = [
    'tests/api/curve/**/*.test.ts',
    'tests/api/startup-listings/**/*.test.ts',
    'tests/api/admin/**/*.test.ts',
    'tests/api/my-startups/**/*.test.ts',
    'tests/api/auth/**/*.test.ts',
    'tests/api/deposit/**/*.test.ts',
    'tests/api/release-due-investment-packs.test.ts',
    'tests/api/withdraw/**/*.test.ts',
    'tests/api/stripe/**/*.test.ts',
    'tests/netlify/**/*.test.ts',
  ]

  return {
    resolve: resolveConfig,
    test: {
      ...shared,
      name: 'serial',
      globalSetup: 'tests/global-teardown.ts',
      include: ['tests/**/*.test.ts'],
      exclude: [],
      fileParallelism: false,
    },
  }
})
