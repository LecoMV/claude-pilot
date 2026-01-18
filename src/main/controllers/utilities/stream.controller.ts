/**
 * Stream Controller
 *
 * Type-safe tRPC controller for MessagePort streaming management.
 * Handles stream statistics, listing, and lifecycle.
 *
 * Migrated from handlers.ts (4 handlers):
 * - stream:stats
 * - stream:list
 * - stream:getStatus
 * - stream:close
 *
 * @module stream.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { messagePortStreamer } from '../../services/streaming'

// ============================================================================
// Schemas
// ============================================================================

const StreamIdSchema = z.object({
  streamId: z.string().min(1),
})

// ============================================================================
// Types (matching service implementation)
// ============================================================================

interface StreamStats {
  activeStreams: number
  totalBytesTransferred: number
  streamsByType: Record<string, number>
  maxConcurrent: number
  chunkSize: number
}

interface StreamListItem {
  id: string
  type: 'file' | 'data' | 'worker'
  createdAt: number
  bytesTransferred: number
  status: 'pending' | 'active' | 'complete' | 'error'
  metadata?: Record<string, unknown>
}

interface StreamStatus {
  id: string
  type: 'file' | 'data' | 'worker'
  status: 'pending' | 'active' | 'complete' | 'error'
  bytesTransferred: number
  createdAt: number
  metadata?: Record<string, unknown>
}

// ============================================================================
// Router
// ============================================================================

export const streamRouter = router({
  /**
   * Get streaming statistics
   */
  stats: publicProcedure.query((): StreamStats => {
    return messagePortStreamer.getStats()
  }),

  /**
   * List all active streams
   */
  list: publicProcedure.query((): StreamListItem[] => {
    return messagePortStreamer.listStreams()
  }),

  /**
   * Get status of a specific stream
   */
  getStatus: publicProcedure.input(StreamIdSchema).query(({ input }): StreamStatus | null => {
    return messagePortStreamer.getStreamStatus(input.streamId)
  }),

  /**
   * Close a specific stream
   */
  close: auditedProcedure.input(StreamIdSchema).mutation(({ input }): boolean => {
    return messagePortStreamer.closeStream(input.streamId)
  }),
})
