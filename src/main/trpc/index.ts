/**
 * tRPC Main Process Integration
 *
 * Sets up custom IPC handler for tRPC v11 + Electron.
 * This replaces electron-trpc/main which is incompatible with tRPC v11.
 */

import type { BrowserWindow } from 'electron'
import { createIPCHandler } from './ipcHandler'
import { appRouter } from './router'
import { createContext } from './context'

let ipcHandler: ReturnType<typeof createIPCHandler> | null = null

/**
 * Initialize tRPC IPC handler
 * Call this after creating the main window
 */
export function initializeTRPC(window: BrowserWindow): void {
  if (ipcHandler) {
    console.warn('[tRPC] Already initialized, skipping')
    return
  }

  ipcHandler = createIPCHandler({
    router: appRouter,
    createContext: () => createContext(window),
  })

  console.info('[tRPC] IPC handler initialized')
}

/**
 * Cleanup tRPC handler
 * Call this before app quit
 */
export function cleanupTRPC(): void {
  if (ipcHandler) {
    ipcHandler.dispose()
    ipcHandler = null
  }
  console.info('[tRPC] IPC handler cleaned up')
}

// Re-export types for convenience
export { appRouter, type AppRouter } from './router'
export { createContext, type TRPCContext } from './context'
