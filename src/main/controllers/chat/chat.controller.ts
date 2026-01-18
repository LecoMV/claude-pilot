/**
 * Chat Controller
 *
 * Type-safe tRPC controller for Claude Code chat operations.
 * Handles sending messages to Claude Code CLI and streaming responses.
 *
 * @module chat.controller
 */

import { z } from 'zod'
import { router, publicProcedure } from '../../trpc/trpc'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { BrowserWindow } from 'electron'

// ============================================================================
// Types
// ============================================================================

interface ChatProcess {
  process: ChildProcessWithoutNullStreams
  messageId: string
  startedAt: number
}

// Track active chat processes
const activeChats = new Map<string, ChatProcess>()

// ============================================================================
// Helpers
// ============================================================================

/**
 * Send streaming response to all renderer windows
 */
function sendToRenderer(data: {
  type: 'chunk' | 'done' | 'error'
  messageId: string
  content?: string
  error?: string
}) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('chat:response', data)
  })
}

/**
 * Resolve Claude binary path (reuse from claude.controller logic)
 */
async function resolveClaudeBinary(): Promise<string> {
  const { spawnSync } = await import('child_process')
  const { existsSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')

  const HOME = homedir()
  const searchPaths = [
    join(HOME, '.local', 'bin', 'claude'),
    join(HOME, '.npm-global', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    '/opt/homebrew/bin/claude',
    join(HOME, '.nvm', 'current', 'bin', 'claude'),
    join(HOME, '.volta', 'bin', 'claude'),
  ]

  // Try which first
  const whichResult = spawnSync('which', ['claude'], { encoding: 'utf-8' })
  if (whichResult.status === 0) {
    const path = whichResult.stdout.trim()
    if (existsSync(path)) return path
  }

  // Search standard paths
  for (const binaryPath of searchPaths) {
    if (existsSync(binaryPath)) {
      return binaryPath
    }
  }

  // Fallback to 'claude' and hope it's in PATH
  return 'claude'
}

// ============================================================================
// Router
// ============================================================================

export const chatRouter = router({
  /**
   * Send a message to Claude Code and stream the response
   */
  send: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        message: z.string(),
        messageId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { projectPath, message, messageId } = input

      // Resolve Claude binary
      const claudeBinary = await resolveClaudeBinary()

      // Spawn Claude with --print flag for non-interactive output
      const claude = spawn(claudeBinary, ['--print', message], {
        cwd: projectPath,
        env: {
          ...process.env,
          // Force non-interactive mode
          CI: '1',
          TERM: 'dumb',
        },
      })

      // Track this process
      activeChats.set(messageId, {
        process: claude,
        messageId,
        startedAt: Date.now(),
      })

      let response = ''

      claude.stdout.on('data', (data: Buffer) => {
        response += data.toString()
        sendToRenderer({
          type: 'chunk',
          messageId,
          content: response,
        })
      })

      claude.stderr.on('data', (data: Buffer) => {
        console.error('[Chat] stderr:', data.toString())
      })

      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        claude.on('close', (code) => {
          activeChats.delete(messageId)

          if (code === 0) {
            sendToRenderer({
              type: 'done',
              messageId,
            })
            resolve({ success: true })
          } else {
            const error = `Process exited with code ${code}`
            sendToRenderer({
              type: 'error',
              messageId,
              error,
            })
            resolve({ success: false, error })
          }
        })

        claude.on('error', (err) => {
          activeChats.delete(messageId)
          sendToRenderer({
            type: 'error',
            messageId,
            error: err.message,
          })
          resolve({ success: false, error: err.message })
        })
      })
    }),

  /**
   * Cancel an active chat request
   */
  cancel: publicProcedure.input(z.object({ messageId: z.string() })).mutation(({ input }) => {
    const chat = activeChats.get(input.messageId)
    if (chat) {
      chat.process.kill('SIGTERM')
      activeChats.delete(input.messageId)
      sendToRenderer({
        type: 'error',
        messageId: input.messageId,
        error: 'Request cancelled',
      })
      return { success: true }
    }
    return { success: false, error: 'Chat not found' }
  }),

  /**
   * Get status of active chats
   */
  status: publicProcedure.query(() => {
    return {
      activeChats: activeChats.size,
      chats: Array.from(activeChats.entries()).map(([id, chat]) => ({
        messageId: id,
        startedAt: chat.startedAt,
        durationMs: Date.now() - chat.startedAt,
      })),
    }
  }),
})
