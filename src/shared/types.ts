// Shared type definitions between main and renderer processes

// System status types
export interface SystemStatus {
  claude: ServiceStatus
  mcp: MCPStatus
  memory: MemoryStatus
  resources: ResourceUsage
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
}

export interface DiskUsage {
  used: number
  total: number
  claudeData: number
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

  // Memory
  'memory:learnings': (query?: string, limit?: number) => Promise<Learning[]>
  'memory:stats': () => Promise<{
    postgresql: { count: number }
    memgraph: { nodes: number; edges: number }
    qdrant: { vectors: number }
  }>
  'memory:graph': (query: string) => Promise<KnowledgeNode[]>
  'memory:vectors': (query: string, limit?: number) => Promise<VectorMemory[]>

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
