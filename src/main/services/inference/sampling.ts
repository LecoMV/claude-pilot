/**
 * MCP Sampling Service
 *
 * Handles MCP Sampling protocol requests from MCP servers.
 * Routes requests through the inference router to the appropriate
 * LLM provider (Ollama local or Claude cloud).
 *
 * MCP Sampling allows servers to delegate AI completion requests
 * back to the client, enabling:
 * - Context-aware completions using client conversation history
 * - Cost optimization through local inference routing
 * - Human-in-the-loop approval for sensitive operations
 *
 * @module inference/sampling
 */

import { EventEmitter } from 'events'
import { inferenceRouter } from './router'
import type {
  MCPSamplingRequest,
  MCPSamplingResponse,
  InferenceProvider,
  Message,
} from './types'

/**
 * Sampling approval modes
 */
export type ApprovalMode = 'auto' | 'always' | 'never'

/**
 * Sampling service configuration
 */
export interface SamplingConfig {
  enabled: boolean
  approvalMode: ApprovalMode
  maxTokensPerRequest: number
  maxRequestsPerMinute: number
  allowedServers: string[] | '*' // Server IDs that can make sampling requests
  defaultSystemPrompt?: string
  costThreshold?: number // Auto-approve if estimated cost below this
}

/**
 * Pending approval request
 */
export interface PendingApproval {
  id: string
  serverId: string
  request: MCPSamplingRequest
  timestamp: number
  estimatedCost?: number
  estimatedTokens: number
}

/**
 * Sampling request result
 */
export interface SamplingResult {
  response?: MCPSamplingResponse
  error?: string
  approved: boolean
  provider: InferenceProvider
  latencyMs: number
}

// Default configuration
const DEFAULT_CONFIG: SamplingConfig = {
  enabled: true,
  approvalMode: 'auto',
  maxTokensPerRequest: 8192,
  maxRequestsPerMinute: 60,
  allowedServers: '*',
  defaultSystemPrompt: 'You are a helpful assistant.',
  costThreshold: 0.01, // $0.01 auto-approve threshold
}

class MCPSamplingService extends EventEmitter {
  private config: SamplingConfig = DEFAULT_CONFIG
  private pendingApprovals: Map<string, PendingApproval> = new Map()
  private requestCounts: Map<string, number[]> = new Map() // serverId -> timestamps
  private initialized = false

  /**
   * Initialize the sampling service
   */
  async initialize(config?: Partial<SamplingConfig>): Promise<void> {
    if (this.initialized) return

    this.config = { ...DEFAULT_CONFIG, ...config }

    // Ensure inference router is initialized
    await inferenceRouter.initialize()

    this.initialized = true
    console.info('[MCP-Sampling] Initialized', {
      enabled: this.config.enabled,
      approvalMode: this.config.approvalMode,
      maxTokens: this.config.maxTokensPerRequest,
    })
  }

  /**
   * Check if a server is allowed to make sampling requests
   */
  private isServerAllowed(serverId: string): boolean {
    if (this.config.allowedServers === '*') return true
    return this.config.allowedServers.includes(serverId)
  }

  /**
   * Check rate limit for a server
   */
  private checkRateLimit(serverId: string): boolean {
    const now = Date.now()
    const windowMs = 60000 // 1 minute
    const timestamps = this.requestCounts.get(serverId) || []

    // Remove old timestamps
    const recent = timestamps.filter((t) => now - t < windowMs)
    this.requestCounts.set(serverId, recent)

    return recent.length < this.config.maxRequestsPerMinute
  }

  /**
   * Record a request for rate limiting
   */
  private recordRequest(serverId: string): void {
    const timestamps = this.requestCounts.get(serverId) || []
    timestamps.push(Date.now())
    this.requestCounts.set(serverId, timestamps)
  }

  /**
   * Estimate tokens for a sampling request
   */
  private estimateTokens(request: MCPSamplingRequest): number {
    let text = request.systemPrompt || ''
    for (const msg of request.messages) {
      if (msg.content.type === 'text') {
        text += msg.content.text
      }
    }
    return Math.ceil(text.length / 4) + (request.maxTokens || 2048)
  }

  /**
   * Estimate cost for a sampling request (in USD)
   */
  private estimateCost(tokens: number, provider: InferenceProvider): number {
    if (provider === 'ollama') return 0 // Local is free

    // Claude pricing (rough estimate)
    const inputCostPer1k = 0.003 // $0.003 per 1K input tokens (Sonnet)
    const outputCostPer1k = 0.015 // $0.015 per 1K output tokens
    const estimatedOutput = Math.min(tokens * 0.5, 2048)

    return (tokens * inputCostPer1k + estimatedOutput * outputCostPer1k) / 1000
  }

  /**
   * Convert MCP sampling request to inference request format
   */
  private convertToInferenceRequest(request: MCPSamplingRequest): {
    messages: Message[]
    systemPrompt?: string
    maxTokens?: number
    temperature?: number
    stopSequences?: string[]
  } {
    const messages: Message[] = request.messages.map((m) => ({
      role: m.role,
      content:
        m.content.type === 'text'
          ? m.content.text
          : [
              m.content.type === 'image'
                ? { type: 'image' as const, data: m.content.data, mimeType: m.content.mimeType }
                : { type: 'text' as const, text: '' },
            ],
    }))

    return {
      messages,
      systemPrompt: request.systemPrompt || this.config.defaultSystemPrompt,
      maxTokens: Math.min(request.maxTokens, this.config.maxTokensPerRequest),
      temperature: request.temperature,
      stopSequences: request.stopSequences,
    }
  }

  /**
   * Convert inference response to MCP sampling response format
   */
  private convertToSamplingResponse(
    content: string,
    model: string,
    stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence'
  ): MCPSamplingResponse {
    return {
      role: 'assistant',
      content: { type: 'text', text: content },
      model,
      stopReason:
        stopReason === 'end_turn'
          ? 'endTurn'
          : stopReason === 'max_tokens'
            ? 'maxTokens'
            : stopReason === 'stop_sequence'
              ? 'stopSequence'
              : undefined,
    }
  }

  /**
   * Select provider based on MCP model preferences
   */
  private selectProviderFromPreferences(request: MCPSamplingRequest): InferenceProvider {
    const prefs = request.modelPreferences

    if (!prefs) return 'auto'

    // Check for specific model hints
    if (prefs.hints?.length) {
      for (const hint of prefs.hints) {
        if (hint.name?.includes('claude')) return 'claude'
        if (hint.name?.includes('llama') || hint.name?.includes('ollama')) {
          return 'ollama'
        }
      }
    }

    // Use priority weights
    const costPriority = prefs.costPriority || 0.5
    const speedPriority = prefs.speedPriority || 0.5
    const intelligencePriority = prefs.intelligencePriority || 0.5

    // High cost priority or high speed priority favors local
    if (costPriority > 0.7 || speedPriority > 0.7) {
      return 'ollama'
    }

    // High intelligence priority favors Claude
    if (intelligencePriority > 0.7) {
      return 'claude'
    }

    return 'auto'
  }

  /**
   * Handle a sampling request from an MCP server
   */
  async handleSamplingRequest(
    serverId: string,
    request: MCPSamplingRequest
  ): Promise<SamplingResult> {
    const startTime = Date.now()

    // Check if enabled
    if (!this.config.enabled) {
      return {
        error: 'MCP Sampling is disabled',
        approved: false,
        provider: 'auto',
        latencyMs: Date.now() - startTime,
      }
    }

    // Check server authorization
    if (!this.isServerAllowed(serverId)) {
      this.emit('sampling:unauthorized', { serverId, request })
      return {
        error: `Server '${serverId}' is not authorized for sampling requests`,
        approved: false,
        provider: 'auto',
        latencyMs: Date.now() - startTime,
      }
    }

    // Check rate limit
    if (!this.checkRateLimit(serverId)) {
      this.emit('sampling:ratelimited', { serverId })
      return {
        error: 'Rate limit exceeded',
        approved: false,
        provider: 'auto',
        latencyMs: Date.now() - startTime,
      }
    }

    // Estimate tokens and cost
    const estimatedTokens = this.estimateTokens(request)
    const preferredProvider = this.selectProviderFromPreferences(request)
    const estimatedCost = this.estimateCost(estimatedTokens, preferredProvider)

    // Check approval
    let approved = false
    if (this.config.approvalMode === 'always') {
      // Require manual approval
      const approvalId = `${serverId}-${Date.now()}`
      this.pendingApprovals.set(approvalId, {
        id: approvalId,
        serverId,
        request,
        timestamp: Date.now(),
        estimatedCost,
        estimatedTokens,
      })
      this.emit('sampling:approval_required', {
        id: approvalId,
        serverId,
        estimatedTokens,
        estimatedCost,
      })
      return {
        error: 'Approval required',
        approved: false,
        provider: preferredProvider,
        latencyMs: Date.now() - startTime,
      }
    } else if (this.config.approvalMode === 'auto') {
      // Auto-approve if under cost threshold
      approved =
        this.config.costThreshold !== undefined &&
        estimatedCost <= this.config.costThreshold
      if (!approved) {
        const approvalId = `${serverId}-${Date.now()}`
        this.pendingApprovals.set(approvalId, {
          id: approvalId,
          serverId,
          request,
          timestamp: Date.now(),
          estimatedCost,
          estimatedTokens,
        })
        this.emit('sampling:approval_required', {
          id: approvalId,
          serverId,
          estimatedTokens,
          estimatedCost,
        })
        return {
          error: 'Approval required (cost threshold exceeded)',
          approved: false,
          provider: preferredProvider,
          latencyMs: Date.now() - startTime,
        }
      }
    } else {
      // Never require approval
      approved = true
    }

    // Record the request for rate limiting
    this.recordRequest(serverId)

    // Execute the inference
    try {
      const inferRequest = this.convertToInferenceRequest(request)
      const inferResponse = await inferenceRouter.infer({
        ...inferRequest,
        provider: preferredProvider,
      })

      const response = this.convertToSamplingResponse(
        inferResponse.content,
        inferResponse.model,
        inferResponse.stopReason
      )

      this.emit('sampling:complete', {
        serverId,
        provider: inferResponse.provider,
        tokens: inferResponse.usage?.totalTokens,
        latencyMs: inferResponse.latencyMs,
      })

      return {
        response,
        approved: true,
        provider: inferResponse.provider,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      this.emit('sampling:error', { serverId, error })
      return {
        error: (error as Error).message,
        approved: true, // Was approved, but failed
        provider: preferredProvider,
        latencyMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Approve a pending sampling request
   */
  async approveRequest(approvalId: string): Promise<SamplingResult> {
    const pending = this.pendingApprovals.get(approvalId)
    if (!pending) {
      return {
        error: 'Approval not found or expired',
        approved: false,
        provider: 'auto',
        latencyMs: 0,
      }
    }

    this.pendingApprovals.delete(approvalId)
    this.emit('sampling:approved', { id: approvalId })

    // Execute the request
    return this.executeSamplingRequest(pending.serverId, pending.request)
  }

  /**
   * Reject a pending sampling request
   */
  rejectRequest(approvalId: string): boolean {
    const pending = this.pendingApprovals.get(approvalId)
    if (!pending) return false

    this.pendingApprovals.delete(approvalId)
    this.emit('sampling:rejected', { id: approvalId })
    return true
  }

  /**
   * Execute a sampling request without approval checks (internal use)
   */
  private async executeSamplingRequest(
    serverId: string,
    request: MCPSamplingRequest
  ): Promise<SamplingResult> {
    const startTime = Date.now()
    const preferredProvider = this.selectProviderFromPreferences(request)

    try {
      const inferRequest = this.convertToInferenceRequest(request)
      const inferResponse = await inferenceRouter.infer({
        ...inferRequest,
        provider: preferredProvider,
      })

      const response = this.convertToSamplingResponse(
        inferResponse.content,
        inferResponse.model,
        inferResponse.stopReason
      )

      return {
        response,
        approved: true,
        provider: inferResponse.provider,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        error: (error as Error).message,
        approved: true,
        provider: preferredProvider,
        latencyMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Get pending approval requests
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values())
  }

  /**
   * Get configuration
   */
  getConfig(): SamplingConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SamplingConfig>): void {
    this.config = { ...this.config, ...config }
    this.emit('config:updated', this.config)
  }

  /**
   * Clean up expired pending approvals
   */
  cleanupExpiredApprovals(maxAgeMs: number = 300000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, pending] of this.pendingApprovals) {
      if (now - pending.timestamp > maxAgeMs) {
        this.pendingApprovals.delete(id)
        cleaned++
      }
    }

    return cleaned
  }
}

// Export singleton
export const mcpSamplingService = new MCPSamplingService()

// Export class for testing
export { MCPSamplingService }
