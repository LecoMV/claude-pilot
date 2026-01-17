/**
 * tRPC Main Process Integration
 *
 * Sets up electron-trpc to handle IPC calls from the renderer.
 * This coexists with the legacy ipcMain handlers during migration.
 */

import { createIPCHandler } from 'electron-trpc/main'
import type { BrowserWindow } from 'electron'
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
  // electron-trpc doesn't have explicit cleanup, but we track state
  ipcHandler = null
  console.info('[tRPC] IPC handler cleaned up')
}

// Re-export types for convenience
export { appRouter, type AppRouter } from './router'
export { createContext, type TRPCContext } from './context'
