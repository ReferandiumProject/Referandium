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
    testTimeout: 20000,
  }

  // Tests that move USDC balances or read/write the shared platform balance
  // row (bonding curve trades, paid startup listing creation, and admin
  // routes that now trigger curve trades). Running these files concurrently
  // against the same Postgres instance causes two classes of nondeterminism:
  // (1) delta-balance assertions racing against another file's fee landing
  // between their "before" and "after" reads, and (2) row-lock contention
  // that manifests as spurious timeouts on longer-running tests. Forcing
  // fileParallelism off for just this project serializes them without
  // slowing down the unrelated vote/listing-read test files below.
  const moneyTestGlobs = [
    'tests/api/curve/**/*.test.ts',
    'tests/api/startup-listings/**/*.test.ts',
    'tests/api/admin/**/*.test.ts',
    'tests/api/my-startups/**/*.test.ts',
    'tests/api/auth/**/*.test.ts',
  ]

  return {
    resolve: resolveConfig,
    test: {
      ...shared,
      projects: [
        {
          resolve: resolveConfig,
          test: {
            ...shared,
            name: 'money',
            include: moneyTestGlobs,
            fileParallelism: false,
          },
        },
        {
          resolve: resolveConfig,
          test: {
            ...shared,
            name: 'default',
            include: ['tests/**/*.test.ts'],
            exclude: moneyTestGlobs,
          },
        },
      ],
    },
  }
})
