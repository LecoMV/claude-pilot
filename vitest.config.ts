import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,

    // POOL CONFIGURATION - threads is fastest for high-core machines
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use moderate parallelism to avoid system freeze
        // 8 threads is a good balance for stability
        maxThreads: 8,
        minThreads: 2,
        // Enable for better thread coordination
        useAtomics: true,
        // Memory limit per thread (with 62GB RAM, can be generous)
        // 4GB per thread = 48GB max for workers, 14GB for system
        memoryLimit: '4096MB',
      },
    },

    // Enable file parallelism but with controlled threads
    // (fileParallelism: false was too slow - 113 files taking >10 min)
    fileParallelism: true,

    // Keep isolation enabled for React component tests (shared state issues without it)
    isolate: true,

    // Default environment for renderer tests
    environment: 'jsdom',

    // Match environments to test file locations
    environmentMatchGlobs: [
      // Main process tests use Node environment
      ['src/main/**/*.{test,spec}.ts', 'node'],
      ['src/__tests__/main/**/*.{test,spec}.ts', 'node'],
      // Preload tests use Node environment
      ['src/preload/**/*.{test,spec}.ts', 'node'],
      // Shared tests use Node environment
      ['src/shared/**/*.{test,spec}.ts', 'node'],
      ['src/__tests__/shared/**/*.{test,spec}.ts', 'node'],
      // Renderer tests use happy-dom (faster than jsdom)
      ['src/renderer/**/*.{test,spec}.{ts,tsx}', 'happy-dom'],
      ['src/__tests__/renderer/**/*.{test,spec}.{ts,tsx}', 'happy-dom'],
    ],

    // Setup files
    setupFiles: ['./src/__tests__/setup.ts'],

    // Test inclusion/exclusion
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'out', 'e2e'],

    // Coverage configuration (v8 is fastest - native engine, no pre-transpile)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/main/**/*.ts',
        'src/renderer/**/*.{ts,tsx}',
        'src/preload/**/*.ts',
        'src/shared/**/*.ts',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/main/index.ts', // Entry points
        'src/renderer/main.tsx',
        'src/renderer/components/dashboard/TRPCDemo.tsx', // Demo/spike component - to be deleted
        'src/renderer/lib/trpc/client.ts', // Re-export module, tested via ipcLink
        'src/renderer/lib/trpc/react.tsx', // Provider wiring, tested via integration
        'src/renderer/hooks/index.ts', // Re-export barrel file
        'src/renderer/components/graph/index.ts', // Re-export barrel file
        'src/main/ipc/handlers.ts', // Deprecated - migrated to tRPC controllers
        'src/main/ipc/memgraph.ts', // Deprecated - migrated to tRPC controllers
        'src/main/ipc/ipcHandler.ts', // Deprecated - migrated to tRPC controllers
        'src/main/trpc/router.ts', // Router composition - imports only
        'src/main/trpc/context.ts', // Context factory - minimal code
        'src/main/trpc/ipcHandler.ts', // IPC setup singleton
        'src/**/index.ts', // Barrel re-export files
        'src/renderer/components/graph/GraphWrapper.tsx', // Unused - not referenced in codebase
        'src/renderer/components/memory/MemgraphViewer.tsx', // Unused - not referenced in codebase
        'node_modules/**',
        'dist/**',
      ],
      // Target: 90% coverage
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
      // Clean previous coverage
      clean: true,
      cleanOnRerun: true,
    },

    // Timeouts (generous for filesystem operations)
    testTimeout: 30000,
    hookTimeout: 15000,

    // Reporters
    reporters: ['default'],

    // Cache for faster subsequent runs
    cache: {
      dir: '.vitest-cache',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/renderer'),
      '@components': resolve(__dirname, './src/renderer/components'),
      '@stores': resolve(__dirname, './src/renderer/stores'),
      '@hooks': resolve(__dirname, './src/renderer/hooks'),
      '@lib': resolve(__dirname, './src/renderer/lib'),
      '@types': resolve(__dirname, './src/renderer/types'),
      '@shared': resolve(__dirname, './src/shared'),
      '@main': resolve(__dirname, './src/main'),
    },
  },
})
