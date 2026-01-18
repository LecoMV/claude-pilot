/**
 * Watchdog Controller
 *
 * Type-safe tRPC controller for service health monitoring and auto-recovery.
 * Monitors systemd services, podman containers, and HTTP health endpoints.
 *
 * Migrated from handlers.ts (8 handlers):
 * - watchdog:start
 * - watchdog:stop
 * - watchdog:isEnabled
 * - watchdog:getHealth
 * - watchdog:getServiceHealth
 * - watchdog:getRecoveryHistory
 * - watchdog:forceCheck
 * - watchdog:forceRestart
 *
 * @module watchdog.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { watchdogService, type ServiceHealth, type RecoveryEvent } from '../../services/watchdog'

// ============================================================================
// Schemas
// ============================================================================

const ServiceIdSchema = z.object({
  serviceId: z.string().min(1).max(50),
})

const RecoveryHistorySchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(50),
  })
  .optional()

// ============================================================================
// Router
// ============================================================================

export const watchdogRouter = router({
  /**
   * Start the watchdog service monitoring
   */
  start: auditedProcedure.mutation((): boolean => {
    try {
      watchdogService.start()
      return true
    } catch {
      return false
    }
  }),

  /**
   * Stop the watchdog service monitoring
   */
  stop: auditedProcedure.mutation((): boolean => {
    try {
      watchdogService.stop()
      return true
    } catch {
      return false
    }
  }),

  /**
   * Check if watchdog is enabled
   */
  isEnabled: publicProcedure.query((): boolean => {
    return watchdogService.isEnabled()
  }),

  /**
   * Get health status for all monitored services
   */
  getHealth: publicProcedure.query((): ServiceHealth[] => {
    return watchdogService.getHealth()
  }),

  /**
   * Get health status for a specific service
   */
  getServiceHealth: publicProcedure
    .input(ServiceIdSchema)
    .query(({ input }): ServiceHealth | null => {
      return watchdogService.getServiceHealth(input.serviceId)
    }),

  /**
   * Get recovery event history
   */
  getRecoveryHistory: publicProcedure
    .input(RecoveryHistorySchema)
    .query(({ input }): RecoveryEvent[] => {
      return watchdogService.getRecoveryHistory(input?.limit)
    }),

  /**
   * Force an immediate health check for a service
   */
  forceCheck: publicProcedure
    .input(ServiceIdSchema)
    .mutation(({ input }): Promise<ServiceHealth | null> => {
      return watchdogService.forceCheck(input.serviceId)
    }),

  /**
   * Force restart a service (manual recovery)
   */
  forceRestart: auditedProcedure.input(ServiceIdSchema).mutation(({ input }): Promise<boolean> => {
    return watchdogService.forceRestart(input.serviceId)
  }),
})
