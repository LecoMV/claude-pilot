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
    inputPricePerMillion: 15.0,
    outputPricePerMillion: 75.0,
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
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
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
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
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
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
    cachePricePerMillion: 0.1,
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

// MCP Proxy/Federation (deploy-zebp)
export interface MCPFederatedServer {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPing?: number
  toolCount: number
  resourceCount: number
  promptCount: number
  error?: string
}

export interface MCPProxyTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
}

export interface MCPProxyResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface MCPProxyPrompt {
  name: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
  serverId: string
}

export interface MCPProxyConfig {
  loadBalancing: 'round-robin' | 'least-connections' | 'capability-based'
  healthCheckInterval: number
  connectionTimeout: number
  retryAttempts: number
  cacheToolsFor: number
}

export interface MCPProxyStats {
  totalRequests: number
  totalErrors: number
  serverStats: Record<string, { requests: number; errors: number; avgLatency: number }>
  uptime: number
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
  workingDirectory?: string // cwd from JSONL - where Claude was launched
  userType?: 'external' | 'api' | 'internal' | string // How session was initiated
  isSubagent?: boolean // Whether this is a subagent/sidechain session
  // Process info (for active sessions only)
  processInfo?: SessionProcessInfo
}

export interface SessionProcessInfo {
  pid: number // Process ID
  profile: string // Profile name (default, engineering, security, etc.)
  terminal: string // TTY (pts/3) or 'background'
  launchMode: 'new' | 'resume' // Whether session was resumed or new
  permissionMode?: string // Permission level (bypassPermissions, etc.)
  wrapper?: string // Launch wrapper (claude+, claude-eng, etc.)
  activeMcpServers: string[] // Running MCP server names
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
  serviceTier?: 'standard' | 'scale' | 'pro' | string // API tier from Anthropic
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
  hasMcpConfig?: boolean // Whether profile has mcp.json
  profilePath?: string // Full path to profile directory
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

// SIEM Log Shipping (deploy-e1fc)
export interface SIEMEndpoint {
  id: string
  name: string
  type: 'webhook' | 'syslog' | 'http'
  url?: string // For webhook/http
  host?: string // For syslog
  port?: number // For syslog
  protocol?: 'tcp' | 'udp' // For syslog
  apiKey?: string // Optional auth header
  enabled: boolean
  batchSize: number // Events to batch before sending
  flushInterval: number // ms between flushes
  retryAttempts: number
  retryDelay: number // ms between retries
}

export interface SIEMShipperStats {
  totalShipped: number
  totalFailed: number
  lastShipTime?: number
  lastError?: string
  queueSize: number
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

  // Budget tracking
  budget?: BudgetSettings
}

export interface BudgetSettings {
  monthlyLimit: number // USD
  warningThreshold: number // Percentage (0-100) to trigger warning
  alertsEnabled: boolean
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

// ============================================================================
// PGVECTOR EMBEDDINGS - Semantic search types
// ============================================================================

export type VectorIndexType = 'hnsw' | 'ivfflat' | 'none'

export interface PgVectorCollection {
  name: string
  tableName: string
  vectorCount: number
  dimensions: number
  indexType: VectorIndexType
  indexName?: string
  sizeBytes: number
  lastUpdated?: string
}

export interface PgVectorStatus {
  enabled: boolean
  version?: string
  defaultDimensions: number
  embeddingModel: string
  collections: PgVectorCollection[]
}

export interface PgVectorSearchResult {
  id: string | number
  content: string
  similarity: number
  metadata?: Record<string, unknown>
  tableName: string
}

export interface PgVectorAutoEmbedConfig {
  enableLearnings: boolean
  enableSessions: boolean
  enableCode: boolean
  enableCommits: boolean
  embeddingModel: string
  batchSize: number
  concurrentRequests: number
  rateLimit: number
}

export interface PgVectorIndexConfig {
  type: VectorIndexType
  m?: number // HNSW connections per layer
  efConstruction?: number // HNSW build quality
  efSearch?: number // HNSW search quality
  lists?: number // IVFFlat clusters
  probes?: number // IVFFlat search clusters
}

// ============================================================================
// PREDICTIVE CONTEXT - File prediction types
// ============================================================================

export interface FilePrediction {
  path: string
  confidence: number // 0-1 score
  reason: string // Why this file was predicted
  source: 'keyword' | 'pattern' | 'cooccurrence' | 'recent'
  lastAccessed?: number
}

export interface FileAccessPattern {
  path: string
  accessCount: number
  lastAccessed: number
  cooccurringFiles: string[] // Files frequently accessed together
  keywords: string[] // Keywords that triggered access
}

export interface PredictiveContextStats {
  totalPredictions: number
  accuratePredictions: number
  accuracy: number
  trackedFiles: number
  cacheHitRate: number
}

export interface PredictiveContextConfig {
  enabled: boolean
  maxPredictions: number
  minConfidence: number
  trackHistory: boolean
  preloadEnabled: boolean
  cacheSize: number
}

// ============================================================================
// AUTONOMOUS PLAN & EXECUTE - Task planning and execution types
// ============================================================================

export type PlanStatus = 'draft' | 'ready' | 'executing' | 'paused' | 'completed' | 'failed'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type StepType = 'code' | 'shell' | 'research' | 'review' | 'test' | 'manual'

export interface PlanStep {
  id: string
  name: string
  description: string
  type: StepType
  status: StepStatus
  order: number
  command?: string // For shell/code steps
  output?: string
  error?: string
  startedAt?: number
  completedAt?: number
  estimatedDuration?: number // seconds
  dependencies?: string[] // Step IDs that must complete first
}

export interface Plan {
  id: string
  title: string
  description: string
  projectPath: string
  status: PlanStatus
  steps: PlanStep[]
  currentStepIndex: number
  createdAt: number
  updatedAt: number
  startedAt?: number
  completedAt?: number
  totalDuration?: number
  error?: string
}

export interface PlanCreateParams {
  title: string
  description: string
  projectPath: string
  steps: Omit<PlanStep, 'id' | 'status' | 'order'>[]
}

export interface PlanExecutionStats {
  totalPlans: number
  completedPlans: number
  failedPlans: number
  successRate: number
  avgDuration: number
  totalStepsExecuted: number
}

// ============================================================================
// TRANSCRIPT PARSING - Streaming parser for Claude Code transcript.jsonl files
// ============================================================================

export type TranscriptMessageType =
  | 'file-history-snapshot'
  | 'progress'
  | 'user'
  | 'assistant'
  | 'tool_use'
  | 'tool_result'
  | 'summary'
  | 'system'

export interface TranscriptContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: unknown
  content?: string
  is_error?: boolean
}

export interface TranscriptMessage {
  type: TranscriptMessageType
  parentUuid?: string | null
  isSidechain?: boolean
  userType?: 'external' | 'internal'
  cwd?: string
  sessionId?: string
  version?: string
  gitBranch?: string
  uuid?: string
  timestamp?: string
  message?: {
    role: 'user' | 'assistant'
    content: string | TranscriptContentBlock[]
  }
  data?: unknown
  toolUseID?: string
  parentToolUseID?: string
  snapshot?: {
    messageId: string
    trackedFileBackups: Record<string, unknown>
    timestamp: string
  }
}

export interface TranscriptStats {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  toolCalls: number
  fileSize: number
  parseTime: number
}

export interface TranscriptParseOptions {
  types?: TranscriptMessageType[]
  limit?: number
  offset?: number
  after?: Date
  before?: Date
  search?: string
}

// ============================================================================
// CONVERSATION BRANCHING - Git-like branching for conversations
// ============================================================================

export type BranchStatus = 'active' | 'merged' | 'abandoned'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'tool-result'
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  parentId?: string // For tracking message tree
}

export interface ConversationBranch {
  id: string
  name: string
  sessionId: string
  parentBranchId: string | null // null for main branch
  branchPointMessageId: string // Message where this branch diverges
  status: BranchStatus
  createdAt: number
  updatedAt: number
  messages: ConversationMessage[] // Messages unique to this branch (after branch point)
  description?: string
  mergedInto?: string // Branch ID if merged
}

export interface BranchTree {
  sessionId: string
  mainBranchId: string
  branches: ConversationBranch[]
}

export interface BranchNode {
  id: string
  name: string
  parentId: string | null
  messageCount: number
  status: BranchStatus
  createdAt: number
  isMainBranch: boolean
  children: BranchNode[]
}

export interface BranchDiff {
  branchA: string
  branchB: string
  commonAncestorId: string
  messagesOnlyInA: ConversationMessage[]
  messagesOnlyInB: ConversationMessage[]
}

export interface BranchMergeParams {
  sourceBranchId: string
  targetBranchId: string
  strategy: 'replace' | 'append' | 'cherry-pick'
  messageIds?: string[] // For cherry-pick strategy
}

export interface BranchCreateParams {
  sessionId: string
  branchPointMessageId: string
  name: string
  description?: string
}

export interface BranchStats {
  totalBranches: number
  activeBranches: number
  mergedBranches: number
  abandonedBranches: number
  avgMessagesPerBranch: number
}

// ============================================================================
// OBSERVABILITY - OpenTelemetry types (deploy-rjvh)
// ============================================================================

export interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId?: string
  traceFlags: number
}

export type SpanAttributeValue = string | number | boolean | string[] | number[] | boolean[]

export interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
  startTime: number
  endTime?: number
  status: { code: 'unset' | 'ok' | 'error'; message?: string }
  attributes: Record<string, SpanAttributeValue>
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, SpanAttributeValue> }>
  links: Array<{ traceId: string; spanId: string; attributes?: Record<string, SpanAttributeValue> }>
}

export interface HistogramMetricData {
  name: string
  count: number
  sum: number
  min: number
  max: number
  avg: number
  buckets: number[]
  counts: number[]
}

export interface ObservabilityMetrics {
  counters: Record<string, number>
  gauges: Record<string, number>
  histograms: Record<string, HistogramMetricData>
}

export interface ObservabilityStats {
  tracesCreated: number
  spansCreated: number
  spansExported: number
  metricsRecorded: number
  errorsRecorded: number
  exportErrors: number
  activeSpans: number
  uptime: number
}

export interface ObservabilityConfig {
  serviceName: string
  serviceVersion: string
  environment: string
  sampleRate: number
  enableAutoInstrumentation: boolean
  maxSpansPerTrace: number
  maxAttributeLength: number
  enabledInstrumentations: string[]
}

// ============================================================================
// TREE-SITTER - Code parsing types (deploy-4u2e)
// ============================================================================

export type CodeSymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'property'
  | 'parameter'
  | 'module'
  | 'namespace'
  | 'import'
  | 'export'

export interface CodeSymbol {
  name: string
  kind: CodeSymbolKind
  filePath: string
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  signature?: string
  docstring?: string
  parent?: string
  children?: string[]
  modifiers?: string[]
  returnType?: string
  parameters?: Array<{ name: string; type?: string; defaultValue?: string }>
}

export interface FileParseResult {
  filePath: string
  language: string
  symbols: CodeSymbol[]
  imports: Array<{ module: string; symbols: string[]; alias?: string; line: number }>
  exports: Array<{ name: string; kind: CodeSymbolKind; line: number }>
  parseTime: number
  errors: Array<{ message: string; line: number; column: number }>
  size: number
  lineCount: number
}

export interface CodebaseIndexStats {
  totalFiles: number
  totalSymbols: number
  byLanguage: Record<string, number>
  byKind: Record<CodeSymbolKind, number>
}

export interface TreeSitterConfig {
  maxFileSize: number
  excludePatterns: string[]
  includeExtensions: string[]
  maxDepth: number
  parallelParsing: boolean
  cacheResults: boolean
}

export interface TreeSitterStats {
  filesParsed: number
  symbolsExtracted: number
  parseErrors: number
  cacheHits: number
  cacheMisses: number
  avgParseTime: number
  indexedProjects: number
}

export interface CodebaseStructureItem {
  path: string
  name: string
  type: 'file' | 'directory'
  language?: string
  symbolCount?: number
  children?: CodebaseStructureItem[]
}

// ============================================================================
// COSMOGRAPH - Large graph visualization types (deploy-6elk)
// ============================================================================

export interface GraphVisualizationNode {
  id: string
  label?: string
  type?: string
  color?: string
  size?: number
  x?: number
  y?: number
  properties?: Record<string, unknown>
}

export interface GraphVisualizationEdge {
  source: string
  target: string
  id?: string
  label?: string
  type?: string
  color?: string
  width?: number
  properties?: Record<string, unknown>
}

export interface GraphVisualizationData {
  nodes: GraphVisualizationNode[]
  edges: GraphVisualizationEdge[]
}

export interface GraphVisualizationConfig {
  nodeSize: number
  nodeColor: string
  nodeLabels: boolean
  edgeWidth: number
  edgeColor: string
  edgeArrows: boolean
  simulation: boolean
  backgroundColor: string
}

// ============================================================================
// AUTO-UPDATE - electron-updater types
// ============================================================================

export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string | null
}

export interface UpdateCheckResult {
  updateAvailable: boolean
  updateInfo?: UpdateInfo
  error?: string
}

export interface UpdateStatus {
  checking: boolean
  downloading: boolean
  downloadProgress?: number
  updateAvailable: boolean
  updateDownloaded: boolean
  currentVersion: string
  latestVersion?: string
  error?: string
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
  // MCP Proxy/Federation (deploy-zebp)
  'mcp:proxy:init': (config?: Partial<MCPProxyConfig>) => Promise<void>
  'mcp:proxy:servers': () => Promise<MCPFederatedServer[]>
  'mcp:proxy:connect': (serverId: string) => Promise<boolean>
  'mcp:proxy:connectAll': () => Promise<void>
  'mcp:proxy:disconnect': (serverId: string) => Promise<void>
  'mcp:proxy:tools': () => Promise<MCPProxyTool[]>
  'mcp:proxy:resources': () => Promise<MCPProxyResource[]>
  'mcp:proxy:prompts': () => Promise<MCPProxyPrompt[]>
  'mcp:proxy:callTool': (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<{ content: unknown; isError?: boolean }>
  'mcp:proxy:stats': () => Promise<MCPProxyStats>
  'mcp:proxy:config': () => Promise<MCPProxyConfig>
  'mcp:proxy:updateConfig': (config: Partial<MCPProxyConfig>) => Promise<void>

  // Memory
  'memory:learnings': (query?: string, limit?: number) => Promise<Learning[]>
  'memory:stats': () => Promise<{
    postgresql: { count: number }
    memgraph: { nodes: number; edges: number }
    qdrant: { vectors: number }
  }>
  'memory:graph': (
    query?: string,
    limit?: number
  ) => Promise<{
    nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
    edges: Array<{
      id: string
      source: string
      target: string
      type: string
      properties: Record<string, unknown>
    }>
  }>
  'memory:vectors': (query: string, limit?: number) => Promise<VectorMemory[]>
  'memory:qdrant:browse': (
    collection?: string,
    limit?: number,
    offset?: string
  ) => Promise<{
    points: Array<{ id: string; payload: Record<string, unknown>; created_at?: string }>
    nextOffset: string | null
  }>
  'memory:qdrant:search': (
    query: string,
    collection?: string,
    limit?: number
  ) => Promise<{
    results: Array<{ id: string; score: number; payload: Record<string, unknown> }>
  }>
  'memory:memgraph:search': (
    keyword: string,
    nodeType?: string,
    limit?: number
  ) => Promise<{
    results: Array<{
      id: string
      label: string
      type: string
      properties: Record<string, unknown>
      score?: number
    }>
  }>
  'memory:raw': (
    source: 'postgresql' | 'memgraph' | 'qdrant',
    query: string
  ) => Promise<{
    success: boolean
    data: unknown
    error?: string
    suggestion?: string
    executionTime: number
  }>
  'memory:unified-search': (
    query: string,
    limit?: number
  ) => Promise<{
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
  'profiles:create': (
    profile: Omit<ClaudeCodeProfile, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<ClaudeCodeProfile | null>
  'profiles:update': (id: string, updates: Partial<ClaudeCodeProfile>) => Promise<boolean>
  'profiles:delete': (id: string) => Promise<boolean>
  'profiles:activate': (id: string) => Promise<boolean>
  'profiles:getActive': () => Promise<string | null>
  'profiles:launch': (
    id: string,
    projectPath?: string
  ) => Promise<{ success: boolean; error?: string }>

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
  'audit:export': (
    format: 'json' | 'csv',
    params?: { startTime?: number; endTime?: number }
  ) => Promise<string>
  // SIEM log shipping (deploy-e1fc)
  'audit:siem:register': (endpoint: SIEMEndpoint) => Promise<void>
  'audit:siem:unregister': (endpointId: string) => Promise<void>
  'audit:siem:setEnabled': (endpointId: string, enabled: boolean) => Promise<void>
  'audit:siem:getEndpoints': () => Promise<SIEMEndpoint[]>
  'audit:siem:getStats': (
    endpointId?: string
  ) => Promise<SIEMShipperStats | Record<string, SIEMShipperStats>>
  'audit:siem:flush': (endpointId?: string) => Promise<boolean>

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

  // pgvector (embeddings)
  'pgvector:status': () => Promise<PgVectorStatus>
  'pgvector:search': (
    query: string,
    table?: string,
    limit?: number,
    threshold?: number
  ) => Promise<PgVectorSearchResult[]>
  'pgvector:embed': (text: string) => Promise<number[] | null>
  'pgvector:collections': () => Promise<PgVectorCollection[]>
  'pgvector:createIndex': (table: string, config: PgVectorIndexConfig) => Promise<boolean>
  'pgvector:rebuildIndex': (table: string) => Promise<boolean>
  'pgvector:vacuum': (table: string) => Promise<boolean>
  'pgvector:getAutoConfig': () => Promise<PgVectorAutoEmbedConfig>
  'pgvector:setAutoConfig': (config: PgVectorAutoEmbedConfig) => Promise<boolean>

  // Predictive context
  'context:predict': (prompt: string, projectPath: string) => Promise<FilePrediction[]>
  'context:patterns': (projectPath: string) => Promise<FileAccessPattern[]>
  'context:stats': () => Promise<PredictiveContextStats>
  'context:recordAccess': (path: string, keywords: string[]) => Promise<void>
  'context:getConfig': () => Promise<PredictiveContextConfig>
  'context:setConfig': (config: PredictiveContextConfig) => Promise<boolean>
  'context:clearCache': () => Promise<boolean>

  // Transcript parsing
  'transcript:parse': (
    filePath: string,
    options?: TranscriptParseOptions
  ) => Promise<TranscriptMessage[]>
  'transcript:stats': (filePath: string) => Promise<TranscriptStats>
  'transcript:last': (filePath: string, count: number) => Promise<TranscriptMessage[]>
  'transcript:watch': (filePath: string, enable: boolean) => Promise<boolean>

  // Plans (autonomous execution)
  'plans:list': (projectPath?: string) => Promise<Plan[]>
  'plans:get': (id: string) => Promise<Plan | null>
  'plans:create': (params: PlanCreateParams) => Promise<Plan>
  'plans:update': (id: string, updates: Partial<Plan>) => Promise<boolean>
  'plans:delete': (id: string) => Promise<boolean>
  'plans:execute': (id: string) => Promise<boolean>
  'plans:pause': (id: string) => Promise<boolean>
  'plans:resume': (id: string) => Promise<boolean>
  'plans:cancel': (id: string) => Promise<boolean>
  'plans:stepComplete': (planId: string, stepId: string, output?: string) => Promise<boolean>
  'plans:stepFail': (planId: string, stepId: string, error: string) => Promise<boolean>
  'plans:stats': () => Promise<PlanExecutionStats>

  // Branches (conversation branching)
  'branches:list': (sessionId: string) => Promise<ConversationBranch[]>
  'branches:get': (branchId: string) => Promise<ConversationBranch | null>
  'branches:getTree': (sessionId: string) => Promise<BranchTree | null>
  'branches:create': (params: BranchCreateParams) => Promise<ConversationBranch | null>
  'branches:delete': (branchId: string) => Promise<boolean>
  'branches:rename': (branchId: string, name: string) => Promise<boolean>
  'branches:switch': (branchId: string) => Promise<boolean>
  'branches:addMessage': (branchId: string, message: ConversationMessage) => Promise<boolean>
  'branches:diff': (branchA: string, branchB: string) => Promise<BranchDiff | null>
  'branches:merge': (params: BranchMergeParams) => Promise<boolean>
  'branches:abandon': (branchId: string) => Promise<boolean>
  'branches:stats': (sessionId?: string) => Promise<BranchStats>
  'branches:getActiveBranch': (sessionId: string) => Promise<string | null>

  // System helpers
  'system:getHomePath': () => Promise<string>

  // Shell operations
  'shell:openPath': (path: string) => Promise<string>
  'shell:openExternal': (url: string) => Promise<void>

  // Dialog operations
  'dialog:openDirectory': () => Promise<string | null>

  // Terminal operations
  'terminal:openAt': (path: string) => Promise<boolean>

  // Auto-update (electron-updater)
  'update:check': () => Promise<UpdateCheckResult>
  'update:download': () => Promise<boolean>
  'update:install': () => Promise<void>
  'update:getStatus': () => Promise<UpdateStatus>

  // Observability - OpenTelemetry (deploy-rjvh)
  'observability:init': (config?: Partial<ObservabilityConfig>) => Promise<void>
  'observability:startTrace': (
    name: string,
    attributes?: Record<string, SpanAttributeValue>
  ) => Promise<TraceContext>
  'observability:startSpan': (
    name: string,
    kind?: 'internal' | 'server' | 'client' | 'producer' | 'consumer',
    attributes?: Record<string, SpanAttributeValue>
  ) => Promise<string>
  'observability:endSpan': (
    spanId: string,
    status?: { code: 'unset' | 'ok' | 'error'; message?: string },
    attributes?: Record<string, SpanAttributeValue>
  ) => Promise<void>
  'observability:recordException': (spanId: string, error: { name: string; message: string; stack?: string }) => Promise<void>
  'observability:addEvent': (spanId: string, name: string, attributes?: Record<string, SpanAttributeValue>) => Promise<void>
  'observability:getMetrics': () => Promise<ObservabilityMetrics>
  'observability:getStats': () => Promise<ObservabilityStats>
  'observability:getConfig': () => Promise<ObservabilityConfig>
  'observability:updateConfig': (config: Partial<ObservabilityConfig>) => Promise<void>
  'observability:recordMetric': (
    name: string,
    value: number,
    type: 'counter' | 'gauge' | 'histogram',
    attributes?: Record<string, string>
  ) => Promise<void>
  'observability:getActiveSpans': () => Promise<SpanData[]>
  'observability:getRecentSpans': (limit?: number) => Promise<SpanData[]>

  // Tree-sitter - Code parsing (deploy-4u2e)
  'treesitter:init': (config?: Partial<TreeSitterConfig>) => Promise<void>
  'treesitter:parseFile': (filePath: string) => Promise<FileParseResult | null>
  'treesitter:indexCodebase': (rootPath: string) => Promise<CodebaseIndexStats>
  'treesitter:searchSymbols': (
    query: string,
    options?: {
      kind?: CodeSymbolKind
      rootPath?: string
      limit?: number
      caseSensitive?: boolean
    }
  ) => Promise<CodeSymbol[]>
  'treesitter:findDefinition': (symbolName: string, rootPath?: string) => Promise<CodeSymbol | null>
  'treesitter:findReferences': (symbolName: string, rootPath?: string) => Promise<CodeSymbol[]>
  'treesitter:getFileOutline': (filePath: string) => Promise<CodeSymbol[]>
  'treesitter:getCodebaseStructure': (rootPath: string) => Promise<CodebaseStructureItem[]>
  'treesitter:clearCache': (filePath?: string) => Promise<void>
  'treesitter:clearIndex': (rootPath: string) => Promise<void>
  'treesitter:getStats': () => Promise<TreeSitterStats>
  'treesitter:getConfig': () => Promise<TreeSitterConfig>
  'treesitter:updateConfig': (config: Partial<TreeSitterConfig>) => Promise<void>
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
    query: (
      params?: Parameters<IPCChannels['audit:query']>[0]
    ) => ReturnType<IPCChannels['audit:query']>
    getStats: () => ReturnType<IPCChannels['audit:stats']>
    export: (
      format: 'json' | 'csv',
      params?: { startTime?: number; endTime?: number }
    ) => Promise<string>
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
  pgvector: {
    getStatus: () => ReturnType<IPCChannels['pgvector:status']>
    search: (
      query: string,
      table?: string,
      limit?: number,
      threshold?: number
    ) => ReturnType<IPCChannels['pgvector:search']>
    embed: (text: string) => ReturnType<IPCChannels['pgvector:embed']>
    getCollections: () => ReturnType<IPCChannels['pgvector:collections']>
    createIndex: (
      table: string,
      config: PgVectorIndexConfig
    ) => ReturnType<IPCChannels['pgvector:createIndex']>
    rebuildIndex: (table: string) => ReturnType<IPCChannels['pgvector:rebuildIndex']>
    vacuum: (table: string) => ReturnType<IPCChannels['pgvector:vacuum']>
    getAutoConfig: () => ReturnType<IPCChannels['pgvector:getAutoConfig']>
    setAutoConfig: (
      config: PgVectorAutoEmbedConfig
    ) => ReturnType<IPCChannels['pgvector:setAutoConfig']>
  }
  predictiveContext: {
    predict: (prompt: string, projectPath: string) => ReturnType<IPCChannels['context:predict']>
    getPatterns: (projectPath: string) => ReturnType<IPCChannels['context:patterns']>
    getStats: () => ReturnType<IPCChannels['context:stats']>
    recordAccess: (
      path: string,
      keywords: string[]
    ) => ReturnType<IPCChannels['context:recordAccess']>
    getConfig: () => ReturnType<IPCChannels['context:getConfig']>
    setConfig: (config: PredictiveContextConfig) => ReturnType<IPCChannels['context:setConfig']>
    clearCache: () => ReturnType<IPCChannels['context:clearCache']>
  }
  plans: {
    list: (projectPath?: string) => ReturnType<IPCChannels['plans:list']>
    get: (id: string) => ReturnType<IPCChannels['plans:get']>
    create: (params: PlanCreateParams) => ReturnType<IPCChannels['plans:create']>
    update: (id: string, updates: Partial<Plan>) => ReturnType<IPCChannels['plans:update']>
    delete: (id: string) => ReturnType<IPCChannels['plans:delete']>
    execute: (id: string) => ReturnType<IPCChannels['plans:execute']>
    pause: (id: string) => ReturnType<IPCChannels['plans:pause']>
    resume: (id: string) => ReturnType<IPCChannels['plans:resume']>
    cancel: (id: string) => ReturnType<IPCChannels['plans:cancel']>
    stepComplete: (
      planId: string,
      stepId: string,
      output?: string
    ) => ReturnType<IPCChannels['plans:stepComplete']>
    stepFail: (
      planId: string,
      stepId: string,
      error: string
    ) => ReturnType<IPCChannels['plans:stepFail']>
    getStats: () => ReturnType<IPCChannels['plans:stats']>
  }
  transcript: {
    parse: (
      filePath: string,
      options?: TranscriptParseOptions
    ) => ReturnType<IPCChannels['transcript:parse']>
    stats: (filePath: string) => ReturnType<IPCChannels['transcript:stats']>
    last: (filePath: string, count: number) => ReturnType<IPCChannels['transcript:last']>
    watch: (filePath: string, enable: boolean) => ReturnType<IPCChannels['transcript:watch']>
  }
  branches: {
    list: (sessionId: string) => ReturnType<IPCChannels['branches:list']>
    get: (branchId: string) => ReturnType<IPCChannels['branches:get']>
    getTree: (sessionId: string) => ReturnType<IPCChannels['branches:getTree']>
    create: (params: BranchCreateParams) => ReturnType<IPCChannels['branches:create']>
    delete: (branchId: string) => ReturnType<IPCChannels['branches:delete']>
    rename: (branchId: string, name: string) => ReturnType<IPCChannels['branches:rename']>
    switch: (branchId: string) => ReturnType<IPCChannels['branches:switch']>
    addMessage: (
      branchId: string,
      message: ConversationMessage
    ) => ReturnType<IPCChannels['branches:addMessage']>
    diff: (branchA: string, branchB: string) => ReturnType<IPCChannels['branches:diff']>
    merge: (params: BranchMergeParams) => ReturnType<IPCChannels['branches:merge']>
    abandon: (branchId: string) => ReturnType<IPCChannels['branches:abandon']>
    getStats: (sessionId?: string) => ReturnType<IPCChannels['branches:stats']>
    getActiveBranch: (sessionId: string) => ReturnType<IPCChannels['branches:getActiveBranch']>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    claude: ClaudeAPI
  }
}
