/**
 * Configuration Types for 5-Tier Config Resolver
 *
 * Defines the configuration schema and tier priorities.
 *
 * Tier Priority (lowest to highest):
 * 1. Installation Defaults - Built into app bundle
 * 2. System Policies - /etc/claude-pilot/ (admin-controlled)
 * 3. User Preferences - ~/.config/claude-pilot/settings.json
 * 4. Project Config - .claude/pilot.json in project root
 * 5. Session Overrides - CLI flags, environment variables
 */

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

export type ConfigTier = 'installation' | 'system' | 'user' | 'project' | 'session'

export const TIER_PRIORITY: Record<ConfigTier, number> = {
  installation: 0,
  system: 1,
  user: 2,
  project: 3,
  session: 4,
}

// ============================================================================
// LOCKABLE CONFIG VALUE
// ============================================================================

/**
 * A value that can be locked by system admins
 */
export interface LockableValue<T> {
  value: T
  locked?: boolean
  lockReason?: string
}

/**
 * Check if a value is a LockableValue
 */
export function isLockableValue<T>(val: unknown): val is LockableValue<T> {
  return typeof val === 'object' && val !== null && 'value' in val && !Array.isArray(val)
}

// ============================================================================
// LLM CONFIGURATION
// ============================================================================

export interface LLMConfig {
  /** Model identifier */
  model?: string | LockableValue<string>
  /** Max tokens for responses */
  maxTokens?: number | LockableValue<number>
  /** Enable extended thinking */
  thinkingEnabled?: boolean | LockableValue<boolean>
  /** Thinking budget in tokens */
  thinkingBudget?: number | LockableValue<number>
  /** Custom API endpoint */
  endpoint?: string | LockableValue<string>
  /** API key reference (never store actual key) */
  apiKeyRef?: string
}

// ============================================================================
// MCP SERVER CONFIGURATION
// ============================================================================

export interface MCPServerConfig {
  /** Command to execute */
  command: string
  /** Command arguments */
  args?: string[]
  /** Environment variables */
  env?: Record<string, string>
  /** Disable this server */
  disabled?: boolean
  /** Auto-restart on crash */
  autoRestart?: boolean
  /** Health check config */
  healthCheck?: {
    interval: number
    timeout: number
  }
}

export interface MCPConfig {
  /** MCP servers by name */
  servers?: Record<string, MCPServerConfig>
  /** Approved servers (admin whitelist) */
  approvedServers?: LockableValue<string[]>
  /** Blocked servers (admin blacklist) */
  blockedServers?: LockableValue<string[]>
  /** Discovery sources priority */
  discoveryPriority?: ('project' | 'user' | 'system' | 'builtin')[]
}

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

export interface SecurityConfig {
  /** Sandbox mode for Claude sessions */
  sandboxMode?: boolean | LockableValue<boolean>
  /** Allow dangerous operations */
  allowDangerousOperations?: boolean | LockableValue<boolean>
  /** Require confirmation for file writes */
  requireWriteConfirmation?: boolean
  /** Path restrictions */
  pathRestrictions?: LockableValue<string[]>
  /** Allowed domains for web access */
  allowedDomains?: LockableValue<string[]>
}

// ============================================================================
// EMBEDDING CONFIGURATION
// ============================================================================

export interface EmbeddingConfig {
  /** Ollama model for embeddings */
  model?: string
  /** Auto-embed sessions */
  autoEmbedSessions?: boolean
  /** Auto-embed learnings */
  autoEmbedLearnings?: boolean
  /** Ollama endpoint */
  ollamaEndpoint?: string
}

// ============================================================================
// UI CONFIGURATION
// ============================================================================

export interface UIConfig {
  /** Theme: 'dark' | 'light' | 'system' */
  theme?: 'dark' | 'light' | 'system'
  /** Sidebar collapsed */
  sidebarCollapsed?: boolean
  /** Font size */
  fontSize?: number
  /** Font family */
  fontFamily?: string
  /** Show line numbers in code */
  showLineNumbers?: boolean
}

// ============================================================================
// TELEMETRY CONFIGURATION
// ============================================================================

export interface TelemetryConfig {
  /** Enable telemetry */
  enabled?: boolean | LockableValue<boolean>
  /** OTEL endpoint */
  otelEndpoint?: string | LockableValue<string>
  /** OTEL headers helper path */
  otelHeadersHelper?: string
  /** Enable crash reporting */
  crashReporting?: boolean | LockableValue<boolean>
}

// ============================================================================
// MAIN CONFIG SCHEMA
// ============================================================================

export interface ClaudePilotConfig {
  /** Schema version for migrations */
  $version?: number

  /** LLM model settings */
  llm?: LLMConfig

  /** MCP server configuration */
  mcp?: MCPConfig

  /** Security settings */
  security?: SecurityConfig

  /** Embedding pipeline settings */
  embedding?: EmbeddingConfig

  /** UI preferences */
  ui?: UIConfig

  /** Telemetry/observability */
  telemetry?: TelemetryConfig

  /** Custom extensions (user-defined) */
  extensions?: Record<string, unknown>
}

// ============================================================================
// CONFIG RESOLVER RESULT
// ============================================================================

export interface ResolvedConfig extends ClaudePilotConfig {
  /** Metadata about resolution */
  _meta: {
    /** Source tier for each resolved key */
    sources: Record<string, ConfigTier>
    /** Locked keys */
    locked: string[]
    /** Resolution timestamp */
    resolvedAt: number
    /** Project path if project config was used */
    projectPath?: string
  }
}

export interface ConfigDiagnostic {
  key: string
  value: unknown
  sourceTier: ConfigTier
  isLocked: boolean
  lockReason?: string
  overriddenBy?: ConfigTier
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_CONFIG: ClaudePilotConfig = {
  $version: 1,

  llm: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
  },

  mcp: {
    discoveryPriority: ['project', 'user', 'system', 'builtin'],
  },

  security: {
    sandboxMode: true,
    allowDangerousOperations: false,
    requireWriteConfirmation: true,
  },

  embedding: {
    model: 'nomic-embed-text',
    autoEmbedSessions: true,
    autoEmbedLearnings: true,
    ollamaEndpoint: 'http://localhost:11434',
  },

  ui: {
    theme: 'dark',
    sidebarCollapsed: false,
    fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    showLineNumbers: true,
  },

  telemetry: {
    enabled: true,
    crashReporting: true,
  },
}
