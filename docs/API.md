# IPC API Reference

Complete reference for all IPC channels available in Claude Pilot.

## Using the API

### From Renderer Process

```typescript
// Invoke (request/response)
const result = await window.electron.invoke('channel:name', arg1, arg2)

// Listen for events
window.electron.on('channel:event', (data) => {
  console.log('Event received:', data)
})

// Remove listener
window.electron.off('channel:event', handler)
```

### Response Format

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string, severity: string } }
```

---

## System Channels

### `system:status`

Get current system status.

**Returns:** `SystemStatus`

```typescript
interface SystemStatus {
  claude: {
    version: string
    running: boolean
    sessions: number
  }
  mcp: {
    enabled: number
    disabled: number
    total: number
  }
  memory: {
    postgresql: boolean
    memgraph: boolean
    qdrant: boolean
  }
}
```

### `system:resources`

Get current resource usage.

**Returns:** `ResourceUsage`

```typescript
interface ResourceUsage {
  cpu: number // 0-100 percentage
  memory: {
    used: number // bytes
    total: number
    percent: number
  }
  disk: {
    used: number
    total: number
    percent: number
  }
}
```

### `system:gpu`

Get GPU status (NVIDIA only).

**Returns:** `GPUUsage | null`

```typescript
interface GPUUsage {
  name: string
  utilization: number // 0-100
  memoryUsed: number // MB
  memoryTotal: number // MB
  temperature: number // Celsius
  fanSpeed?: number // 0-100
  powerDraw?: number // Watts
}
```

---

## Claude Channels

### `claude:version`

Get installed Claude Code version.

**Returns:** `string`

### `claude:projects`

List Claude Code projects.

**Returns:** `ClaudeProject[]`

```typescript
interface ClaudeProject {
  path: string
  name: string
  hasClaudeMd: boolean
  lastAccess: number
  sessionCount: number
}
```

---

## MCP Channels

### `mcp:list`

List all MCP servers.

**Returns:** `MCPServer[]`

```typescript
interface MCPServer {
  name: string
  enabled: boolean
  type: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}
```

### `mcp:toggle`

Enable or disable an MCP server.

**Parameters:**

- `name: string` - Server name
- `enabled: boolean` - New state

**Returns:** `boolean` - Success

### `mcp:getConfig`

Get raw MCP configuration JSON.

**Returns:** `string` - JSON content

### `mcp:saveConfig`

Save MCP configuration.

**Parameters:**

- `content: string` - JSON content

**Returns:** `boolean` - Success

---

## Memory Channels

### `memory:learnings`

Query learnings from PostgreSQL.

**Parameters:**

- `query?: string` - Search term
- `limit?: number` - Max results (default: 50)

**Returns:** `Learning[]`

```typescript
interface Learning {
  id: number
  content: string
  category?: string
  tags?: string[]
  created_at: Date
  updated_at?: Date
}
```

### `memory:stats`

Get memory system statistics.

**Returns:** `MemoryStats`

```typescript
interface MemoryStats {
  postgresql: { count: number; connected: boolean }
  memgraph: { nodes: number; edges: number; connected: boolean }
  qdrant: { vectors: number; connected: boolean }
}
```

### `memory:raw`

Execute raw query against a memory source.

**Parameters:**

```typescript
{
  source: 'postgresql' | 'memgraph' | 'qdrant'
  query: string
  params?: unknown[]
}
```

**Returns:** Query results (format depends on source)

### `memory:unified-search`

Search across all memory sources with RRF.

**Parameters:**

- `query: string` - Search term
- `limit?: number` - Max results per source

**Returns:** `UnifiedSearchResult[]`

```typescript
interface UnifiedSearchResult {
  id: string
  source: 'postgresql' | 'memgraph' | 'qdrant'
  content: string
  score: number
  metadata?: Record<string, unknown>
}
```

---

## Profile Channels

### `profile:list`

List all profiles.

**Returns:** `ClaudeCodeProfile[]`

```typescript
interface ClaudeCodeProfile {
  id: string
  name: string
  path: string
  hasClaudeMd: boolean
  isActive: boolean
}
```

### `profile:get`

Get profile details.

**Parameters:**

- `id: string` - Profile ID

**Returns:** `ClaudeCodeProfile`

### `profile:create`

Create a new profile.

**Parameters:**

```typescript
{
  name: string
  basedOn?: string  // Copy from existing profile
}
```

**Returns:** `ClaudeCodeProfile`

### `profile:activate`

Activate a profile.

**Parameters:**

- `id: string` - Profile ID

**Returns:** `boolean`

### `profile:getRules`

Get profile rules.

**Parameters:**

- `profileId: string`

**Returns:** `ClaudeRule[]`

```typescript
interface ClaudeRule {
  id: string
  name: string
  content: string
  type: 'always' | 'auto-attached' | 'disabled'
  createdAt: Date
}
```

### `profile:saveRule`

Create or update a rule.

**Parameters:**

```typescript
{
  profileId: string
  rule: Partial<ClaudeRule>
}
```

**Returns:** `ClaudeRule`

---

## Credential Channels

### `credentials:store`

Store a credential securely.

**Parameters:**

- `key: string` - Credential identifier
- `value: string` - Secret value

**Returns:** `boolean`

### `credentials:retrieve`

Retrieve a credential.

**Parameters:**

- `key: string` - Credential identifier

**Returns:** `string | null`

### `credentials:delete`

Delete a credential.

**Parameters:**

- `key: string` - Credential identifier

**Returns:** `boolean`

### `credentials:list`

List all credential keys.

**Returns:** `string[]`

### `credentials:isEncryptionAvailable`

Check if OS encryption is available.

**Returns:** `boolean`

---

## Terminal Channels

### `terminal:create`

Create a new terminal session.

**Parameters:**

```typescript
{
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string>
}
```

**Returns:** `string` - Session ID

### `terminal:write`

Write to terminal.

**Parameters:**

- `sessionId: string`
- `data: string`

**Returns:** `void`

### `terminal:resize`

Resize terminal.

**Parameters:**

- `sessionId: string`
- `cols: number`
- `rows: number`

**Returns:** `void`

### `terminal:close`

Close terminal session.

**Parameters:**

- `sessionId: string`

**Returns:** `void`

---

## Session Channels

### `session:list`

List Claude Code sessions.

**Returns:** `SessionSummary[]`

```typescript
interface SessionSummary {
  id: string
  project: string
  startTime: number
  messageCount: number
  tokenUsage?: TokenUsage
  isActive: boolean
}
```

### `session:messages`

Get messages from a session.

**Parameters:**

- `sessionId: string`
- `limit?: number`
- `offset?: number`

**Returns:** `SessionMessage[]`

### `session:stats`

Get session statistics.

**Parameters:**

- `sessionId: string`

**Returns:** `SessionStats`

---

## Transcript Channels

### `transcript:parse`

Parse a transcript file.

**Parameters:**

```typescript
{
  filePath: string
  options?: {
    types?: TranscriptMessageType[]
    limit?: number
    after?: number
    before?: number
    search?: string
  }
}
```

**Returns:** `TranscriptMessage[]`

### `transcript:stats`

Get transcript statistics.

**Parameters:**

- `filePath: string`

**Returns:** `TranscriptStats`

```typescript
interface TranscriptStats {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  toolCalls: number
  fileSize: number
  parseTime: number
}
```

### `transcript:lastMessages`

Get last N messages efficiently.

**Parameters:**

- `filePath: string`
- `count: number`

**Returns:** `TranscriptMessage[]`

---

## Service Channels

### `services:systemd`

List systemd services.

**Returns:** `SystemdService[]`

```typescript
interface SystemdService {
  name: string
  loadState: string
  activeState: string
  subState: string
}
```

### `services:systemdAction`

Perform action on systemd service.

**Parameters:**

- `name: string` - Service name
- `action: 'start' | 'stop' | 'restart'`

**Returns:** `boolean`

### `services:podman`

List Podman containers.

**Returns:** `PodmanContainer[]`

### `services:podmanAction`

Perform action on container.

**Parameters:**

- `id: string` - Container ID
- `action: 'start' | 'stop' | 'restart'`

**Returns:** `boolean`

---

## Ollama Channels

### `ollama:status`

Get Ollama status.

**Returns:** `OllamaStatus`

```typescript
interface OllamaStatus {
  available: boolean
  version?: string
  models: OllamaModel[]
  running: OllamaRunningModel[]
}
```

### `ollama:pull`

Download a model.

**Parameters:**

- `model: string` - Model name (e.g., "llama2:7b")

**Returns:** `boolean`

### `ollama:delete`

Delete a model.

**Parameters:**

- `model: string`

**Returns:** `boolean`

### `ollama:run`

Load a model for inference.

**Parameters:**

- `model: string`

**Returns:** `boolean`

---

## Audit Channels

### `audit:query`

Query audit events.

**Parameters:**

```typescript
{
  startTime?: number
  endTime?: number
  category?: EventCategory
  activity?: ActivityType
  targetType?: string
  limit?: number
  offset?: number
}
```

**Returns:** `AuditEvent[]`

### `audit:stats`

Get audit statistics.

**Returns:** `AuditStats`

```typescript
interface AuditStats {
  totalEvents: number
  eventsByCategory: Record<string, number>
  eventsByActivity: Record<string, number>
  last24hCount: number
  dbSizeMB: number
}
```

---

## Beads Channels

### `beads:list`

List beads (issues).

**Parameters:**

```typescript
{
  status?: 'open' | 'closed' | 'in_progress'
  type?: 'bug' | 'feature' | 'task' | 'epic'
  priority?: number
  limit?: number
}
```

**Returns:** `Bead[]`

### `beads:create`

Create a new bead.

**Parameters:**

```typescript
{
  title: string
  type: 'bug' | 'feature' | 'task' | 'epic'
  priority?: number
  description?: string
}
```

**Returns:** `Bead`

### `beads:update`

Update a bead.

**Parameters:**

```typescript
{
  id: string
  updates: Partial<Bead>
}
```

**Returns:** `Bead`

### `beads:close`

Close a bead.

**Parameters:**

- `id: string`
- `reason?: string`

**Returns:** `boolean`

### `beads:stats`

Get beads statistics.

**Returns:** `BeadStats`

---

## Event Channels

### `terminal:data`

Terminal output data.

**Payload:** `{ sessionId: string, data: string }`

### `session:update`

Session state changed.

**Payload:** `SessionSummary`

### `system:status-update`

System status changed.

**Payload:** `SystemStatus`

### `mcp:status-update`

MCP server status changed.

**Payload:** `{ name: string, status: 'connected' | 'disconnected' | 'error' }`
