import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
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
    testTimeout: 10000,
    hookTimeout: 10000,
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
