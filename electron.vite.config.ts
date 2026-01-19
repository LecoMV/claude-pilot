import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    // Bundle electron-trpc for sandboxed preload compatibility
    // See: https://electron-vite.org/guide/troubleshooting
    plugins: [externalizeDepsPlugin({ exclude: ['electron-trpc'] })],
    build: {
      // Output CommonJS for sandbox compatibility
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      sourcemap: false,
      minify: true,
      // Target modern browsers for smaller bundle
      target: 'esnext',
      // Increase chunk size warning limit (Monaco is large)
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
        output: {
          // Code splitting for large dependencies
          manualChunks: {
            // Monaco editor (~2MB) - lazy loaded
            monaco: ['monaco-editor', '@monaco-editor/react'],
            // Graph visualization libraries (~500KB)
            graphs: ['cytoscape', 'graphology', 'graphology-layout-forceatlas2', 'sigma'],
            // Terminal emulator (~300KB)
            terminal: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-webgl'],
            // Charts and visualization (~200KB)
            charts: ['recharts'],
            // React Flow for workflows
            flow: ['reactflow'],
            // Core React ecosystem
            react: ['react', 'react-dom'],
            // State and data management
            state: ['zustand', '@tanstack/react-query', 'superjson'],
            // tRPC client
            trpc: ['@trpc/client', '@trpc/react-query'],
          },
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@components': resolve(__dirname, 'src/renderer/components'),
        '@stores': resolve(__dirname, 'src/renderer/stores'),
        '@hooks': resolve(__dirname, 'src/renderer/hooks'),
        '@lib': resolve(__dirname, 'src/renderer/lib'),
        '@types': resolve(__dirname, 'src/renderer/types'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
})
