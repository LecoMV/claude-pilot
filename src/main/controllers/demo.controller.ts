/**
 * Demo Controller - Proof of Concept
 *
 * This controller demonstrates the tRPC pattern for Claude Pilot.
 * It proves that TypeScript types flow from backend to frontend automatically.
 *
 * Once verified, this pattern will be applied to migrate handlers.ts
 * into domain-specific controllers.
 */

import { z } from 'zod'
import { router, auditedProcedure, publicProcedure } from '../trpc/trpc'
import { detectGPU, performSystemCheck } from '../services/ollama'

// ============================================================================
// SCHEMAS (Shared between backend and frontend via type inference)
// ============================================================================

const PingInputSchema = z.object({
  message: z.string().min(1).max(100),
})

const SystemInfoSchema = z.object({
  includeGpu: z.boolean().default(false),
  includeOllama: z.boolean().default(false),
})

// ============================================================================
// DEMO ROUTER
// ============================================================================

export const demoRouter = router({
  /**
   * Simple ping/pong to verify IPC works
   */
  ping: publicProcedure.input(PingInputSchema).query(({ input }) => {
    return {
      pong: `Received: ${input.message}`,
      timestamp: Date.now(),
      version: '0.1.0',
    }
  }),

  /**
   * Get system information (demonstrates async procedures)
   */
  systemInfo: auditedProcedure.input(SystemInfoSchema).query(async ({ input }) => {
    const info: Record<string, unknown> = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      timestamp: Date.now(),
    }

    if (input.includeGpu) {
      try {
        info.gpu = await detectGPU()
      } catch {
        info.gpu = { error: 'Failed to detect GPU' }
      }
    }

    if (input.includeOllama) {
      try {
        const check = await performSystemCheck()
        info.ollama = {
          installed: check.ollama.installed,
          running: check.ollama.running,
          recommendedModel: check.gpu.recommended.name,
          recommendedAction: check.recommendedAction,
        }
      } catch {
        info.ollama = { error: 'Failed to check Ollama' }
      }
    }

    return info
  }),

  /**
   * Mutation example - demonstrates write operations
   */
  logMessage: auditedProcedure
    .input(
      z.object({
        level: z.enum(['info', 'warn', 'error']),
        message: z.string(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(({ input }) => {
      const logFn =
        input.level === 'error'
          ? console.error
          : input.level === 'warn'
            ? console.warn
            : console.info

      logFn(`[Demo] ${input.message}`, input.metadata || '')

      return {
        logged: true,
        timestamp: Date.now(),
      }
    }),

  /**
   * Subscription example placeholder (for real-time updates)
   * Note: electron-trpc has limited subscription support
   */
  // healthCheck: publicProcedure.subscription(() => {
  //   return observable((emit) => {
  //     const interval = setInterval(() => {
  //       emit.next({ healthy: true, timestamp: Date.now() })
  //     }, 5000)
  //     return () => clearInterval(interval)
  //   })
  // }),
})

// Export type for frontend consumption
export type DemoRouter = typeof demoRouter
