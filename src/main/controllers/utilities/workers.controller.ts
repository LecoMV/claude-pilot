/**
 * Workers Controller
 *
 * Type-safe tRPC controller for worker pool management.
 * Handles worker pool statistics, readiness, and configuration.
 *
 * Migrated from handlers.ts (3 handlers):
 * - workers:stats
 * - workers:isReady
 * - workers:getConfig
 *
 * @module workers.controller
 */

import { router, publicProcedure } from '../../trpc/trpc'
import { workerPool, type PoolStats, type PoolConfig } from '../../services/workers'

// ============================================================================
// Router
// ============================================================================

export const workersRouter = router({
  /**
   * Get worker pool statistics
   */
  stats: publicProcedure.query((): PoolStats => {
    return workerPool.getStats()
  }),

  /**
   * Check if worker pools are ready
   */
  isReady: publicProcedure.query((): boolean => {
    return workerPool.isInitialized()
  }),

  /**
   * Get worker pool configuration
   */
  getConfig: publicProcedure.query((): PoolConfig => {
    return workerPool.getConfig()
  }),
})
