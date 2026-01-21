/**
 * MCP Elicitation Controller
 *
 * Type-safe tRPC controller for MCP Elicitation protocol.
 * Handles form input, OAuth flows, and confirmations from MCP servers.
 *
 * Endpoints:
 * - elicitation:pending - Get pending elicitation requests
 * - elicitation:submitForm - Submit form data for a form request
 * - elicitation:submitConfirmation - Submit confirmation response
 * - elicitation:cancel - Cancel a pending request
 * - elicitation:config - Get/update elicitation configuration
 *
 * @module elicitation.controller
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import {
  mcpElicitationService,
  type ElicitationConfig,
  type ElicitationType,
  type JSONSchema,
} from '../../services/mcp/elicitation'

// ============================================================================
// Schemas
// ============================================================================

const RequestIdSchema = z.object({
  id: z.string().uuid(),
})

const SubmitFormSchema = z.object({
  id: z.string().uuid(),
  data: z.record(z.unknown()),
})

const SubmitConfirmationSchema = z.object({
  id: z.string().uuid(),
  confirmed: z.boolean(),
})

const UpdateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  allowedServers: z.union([z.literal('*'), z.array(z.string())]).optional(),
  oauthCallbackPort: z.number().min(1024).max(65535).optional(),
  requestTimeoutMs: z.number().min(10000).max(3600000).optional(),
  autoApproveServers: z.array(z.string()).optional(),
})

// Form elicitation request schema (for direct API use)
const FormRequestSchema = z.object({
  serverId: z.string().min(1).max(100),
  schema: z.object({
    type: z.enum(['object', 'string', 'number', 'boolean', 'array']),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  }),
  title: z.string().optional(),
  description: z.string().optional(),
  submitLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
})

// OAuth request schema
const OAuthRequestSchema = z.object({
  serverId: z.string().min(1).max(100),
  authorizationUrl: z.string().url(),
  clientId: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  pkce: z.boolean().optional(),
  redirectUri: z.string().url().optional(),
})

// Confirmation request schema
const ConfirmationRequestSchema = z.object({
  serverId: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
  danger: z.boolean().optional(),
})

// ============================================================================
// Response types
// ============================================================================

interface PendingRequest {
  id: string
  serverId: string
  type: ElicitationType
  timestamp: number
}

// ============================================================================
// Router
// ============================================================================

export const elicitationRouter = router({
  /**
   * Get pending elicitation requests
   */
  pending: publicProcedure.query((): PendingRequest[] => {
    return mcpElicitationService.getPendingRequests()
  }),

  /**
   * Submit form data for a form elicitation request
   */
  submitForm: auditedProcedure.input(SubmitFormSchema).mutation(({ input }) => {
    const success = mcpElicitationService.submitFormResponse(input.id, input.data)
    if (!success) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Elicitation request ${input.id} not found or already completed`,
      })
    }
    return { success: true }
  }),

  /**
   * Submit confirmation response
   */
  submitConfirmation: auditedProcedure
    .input(SubmitConfirmationSchema)
    .mutation(({ input }) => {
      const success = mcpElicitationService.submitConfirmation(input.id, input.confirmed)
      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Elicitation request ${input.id} not found or already completed`,
        })
      }
      return { success: true }
    }),

  /**
   * Cancel a pending elicitation request
   */
  cancel: auditedProcedure.input(RequestIdSchema).mutation(({ input }) => {
    const success = mcpElicitationService.cancelRequest(input.id)
    if (!success) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Elicitation request ${input.id} not found or already cancelled`,
      })
    }
    return { success: true }
  }),

  /**
   * Get elicitation configuration
   */
  getConfig: publicProcedure.query((): ElicitationConfig => {
    return mcpElicitationService.getConfig()
  }),

  /**
   * Update elicitation configuration
   */
  updateConfig: auditedProcedure
    .input(UpdateConfigSchema)
    .mutation(({ input }): ElicitationConfig => {
      mcpElicitationService.updateConfig(input as Partial<ElicitationConfig>)
      return mcpElicitationService.getConfig()
    }),

  /**
   * Request form input from user (for testing/manual use)
   */
  requestForm: auditedProcedure.input(FormRequestSchema).mutation(async ({ input }) => {
    const response = await mcpElicitationService.handleElicitationRequest(input.serverId, {
      type: 'form',
      schema: input.schema as JSONSchema,
      title: input.title,
      description: input.description,
      submitLabel: input.submitLabel,
      cancelLabel: input.cancelLabel,
    })
    return response
  }),

  /**
   * Initiate OAuth flow (for testing/manual use)
   */
  requestOAuth: auditedProcedure.input(OAuthRequestSchema).mutation(async ({ input }) => {
    const response = await mcpElicitationService.handleElicitationRequest(input.serverId, {
      type: 'oauth',
      authorizationUrl: input.authorizationUrl,
      clientId: input.clientId,
      scopes: input.scopes,
      pkce: input.pkce,
      redirectUri: input.redirectUri,
    })
    return response
  }),

  /**
   * Request user confirmation (for testing/manual use)
   */
  requestConfirmation: auditedProcedure
    .input(ConfirmationRequestSchema)
    .mutation(async ({ input }) => {
      const response = await mcpElicitationService.handleElicitationRequest(input.serverId, {
        type: 'confirmation',
        title: input.title,
        message: input.message,
        confirmLabel: input.confirmLabel,
        cancelLabel: input.cancelLabel,
        danger: input.danger,
      })
      return response
    }),
})

export type ElicitationRouter = typeof elicitationRouter
