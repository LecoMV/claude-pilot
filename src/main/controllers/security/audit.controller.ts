/**
 * Audit Controller
 *
 * Type-safe tRPC controller for OCSF-compliant audit logging.
 * Supports querying, exporting, and SIEM integration.
 *
 * Migrated from handlers.ts (11 handlers):
 * - audit:query
 * - audit:stats
 * - audit:export
 * - audit:siem:register
 * - audit:siem:unregister
 * - audit:siem:setEnabled
 * - audit:siem:getEndpoints
 * - audit:siem:getStats
 * - audit:siem:flush
 *
 * @module audit.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import {
  auditService,
  type AuditEvent,
  type SIEMEndpoint,
  type ShipperStats,
  EventCategory,
  ActivityType,
} from '../../services/audit'

// ============================================================================
// Schemas
// ============================================================================

const QueryParamsSchema = z
  .object({
    startTime: z.number().int().positive().optional(),
    endTime: z.number().int().positive().optional(),
    category: z.nativeEnum(EventCategory).optional(),
    activity: z.nativeEnum(ActivityType).optional(),
    targetType: z.string().max(50).optional(),
    limit: z.number().int().min(1).max(10000).default(100),
    offset: z.number().int().min(0).default(0),
  })
  .optional()

const ExportParamsSchema = z.object({
  format: z.enum(['json', 'csv']),
  startTime: z.number().int().positive().optional(),
  endTime: z.number().int().positive().optional(),
})

const SIEMEndpointSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  type: z.enum(['webhook', 'syslog', 'http']),
  url: z.string().url().optional(),
  host: z.string().max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(['tcp', 'udp']).optional(),
  apiKey: z.string().max(500).optional(),
  enabled: z.boolean(),
  batchSize: z.number().int().min(1).max(1000).default(100),
  flushInterval: z.number().int().min(1000).max(3600000).default(5000),
  retryAttempts: z.number().int().min(0).max(10).default(3),
  retryDelay: z.number().int().min(100).max(60000).default(1000),
})

const EndpointIdSchema = z.object({
  endpointId: z.string().min(1).max(50),
})

const SetEnabledSchema = z.object({
  endpointId: z.string().min(1).max(50),
  enabled: z.boolean(),
})

const FlushSchema = z
  .object({
    endpointId: z.string().min(1).max(50).optional(),
  })
  .optional()

// ============================================================================
// Router
// ============================================================================

export const auditRouter = router({
  /**
   * Query audit events with filters
   */
  query: publicProcedure.input(QueryParamsSchema).query(({ input }): AuditEvent[] => {
    return auditService.query(input)
  }),

  /**
   * Get audit statistics
   */
  stats: publicProcedure.query(
    (): {
      totalEvents: number
      eventsByCategory: Record<string, number>
      eventsByActivity: Record<string, number>
      last24hCount: number
      dbSizeMB: number
    } => {
      return auditService.getStats()
    }
  ),

  /**
   * Export audit events to JSON or CSV
   */
  export: publicProcedure.input(ExportParamsSchema).query(({ input }): string => {
    const params = {
      startTime: input.startTime,
      endTime: input.endTime,
    }

    if (input.format === 'csv') {
      return auditService.exportCSV(params)
    }
    return auditService.exportJSON(params)
  }),

  // ============================================================================
  // SIEM Integration
  // ============================================================================

  siem: router({
    /**
     * Register a SIEM endpoint for log shipping
     */
    register: auditedProcedure.input(SIEMEndpointSchema).mutation(({ input }): void => {
      auditService.registerEndpoint(input as SIEMEndpoint)
    }),

    /**
     * Unregister a SIEM endpoint
     */
    unregister: auditedProcedure.input(EndpointIdSchema).mutation(({ input }): void => {
      auditService.unregisterEndpoint(input.endpointId)
    }),

    /**
     * Enable or disable a SIEM endpoint
     */
    setEnabled: auditedProcedure.input(SetEnabledSchema).mutation(({ input }): void => {
      auditService.setEndpointEnabled(input.endpointId, input.enabled)
    }),

    /**
     * Get all registered SIEM endpoints
     */
    getEndpoints: publicProcedure.query((): SIEMEndpoint[] => {
      return auditService.getEndpoints()
    }),

    /**
     * Get shipper stats for an endpoint
     */
    getStats: publicProcedure
      .input(
        z
          .object({
            endpointId: z.string().min(1).max(50).optional(),
          })
          .optional()
      )
      .query(({ input }): Record<string, ShipperStats> | ShipperStats => {
        const stats = auditService.getShipperStats(input?.endpointId)
        if (stats instanceof Map) {
          return Object.fromEntries(stats)
        }
        return stats
      }),

    /**
     * Flush queued events to SIEM endpoint(s)
     */
    flush: auditedProcedure.input(FlushSchema).mutation(async ({ input }): Promise<boolean> => {
      if (input?.endpointId) {
        return auditService.flushToEndpoint(input.endpointId)
      }
      await auditService.flushAll()
      return true
    }),
  }),
})
