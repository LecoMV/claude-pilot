/**
 * Transcript Controller - Streaming Transcript Parser
 *
 * Type-safe tRPC controller for parsing Claude Code transcript.jsonl files.
 * Uses Node.js streams for memory-efficient parsing of large transcripts.
 *
 * Migrated from handlers.ts (4 handlers):
 * - transcript:parse - parse transcript file with options
 * - transcript:stats - get transcript statistics
 * - transcript:last - get last N entries
 * - transcript:watch - watch transcript file
 *
 * @module transcript.controller
 */

import { z } from 'zod'
import { router, publicProcedure } from '../../trpc/trpc'
import {
  transcriptService,
  type ParseOptions,
  type TranscriptStats,
  type TranscriptMessage,
  type TranscriptMessageType,
} from '../../services/transcript'
import { createFilePathSchema, SecureFilePathSchema } from '../../utils/path-security'

// ============================================================================
// Schemas
// ============================================================================

// Use secure file path schema to prevent path traversal attacks
// @see SEC-2 Path Traversal Prevention
const FilePathSchema = SecureFilePathSchema

// Secure path for parsing options
const secureFilePath = createFilePathSchema()

const ParseOptionsSchema = z.object({
  filePath: secureFilePath,
  options: z
    .object({
      types: z
        .array(
          z.enum([
            'file-history-snapshot',
            'progress',
            'user',
            'assistant',
            'tool_use',
            'tool_result',
            'summary',
            'system',
          ])
        )
        .optional(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      after: z.coerce.date().optional(),
      before: z.coerce.date().optional(),
      search: z.string().optional(),
    })
    .optional(),
})

const LastMessagesSchema = z.object({
  filePath: secureFilePath,
  count: z.number().int().positive().default(10),
})

const WatchTranscriptSchema = z.object({
  filePath: secureFilePath,
  enable: z.boolean(),
})

// ============================================================================
// Router
// ============================================================================

export const transcriptRouter = router({
  /**
   * Parse a transcript file with optional filtering
   * Returns all matching messages from the file
   */
  parse: publicProcedure
    .input(ParseOptionsSchema)
    .query(async ({ input }): Promise<TranscriptMessage[]> => {
      try {
        const options: ParseOptions = {}

        if (input.options) {
          if (input.options.types) {
            options.types = input.options.types as TranscriptMessageType[]
          }
          if (input.options.limit !== undefined) {
            options.limit = input.options.limit
          }
          if (input.options.offset !== undefined) {
            options.offset = input.options.offset
          }
          if (input.options.after) {
            options.after = input.options.after
          }
          if (input.options.before) {
            options.before = input.options.before
          }
          if (input.options.search) {
            options.search = input.options.search
          }
        }

        return await transcriptService.parseAll(input.filePath, options)
      } catch (error) {
        console.error('Failed to parse transcript:', error)
        return []
      }
    }),

  /**
   * Get transcript statistics without loading all messages
   * Efficient counting of messages by type
   */
  stats: publicProcedure
    .input(FilePathSchema)
    .query(async ({ input }): Promise<TranscriptStats> => {
      try {
        return await transcriptService.getStats(input.filePath)
      } catch (error) {
        console.error('Failed to get transcript stats:', error)
        return {
          totalMessages: 0,
          userMessages: 0,
          assistantMessages: 0,
          toolCalls: 0,
          fileSize: 0,
          parseTime: 0,
        }
      }
    }),

  /**
   * Get the last N messages from a transcript
   * Uses efficient reverse reading for large files
   */
  last: publicProcedure
    .input(LastMessagesSchema)
    .query(async ({ input }): Promise<TranscriptMessage[]> => {
      try {
        return await transcriptService.getLastMessages(input.filePath, input.count)
      } catch (error) {
        console.error('Failed to get last messages:', error)
        return []
      }
    }),

  /**
   * Enable/disable watching a transcript file for changes
   * Emits 'message' events for new messages when enabled
   */
  watch: publicProcedure.input(WatchTranscriptSchema).mutation(({ input }): boolean => {
    if (input.enable) {
      transcriptService.watchTranscript(input.filePath)
      return true
    } else {
      transcriptService.unwatchTranscript(input.filePath)
      return true
    }
  }),
})

export type TranscriptRouter = typeof transcriptRouter
