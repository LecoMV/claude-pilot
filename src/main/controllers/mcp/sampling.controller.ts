/**
 * MCP Sampling Controller
 *
 * Type-safe tRPC controller for MCP Sampling protocol.
 * Handles LLM completion requests from MCP servers.
 *
 * Endpoints:
 * - sampling:request - Handle a sampling request from an MCP server
 * - sampling:approve - Approve a pending sampling request
 * - sampling:reject - Reject a pending sampling request
 * - sampling:pending - Get pending approval requests
 * - sampling:config - Get/update sampling configuration
 * - sampling:providers - Get inference provider statuses
 * - sampling:stats - Get inference router statistics
 *
 * @module sampling.controller
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { mcpSamplingService, inferenceRouter } from '../../services/inference'
import type {
  MCPSamplingRequest,
  
  ProviderStatus,
  RouterStats,
} from '../../services/inference/types'
import type {
  SamplingConfig,
  PendingApproval,
  SamplingResult,
  
} from '../../services/inference/sampling'

// ============================================================================
// Schemas
// ============================================================================

const MessageContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('image'),
    data: z.string(),
    mimeType: z.string(),
  }),
])

const SamplingRequestSchema = z.object({
  serverId: z.string().min(1).max(100),
  request: z.object({
    messages: z.array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: MessageContentSchema,
      })
    ),
    modelPreferences: z
      .object({
        hints: z.array(z.object({ name: z.string().optional() })).optional(),
        costPriority: z.number().min(0).max(1).optional(),
        speedPriority: z.number().min(0).max(1).optional(),
        intelligencePriority: z.number().min(0).max(1).optional(),
      })
      .optional(),
    systemPrompt: z.string().optional(),
    includeContext: z.enum(['none', 'thisServer', 'allServers']).optional(),
    maxTokens: z.number().min(1).max(32768),
    temperature: z.number().min(0).max(2).optional(),
    stopSequences: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
})

const ApprovalIdSchema = z.object({
  approvalId: z.string().min(1).max(100),
})

const UpdateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  approvalMode: z.enum(['auto', 'always', 'never']).optional(),
  maxTokensPerRequest: z.number().min(1).max(32768).optional(),
  maxRequestsPerMinute: z.number().min(1).max(1000).optional(),
  allowedServers: z.union([z.literal('*'), z.array(z.string())]).optional(),
  defaultSystemPrompt: z.string().optional(),
  costThreshold: z.number().min(0).optional(),
})

const InferRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.union([z.string(), z.array(MessageContentSchema)]),
    })
  ),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  provider: z.enum(['ollama', 'claude', 'auto']).optional(),
  maxTokens: z.number().min(1).max(32768).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  stopSequences: z.array(z.string()).optional(),
})

// ============================================================================
// Router
// ============================================================================

export const samplingRouter = router({
  /**
   * Handle a sampling request from an MCP server
   */
  request: auditedProcedure
    .input(SamplingRequestSchema)
    .mutation(({ input }): Promise<SamplingResult> => {
      return mcpSamplingService.handleSamplingRequest(
        input.serverId,
        input.request as MCPSamplingRequest
      )
    }),

  /**
   * Approve a pending sampling request
   */
  approve: auditedProcedure
    .input(ApprovalIdSchema)
    .mutation(({ input }): Promise<SamplingResult> => {
      return mcpSamplingService.approveRequest(input.approvalId)
    }),

  /**
   * Reject a pending sampling request
   */
  reject: auditedProcedure.input(ApprovalIdSchema).mutation(({ input }) => {
    const success = mcpSamplingService.rejectRequest(input.approvalId)
    if (!success) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Approval request ${input.approvalId} not found or already processed`,
      })
    }
    return { success: true }
  }),

  /**
   * Get pending approval requests
   */
  pending: publicProcedure.query((): PendingApproval[] => {
    return mcpSamplingService.getPendingApprovals()
  }),

  /**
   * Get sampling configuration
   */
  getConfig: publicProcedure.query((): SamplingConfig => {
    return mcpSamplingService.getConfig()
  }),

  /**
   * Update sampling configuration
   */
  updateConfig: auditedProcedure
    .input(UpdateConfigSchema)
    .mutation(({ input }): SamplingConfig => {
      mcpSamplingService.updateConfig(input as Partial<SamplingConfig>)
      return mcpSamplingService.getConfig()
    }),

  /**
   * Get inference provider statuses
   */
  providers: publicProcedure.query((): Promise<ProviderStatus[]> => {
    return inferenceRouter.getProviderStatuses()
  }),

  /**
   * Get inference router statistics
   */
  stats: publicProcedure.query((): RouterStats => {
    return inferenceRouter.getStats()
  }),

  /**
   * Reset inference statistics
   */
  resetStats: auditedProcedure.mutation((): void => {
    inferenceRouter.resetStats()
  }),

  /**
   * Direct inference request (for testing/manual use)
   */
  infer: auditedProcedure.input(InferRequestSchema).mutation(async ({ input }) => {
    const response = await inferenceRouter.infer({
      messages: input.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content as string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>,
      })),
      systemPrompt: input.systemPrompt,
      model: input.model,
      provider: input.provider,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      topP: input.topP,
      stopSequences: input.stopSequences,
    })
    return response
  }),
})

export type SamplingRouter = typeof samplingRouter
