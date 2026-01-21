import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  // Use Vite's cacheDir (vitest cache.dir is deprecated)
  cacheDir: '.vitest-cache',
  test: {
    globals: true,

    // POOL CONFIGURATION - forks for better memory isolation (separate V8 heaps)
    // Each worker is a separate process with its own heap, avoiding shared memory OOM
    pool: 'forks',
    poolOptions: {
      forks: {
        // Conservative parallelism (3 workers) - prevents OOM on large test suites
        // 81 test files with 3 workers balances speed vs memory
        maxForks: 3,
        minForks: 1,
        // Memory limit per worker (1.5GB - leaves headroom for system)
        memoryLimit: '1536MB',
        // Isolate globals for cleaner test environment
        isolate: true,
        // Single child per worker to reduce memory fragmentation
        singleFork: true,
      },
    },

    // Enable file parallelism with controlled workers
    fileParallelism: true,

    // Test isolation (each test file gets fresh environment)
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
        // Complex visualization components (require GPU/WebGL/integration tests)
        'src/renderer/components/graph/CosmographWrapper.tsx', // GPU-accelerated Cosmograph visualization
        'src/renderer/components/memory/HybridGraphViewer.tsx', // Cytoscape, Graphology, Sigma, FA2Layout worker
        'src/renderer/components/branches/BranchPanel.tsx', // ReactFlow + window.claude API (mocking breaks jsdom container)
        // Complex multi-system UI components (require database/tRPC integration tests)
        'src/renderer/components/memory/MemoryBrowser.tsx', // PostgreSQL, Memgraph, Qdrant integration
        'src/renderer/components/settings/GlobalSettings.tsx', // Multi-tab settings with complex tRPC mutations
        // Worker threads and complex services (require integration tests)
        'src/main/services/embeddings/**', // Entire embeddings service - Ollama/worker integration
        'src/main/services/memgraph.ts', // External database connection
        'src/main/services/memory/qdrant.service.ts', // External database connection (has tests separately)
        // Error handlers with Electron dialog integration (require integration tests)
        'src/main/utils/error-handler.ts', // Electron dialog, app integration
        'src/main/utils/ipc-error-handler.ts', // Audit service integration
        'node_modules/**',
        'dist/**',
      ],
      // Target: 90% coverage (increased from 70% -> 75% for v0.2.0)
      thresholds: {
        global: {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
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
