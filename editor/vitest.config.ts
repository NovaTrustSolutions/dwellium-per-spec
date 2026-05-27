import { defineConfig } from 'vitest/config'
import path from 'path'

// Vitest config for the main-process test suite.
//
// `electron` is aliased to a node-only stub so importing config.ts / workspace.ts
// — which transitively pull in `app` and `BrowserWindow` — works without an
// Electron runtime. The stub returns a per-run temp userData dir so saveConfig()
// writes don't leak into the dev install at ~/Library/Application Support/.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run files sequentially — they share one Postgres test DB. Within a file
    // tests share the same fixture; between files we want a clean slate.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'tests/electron-stub.ts'),
    },
  },
})
