// Shared type definitions between main and renderer processes

// ============================================================================
// MODEL CAPABILITIES - All Claude Code models with their capabilities
// ============================================================================

export interface ModelCapabilities {
  id: string
  name: string
  maxContextTokens: number
  supportsExtendedThinking: boolean
  thinkingBudgetRange: [number, number] | null // [min, max] or null if not supported
  supportsVision: boolean
  supportsToolUse: boolean
  inputPricePerMillion: number
  outputPricePerMillion: number
  cachePricePerMillion: number
  description: string
  recommended: 'planning' | 'coding' | 'fast' | 'balanced'
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'claude-opus-4-5-20251101': {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    maxContextTokens: 200000,
    supportsExtendedThinking: true,
    thinkingBudgetRange: [1024, 128000],
    supportsVision: true,
    supportsToolUse: true,
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    cachePricePerMillion: 1.875,
    description: 'Most capable model for complex reasoning and planning',
    recommended: 'planning',
  },
  'claude-sonnet-4-5-20250929': {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    maxContextTokens: 200000,
    supportsExtendedThinking: true,
    thinkingBudgetRange: [1024, 32000],
    supportsVision: true,
    supportsToolUse: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachePricePerMillion: 0.375,
    description: 'Best balance of capability and speed for coding',
    recommended: 'coding',
  },
  'claude-sonnet-4-20250514': {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    maxContextTokens: 200000,
    supportsExtendedThinking: true,
    thinkingBudgetRange: [1024, 32000],
    supportsVision: true,
    supportsToolUse: true,
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    cachePricePerMillion: 0.375,
    description: 'Fast and efficient for everyday tasks',
    recommended: 'balanced',
  },
  'claude-haiku-3-5-20241022': {
    id: 'claude-haiku-3-5-20241022',
    name: 'Claude Haiku 3.5',
    maxContextTokens: 200000,
    supportsExtendedThinking: false,
    thinkingBudgetRange: null,
    supportsVision: true,
    supportsToolUse: true,
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
    cachePricePerMillion: 0.10,
    description: 'Fastest model for simple tasks and quick responses',
    recommended: 'fast',
  },
}

// Helper to get model by ID or partial match
export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  // Direct match
  if (MODEL_CAPABILITIES[modelId]) {
    return MODEL_CAPABILITIES[modelId]
  }
  // Partial match (e.g., 'opus' matches 'claude-opus-4-5-20251101')
  const lowerModelId = modelId.toLowerCase()
  for (const [id, caps] of Object.entries(MODEL_CAPABILITIES)) {
    if (id.toLowerCase().includes(lowerModelId) || caps.name.toLowerCase().includes(lowerModelId)) {
      return caps
    }
  }
  return null
}

// Helper to calculate estimated cost
export function calculateSessionCost(
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  modelId: string
): number {
  const caps = getModelCapabilities(modelId)
  if (!caps) return 0

  const inputCost = (inputTokens / 1_000_000) * caps.inputPricePerMillion
  const outputCost = (outputTokens / 1_000_000) * caps.outputPricePerMillion
  const cacheCost = (cachedTokens / 1_000_000) * caps.cachePricePerMillion

  return inputCost + outputCost + cacheCost
}

// ============================================================================
// System status types
// ============================================================================
export interface SystemStatus {
  claude: ServiceStatus
  mcp: MCPStatus
  memory: MemoryStatus
  ollama: OllamaServiceStatus
  resources: ResourceUsage
}

export interface OllamaServiceStatus {
  online: boolean
  modelCount: number
  runningModels: number
}

export interface ServiceStatus {
  online: boolean
  version?: string
  lastCheck: number
}

export interface MCPStatus {
  servers: MCPServer[]
  totalActive: number
  totalDisabled: number
}

export interface MCPServer {
  name: string
  status: 'online' | 'offline' | 'error'
  toolCount?: number
  lastPing?: number
  config: MCPServerConfig
}

export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

export interface MemoryStatus {
  postgresql: DatabaseStatus
  memgraph: DatabaseStatus
  qdrant: DatabaseStatus
}

export interface DatabaseStatus {
  online: boolean
  recordCount?: number
  lastSync?: number
}

export interface ResourceUsage {
  cpu: number
  memory: number
  disk: DiskUsage
  gpu?: GPUUsage
}

export interface DiskUsage {
  used: number
  total: number
  claudeData: number
}

export interface GPUUsage {
  available: boolean
  name?: string
  memoryUsed?: number
  memoryTotal?: number
  utilization?: number
  temperature?: number
  driverVersion?: string
  error?: string
}

// Project types
export interface ClaudeProject {
  path: string
  name: string
  hasCLAUDEMD: boolean
  hasBeads: boolean
  lastSession?: SessionInfo
  sessionCount: number
}

export interface SessionInfo {
  id: string
  startTime: number
  endTime?: number
  messageCount: number
  toolCalls: number
  model?: string
}

// Claude profile types
export interface ClaudeProfile {
  name: string
  path: string
  settings: ProfileSettings
}

export interface ProfileSettings {
  model?: string
  maxTokens?: number
  temperature?: number
  customInstructions?: string
  thinkingEnabled?: boolean
  thinkingBudget?: number
}

// Workflow types (Claude Flow)
export interface Workflow {
  id: string
  name: string
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed'
  steps: WorkflowStep[]
  variables: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface WorkflowStep {
  id: string
  type: 'task' | 'condition' | 'parallel' | 'loop' | 'wait'
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  config: Record<string, unknown>
  result?: unknown
}

// Memory entry types
export interface Learning {
  id: number
  category: string
  content: string
  source?: string
  confidence: number
  createdAt: string
  tags?: string[]
}

export interface KnowledgeNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface VectorMemory {
  id: string
  content: string
  metadata: Record<string, unknown>
  score?: number
}

// Services types
export interface SystemdService {
  name: string
  description: string
  status: 'running' | 'stopped' | 'failed' | 'inactive'
  enabled: boolean
  activeState: string
  subState: string
  pid?: number
  memory?: string
  cpu?: string
}

export interface PodmanContainer {
  id: string
  name: string
  image: string
  status: 'running' | 'stopped' | 'paused' | 'exited'
  created: string
  ports: string[]
  state: string
  health?: string
}

// Context types
export interface TokenUsage {
  current: number
  max: number
  percentage: number
  lastCompaction?: number
}

export interface CompactionSettings {
  autoCompact: boolean
  threshold: number
}

export interface SessionSummary {
  id: string
  projectPath: string
  projectName: string
  startTime: number
  endTime?: number
  messageCount: number
  tokenCount: number
  toolCalls: number
  model?: string
}

// External Session Management Types (for sessions launched outside the app)
export interface ExternalSession {
  id: string
  slug?: string
  projectPath: string
  projectName: string
  filePath: string
  startTime: number
  lastActivity: number
  isActive: boolean
  model?: string
  version?: string
  gitBranch?: string
  stats: SessionStats
  // Enhanced session metadata
  workingDirectory?: string      // cwd from JSONL - where Claude was launched
  userType?: 'external' | 'api' | 'internal' | string  // How session was initiated
  isSubagent?: boolean           // Whether this is a subagent/sidechain session
  // Process info (for active sessions only)
  processInfo?: SessionProcessInfo
}

export interface SessionProcessInfo {
  pid: number                    // Process ID
  profile: string                // Profile name (default, engineering, security, etc.)
  terminal: string               // TTY (pts/3) or 'background'
  launchMode: 'new' | 'resume'   // Whether session was resumed or new
  permissionMode?: string        // Permission level (bypassPermissions, etc.)
  wrapper?: string               // Launch wrapper (claude+, claude-eng, etc.)
  activeMcpServers: string[]     // Running MCP server names
}

export interface SessionStats {
  messageCount: number
  userMessages: number
  assistantMessages: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  estimatedCost?: number
  serviceTier?: 'standard' | 'scale' | 'pro' | string  // API tier from Anthropic
}

export interface SessionMessage {
  uuid: string
  parentUuid?: string
  type: 'user' | 'assistant' | 'tool-result' | 'queue-operation' | 'file-history-snapshot'
  timestamp: number
  content?: string
  model?: string
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
}

export interface SessionEvent {
  type: 'session-started' | 'session-updated' | 'session-ended'
  sessionId: string
  data?: Partial<ExternalSession>
}

// Note: ProfileSettings is defined above in "Claude profile types" section
// with all properties including thinkingEnabled and thinkingBudget

export interface ClaudeRule {
  name: string
  path: string
  enabled: boolean
  content?: string
}

// Custom Claude Code Profile (for different work contexts like claude-eng, claude-sec)
// Profiles are stored as directories in ~/.claude-profiles/
// Each profile directory contains: mcp.json, settings.json, CLAUDE.md, .env
export interface ClaudeCodeProfile {
  id: string
  name: string
  description?: string
  settings: ProfileSettings
  claudeMd?: string
  enabledRules?: string[]
  hasMcpConfig?: boolean  // Whether profile has mcp.json
  profilePath?: string    // Full path to profile directory
  createdAt: number
  updatedAt: number
}

// Watchdog types
export interface WatchdogServiceHealth {
  id: string
  name: string
  status: 'healthy' | 'unhealthy' | 'recovering' | 'failed'
  lastCheck: number
  lastHealthy: number
  restartCount: number
  lastRestart?: number
  error?: string
}

export interface WatchdogRecoveryEvent {
  id: string
  serviceId: string
  serviceName: string
  timestamp: number
  action: 'restart' | 'alert' | 'recovery_failed'
  success: boolean
  message: string
}

// Audit types (OCSF-compliant)
export interface AuditEvent {
  id?: number
  time: number
  class_uid: number
  class_name: string
  category_uid: number
  category_name: string
  activity_id: number
  activity_name: string
  severity_id: number
  status_id: number
  status_detail?: string
  message: string
  actor_user?: string
  actor_process?: string
  actor_session?: string
  target_type?: string
  target_name?: string
  target_data?: string
  metadata_version: string
  metadata_product_name: string
  metadata_product_version: string
  raw_data?: string
}

export interface AuditStats {
  totalEvents: number
  eventsByCategory: Record<string, number>
  eventsByActivity: Record<string, number>
  last24hCount: number
  dbSizeMB: number
}

// Logs types
export type LogSource = 'claude' | 'mcp' | 'system' | 'agent' | 'workflow' | 'all'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  timestamp: number
  source: LogSource
  level: LogLevel
  message: string
  metadata?: Record<string, unknown>
}

// Ollama types
export interface OllamaModel {
  name: string
  size: number
  digest: string
  modifiedAt: string
  details?: {
    format?: string
    family?: string
    parameterSize?: string
    quantizationLevel?: string
  }
}

export interface OllamaRunningModel {
  name: string
  model: string
  size: number
  digest: string
  expiresAt: string
}

export interface OllamaStatus {
  online: boolean
  version?: string
}

// Agent types
export type AgentStatus = 'idle' | 'active' | 'busy' | 'error' | 'terminated'
export type AgentType = 'coder' | 'researcher' | 'tester' | 'architect' | 'coordinator' | 'security'

export interface Agent {
  id: string
  name: string
  type: AgentType
  status: AgentStatus
  taskCount: number
  health: number
  domain?: string
  config?: Record<string, unknown>
}

export interface SwarmInfo {
  id: string
  topology: string
  agents: string[]
  status: 'active' | 'idle' | 'shutdown'
  createdAt: number
}

export interface HiveMindInfo {
  queenId?: string
  workers: string[]
  topology: string
  status: 'active' | 'idle' | 'shutdown'
}

// Chat types
export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
}

// App Settings
export interface AppSettings {
  // Appearance
  theme: 'dark' | 'light' | 'auto'
  accentColor: 'purple' | 'blue' | 'green' | 'teal'
  sidebarCollapsed: boolean

  // Terminal
  terminalFont: 'jetbrains' | 'fira' | 'cascadia'
  terminalFontSize: number
  terminalScrollback: number

  // Memory
  postgresHost: string
  postgresPort: number
  memgraphHost: string
  memgraphPort: number

  // Notifications
  systemNotifications: boolean
  soundEnabled: boolean

  // Security
  autoLock: boolean
  clearOnExit: boolean
}

// ============================================================================
// BEADS WORK TRACKING - Issue/Task management types
// ============================================================================

export type BeadStatus = 'open' | 'in_progress' | 'closed'
export type BeadType = 'task' | 'bug' | 'feature' | 'epic'
export type BeadPriority = 0 | 1 | 2 | 3 | 4 // P0 (critical) to P4 (backlog)

export interface Bead {
  id: string
  title: string
  status: BeadStatus
  priority: BeadPriority
  type: BeadType
  created: string // ISO date
  updated: string // ISO date
  description?: string
  assignee?: string
  blockedBy?: string[]
  blocks?: string[]
  tags?: string[]
}

export interface BeadStats {
  total: number
  open: number
  inProgress: number
  closed: number
  blocked: number
  ready: number
  avgLeadTime?: number // hours
}

export interface BeadCreateParams {
  title: string
  type: BeadType
  priority: BeadPriority
  description?: string
  assignee?: string
}

export interface BeadUpdateParams {
  status?: BeadStatus
  priority?: BeadPriority
  assignee?: string
  description?: string
}

export interface BeadListFilter {
  status?: BeadStatus | 'all'
  priority?: BeadPriority | 'all'
  type?: BeadType | 'all'
  search?: string
  limit?: number
}

// IPC Channel definitions
export type IPCChannels = {
  // System
  'system:status': () => Promise<SystemStatus>
  'system:resources': () => Promise<ResourceUsage>

  // Claude
  'claude:version': () => Promise<string>
  'claude:projects': () => Promise<ClaudeProject[]>
  'claude:sessions': (projectPath: string) => Promise<SessionInfo[]>

  // MCP
  'mcp:list': () => Promise<MCPServer[]>
  'mcp:toggle': (name: string, enabled: boolean) => Promise<boolean>
  'mcp:reload': () => Promise<boolean>
  'mcp:getServer': (name: string) => Promise<MCPServer | null>
  'mcp:getConfig': () => Promise<string>
  'mcp:saveConfig': (content: string) => Promise<boolean>

  // Memory
  'memory:learnings': (query?: string, limit?: number) => Promise<Learning[]>
  'memory:stats': () => Promise<{
    postgresql: { count: number }
    memgraph: { nodes: number; edges: number }
    qdrant: { vectors: number }
  }>
  'memory:graph': (query?: string, limit?: number) => Promise<{
    nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
    edges: Array<{ id: string; source: string; target: string; type: string; properties: Record<string, unknown> }>
  }>
  'memory:vectors': (query: string, limit?: number) => Promise<VectorMemory[]>
  'memory:qdrant:browse': (collection?: string, limit?: number, offset?: string) => Promise<{
    points: Array<{ id: string; payload: Record<string, unknown>; created_at?: string }>
    nextOffset: string | null
  }>
  'memory:qdrant:search': (query: string, collection?: string, limit?: number) => Promise<{
    results: Array<{ id: string; score: number; payload: Record<string, unknown> }>
  }>
  'memory:memgraph:search': (keyword: string, nodeType?: string, limit?: number) => Promise<{
    results: Array<{ id: string; label: string; type: string; properties: Record<string, unknown>; score?: number }>
  }>
  'memory:raw': (source: 'postgresql' | 'memgraph' | 'qdrant', query: string) => Promise<{
    success: boolean
    data: unknown
    error?: string
    suggestion?: string
    executionTime: number
  }>
  'memory:unified-search': (query: string, limit?: number) => Promise<{
    results: Array<{
      id: string
      source: 'postgresql' | 'memgraph' | 'qdrant'
      title: string
      content: string
      score: number
      metadata: Record<string, unknown>
    }>
    stats: {
      postgresql: number
      memgraph: number
      qdrant: number
      totalTime: number
    }
  }>

  // Terminal
  'terminal:create': () => Promise<string>
  'terminal:write': (id: string, data: string) => void
  'terminal:resize': (id: string, cols: number, rows: number) => void
  'terminal:close': (id: string) => void

  // Profile
  'profile:settings': () => Promise<ProfileSettings>
  'profile:saveSettings': (settings: ProfileSettings) => Promise<boolean>
  'profile:claudemd': () => Promise<string>
  'profile:saveClaudemd': (content: string) => Promise<boolean>
  'profile:rules': () => Promise<ClaudeRule[]>
  'profile:toggleRule': (name: string, enabled: boolean) => Promise<boolean>
  'profile:saveRule': (path: string, content: string) => Promise<boolean>

  // Custom Profiles (claude-eng, claude-sec, etc.)
  'profiles:list': () => Promise<ClaudeCodeProfile[]>
  'profiles:get': (id: string) => Promise<ClaudeCodeProfile | null>
  'profiles:create': (profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ClaudeCodeProfile | null>
  'profiles:update': (id: string, updates: Partial<ClaudeCodeProfile>) => Promise<boolean>
  'profiles:delete': (id: string) => Promise<boolean>
  'profiles:activate': (id: string) => Promise<boolean>
  'profiles:getActive': () => Promise<string | null>
  'profiles:launch': (id: string, projectPath?: string) => Promise<{ success: boolean; error?: string }>

  // Context
  'context:tokenUsage': () => Promise<TokenUsage>
  'context:compactionSettings': () => Promise<CompactionSettings>
  'context:sessions': () => Promise<SessionSummary[]>
  'context:compact': () => Promise<boolean>
  'context:setAutoCompact': (enabled: boolean) => Promise<boolean>

  // Services
  'services:systemd': () => Promise<SystemdService[]>
  'services:podman': () => Promise<PodmanContainer[]>
  'services:systemdAction': (name: string, action: 'start' | 'stop' | 'restart') => Promise<boolean>
  'services:podmanAction': (id: string, action: 'start' | 'stop' | 'restart') => Promise<boolean>

  // Logs
  'logs:recent': (limit?: number) => Promise<LogEntry[]>
  'logs:stream': (sources: string[]) => Promise<boolean>
  'logs:stopStream': () => Promise<boolean>

  // Ollama
  'ollama:status': () => Promise<OllamaStatus>
  'ollama:list': () => Promise<OllamaModel[]>
  'ollama:running': () => Promise<OllamaRunningModel[]>
  'ollama:pull': (model: string) => Promise<boolean>
  'ollama:delete': (model: string) => Promise<boolean>
  'ollama:run': (model: string) => Promise<boolean>
  'ollama:stop': (model: string) => Promise<boolean>

  // Agents
  'agents:list': () => Promise<Agent[]>
  'agents:spawn': (type: AgentType, name: string) => Promise<Agent | null>
  'agents:terminate': (id: string) => Promise<boolean>
  'agents:swarmStatus': () => Promise<SwarmInfo | null>
  'agents:hiveMindStatus': () => Promise<HiveMindInfo | null>
  'agents:initSwarm': (topology: string) => Promise<boolean>
  'agents:shutdownSwarm': () => Promise<boolean>

  // Chat
  'chat:send': (projectPath: string, message: string, messageId: string) => Promise<boolean>

  // Settings
  'settings:get': () => Promise<AppSettings>
  'settings:save': (settings: AppSettings) => Promise<boolean>

  // External Sessions (sessions launched outside the app)
  'sessions:discover': () => Promise<ExternalSession[]>
  'sessions:get': (sessionId: string) => Promise<ExternalSession | null>
  'sessions:getMessages': (sessionId: string, limit?: number) => Promise<SessionMessage[]>
  'sessions:watch': (enable: boolean) => Promise<boolean>
  'sessions:getActive': () => Promise<ExternalSession[]>

  // Credentials (secure storage)
  'credentials:store': (key: string, value: string) => Promise<boolean>
  'credentials:retrieve': (key: string) => Promise<string | null>
  'credentials:delete': (key: string) => Promise<boolean>
  'credentials:has': (key: string) => Promise<boolean>
  'credentials:list': () => Promise<string[]>
  'credentials:isEncryptionAvailable': () => Promise<boolean>

  // Audit (OCSF-compliant logging)
  'audit:query': (params?: {
    startTime?: number
    endTime?: number
    category?: string
    activity?: number
    targetType?: string
    limit?: number
    offset?: number
  }) => Promise<AuditEvent[]>
  'audit:stats': () => Promise<AuditStats>
  'audit:export': (format: 'json' | 'csv', params?: { startTime?: number; endTime?: number }) => Promise<string>

  // Watchdog (auto-recovery)
  'watchdog:start': () => Promise<boolean>
  'watchdog:stop': () => Promise<boolean>
  'watchdog:isEnabled': () => Promise<boolean>
  'watchdog:getHealth': () => Promise<WatchdogServiceHealth[]>
  'watchdog:getServiceHealth': (serviceId: string) => Promise<WatchdogServiceHealth | null>
  'watchdog:getRecoveryHistory': (limit?: number) => Promise<WatchdogRecoveryEvent[]>
  'watchdog:forceCheck': (serviceId: string) => Promise<WatchdogServiceHealth | null>
  'watchdog:forceRestart': (serviceId: string) => Promise<boolean>

  // Beads (work tracking)
  'beads:list': (filter?: BeadListFilter) => Promise<Bead[]>
  'beads:get': (id: string) => Promise<Bead | null>
  'beads:stats': () => Promise<BeadStats>
  'beads:create': (params: BeadCreateParams) => Promise<Bead | null>
  'beads:update': (id: string, params: BeadUpdateParams) => Promise<boolean>
  'beads:close': (id: string, reason?: string) => Promise<boolean>
  'beads:ready': () => Promise<Bead[]>
  'beads:blocked': () => Promise<Bead[]>
  'beads:hasBeads': (projectPath: string) => Promise<boolean>

  // System helpers
  'system:getHomePath': () => Promise<string>

  // Shell operations
  'shell:openPath': (path: string) => Promise<string>
  'shell:openExternal': (url: string) => Promise<void>

  // Dialog operations
  'dialog:openDirectory': () => Promise<string | null>

  // Terminal operations
  'terminal:openAt': (path: string) => Promise<boolean>
}

// Window API exposed to renderer
export interface ElectronAPI {
  invoke<K extends keyof IPCChannels>(
    channel: K,
    ...args: Parameters<IPCChannels[K]>
  ): ReturnType<IPCChannels[K]>

  on(channel: string, callback: (...args: unknown[]) => void): () => void

  send(channel: string, ...args: unknown[]): void
}

// Domain-specific API type (from preload)
export interface ClaudeAPI {
  system: {
    getStatus: () => Promise<SystemStatus>
    getResources: () => Promise<ResourceUsage>
  }
  memory: {
    search: (query: string, limit?: number) => ReturnType<IPCChannels['memory:unified-search']>
    getLearnings: (query?: string, limit?: number) => ReturnType<IPCChannels['memory:learnings']>
    getStats: () => ReturnType<IPCChannels['memory:stats']>
  }
  sessions: {
    discover: () => ReturnType<IPCChannels['sessions:discover']>
    get: (id: string) => ReturnType<IPCChannels['sessions:get']>
    getMessages: (id: string, limit?: number) => ReturnType<IPCChannels['sessions:getMessages']>
    getActive: () => ReturnType<IPCChannels['sessions:getActive']>
  }
  credentials: {
    store: (key: string, value: string) => Promise<boolean>
    retrieve: (key: string) => Promise<string | null>
    delete: (key: string) => Promise<boolean>
    has: (key: string) => Promise<boolean>
    list: () => Promise<string[]>
    isEncryptionAvailable: () => Promise<boolean>
  }
  audit: {
    query: (params?: Parameters<IPCChannels['audit:query']>[0]) => ReturnType<IPCChannels['audit:query']>
    getStats: () => ReturnType<IPCChannels['audit:stats']>
    export: (format: 'json' | 'csv', params?: { startTime?: number; endTime?: number }) => Promise<string>
  }
  beads: {
    list: (filter?: BeadListFilter) => ReturnType<IPCChannels['beads:list']>
    get: (id: string) => ReturnType<IPCChannels['beads:get']>
    stats: () => ReturnType<IPCChannels['beads:stats']>
    create: (params: BeadCreateParams) => ReturnType<IPCChannels['beads:create']>
    update: (id: string, params: BeadUpdateParams) => ReturnType<IPCChannels['beads:update']>
    close: (id: string, reason?: string) => ReturnType<IPCChannels['beads:close']>
    ready: () => ReturnType<IPCChannels['beads:ready']>
    blocked: () => ReturnType<IPCChannels['beads:blocked']>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    claude: ClaudeAPI
  }
}
