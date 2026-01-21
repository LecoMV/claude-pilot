/**
 * Inference Router Service
 *
 * Smart router that directs inference requests to the optimal provider
 * based on availability, cost, latency, and custom routing rules.
 *
 * Features:
 * - Automatic provider selection (Ollama local vs Claude cloud)
 * - Custom routing rules based on content/size
 * - Fallback handling when providers are unavailable
 * - Statistics tracking for cost optimization
 *
 * @module inference/router
 */

import { EventEmitter } from 'events'
import type {
  InferenceProvider,
  InferenceRequest,
  InferenceResponse,
  RouterConfig,
  RoutingRule,
  ProviderStatus,
  RouterStats,
  Message,
} from './types'

// Default configuration
const DEFAULT_CONFIG: RouterConfig = {
  defaultProvider: 'auto',
  ollamaEndpoint: 'http://localhost:11434',
  preferLocal: true,
  maxLocalTokens: 4096,
  localModels: ['llama3.2', 'qwen2.5-coder', 'gemma2'],
  fallbackToCloud: true,
  routingRules: [],
}

// Claude API endpoint
const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

class InferenceRouter extends EventEmitter {
  private config: RouterConfig = DEFAULT_CONFIG
  private stats: RouterStats = {
    totalRequests: 0,
    ollamaRequests: 0,
    claudeRequests: 0,
    ollamaErrors: 0,
    claudeErrors: 0,
    avgOllamaLatency: 0,
    avgClaudeLatency: 0,
    tokensSaved: 0,
  }
  private ollamaModels: string[] = []
  private lastOllamaCheck = 0
  private ollamaAvailable = false

  /**
   * Initialize the router with configuration
   */
  async initialize(config?: Partial<RouterConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Try to load Claude API key from pass
    if (!this.config.claudeApiKey) {
      try {
        const { execSync } = await import('child_process')
        const apiKey = execSync('pass show claude/anthropic/api-key', {
          encoding: 'utf-8',
          timeout: 5000,
        }).trim()
        if (apiKey) {
          this.config.claudeApiKey = apiKey
        }
      } catch {
        console.warn('[InferenceRouter] No Claude API key found in pass')
      }
    }

    // Check Ollama availability
    await this.checkOllamaStatus()

    console.info('[InferenceRouter] Initialized', {
      ollamaAvailable: this.ollamaAvailable,
      claudeConfigured: !!this.config.claudeApiKey,
      preferLocal: this.config.preferLocal,
    })
  }

  /**
   * Check if Ollama is available and get models
   */
  async checkOllamaStatus(): Promise<ProviderStatus> {
    const now = Date.now()
    // Cache check for 30 seconds
    if (now - this.lastOllamaCheck < 30000 && this.lastOllamaCheck > 0) {
      return {
        provider: 'ollama',
        available: this.ollamaAvailable,
        models: this.ollamaModels,
      }
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const response = await fetch(`${this.config.ollamaEndpoint}/api/tags`, {
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (response.ok) {
        const data = (await response.json()) as {
          models?: Array<{ name: string }>
        }
        this.ollamaModels = (data.models || []).map((m) => m.name)
        this.ollamaAvailable = true
        this.lastOllamaCheck = now
        return {
          provider: 'ollama',
          available: true,
          models: this.ollamaModels,
        }
      }
    } catch {
      // Ollama not available
    }

    this.ollamaAvailable = false
    this.ollamaModels = []
    this.lastOllamaCheck = now
    return {
      provider: 'ollama',
      available: false,
      models: [],
    }
  }

  /**
   * Get Claude API status
   */
  getClaudeStatus(): ProviderStatus {
    return {
      provider: 'claude',
      available: !!this.config.claudeApiKey,
      models: this.config.claudeApiKey
        ? ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022']
        : [],
    }
  }

  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: Message[], systemPrompt?: string): number {
    let text = systemPrompt || ''
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        text += msg.content
      } else {
        for (const part of msg.content) {
          if (part.type === 'text') {
            text += part.text
          }
        }
      }
    }
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4)
  }

  /**
   * Select the best provider for a request
   */
  selectProvider(request: InferenceRequest): {
    provider: InferenceProvider
    model: string
    reason: string
  } {
    // If explicitly specified, use that provider
    if (request.provider && request.provider !== 'auto') {
      const model = request.model || this.getDefaultModel(request.provider)
      return {
        provider: request.provider,
        model,
        reason: 'explicitly_requested',
      }
    }

    // Check custom routing rules
    for (const rule of this.config.routingRules.sort(
      (a, b) => b.priority - a.priority
    )) {
      if (this.matchesRule(request, rule)) {
        return {
          provider: rule.provider,
          model: rule.model || this.getDefaultModel(rule.provider),
          reason: `routing_rule_${rule.priority}`,
        }
      }
    }

    // Estimate tokens
    const tokenEstimate = this.estimateTokens(request.messages, request.systemPrompt)

    // Auto-selection logic
    if (this.config.preferLocal && this.ollamaAvailable) {
      // Check if request is suitable for local inference
      if (tokenEstimate <= this.config.maxLocalTokens) {
        const localModel =
          request.model ||
          this.ollamaModels.find((m) => this.config.localModels.includes(m.split(':')[0])) ||
          this.ollamaModels[0]

        if (localModel) {
          return {
            provider: 'ollama',
            model: localModel,
            reason: 'local_preferred_and_suitable',
          }
        }
      }
    }

    // Fall back to Claude if available
    if (this.config.claudeApiKey) {
      return {
        provider: 'claude',
        model: request.model || 'claude-sonnet-4-20250514',
        reason: this.ollamaAvailable
          ? 'request_too_large_for_local'
          : 'local_unavailable',
      }
    }

    // Last resort: try Ollama anyway
    if (this.ollamaAvailable) {
      return {
        provider: 'ollama',
        model: this.ollamaModels[0] || 'llama3.2',
        reason: 'only_provider_available',
      }
    }

    throw new Error('No inference providers available')
  }

  /**
   * Check if request matches a routing rule
   */
  private matchesRule(request: InferenceRequest, rule: RoutingRule): boolean {
    if (rule.match.systemPrompt) {
      const pattern =
        typeof rule.match.systemPrompt === 'string'
          ? new RegExp(rule.match.systemPrompt, 'i')
          : rule.match.systemPrompt
      if (!request.systemPrompt?.match(pattern)) {
        return false
      }
    }

    if (rule.match.messageContains) {
      const pattern =
        typeof rule.match.messageContains === 'string'
          ? new RegExp(rule.match.messageContains, 'i')
          : rule.match.messageContains
      const hasMatch = request.messages.some((m) => {
        const text =
          typeof m.content === 'string'
            ? m.content
            : m.content
                .filter((c) => c.type === 'text')
                .map((c) => (c as { text: string }).text)
                .join('')
        return text.match(pattern)
      })
      if (!hasMatch) return false
    }

    if (rule.match.tokenEstimate) {
      const tokens = this.estimateTokens(request.messages, request.systemPrompt)
      if (rule.match.tokenEstimate.min && tokens < rule.match.tokenEstimate.min) {
        return false
      }
      if (rule.match.tokenEstimate.max && tokens > rule.match.tokenEstimate.max) {
        return false
      }
    }

    return true
  }

  /**
   * Get default model for a provider
   */
  private getDefaultModel(provider: InferenceProvider): string {
    switch (provider) {
      case 'ollama':
        return (
          this.ollamaModels.find((m) =>
            this.config.localModels.includes(m.split(':')[0])
          ) ||
          this.ollamaModels[0] ||
          'llama3.2'
        )
      case 'claude':
        return 'claude-sonnet-4-20250514'
      default:
        return 'llama3.2'
    }
  }

  /**
   * Make an inference request
   */
  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    this.stats.totalRequests++
    _startTime = Date.now()

    // Select provider
    const selection = this.selectProvider(request)
    this.emit('provider:selected', selection)

    try {
      let response: InferenceResponse

      if (selection.provider === 'ollama') {
        response = await this.inferOllama(request, selection.model)
        this.stats.ollamaRequests++
        this.updateLatency('ollama', response.latencyMs)
        this.stats.tokensSaved += response.usage?.totalTokens || 0
      } else {
        response = await this.inferClaude(request, selection.model)
        this.stats.claudeRequests++
        this.updateLatency('claude', response.latencyMs)
      }

      this.emit('inference:complete', response)
      return response
    } catch (error) {
      // Handle fallback
      if (this.config.fallbackToCloud && selection.provider === 'ollama') {
        console.warn('[InferenceRouter] Ollama failed, falling back to Claude')
        this.stats.ollamaErrors++

        if (this.config.claudeApiKey) {
          const response = await this.inferClaude(request, 'claude-sonnet-4-20250514')
          this.stats.claudeRequests++
          this.updateLatency('claude', response.latencyMs)
          return response
        }
      }

      if (selection.provider === 'claude') {
        this.stats.claudeErrors++
      }

      this.emit('inference:error', error)
      throw error
    }
  }

  /**
   * Make inference request to Ollama
   */
  private async inferOllama(
    request: InferenceRequest,
    model: string
  ): Promise<InferenceResponse> {
    _startTime = Date.now()

    // Convert messages to Ollama format
    const messages = request.messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((c) => (c.type === 'text' ? c.text : '')).join(''),
    }))

    if (request.systemPrompt) {
      messages.unshift({ role: 'system', content: request.systemPrompt })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000) // 2 min timeout

    const response = await fetch(`${this.config.ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          top_p: request.topP,
          num_predict: request.maxTokens || 2048,
          stop: request.stopSequences,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`)
    }

    const data = (await response.json()) as {
      message: { content: string }
      eval_count?: number
      prompt_eval_count?: number
    }

    const latencyMs = Date.now() - startTime

    return {
      content: data.message.content,
      model,
      provider: 'ollama',
      usage: data.eval_count
        ? {
            inputTokens: data.prompt_eval_count || 0,
            outputTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          }
        : undefined,
      stopReason: 'end_turn',
      latencyMs,
    }
  }

  /**
   * Make inference request to Claude API
   */
  private async inferClaude(
    request: InferenceRequest,
    model: string
  ): Promise<InferenceResponse> {
    if (!this.config.claudeApiKey) {
      throw new Error('Claude API key not configured')
    }

    _startTime = Date.now()

    // Convert messages to Claude format
    const messages = request.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((c) =>
              c.type === 'text'
                ? { type: 'text' as const, text: c.text }
                : {
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: c.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                      data: c.data,
                    },
                  }
            ),
    }))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)

    const response = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        messages,
        system: request.systemPrompt,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature,
        top_p: request.topP,
        stop_sequences: request.stopSequences,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Claude API error: ${error}`)
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>
      model: string
      usage: { input_tokens: number; output_tokens: number }
      stop_reason: string
    }

    const latencyMs = Date.now() - startTime

    return {
      content: data.content.map((c) => c.text).join(''),
      model: data.model,
      provider: 'claude',
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      stopReason:
        data.stop_reason === 'end_turn'
          ? 'end_turn'
          : data.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : 'stop_sequence',
      latencyMs,
    }
  }

  /**
   * Update latency statistics
   */
  private updateLatency(provider: 'ollama' | 'claude', latencyMs: number): void {
    if (provider === 'ollama') {
      this.stats.avgOllamaLatency =
        (this.stats.avgOllamaLatency + latencyMs) / 2
    } else {
      this.stats.avgClaudeLatency =
        (this.stats.avgClaudeLatency + latencyMs) / 2
    }
  }

  /**
   * Get router configuration
   */
  getConfig(): RouterConfig {
    return { ...this.config, claudeApiKey: undefined } // Don't expose API key
  }

  /**
   * Update router configuration
   */
  updateConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config }
    this.emit('config:updated', this.getConfig())
  }

  /**
   * Add a custom routing rule
   */
  addRoutingRule(rule: RoutingRule): void {
    this.config.routingRules.push(rule)
  }

  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      ollamaRequests: 0,
      claudeRequests: 0,
      ollamaErrors: 0,
      claudeErrors: 0,
      avgOllamaLatency: 0,
      avgClaudeLatency: 0,
      tokensSaved: 0,
    }
  }

  /**
   * Get all provider statuses
   */
  async getProviderStatuses(): Promise<ProviderStatus[]> {
    const [ollamaStatus, claudeStatus] = await Promise.all([
      this.checkOllamaStatus(),
      Promise.resolve(this.getClaudeStatus()),
    ])
    return [ollamaStatus, claudeStatus]
  }
}

// Export singleton
export const inferenceRouter = new InferenceRouter()

// Export class for testing
export { InferenceRouter }
