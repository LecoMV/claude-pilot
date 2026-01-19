/**
 * Chat Controller
 *
 * Type-safe tRPC controller for Claude Code chat operations.
 * Handles sending messages to Claude Code CLI and streaming responses.
 *
 * Supports two modes:
 * 1. Single-shot: Uses --print for quick responses without tool use
 * 2. Interactive: Uses bidirectional stream-json for full interactivity
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
  sessionId: string
  startedAt: number
  isInteractive: boolean
}

interface ChatSession {
  projectPath: string
  sessionId: string
  process: ChildProcessWithoutNullStreams | null
  messageCount: number
  startedAt: number
}

// Track active chat processes
const activeChats = new Map<string, ChatProcess>()
// Track chat sessions for continuity
const chatSessions = new Map<string, ChatSession>()

// ============================================================================
// Helpers
// ============================================================================

/**
 * Send streaming response to all renderer windows
 */
function sendToRenderer(data: {
  type: 'chunk' | 'done' | 'error' | 'tool_use'
  messageId: string
  content?: string
  error?: string
  toolName?: string
  toolInput?: string
}) {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('chat:response', data)
  })
}

/**
 * Resolve Claude binary path
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

/**
 * Parse stream-json events from Claude Code
 */
function parseStreamJsonEvent(
  line: string,
  _messageId: string
): { text?: string; toolUse?: { name: string; input: string }; done?: boolean } | null {
  if (!line.trim()) return null

  try {
    const event = JSON.parse(line)

    // Handle different event types from Claude Code stream-json format
    switch (event.type) {
      case 'assistant':
        // Full message with content blocks
        if (event.message?.content) {
          let text = ''
          for (const block of event.message.content) {
            if (block.type === 'text') {
              text += block.text
            } else if (block.type === 'tool_use') {
              return {
                toolUse: {
                  name: block.name,
                  input: JSON.stringify(block.input, null, 2),
                },
              }
            }
          }
          if (text) return { text }
        }
        break

      case 'content_block_delta':
        // Incremental text delta
        if (event.delta?.text) {
          return { text: event.delta.text }
        }
        break

      case 'content_block_start':
        // Start of a new content block (could be text or tool_use)
        if (event.content_block?.type === 'tool_use') {
          return {
            toolUse: {
              name: event.content_block.name,
              input: '',
            },
          }
        }
        break

      case 'result':
        // Final result
        if (event.result) {
          return { text: event.result, done: true }
        }
        break

      case 'error':
        console.error('[Chat] Stream error:', event.error)
        break

      default:
        // Unknown event type - ignore
        break
    }
  } catch {
    // Not valid JSON - treat as raw text
    if (line.trim()) {
      return { text: line + '\n' }
    }
  }

  return null
}

// ============================================================================
// Router
// ============================================================================

export const chatRouter = router({
  /**
   * Send a message to Claude Code and stream the response.
   * Uses --continue flag for subsequent messages to maintain session.
   */
  send: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        message: z.string(),
        messageId: z.string(),
        sessionKey: z.string().optional(), // For session continuity
        continueSession: z.boolean().optional(), // Use --continue flag
      })
    )
    .mutation(async ({ input }) => {
      const { projectPath, message, messageId, sessionKey, continueSession } = input

      // Resolve Claude binary
      const claudeBinary = await resolveClaudeBinary()

      // Build arguments
      const args = ['--print', '--output-format', 'stream-json']

      // Add --continue for session continuity (uses most recent session in project)
      if (continueSession) {
        args.push('--continue')
      }

      // Add the message
      args.push(message)

      // Spawn Claude process
      const claude = spawn(claudeBinary, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          // Don't set CI=1 as it may limit functionality
        },
      })

      // Track this process
      const session = chatSessions.get(sessionKey || projectPath)
      activeChats.set(messageId, {
        process: claude,
        messageId,
        sessionId: sessionKey || projectPath,
        startedAt: Date.now(),
        isInteractive: false,
      })

      // Update or create session tracking
      if (session) {
        session.messageCount++
      } else {
        chatSessions.set(sessionKey || projectPath, {
          projectPath,
          sessionId: sessionKey || projectPath,
          process: null,
          messageCount: 1,
          startedAt: Date.now(),
        })
      }

      let response = ''
      let buffer = ''

      claude.stdout.on('data', (data: Buffer) => {
        buffer += data.toString()

        // Parse JSON lines from stream-json format
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          const parsed = parseStreamJsonEvent(line, messageId)
          if (parsed) {
            if (parsed.text) {
              response += parsed.text
              sendToRenderer({
                type: 'chunk',
                messageId,
                content: response,
              })
            }
            if (parsed.toolUse) {
              sendToRenderer({
                type: 'tool_use',
                messageId,
                toolName: parsed.toolUse.name,
                toolInput: parsed.toolUse.input,
              })
            }
          }
        }
      })

      claude.stderr.on('data', (data: Buffer) => {
        const text = data.toString()
        console.error('[Chat] stderr:', text)
        // Only send visible errors (not progress/debug messages)
        if (text.includes('Error:') || text.includes('error:')) {
          response += `\n⚠️ ${text.trim()}`
          sendToRenderer({
            type: 'chunk',
            messageId,
            content: response,
          })
        }
      })

      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        claude.on('close', (code) => {
          activeChats.delete(messageId)

          // Process any remaining buffer content
          if (buffer.trim()) {
            const parsed = parseStreamJsonEvent(buffer, messageId)
            if (parsed?.text) {
              response += parsed.text
            }
          }

          if (code === 0) {
            sendToRenderer({
              type: 'done',
              messageId,
              content: response,
            })
            resolve({ success: true })
          } else {
            const error = `Process exited with code ${code}`
            sendToRenderer({
              type: 'error',
              messageId,
              error,
              content: response || error,
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
   * Start an interactive Claude session with bidirectional streaming.
   * This keeps a persistent process for multi-turn conversation.
   */
  startInteractive: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        sessionKey: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { projectPath, sessionKey } = input

      // Check if session already exists
      const existing = chatSessions.get(sessionKey)
      if (existing?.process) {
        return { success: true, sessionKey, alreadyRunning: true }
      }

      const claudeBinary = await resolveClaudeBinary()

      // Start interactive session with bidirectional JSON streaming
      const claude = spawn(
        claudeBinary,
        [
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--replay-user-messages', // Echo back user messages for sync
        ],
        {
          cwd: projectPath,
          env: process.env,
        }
      )

      // Create session
      chatSessions.set(sessionKey, {
        projectPath,
        sessionId: sessionKey,
        process: claude,
        messageCount: 0,
        startedAt: Date.now(),
      })

      // Set up output handler for interactive mode
      let buffer = ''
      claude.stdout.on('data', (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const parsed = parseStreamJsonEvent(line, sessionKey)
          if (parsed) {
            sendToRenderer({
              type: parsed.text ? 'chunk' : 'tool_use',
              messageId: sessionKey,
              content: parsed.text,
              toolName: parsed.toolUse?.name,
              toolInput: parsed.toolUse?.input,
            })
          }
        }
      })

      claude.stderr.on('data', (data: Buffer) => {
        console.error('[Chat Interactive] stderr:', data.toString())
      })

      claude.on('close', (code) => {
        console.info(`[Chat] Interactive session ${sessionKey} closed with code ${code}`)
        const session = chatSessions.get(sessionKey)
        if (session) {
          session.process = null
        }
        sendToRenderer({
          type: code === 0 ? 'done' : 'error',
          messageId: sessionKey,
          error: code !== 0 ? `Session ended with code ${code}` : undefined,
        })
      })

      return { success: true, sessionKey }
    }),

  /**
   * Send a message to an interactive session
   */
  sendToInteractive: publicProcedure
    .input(
      z.object({
        sessionKey: z.string(),
        message: z.string(),
        messageId: z.string(),
      })
    )
    .mutation(({ input }) => {
      const { sessionKey, message, messageId } = input
      const session = chatSessions.get(sessionKey)

      if (!session?.process) {
        return { success: false, error: 'Session not found or not running' }
      }

      // Send message in stream-json format
      const jsonMessage = JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: message }] },
      })

      try {
        session.process.stdin.write(jsonMessage + '\n')
        session.messageCount++
        return { success: true, messageId }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Write failed' }
      }
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
   * End an interactive session
   */
  endSession: publicProcedure.input(z.object({ sessionKey: z.string() })).mutation(({ input }) => {
    const session = chatSessions.get(input.sessionKey)
    if (session?.process) {
      session.process.stdin.end()
      session.process.kill('SIGTERM')
      session.process = null
      return { success: true }
    }
    chatSessions.delete(input.sessionKey)
    return { success: true }
  }),

  /**
   * Get status of active chats and sessions
   */
  status: publicProcedure.query(() => {
    return {
      activeChats: activeChats.size,
      activeSessions: Array.from(chatSessions.entries())
        .filter(([, s]) => s.process !== null)
        .map(([key, s]) => ({
          sessionKey: key,
          projectPath: s.projectPath,
          messageCount: s.messageCount,
          durationMs: Date.now() - s.startedAt,
          isRunning: s.process !== null,
        })),
      chats: Array.from(activeChats.entries()).map(([id, chat]) => ({
        messageId: id,
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        durationMs: Date.now() - chat.startedAt,
        isInteractive: chat.isInteractive,
      })),
    }
  }),
})
