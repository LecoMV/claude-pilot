/**
 * Terminal Controller
 *
 * Type-safe tRPC controller for terminal operations.
 * Handles opening terminal at specific paths.
 *
 * Migrated from handlers.ts (1 handler):
 * - terminal:openAt
 *
 * @module terminal.controller
 */

import { z } from 'zod'
import { router, publicProcedure } from '../../trpc/trpc'
import { BrowserWindow } from 'electron'

// ============================================================================
// Schemas
// ============================================================================

const OpenAtSchema = z.object({
  path: z.string().min(1),
})

// ============================================================================
// Router
// ============================================================================

export const terminalRouter = router({
  /**
   * Open terminal at a specific path
   *
   * This sends a message to the renderer to navigate to the terminal
   * view and set the working directory.
   */
  openAt: publicProcedure.input(OpenAtSchema).mutation(({ input }): boolean => {
    try {
      // Get the focused window or the first window
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

      if (!win || win.isDestroyed()) {
        console.error('[Terminal] No window available')
        return false
      }

      // Send message to renderer to navigate to terminal and set cwd
      win.webContents.send('terminal:setCwd', input.path)
      return true
    } catch (error) {
      console.error('[Terminal] Failed to open at path:', error)
      return false
    }
  }),
})
