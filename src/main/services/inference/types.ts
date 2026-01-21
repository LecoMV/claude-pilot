/**
 * Inference Service Types
 *
 * Shared types for the inference routing system that supports
 * both Ollama (local) and Claude API (cloud) providers.
 *
 * @module inference/types
 */

/**
 * LLM Provider types
 */
export type InferenceProvider = 'ollama' | 'claude' | 'auto'

/**
 * Message role types (compatible with both providers)
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * Content types for multimodal support
 */
export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  data: string // Base64 encoded
  mimeType: string
}

export type MessageContent = TextContent | ImageContent

/**
 * Unified message format
 */
export interface Message {
  role: MessageRole
  content: string | MessageContent[]
}

/**
 * Inference request options
 */
export interface InferenceRequest {
  messages: Message[]
  systemPrompt?: string
  model?: string
  provider?: InferenceProvider
  maxTokens?: number
  temperature?: number
  topP?: number
  stopSequences?: string[]
  stream?: boolean
}

/**
 * Inference response
 */
export interface InferenceResponse {
  content: string
  model: string
  provider: InferenceProvider
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence'
  latencyMs: number
}

/**
 * Streaming chunk response
 */
export interface InferenceStreamChunk {
  type: 'content_delta' | 'usage' | 'done'
  delta?: string
  usage?: InferenceResponse['usage']
  stopReason?: InferenceResponse['stopReason']
}

/**
 * Router configuration
 */
export interface RouterConfig {
  defaultProvider: InferenceProvider
  ollamaEndpoint: string
  claudeApiKey?: string
  preferLocal: boolean // Prefer Ollama when available
  maxLocalTokens: number // Max tokens for local inference
  localModels: string[] // Allowed local models
  fallbackToCloud: boolean // Fallback to Claude if Ollama fails
  routingRules: RoutingRule[]
}

/**
 * Custom routing rules
 */
export interface RoutingRule {
  match: {
    systemPrompt?: string | RegExp
    messageContains?: string | RegExp
    tokenEstimate?: { min?: number; max?: number }
  }
  provider: InferenceProvider
  model?: string
  priority: number
}

/**
 * Provider status
 */
export interface ProviderStatus {
  provider: InferenceProvider
  available: boolean
  models: string[]
  latency?: number
  error?: string
}

/**
 * Router statistics
 */
export interface RouterStats {
  totalRequests: number
  ollamaRequests: number
  claudeRequests: number
  ollamaErrors: number
  claudeErrors: number
  avgOllamaLatency: number
  avgClaudeLatency: number
  tokensSaved: number // Tokens processed locally (cost savings)
}

/**
 * MCP Sampling request format (from MCP protocol)
 */
export interface MCPSamplingRequest {
  messages: Array<{
    role: 'user' | 'assistant'
    content:
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mimeType: string }
  }>
  modelPreferences?: {
    hints?: Array<{ name?: string }>
    costPriority?: number // 0-1, higher = prefer cheaper
    speedPriority?: number // 0-1, higher = prefer faster
    intelligencePriority?: number // 0-1, higher = prefer smarter
  }
  systemPrompt?: string
  includeContext?: 'none' | 'thisServer' | 'allServers'
  maxTokens: number
  temperature?: number
  stopSequences?: string[]
  metadata?: Record<string, unknown>
}

/**
 * MCP Sampling response format
 */
export interface MCPSamplingResponse {
  role: 'assistant'
  content:
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  model: string
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens'
}
