import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
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
    // Setup files for different environments
    setupFiles: ['./src/__tests__/setup.ts'],
    // Additional setup for main process tests
    globalSetup: undefined,
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'out', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/__tests__/**',
        'src/main/index.ts', // Entry points
        'src/renderer/main.tsx',
        'src/preload/**',
      ],
      thresholds: {
        global: {
          branches: 75,
          functions: 75,
          lines: 80,
          statements: 80,
        },
      },
    },
    // Increased timeouts for session discovery tests (filesystem operations)
    testTimeout: 30000,
    hookTimeout: 15000,
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
    },
  },
})
