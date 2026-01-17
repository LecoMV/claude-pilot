# Architecture Overview

Claude Pilot follows Electron's multi-process architecture with strict security boundaries between main and renderer processes.

## Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN PROCESS                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Services   │  │    IPC      │  │      Node.js APIs       │  │
│  │ - Audit     │  │  Handlers   │  │ - fs, child_process     │  │
│  │ - Postgres  │  │  (103+)     │  │ - crypto, os            │  │
│  │ - Memgraph  │  │             │  │ - safeStorage           │  │
│  │ - Terminal  │  │             │  │                         │  │
│  │ - Transcript│  │             │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ contextBridge (IPC)
┌─────────────────────────────▼───────────────────────────────────┐
│                       PRELOAD SCRIPT                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Channel Whitelist → Typed API → contextBridge.exposeInWorld ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────┬───────────────────────────────────┘
                              │ window.electron / window.claude
┌─────────────────────────────▼───────────────────────────────────┐
│                      RENDERER PROCESS                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   React     │  │   Zustand   │  │     Components          │  │
│  │   19.x      │  │   Stores    │  │ - Dashboard             │  │
│  │             │  │             │  │ - Memory Browser        │  │
│  │             │  │             │  │ - MCP Manager           │  │
│  │             │  │             │  │ - Terminal              │  │
│  │             │  │             │  │ - Settings              │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── main/                           # Main Process (Node.js)
│   ├── index.ts                    # Entry point, window creation
│   ├── ipc/
│   │   └── handlers.ts             # 103+ IPC handlers (4900+ lines)
│   ├── services/
│   │   ├── audit.ts                # OCSF audit logging
│   │   ├── credentials.ts          # OS keychain integration
│   │   ├── memgraph.ts             # Cypher query execution
│   │   ├── postgresql.ts           # SQL query execution
│   │   ├── terminal.ts             # PTY management
│   │   ├── transcript.ts           # JSONL parsing/streaming
│   │   ├── watchdog.ts             # Process monitoring
│   │   ├── predictive-context.ts   # Context prediction
│   │   ├── plans.ts                # Plan file management
│   │   └── branches.ts             # Git branch tracking
│   └── utils/
│       ├── error-handler.ts        # Global error handling
│       └── ipc-error-handler.ts    # IPC-specific error wrapper
│
├── renderer/                       # Renderer Process (React)
│   ├── App.tsx                     # Root component with routing
│   ├── main.tsx                    # React entry point
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        # Main layout container
│   │   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   │   └── Header.tsx          # Top header bar
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx       # Main dashboard view
│   │   │   ├── SystemStatus.tsx    # Health indicators
│   │   │   ├── ResourceMonitor.tsx # CPU/Memory/GPU charts
│   │   │   └── ActiveSessions.tsx  # Running session list
│   │   ├── mcp/
│   │   │   ├── MCPManager.tsx      # MCP server list
│   │   │   ├── MCPCard.tsx         # Individual server card
│   │   │   └── MCPConfig.tsx       # JSON config editor
│   │   ├── memory/
│   │   │   ├── MemoryBrowser.tsx   # Unified search UI
│   │   │   ├── GraphViewer.tsx     # Cytoscape graph view
│   │   │   ├── GlobalSearch.tsx    # Cross-database search
│   │   │   └── PgVectorPanel.tsx   # Vector embeddings view
│   │   ├── profiles/
│   │   │   ├── ProfileManager.tsx  # Profile list/switcher
│   │   │   ├── ProfileEditor.tsx   # CLAUDE.md editor
│   │   │   └── RuleEditor.tsx      # Rules configuration
│   │   ├── terminal/
│   │   │   ├── Terminal.tsx        # xterm.js container
│   │   │   └── TerminalTabs.tsx    # Multi-tab terminal
│   │   ├── context/
│   │   │   ├── ContextDashboard.tsx# Session context view
│   │   │   ├── PredictiveContextPanel.tsx
│   │   │   └── SmartCompactionPanel.tsx
│   │   ├── beads/
│   │   │   └── BeadsPanel.tsx      # Work tracking integration
│   │   ├── settings/
│   │   │   └── Settings.tsx        # App configuration
│   │   └── common/
│   │       ├── ErrorBoundary.tsx   # React error boundary
│   │       ├── LoadingSpinner.tsx  # Async loading state
│   │       └── StatusBadge.tsx     # Status indicators
│   ├── stores/                     # Zustand state stores
│   │   ├── system.ts               # System status
│   │   ├── mcp.ts                  # MCP servers
│   │   ├── memory.ts               # Memory queries
│   │   ├── profile.ts              # Profiles/rules
│   │   ├── context.ts              # Session context
│   │   ├── terminal.ts             # Terminal state
│   │   ├── agents.ts               # Claude Flow agents
│   │   ├── ollama.ts               # Ollama models
│   │   ├── services.ts             # Systemd/Podman
│   │   ├── chat.ts                 # Chat interface
│   │   ├── logs.ts                 # Log viewer
│   │   └── errors.ts               # Error tracking
│   ├── hooks/                      # Custom React hooks
│   └── lib/                        # Utility functions
│
├── preload/                        # Preload Script
│   └── index.ts                    # Context bridge setup
│
└── shared/                         # Shared between processes
    ├── types.ts                    # TypeScript interfaces
    ├── errors.ts                   # Error classes
    └── validation.ts               # Input validation schemas
```

## Data Flow

### IPC Communication Pattern

```typescript
// Renderer → Main (invoke/handle)
const result = await window.electron.invoke('memory:learnings', { limit: 50 })

// Main → Renderer (send/on)
mainWindow.webContents.send('system:status-update', status)

// Renderer listener
window.electron.on('system:status-update', (status) => {
  updateStore(status)
})
```

### Channel Categories

| Prefix          | Purpose                  | Example Channels                            |
| --------------- | ------------------------ | ------------------------------------------- |
| `system:*`      | System status, resources | `system:status`, `system:gpu`               |
| `claude:*`      | Claude Code operations   | `claude:projects`, `claude:version`         |
| `mcp:*`         | MCP server management    | `mcp:list`, `mcp:toggle`, `mcp:saveConfig`  |
| `memory:*`      | Database queries         | `memory:learnings`, `memory:raw`            |
| `terminal:*`    | PTY operations           | `terminal:create`, `terminal:write`         |
| `profile:*`     | Profile management       | `profile:list`, `profile:saveRule`          |
| `credentials:*` | Secure storage           | `credentials:store`, `credentials:retrieve` |
| `audit:*`       | Audit logging            | `audit:query`, `audit:stats`                |
| `services:*`    | Systemd/Podman           | `services:systemd`, `services:podmanAction` |
| `ollama:*`      | Model management         | `ollama:status`, `ollama:pull`              |
| `beads:*`       | Work tracking            | `beads:list`, `beads:create`                |
| `session:*`     | Session analysis         | `session:list`, `session:messages`          |
| `transcript:*`  | Transcript parsing       | `transcript:parse`, `transcript:stats`      |

## Security Architecture

### Defense in Depth

1. **Process Isolation**: Main process handles all filesystem/network access
2. **Context Bridge**: Only whitelisted channels exposed to renderer
3. **Input Validation**: All IPC payloads validated before processing
4. **Credential Protection**: OS keychain via safeStorage API
5. **Audit Trail**: All security-sensitive operations logged

### Preload Channel Whitelist

```typescript
const ALLOWED_CHANNELS = [
  // Explicitly whitelisted channels only
  'system:status',
  'memory:learnings',
  'mcp:list',
  // ... 100+ channels
]

// Validation before every IPC call
function validateChannel(channel: string): boolean {
  return ALLOWED_CHANNELS.includes(channel)
}
```

## State Management

### Zustand Store Pattern

```typescript
// stores/memory.ts
interface MemoryStore {
  learnings: Learning[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchLearnings: (query?: string) => Promise<void>
  clearError: () => void
}

export const useMemoryStore = create<MemoryStore>((set) => ({
  learnings: [],
  isLoading: false,
  error: null,

  fetchLearnings: async (query) => {
    set({ isLoading: true })
    try {
      const result = await window.electron.invoke('memory:learnings', query)
      set({ learnings: result, isLoading: false })
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false })
    }
  },

  clearError: () => set({ error: null }),
}))
```

## Error Handling

### Error Class Hierarchy

```
AppError (base)
├── IPCError        - IPC communication failures
├── DatabaseError   - PostgreSQL, Memgraph, Qdrant errors
├── FilesystemError - File read/write failures
├── NetworkError    - HTTP/API errors
├── ProcessError    - Subprocess failures
├── ValidationError - Input validation failures
└── UIError         - React component errors
```

### Error Response Pattern

```typescript
interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    severity: 'critical' | 'error' | 'warning' | 'info'
    category: string
  }
}
```

## Database Connections

### PostgreSQL (Learnings)

```typescript
// Connection pool configuration
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: process.env.POSTGRES_DB || 'claude_memory',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  max: 10, // Pool size
})
```

### Memgraph (Knowledge Graph)

```typescript
// Neo4j driver for Cypher queries
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('', ''), {
  maxConnectionLifetime: 30 * 60 * 1000,
})
```

### Qdrant (Vector Search)

```typescript
// REST API integration
const qdrantClient = {
  baseUrl: 'http://localhost:6333',
  collections: ['mem0_memories'],
}
```

## Performance Optimizations

### Transcript Reverse Reading

For multi-GB transcript files, efficient reverse reading:

```typescript
// Read 64KB chunks from end of file
const CHUNK_SIZE = 64 * 1024

async function getLastMessages(filePath: string, count: number) {
  // Small files: stream normally
  if (fileSize < 1_000_000) {
    return streamForward(filePath, count)
  }

  // Large files: read from end in chunks
  return readReverse(filePath, count)
}
```

### IPC Batching

Multiple related requests batched into single IPC call:

```typescript
// Instead of 5 separate calls
const [status, memory, mcp, sessions, gpu] = await Promise.all([
  invoke('system:status'),
  invoke('memory:stats'),
  invoke('mcp:list'),
  invoke('session:list'),
  invoke('system:gpu'),
])
```

## Testing Architecture

### Test Categories

| Type        | Framework       | Location                  | Coverage Target |
| ----------- | --------------- | ------------------------- | --------------- |
| Unit        | Vitest          | `src/__tests__/`          | 80%             |
| Component   | Testing Library | `src/__tests__/renderer/` | 70%             |
| Integration | Vitest + mocks  | `src/__tests__/main/`     | 60%             |
| E2E         | Playwright      | `e2e/`                    | Critical paths  |

### Mock Strategy

```typescript
// Main process mocks (setup.ts)
vi.mock('electron', () => ({
  app: { getPath: vi.fn(), getVersion: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { encryptString: vi.fn(), decryptString: vi.fn() },
}))

// Database mocks
vi.mock('pg', () => ({
  Pool: vi.fn(() => createMockPool()),
}))
```
