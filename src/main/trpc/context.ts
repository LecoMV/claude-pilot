/**
 * tRPC Context
 *
 * Creates the context for each tRPC request.
 * This is where we can inject services, user info, etc.
 */

import type { BrowserWindow } from 'electron'

export interface TRPCContext {
  window: BrowserWindow | null
  sessionId?: string
}

export function createContext(window: BrowserWindow | null): TRPCContext {
  return {
    window,
    sessionId: undefined, // Will be set by auth middleware later
  }
}
