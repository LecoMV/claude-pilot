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
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
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
