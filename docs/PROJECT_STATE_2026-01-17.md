# Claude Pilot - Project State Documentation

**Date:** 2026-01-17
**Version:** 0.1.0
**Repository:** https://github.com/LecoMV/claude-pilot

---

## Executive Summary

Claude Pilot is a professional Electron desktop application for managing Claude Code sessions. It provides a unified interface for profile management, resource monitoring, MCP server configuration, memory system access, and workflow orchestration.

**Current Phase:** Enterprise Foundation Complete
**Architecture:** Hybrid tRPC + Legacy IPC
**Test Coverage:** ~70% (target)

---

## Project Metrics

| Metric              | Value          |
| ------------------- | -------------- |
| TypeScript Files    | 137            |
| Total Lines of Code | ~49,500        |
| Legacy IPC Handlers | 223            |
| tRPC Controllers    | 5              |
| Zustand Stores      | 16             |
| Test Files          | 19             |
| React Components    | 23 directories |

---

## Technology Stack

### Core Framework

- **Electron** 34.0.0 - Cross-platform desktop
- **electron-vite** 2.3.0 - Build tooling
- **React** 19.0.0 - UI framework
- **TypeScript** 5.7.2 - Type safety

### State Management

- **Zustand** 5.0.3 - Global state
- **electron-store** 10.0.0 - Settings persistence

### IPC Architecture

- **electron-trpc** 0.6.2 - Type-safe RPC (new)
- **Legacy IPC** - 223 handlers (being migrated)
- **MessagePort Streaming** - Large payload transfer
- **Piscina** 5.1.4 - Worker thread pools

### UI Components

- **TailwindCSS** 3.4.17 - Styling
- **Lucide React** 0.469.0 - Icons
- **Monaco Editor** 0.55.1 - Code editing
- **xterm.js** 5.5.0 - Terminal emulation
- **Cytoscape** 3.30.4 - Graph visualization
- **React Flow** 11.11.4 - Workflow diagrams
- **Recharts** 2.15.0 - Charts/metrics
- **React Virtuoso** 4.18.1 - Virtual lists

### Backend Services

- **PostgreSQL** (pg 8.17.1) - Learnings database
- **Memgraph** (neo4j-driver 6.0.1) - Knowledge graph
- **Qdrant** - Vector embeddings
- **Ollama** - Local LLM embeddings
- **better-sqlite3** 11.7.0 - Local cache

### Testing

- **Vitest** 2.1.8 - Unit tests
- **Playwright** 1.57.0 - E2E tests
- **Testing Library** - React testing

### Quality Tools

- **ESLint** 9.17.0 - Linting
- **Prettier** 3.4.2 - Formatting
- **Husky** 9.1.7 - Git hooks
- **Commitlint** 19.8.1 - Conventional commits

### Security & Monitoring

- **Sentry** 7.6.0 - Crash reporting
- **electron-updater** 6.7.3 - Auto-updates
- **Zod** 3.25.76 - Runtime validation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              RENDERER PROCESS                            │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   Dashboard  │  │   Projects   │  │   Sessions   │  │   Memory    │ │
│  │   Component  │  │   Component  │  │   Component  │  │   Browser   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                 │                 │         │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴──────┐ │
│  │                         Zustand Stores (16)                        │ │
│  │  system, mcp, memory, profile, sessions, terminal, agents, etc.   │ │
│  └──────────────────────────────────────────────────────────────────┬─┘ │
│                                                                      │   │
│  ┌──────────────────────────────────────────────────────────────────┴─┐ │
│  │                    tRPC Client + Legacy IPC Bridge                  │ │
│  │         contextBridge.exposeInMainWorld('electron', ...)           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                              PRELOAD SCRIPT
                       (Channel whitelist validation)
                                      │
┌─────────────────────────────────────────────────────────────────────────┐
│                               MAIN PROCESS                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                          tRPC Router                                 ││
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐      ││
│  │  │ demo   │  │ system │  │ memory │  │embedding │  │ config │      ││
│  │  │ router │  │ router │  │ router │  │  router  │  │ router │      ││
│  │  └────────┘  └────────┘  └────────┘  └──────────┘  └────────┘      ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                      Legacy IPC Handlers (223)                       ││
│  │  claude:*, mcp:*, memory:*, profile:*, session:*, terminal:*, etc.  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                           Services Layer                             ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ││
│  │  │PostgreSQL  │  │ Memgraph   │  │ Embeddings │  │   Config     │  ││
│  │  │  Service   │  │  Service   │  │  Pipeline  │  │  Resolver    │  ││
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ││
│  │  │  Audit     │  │ Watchdog   │  │Observability│ │ Credentials  │  ││
│  │  │  Logger    │  │  Service   │  │   (OTEL)   │  │  (safeStore) │  ││
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────────┘  ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                    ││
│  │  │ Streaming  │  │  Worker    │  │   MCP      │                    ││
│  │  │(MessagePort)│ │  Pool      │  │   Proxy    │                    ││
│  │  └────────────┘  └────────────┘  └────────────┘                    ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                        ┌─────────────┼─────────────┐
                        │             │             │
              ┌─────────┴───┐  ┌──────┴────┐  ┌────┴─────┐
              │ PostgreSQL  │  │ Memgraph  │  │  Qdrant  │
              │  (5433)     │  │  (7687)   │  │  (6333)  │
              │ pgvector    │  │ CybersecKB│  │ Vectors  │
              └─────────────┘  └───────────┘  └──────────┘
```

---

## Directory Structure

```
src/
├── main/                           # Electron main process
│   ├── index.ts                    # Entry point, security config
│   ├── ipc/
│   │   └── handlers.ts             # 223 legacy IPC handlers (5,868 lines)
│   ├── trpc/
│   │   ├── trpc.ts                 # tRPC base setup
│   │   ├── router.ts               # Combined app router
│   │   └── context.ts              # Request context
│   ├── controllers/                # tRPC controllers (migrated)
│   │   ├── demo.controller.ts      # Demo/spike procedures
│   │   ├── system.controller.ts    # System status, resources
│   │   ├── memory.controller.ts    # PostgreSQL, Memgraph, Qdrant
│   │   ├── embedding.controller.ts # Vector operations
│   │   └── config.controller.ts    # 5-tier config resolver
│   ├── services/
│   │   ├── config/                 # 5-tier hierarchical config
│   │   │   ├── types.ts            # Config schemas
│   │   │   ├── resolver.ts         # Merge logic with locks
│   │   │   └── index.ts            # Exports
│   │   ├── embeddings/             # Auto-embedding pipeline
│   │   │   ├── EmbeddingManager.ts # Top-level orchestrator
│   │   │   ├── OllamaEmbeddingService.ts
│   │   │   ├── EmbeddingPipeline.ts
│   │   │   ├── EmbeddingCache.ts
│   │   │   ├── ContentChunker.ts
│   │   │   ├── SessionEmbeddingWorker.ts
│   │   │   ├── VectorStore.ts      # pgvector + Qdrant
│   │   │   └── types.ts
│   │   ├── streaming/              # MessagePort data plane
│   │   │   ├── messageport.ts      # File streaming
│   │   │   └── index.ts
│   │   ├── workers/                # Piscina thread pools
│   │   │   ├── pool.ts             # Interactive + Background pools
│   │   │   └── index.ts
│   │   ├── ollama/                 # LLM integration
│   │   │   ├── gpu-detection.ts    # NVIDIA GPU detection
│   │   │   └── index.ts
│   │   ├── postgresql.ts           # Database connection
│   │   ├── memgraph.ts             # Graph database
│   │   ├── audit.ts                # OCSF audit logging
│   │   ├── observability.ts        # OpenTelemetry
│   │   ├── credentials.ts          # safeStorage encryption
│   │   ├── mcp-proxy.ts            # MCP server management
│   │   ├── treesitter.ts           # Code parsing
│   │   ├── transcript.ts           # Session transcripts
│   │   ├── watchdog.ts             # Health monitoring
│   │   ├── terminal.ts             # PTY management
│   │   ├── predictive-context.ts   # Context prediction
│   │   ├── plans.ts                # Claude plans
│   │   └── branches.ts             # Git branches
│   ├── workers/                    # Worker thread scripts
│   │   ├── batch.js
│   │   └── interactive.js
│   └── utils/
│       ├── error-handler.ts        # Global error handling
│       └── ipc-error-handler.ts    # IPC-specific errors
│
├── renderer/                       # React frontend
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component
│   ├── components/
│   │   ├── layout/                 # Shell, Sidebar, Header
│   │   ├── dashboard/              # System metrics, status
│   │   ├── projects/               # Project browser
│   │   ├── sessions/               # Session management
│   │   ├── mcp/                    # MCP server config
│   │   ├── memory/                 # Memory browser
│   │   ├── profiles/               # Claude profiles
│   │   ├── terminal/               # Integrated terminal
│   │   ├── agents/                 # Agent visualization
│   │   ├── workflows/              # Flow diagrams
│   │   ├── graph/                  # Cytoscape graphs
│   │   ├── context/                # Context management
│   │   ├── ollama/                 # Ollama models
│   │   ├── logs/                   # Log viewer
│   │   ├── settings/               # Global settings
│   │   ├── beads/                  # Issue tracker
│   │   ├── branches/               # Git branches
│   │   ├── plans/                  # Claude plans
│   │   ├── chat/                   # Chat interface
│   │   ├── services/               # Service status
│   │   └── common/                 # Shared components
│   ├── stores/                     # Zustand state (16 stores)
│   │   ├── system.ts
│   │   ├── mcp.ts
│   │   ├── memory.ts
│   │   ├── profile.ts
│   │   ├── sessions.ts
│   │   ├── terminal.ts
│   │   ├── agents.ts
│   │   ├── chat.ts
│   │   ├── context.ts
│   │   ├── services.ts
│   │   ├── logs.ts
│   │   ├── ollama.ts
│   │   ├── budget.ts
│   │   ├── settings.ts
│   │   ├── errors.ts
│   │   └── metricsHistory.ts
│   ├── hooks/                      # Custom hooks
│   │   ├── useSystemStatus.ts
│   │   └── useTerminal.ts
│   ├── lib/
│   │   ├── utils.ts                # Utility functions
│   │   └── trpc/
│   │       └── client.ts           # tRPC client setup
│   └── styles/                     # Global CSS
│
├── preload/
│   └── index.ts                    # Context bridge, channel whitelist
│
├── shared/
│   ├── types.ts                    # Shared type definitions
│   ├── errors.ts                   # Custom error classes
│   └── validation.ts               # Zod schemas
│
└── __tests__/                      # Test files (19 tests)
    ├── setup.ts
    ├── main/
    │   ├── setup.ts
    │   └── ipc/
    ├── renderer/
    │   └── stores/
    └── shared/
```

---

## tRPC Controllers (Migrated from IPC)

### 1. demo.controller.ts

- **Purpose:** Proof of concept for tRPC pattern
- **Procedures:** ping, echo, greet

### 2. system.controller.ts

- **Purpose:** System status and resource monitoring
- **Procedures:**
  - `status` - Full system status (Claude, MCP, memory, Ollama)
  - `resources` - CPU, memory, disk, GPU usage
  - `gpu` - GPU-specific metrics
  - `claudeVersion` - Claude Code version
  - `homePath` - User home directory
  - `appInfo` - Platform, Node, Electron versions
  - `health` - Quick health check
  - `refresh` - Force cache refresh

### 3. memory.controller.ts

- **Purpose:** Unified memory system access
- **Procedures:**
  - `learnings` - Query PostgreSQL learnings
  - `stats` - Memory system statistics
  - `graph` - Memgraph Cypher queries
  - `qdrantSearch` - Vector similarity search
  - `memgraphSearch` - Graph pattern matching
  - `unifiedSearch` - Federated search (RRF merge)
  - `raw` - Direct SQL execution (with safety checks)

### 4. embedding.controller.ts

- **Purpose:** Vector operations and auto-embedding
- **Procedures:**
  - `status` - Embedding system status
  - `metrics` - Pipeline metrics (latency, throughput)
  - `cacheStats` - Embedding cache statistics
  - `vectorStoreStats` - pgvector/Qdrant stats
  - `startAutoEmbed` / `stopAutoEmbed` - Auto-embedding control
  - `embed` - Generate embedding vector
  - `embedAndStore` - Embed and persist
  - `search` - Semantic search
  - `warmupModel` / `unloadModel` - Ollama model control
  - `updateOllamaConfig` - Update Ollama settings
  - `pruneCache` / `clearCache` - Cache management
  - `deadLetterQueue` - Failed embeddings
  - `retryDeadLetterQueue` / `clearDeadLetterQueue`
  - `processSession` - Process session file
  - `resetSessionPosition` / `resetAllSessionPositions`
  - `deleteSessionEmbeddings`

### 5. config.controller.ts

- **Purpose:** 5-tier hierarchical configuration
- **Procedures:**
  - `resolve` - Get merged effective config
  - `get` - Get specific config value
  - `isLocked` - Check if admin-locked
  - `getSource` - Get source tier for key
  - `diagnostics` - Full config audit trail
  - `paths` - Config file paths
  - `projectPath` - Current project path
  - `setProjectPath` - Set project context
  - `saveUserConfig` - Save user preferences
  - `saveProjectConfig` - Save project config
  - `invalidateCache` - Force config refresh

---

## 5-Tier Configuration System

```
Priority (lowest → highest):

1. INSTALLATION DEFAULTS
   - Built into app bundle
   - Read-only defaults in types.ts

2. SYSTEM POLICIES
   - /etc/claude-pilot/policy.json (Linux/macOS)
   - %ProgramData%\claude-pilot\policy.json (Windows)
   - Can LOCK values (admin enforcement)

3. USER PREFERENCES
   - ~/.config/claude-pilot/settings.json (Linux)
   - ~/Library/Application Support/claude-pilot/settings.json (macOS)
   - %APPDATA%\claude-pilot\settings.json (Windows)

4. PROJECT CONFIG
   - .claude/pilot.json in project root
   - Project-specific overrides

5. SESSION OVERRIDES
   - Environment variables: CLAUDE_PILOT_MODEL, CLAUDE_PILOT_SANDBOX, etc.
   - CLI flags (future)
```

**Lockable Values:** System policies can lock specific keys to prevent user override.

---

## Memory Systems Integration

### PostgreSQL (port 5433)

- Database: `claude_memory`
- Tables: learnings, vector_memories, htb_sessions, htb_actions
- Extension: pgvector (768-dim vectors)

### Memgraph (port 7687)

- CybersecKB: 1.7M+ security techniques
- Architecture knowledge graph
- Entity relationships

### Qdrant (port 6333)

- Collection: `claude_memories`
- Vector dimensions: 768 (nomic-embed-text)
- Managed by HybridMemory system

### Ollama (port 11434)

- Embedding model: nomic-embed-text
- Local inference for embeddings
- GPU-accelerated (RTX 3080)

---

## Security Features

- **CSP Headers:** Strict Content-Security-Policy
- **COOP/COEP:** Cross-origin isolation for SharedArrayBuffer
- **Channel Whitelist:** Preload validates all IPC channels
- **Input Validation:** Zod schemas for all tRPC inputs
- **SQL Safety:** Blocks DROP, TRUNCATE, DELETE without WHERE
- **Credential Encryption:** safeStorage for sensitive data
- **Audit Logging:** OCSF format for compliance
- **Crash Reporting:** Sentry integration

---

## Recent Development (January 2026)

### Completed Features

1. **electron-trpc Migration** - Hybrid architecture with type-safe RPC
2. **MessagePort Streaming** - Large payload transfer without IPC limits
3. **Worker Thread Pools** - Piscina for background processing
4. **COOP/COEP Headers** - SharedArrayBuffer support
5. **System Controller** - Dashboard status tRPC procedures
6. **Memory Controller** - Unified memory access
7. **Embedding Controller** - Vector operations tRPC
8. **5-Tier Config Resolver** - Hierarchical configuration

### Pending Controllers (Future Migration)

- `session` - Claude process management
- `mcp` - MCP server proxy/federation
- `audit` - Logging and SIEM
- `security` - Credentials and governance

---

## Build & Distribution

### Supported Platforms

- Linux: AppImage, .deb, .tar.gz (x64, arm64)
- macOS: .dmg, .zip (x64, arm64)
- Windows: NSIS installer, portable (x64, arm64)

### GitHub Actions

- CI workflow for lint, typecheck, tests
- Release workflow for multi-platform builds
- Auto-updates via GitHub Releases

---

## Development Commands

```bash
npm run dev          # Start development
npm run build        # Production build
npm run lint         # ESLint check
npm run typecheck    # TypeScript check
npm run test         # Vitest tests
npm run test:e2e     # Playwright E2E
npm run dist:linux   # Build Linux packages
```

---

## Git History (Recent)

```
5de5cd8 feat: add embedding controller and 5-tier config resolver
8fc4b5e feat: migrate system and memory handlers to trpc controllers
7584136 feat: implement p0/p1 enterprise infrastructure
1694e77 docs: comprehensive gemini research analysis and enterprise roadmap
1e238b5 feat: implement electron-trpc spike for type-safe ipc
8dae859 feat: add virtualization and ollama gpu detection service
5a0ebe9 fix: bundle monaco editor locally to avoid csp errors
9a19f46 feat: implement enterprise auto-embedding pipeline
```

---

## Beads (Issue Tracking)

Epic: `deploy-qu36` - Gemini Deep Research Audit Implementation

Key Beads:

- `deploy-ji2e` - Configuration Hierarchy (COMPLETED)
- `deploy-482i` - electron-trpc Production Patterns (COMPLETED)
- `deploy-scb9` - Worker Thread Optimization (COMPLETED)
- `deploy-d7rm` - Global Credential Management (PLANNED)

---

_Document generated: 2026-01-17_
