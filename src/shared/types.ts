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
