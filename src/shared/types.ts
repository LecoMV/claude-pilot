// Shared type definitions between main and renderer processes

// System status types
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

// Profile types
export interface ProfileSettings {
  model?: string
  maxTokens?: number
  thinkingEnabled?: boolean
  thinkingBudget?: number
}

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

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
