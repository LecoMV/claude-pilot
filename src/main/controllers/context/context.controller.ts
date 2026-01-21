/**
 * Context Controller
 *
 * Type-safe tRPC controller for context management.
 * Includes token usage tracking, compaction settings, session summaries,
 * and predictive context functionality.
 *
 * Migrated from handlers.ts (10 handlers):
 * - context:tokenUsage
 * - context:compactionSettings
 * - context:sessions
 * - context:compact
 * - context:setAutoCompact
 * - context:patterns (predictive context)
 * - context:stats (predictive context)
 * - context:getConfig (predictive context)
 * - context:setConfig (predictive context)
 * - context:clearCache (predictive context)
 *
 * @module context.controller
 */

import { z } from 'zod'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { predictiveContextService } from '../../services/predictive-context'
import type {
  TokenUsage,
  CompactionSettings,
  SessionSummary,
  FileAccessPattern,
  FilePrediction,
  PredictiveContextStats,
  PredictiveContextConfig,
} from '@shared/types'

// ============================================================================
// Constants
// ============================================================================

const HOME = homedir()
const CLAUDE_DIR = join(HOME, '.claude')

// ============================================================================
// Schemas
// ============================================================================

const SetAutoCompactSchema = z.object({
  enabled: z.boolean(),
})

const ProjectPathSchema = z.object({
  projectPath: z.string().min(1, 'Project path cannot be empty'),
})

const PredictiveContextConfigSchema = z.object({
  enabled: z.boolean().optional(),
  maxPredictions: z.number().min(1).max(100).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  trackHistory: z.boolean().optional(),
  preloadEnabled: z.boolean().optional(),
  cacheSize: z.number().min(10).max(10000).optional(),
})

const PredictSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  projectPath: z.string().min(1, 'Project path cannot be empty'),
})

// ============================================================================
// Helper Functions
// ============================================================================

function getTokenUsage(): TokenUsage {
  // Estimate token usage from recent checkpoints
  const checkpointsDir = join(CLAUDE_DIR, 'checkpoints')
  let current = 0
  const max = 200000 // Default max context

  try {
    if (existsSync(checkpointsDir)) {
      const files = readdirSync(checkpointsDir).filter((f) => f.endsWith('.json'))
      if (files.length > 0) {
        // Get most recent checkpoint
        const sorted = files.sort().reverse()
        const latestPath = join(checkpointsDir, sorted[0])
        const checkpoint = JSON.parse(readFileSync(latestPath, 'utf-8'))
        current = checkpoint.tokenCount || checkpoint.tokens || 0
      }
    }
  } catch (error) {
    console.error('Failed to read checkpoints:', error)
  }

  // Also check compaction checkpoints
  const compactionDir = join(CLAUDE_DIR, 'compaction-checkpoints')
  let lastCompaction: number | undefined

  try {
    if (existsSync(compactionDir)) {
      const files = readdirSync(compactionDir).filter((f) => f.endsWith('.json'))
      if (files.length > 0) {
        const sorted = files.sort().reverse()
        const match = sorted[0].match(/checkpoint-(\d+)-(\d+)\.json/)
        if (match) {
          const dateStr = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`
          const timeStr = `${match[2].slice(0, 2)}:${match[2].slice(2, 4)}:${match[2].slice(4, 6)}`
          lastCompaction = new Date(`${dateStr}T${timeStr}`).getTime()
        }
      }
    }
  } catch (error) {
    console.error('Failed to read compaction checkpoints:', error)
  }

  return {
    current,
    max,
    percentage: (current / max) * 100,
    lastCompaction,
  }
}

function getCompactionSettings(): CompactionSettings {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return {
        autoCompact: settings.autoCompact ?? true,
        threshold: settings.compactThreshold || 80,
      }
    }
  } catch (error) {
    console.error('Failed to read compaction settings:', error)
  }
  return { autoCompact: true, threshold: 80 }
}

function setAutoCompact(enabled: boolean): boolean {
  const settingsPath = join(CLAUDE_DIR, 'settings.json')
  try {
    let settings: Record<string, unknown> = {}
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    }
    settings.autoCompact = enabled
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save auto-compact setting:', error)
    return false
  }
}

function triggerCompaction(): boolean {
  try {
    // Trigger Claude's context compaction via the claude CLI
    // The /compact command is used to manually compact the conversation context
    // We use --print to run non-interactively and capture output
    // shell: false prevents command injection vulnerabilities
    const result = spawn('claude', ['--print', '-p', '/compact'], {
      shell: false,
      stdio: 'pipe',
    })

    result.stdout?.on('data', (data: Buffer) => {
      console.info('Compaction output:', data.toString())
    })

    result.stderr?.on('data', (data: Buffer) => {
      console.error('Compaction stderr:', data.toString())
    })

    result.on('error', (error) => {
      console.error('Compaction process error:', error)
    })

    result.on('close', (code) => {
      if (code === 0) {
        console.info('Compaction completed successfully')
      } else {
        console.error(`Compaction exited with code ${code}`)
      }
    })

    return true
  } catch (error) {
    console.error('Failed to trigger compaction:', error)
    return false
  }
}

function getRecentSessions(): SessionSummary[] {
  const sessions: SessionSummary[] = []
  const projectsDir = join(CLAUDE_DIR, 'projects')

  if (!existsSync(projectsDir)) {
    return sessions
  }

  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const projectPath = join(projectsDir, entry.name)
      const transcriptPath = join(projectPath, 'transcript.jsonl')

      if (!existsSync(transcriptPath)) continue

      try {
        const content = readFileSync(transcriptPath, 'utf-8')
        const lines = content.trim().split('\n').filter(Boolean)

        if (lines.length === 0) continue

        let messageCount = 0
        let tokenCount = 0
        let toolCalls = 0
        let startTime = Date.now()
        let endTime: number | undefined
        let model: string | undefined

        for (const line of lines) {
          try {
            const msg = JSON.parse(line)

            if (msg.timestamp) {
              const ts = new Date(msg.timestamp).getTime()
              if (ts < startTime) startTime = ts
              if (!endTime || ts > endTime) endTime = ts
            }

            if (msg.type === 'user' || msg.type === 'assistant') {
              messageCount++
            }

            if (msg.type === 'tool_use' || msg.type === 'tool_result') {
              toolCalls++
            }

            if (msg.message?.usage) {
              tokenCount +=
                (msg.message.usage.input_tokens || 0) + (msg.message.usage.output_tokens || 0)
            }

            if (msg.model && !model) {
              model = msg.model
            }
          } catch {
            // Skip invalid JSON lines
          }
        }

        // Decode project path from directory name
        const decodedPath = decodeURIComponent(entry.name.replace(/-/g, '/'))

        sessions.push({
          id: entry.name,
          projectPath: decodedPath,
          projectName: basename(decodedPath),
          startTime,
          endTime,
          messageCount,
          tokenCount,
          toolCalls,
          model,
        })
      } catch (error) {
        console.error(`Failed to parse transcript for ${entry.name}:`, error)
      }
    }
  } catch (error) {
    console.error('Failed to read projects directory:', error)
  }

  // Sort by most recent first
  return sessions.sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime))
}

// ============================================================================
// Router
// ============================================================================

export const contextRouter = router({
  /**
   * Get current token usage and context stats
   */
  tokenUsage: publicProcedure.query((): TokenUsage => {
    return getTokenUsage()
  }),

  /**
   * Get compaction settings
   */
  compactionSettings: publicProcedure.query((): CompactionSettings => {
    return getCompactionSettings()
  }),

  /**
   * Get recent session summaries
   */
  sessions: publicProcedure.query((): SessionSummary[] => {
    return getRecentSessions()
  }),

  /**
   * Trigger context compaction
   */
  compact: auditedProcedure.mutation((): boolean => {
    return triggerCompaction()
  }),

  /**
   * Set auto-compact enabled/disabled
   */
  setAutoCompact: auditedProcedure.input(SetAutoCompactSchema).mutation(({ input }): boolean => {
    return setAutoCompact(input.enabled)
  }),

  /**
   * Get file access patterns for a project (predictive context)
   */
  patterns: publicProcedure.input(ProjectPathSchema).query(({ input }): FileAccessPattern[] => {
    return predictiveContextService.getPatterns(input.projectPath)
  }),

  /**
   * Get predictive context statistics
   */
  stats: publicProcedure.query((): PredictiveContextStats => {
    return predictiveContextService.getStats()
  }),

  /**
   * Get predictive context configuration
   */
  getConfig: publicProcedure.query((): PredictiveContextConfig => {
    return predictiveContextService.getConfig()
  }),

  /**
   * Update predictive context configuration
   */
  setConfig: auditedProcedure
    .input(PredictiveContextConfigSchema)
    .mutation(({ input }): boolean => {
      return predictiveContextService.setConfig(input as PredictiveContextConfig)
    }),

  /**
   * Clear the predictive context cache
   */
  clearCache: auditedProcedure.mutation((): boolean => {
    return predictiveContextService.clearCache()
  }),

  /**
   * Predict files that might be needed based on a prompt
   */
  predict: publicProcedure.input(PredictSchema).query(({ input }): Promise<FilePrediction[]> => {
    return predictiveContextService.predict(input.prompt, input.projectPath)
  }),
})
