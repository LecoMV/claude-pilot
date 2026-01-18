/**
 * Terminal Controller
 *
 * Type-safe tRPC controller for terminal operations.
 * Implements HYBRID approach:
 * - Control operations (create, resize, close, list): tRPC (type-safe)
 * - Data streaming (write, output): Legacy IPC (low-latency)
 *
 * @see docs/Research/Electron-tRPC Production Patterns Research.md
 * @module terminal.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { BrowserWindow } from 'electron'
import { terminalManager } from '../../services/terminal'

// ============================================================================
// Schemas
// ============================================================================

const OpenAtSchema = z.object({
  path: z.string().min(1),
})

const CreateSchema = z.object({
  cwd: z.string().optional(),
})

const ResizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(500),
})

const CloseSchema = z.object({
  sessionId: z.string().min(1),
})

// ============================================================================
// Router
// ============================================================================

export const terminalRouter = router({
  /**
   * Open terminal at a specific path
   * Sends message to renderer to navigate to terminal view
   */
  openAt: publicProcedure.input(OpenAtSchema).mutation(({ input }): boolean => {
    try {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) {
        console.error('[Terminal] No window available')
        return false
      }
      win.webContents.send('terminal:setCwd', input.path)
      return true
    } catch (error) {
      console.error('[Terminal] Failed to open at path:', error)
      return false
    }
  }),

  /**
   * Create a new terminal session
   * Returns session ID for subsequent operations
   */
  create: auditedProcedure.input(CreateSchema.optional()).mutation(({ input }): string => {
    return terminalManager.create(input?.cwd)
  }),

  /**
   * Resize a terminal session
   * Called on window resize events
   */
  resize: publicProcedure.input(ResizeSchema).mutation(({ input }): boolean => {
    try {
      terminalManager.resize(input.sessionId, input.cols, input.rows)
      return true
    } catch {
      return false
    }
  }),

  /**
   * Close a terminal session
   * Kills the PTY process and cleans up resources
   */
  close: auditedProcedure.input(CloseSchema).mutation(({ input }): boolean => {
    try {
      terminalManager.close(input.sessionId)
      return true
    } catch {
      return false
    }
  }),

  /**
   * List all active terminal sessions
   */
  list: publicProcedure.query((): string[] => {
    return terminalManager.listSessions()
  }),
})
