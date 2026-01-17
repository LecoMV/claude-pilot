# Claude Pilot - Comprehensive Implementation Plan

> Generated: 2026-01-16 | Status: **Active**
> Based on: Research Brief Analysis, Research Plan, Codebase Scan

## Executive Summary

Claude Pilot is a professional Electron-based GUI for Claude Code CLI with 69 TypeScript files, 229 passing tests, and clean type-checking. The current implementation provides a functional prototype but has **critical security vulnerabilities** (39 `execSync` calls with shell injection risk) and missing enterprise features identified in the research documents.

---

## Current State Assessment

### What Works (Implemented)
| Component | Status | Notes |
|-----------|--------|-------|
| Dashboard | ✅ Complete | System status, GPU, services monitoring |
| Memory Browser | ✅ Complete | Unified federated search (PostgreSQL, Memgraph, Qdrant) |
| Session Manager | ✅ Complete | External session discovery with process info |
| MCP Manager | ✅ Complete | Server list, toggle enable/disable, config editor |
| Profile Manager | ✅ Complete | Claude profiles, rules management |
| Terminal | ✅ Complete | xterm.js + node-pty integration |
| Command Palette | ✅ Complete | Ctrl+K navigation |
| Settings | ✅ Complete | Theme, fonts, database connections |
| Services Manager | ✅ Complete | Systemd + Podman container control |
| Logs Viewer | ✅ Complete | Real-time streaming logs |
| Ollama Manager | ✅ Complete | Model management |
| Agent Canvas | ✅ Partial | Claude Flow visualization (basic) |
| Chat Interface | ✅ Partial | Direct Claude chat (basic) |
| Graph Viewer | ✅ Complete | Cytoscape.js knowledge graph |

### What's Broken (Security Critical)
| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| Shell Injection via execSync | **CRITICAL** | `handlers.ts` (39 calls) | Full RCE via malicious input |
| Credentials in Environment | **HIGH** | `handlers.ts` line 43-50 | Password exposure in process list |
| Generic IPC Bridge | **MEDIUM** | `preload/index.ts` | Renderer can invoke any channel |
| unsafe-inline CSP | **MEDIUM** | `main/index.ts` line 22 | XSS vector in styles |

### What's Missing (Enterprise Features)
| Feature | Priority | Bead ID | Notes |
|---------|----------|---------|-------|
| node-postgres migration | P0 | - | Replace all execSync psql calls |
| safeStorage credentials | P0 | - | OS-level credential encryption |
| GPU Monitoring Panel | P2 | deploy-2b52 | Temperature, VRAM, utilization graphs |
| Watchdog Auto-Recovery | P2 | deploy-0k8i | Service health monitoring + restart |
| pgvector Embeddings | P2 | deploy-jaf1 | Semantic search in PostgreSQL |
| Beads Integration | P2 | deploy-101e | Work tracking in-app |
| Session Transcript Viewer | P3 | deploy-r9f1 | Full conversation history |
| OCSF Audit Logging | P2 | - | SOC 2 compliance |

---

## Phase 1: Security Hardening (P0 - Critical)

### 1.1 PostgreSQL Native Driver Migration
**Goal**: Eliminate all 39 `execSync` shell calls with native `node-postgres` (pg) driver

**Files to Modify**:
- `src/main/ipc/handlers.ts` - Replace psql execSync with pg Pool
- `package.json` - Add `pg` dependency

**Implementation**:
```typescript
// NEW: src/main/services/postgresql.ts
import { Pool, PoolConfig } from 'pg'

class PostgresService {
  private pool: Pool | null = null

  async connect(config: PoolConfig): Promise<boolean> {
    this.pool = new Pool({
      ...config,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
    await this.pool.query('SELECT 1') // verify
    return true
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected')
    const result = await this.pool.query(sql, params)
    return result.rows
  }
}
```

**Migration Checklist**:
- [ ] Install `pg` and `@types/pg`
- [ ] Create `src/main/services/postgresql.ts`
- [ ] Replace `buildPsqlCommand()` usage (handlers.ts:53-65)
- [ ] Replace `memory:learnings` handler (execSync → pool.query)
- [ ] Replace `memory:stats` handler
- [ ] Replace `memory:raw` PostgreSQL handler
- [ ] Replace `memory:unified-search` PostgreSQL part
- [ ] Add connection pooling with proper lifecycle
- [ ] Use parameterized queries ($1, $2) everywhere
- [ ] Add connection error handling and retry logic

**Estimated LOC Change**: -200 lines (remove shell helpers), +300 lines (native driver)

### 1.2 Credential Encryption with safeStorage
**Goal**: Store database passwords encrypted at rest using OS keychain

**Files to Modify**:
- `src/main/services/credentials.ts` (NEW)
- `src/main/index.ts` - Initialize on app ready
- `src/main/ipc/handlers.ts` - Use credential service

**Implementation**:
```typescript
// NEW: src/main/services/credentials.ts
import { safeStorage } from 'electron'
import Store from 'electron-store'

class CredentialService {
  private store = new Store({ name: 'credentials' })

  store(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available')
    }
    const encrypted = safeStorage.encryptString(value)
    this.store.set(key, encrypted.toString('hex'))
  }

  retrieve(key: string): string | null {
    const hex = this.store.get(key) as string | undefined
    if (!hex) return null
    const buffer = Buffer.from(hex, 'hex')
    return safeStorage.decryptString(buffer)
  }
}
```

**Migration Checklist**:
- [ ] Create credential service
- [ ] Migrate CLAUDE_PG_PASSWORD from env to safeStorage
- [ ] Add Settings UI for credential input
- [ ] Handle Linux libsecret availability
- [ ] Never log or expose decrypted values

### 1.3 Context Bridge Hardening
**Goal**: Replace generic IPC proxy with restricted domain-specific API

**Current (Vulnerable)**:
```typescript
// preload/index.ts - exposes generic invoke
invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
```

**Target (Secure)**:
```typescript
// preload/index.ts - domain-specific methods only
contextBridge.exposeInMainWorld('claude', {
  // Sessions
  sessions: {
    discover: () => ipcRenderer.invoke('sessions:discover'),
    get: (id: string) => ipcRenderer.invoke('sessions:get', id),
    getMessages: (id: string, limit?: number) =>
      ipcRenderer.invoke('sessions:getMessages', id, limit),
  },
  // Memory (no raw queries!)
  memory: {
    search: (query: string) => ipcRenderer.invoke('memory:unified-search', query),
    learnings: (filter?: string) => ipcRenderer.invoke('memory:learnings', filter),
  },
  // ... etc
})
```

**Note**: This is a significant refactor affecting all renderer code. Should be done after Phase 1.1-1.2.

---

## Phase 2: Data Layer Enhancement (P1)

### 2.1 PostgreSQL Connection Pool Service
Fully replace shell-based queries with connection pooling.

### 2.2 Streaming Transcript Parser
**Goal**: Efficient transcript.jsonl parsing without blocking

**Implementation**:
```typescript
// Use Node.js streams + ndjson for large files
import { createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import split2 from 'split2'

async function* parseTranscript(path: string): AsyncGenerator<Message> {
  const stream = createReadStream(path, { encoding: 'utf8' })
    .pipe(split2(JSON.parse))

  for await (const line of stream) {
    yield line as Message
  }
}
```

### 2.3 Qdrant Native Integration
Currently using REST, consider switching to gRPC for performance if needed.

---

## Phase 3: Enterprise Features (P2)

### 3.1 GPU Monitoring Panel (deploy-2b52)
**Components**:
- Real-time NVIDIA GPU metrics via `nvidia-smi --query-gpu`
- Temperature, memory, utilization charts (Recharts)
- Process GPU memory breakdown
- Alert thresholds for overheating

### 3.2 Watchdog Auto-Recovery (deploy-0k8i)
**Components**:
- Health check scheduler for critical services
- Automatic restart on failure
- Notification system for failures
- Recovery history log

### 3.3 OCSF Audit Logging
**Components**:
- Structured log format (OCSF Class 6003 for API activity)
- Immutable append-only SQLite log
- Log rotation (10MB max, date-based)
- Export to JSON/CSV for compliance

### 3.4 Beads Integration (deploy-101e)
**Components**:
- In-app beads list view
- Create/update/close beads
- Filter by status, priority, type
- Link beads to sessions

---

## Phase 4: UX Polish (P3)

### 4.1 Session Transcript Viewer (deploy-r9f1)
Full conversation replay with:
- Virtualized message list
- Tool call visualization
- Token usage timeline
- Export to Markdown

### 4.2 OS Theme Sync
Listen to `nativeTheme.on('updated')` and apply to Tailwind.

### 4.3 Performance Optimization
- Code splitting with dynamic imports
- Lazy load heavy components (Cytoscape, Monaco)
- V8 heap snapshot (if startup > 2s)

---

## Implementation Priority Queue

| # | Task | Phase | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Install pg, create PostgresService | 1.1 | ✅ DONE | Commit 438b849 |
| 2 | Migrate memory:learnings to pg | 1.1 | ✅ DONE | Parameterized queries |
| 3 | Migrate memory:stats to pg | 1.1 | ✅ DONE | queryScalar method |
| 4 | Migrate memory:raw PostgreSQL | 1.1 | ✅ DONE | queryRaw method |
| 5 | Migrate memory:unified-search | 1.1 | ✅ DONE | Part of #2 |
| 6 | Create CredentialService | 1.2 | ✅ DONE | Commit e72e205 |
| 7 | Settings UI for credentials | 1.2 | ✅ DONE | SecuritySettings component |
| 8 | Remove all execSync psql calls | 1.1 | ✅ DONE | 39 → 36 (non-PG remain) |
| 9 | Streaming transcript parser | 2.2 | ✅ DONE | Commit 6f216e3 |
| 10 | GPU monitoring panel | 3.1 | 🔲 TODO | deploy-2b52 |
| 11 | OCSF audit logging | 3.3 | 🔲 TODO | deploy-x2oc |
| 12 | Context Bridge hardening | 1.3 | 🔲 TODO | deploy-usdx (High Risk) |

---

## Metrics & Targets

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| execSync calls | 36 | 0 (non-PG OK) | PostgreSQL done, remaining are system calls |
| Test coverage | ~80% | >85% | Need IPC handler tests |
| Cold start | ~2.5s | <2s | Lazy loading |
| Memory usage | ~280MB | <300MB | On target |
| IPC latency | ~80ms | <50ms | Native drivers |

---

## File Structure Changes

```
src/
├── main/
│   ├── services/
│   │   ├── postgresql.ts    # NEW: Native pg driver
│   │   ├── credentials.ts   # NEW: safeStorage wrapper
│   │   ├── audit.ts         # NEW: OCSF logging
│   │   ├── memgraph.ts      # EXISTS: ✅ Native driver
│   │   └── terminal.ts      # EXISTS: ✅ node-pty
│   └── ipc/
│       └── handlers.ts      # MODIFY: Remove execSync
├── renderer/
│   └── components/
│       ├── dashboard/
│       │   └── GPUPanel.tsx # NEW: GPU monitoring
│       └── sessions/
│           └── TranscriptViewer.tsx # NEW: Full history
└── shared/
    └── types.ts             # MODIFY: Add audit types
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pg driver incompatibility | Low | High | Test with local Postgres first |
| safeStorage unavailable (Linux) | Medium | Medium | Fallback to env with warning |
| Context Bridge breaks UI | Medium | High | Feature flag, incremental rollout |
| Performance regression | Low | Medium | Benchmark before/after |

---

## Next Steps

**Completed This Session (2026-01-16):**
- ✅ Phase 1.1: PostgreSQL native driver migration (all handlers)
- ✅ Phase 1.2: Credential encryption with safeStorage
- ✅ Phase 1.2: Settings UI for credential management (SecuritySettings)
- ✅ Phase 2.2: Streaming transcript parser

**Remaining Priority Work:**
1. Context Bridge hardening (#12) - High risk, needs careful planning - deploy-usdx
2. GPU monitoring panel (#10) - deploy-2b52
3. OCSF audit logging (#11) - deploy-x2oc

---

## Appendix: Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────────────────────┐   │
│  │  IPC        │  │  Services                       │   │
│  │  Handlers   │  │  - Terminal (node-pty)          │   │
│  │  (4000+ LOC)│  │  - Memgraph (neo4j-driver) ✅   │   │
│  │  ✅ Native  │  │  - PostgreSQL (pg) ✅ NEW       │   │
│  │             │  │  - Credentials (safeStorage) ✅  │   │
│  │             │  │  - Transcript (streaming) ✅     │   │
│  └─────────────┘  └─────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC (contextBridge)
┌───────────────────────────┴─────────────────────────────┐
│                  Electron Renderer Process               │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  React 19   │  │  Zustand    │  │  Components     │  │
│  │  + Tailwind │  │  Stores     │  │  - Dashboard    │  │
│  │             │  │  (12 stores)│  │  - Memory       │  │
│  │             │  │             │  │  - Sessions     │  │
│  │             │  │             │  │  - MCP          │  │
│  │             │  │             │  │  - Terminal     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ PostgreSQL  │    │  Memgraph   │    │   Qdrant    │
│ :5433       │    │  :7687      │    │   :6333     │
│ ✅ native pg│    │  ✅ native  │    │   (REST)    │
└─────────────┘    └─────────────┘    └─────────────┘
```
