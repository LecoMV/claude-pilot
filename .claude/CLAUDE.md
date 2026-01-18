# Claude Pilot - Project Memory

## Project Overview

Professional session control for Claude Code - manage profiles, monitor resources, and orchestrate workflows.
**Aesthetic**: VSCode-inspired dark theme with Grafana-style monitoring dashboards.

## Tech Stack

- **Framework**: Electron 34 + electron-vite
- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Terminal**: xterm.js + node-pty (integrated CLI)
- **Visualization**: Cytoscape.js (graphs) + React Flow (workflows) + Recharts (metrics)
- **State**: Zustand (global state management)
- **Storage**: better-sqlite3 (local cache) + electron-store (settings)
- **Testing**: Vitest (unit) + Playwright (E2E)

## Architecture

### Directory Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Main entry point
│   ├── trpc/                # tRPC infrastructure
│   │   ├── trpc.ts          # Router & procedure definitions
│   │   └── router.ts        # Main appRouter (25 controllers)
│   ├── controllers/         # Domain-grouped tRPC controllers
│   │   ├── security/        # credentials, audit, watchdog
│   │   ├── mcp/             # mcp, proxy
│   │   ├── sessions/        # session, transcript, beads
│   │   ├── context/         # context
│   │   ├── analysis/        # plans, branches
│   │   ├── integrations/    # ollama, pgvector, treesitter
│   │   └── utilities/       # profiles, services, logs, agents, etc.
│   ├── ipc/                 # Legacy IPC handlers (deprecated)
│   ├── services/            # Backend services
│   │   ├── claude/          # Claude Code integration
│   │   ├── mcp/             # MCP server management
│   │   └── memory/          # Memory system connectors
│   └── utils/               # Main process utilities
├── renderer/                # Electron renderer (React)
│   ├── index.html           # HTML entry
│   ├── main.tsx             # React entry
│   ├── App.tsx              # Root component
│   ├── components/
│   │   ├── layout/          # Shell, Sidebar, Header
│   │   ├── dashboard/       # System status, metrics
│   │   ├── projects/        # Project management
│   │   ├── mcp/             # MCP server UI
│   │   ├── profiles/        # Claude profile management
│   │   ├── workflows/       # Claude Flow visualization
│   │   ├── memory/          # Memory browser
│   │   ├── terminal/        # Integrated terminal
│   │   ├── settings/        # App settings
│   │   └── common/          # Shared components
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand stores
│   ├── lib/                 # Utilities
│   ├── styles/              # Global styles
│   └── types/               # TypeScript types
├── preload/                 # Preload scripts
│   └── index.ts             # Context bridge
└── shared/                  # Shared types/utils
    └── types.ts             # Shared type definitions
```

### Core Modules

1. **Dashboard** - System health, resource usage, active sessions
2. **Projects** - Browse/manage Claude projects with CLAUDE.md
3. **MCP Manager** - Configure, enable/disable, monitor MCP servers
4. **Profile Manager** - Claude profiles and settings
5. **Workflows** - Claude Flow visualization and execution
6. **Memory Browser** - Query PostgreSQL, Memgraph, Mem0
7. **Terminal** - Integrated Claude Code CLI

### Data Sources

- `~/.claude/` - Claude Code configuration
- `~/.claude/projects/` - Session transcripts (transcript.jsonl)
- `~/.claude/settings.json` - User settings
- `~/.config/claude-code/` - MCP server configs
- PostgreSQL (port 5433) - Learnings database
- Memgraph (port 7687) - CybersecKB knowledge graph
- Qdrant (port 6333) - Mem0 vector memories

## Common Commands

```bash
npm run dev              # Start development
npm run build            # Production build
npm run preview          # Preview production build
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run typecheck        # TypeScript check
npm run test             # Run Vitest tests
npm run test:run         # Run tests once
npm run test:coverage    # Coverage report
```

## Work Tracking

Use Beads (`bd` commands) for all task management.

```bash
bd ready              # Show available work
bd create --title="..." --type=task|bug|feature --priority=2
bd update <id> --status=in_progress
bd close <id>
bd stats              # Project health
```

## Design Guidelines

### Color Palette (Dark Theme)

| Name          | Hex       | Use                  |
| ------------- | --------- | -------------------- |
| Background    | `#1e1e2e` | Main background      |
| Surface       | `#2a2a3d` | Cards, panels        |
| Border        | `#3d3d5c` | Borders, dividers    |
| Text Primary  | `#cdd6f4` | Main text            |
| Text Muted    | `#6c7086` | Secondary text       |
| Accent Blue   | `#89b4fa` | Links, active states |
| Accent Green  | `#a6e3a1` | Success, online      |
| Accent Yellow | `#f9e2af` | Warnings             |
| Accent Red    | `#f38ba8` | Errors, offline      |
| Accent Purple | `#cba6f7` | Claude branding      |

### Typography

- **Font**: Inter (variable) for all text
- **Monospace**: JetBrains Mono for code/terminal
- **Base size**: 14px
- **Scale**: 12px, 14px, 16px, 18px, 24px, 32px

### Component Patterns

- Card-based layout with subtle shadows
- Rounded corners (8px default)
- Smooth transitions (150ms ease)
- Hover states with subtle highlights
- Loading skeletons for async content

## IPC Communication

### tRPC Controllers (Primary - 201 handlers migrated)

All IPC now uses type-safe electron-trpc with Zod validation:

```typescript
// Frontend usage (full type inference)
const status = await trpc.system.status.query()
const result = await trpc.credentials.store.mutate({ key, value })
```

| Router        | Handlers | Domain                                |
| ------------- | -------- | ------------------------------------- |
| `credentials` | 7        | Credential storage (pass integration) |
| `audit`       | 11       | Security audit logging                |
| `watchdog`    | 8        | Service health monitoring             |
| `mcp`         | 10       | MCP server management                 |
| `proxy`       | 6        | MCP proxy operations                  |
| `session`     | 8        | Session discovery/management          |
| `transcript`  | 5        | Transcript parsing/watching           |
| `beads`       | 5        | Issue/work tracking                   |
| `context`     | 15       | Context operations                    |
| `plans`       | 8        | Plan analysis                         |
| `branches`    | 7        | Branch analysis                       |
| `ollama`      | 8        | Ollama model management               |
| `pgvector`    | 8        | PGVector operations                   |
| `treesitter`  | 7        | Tree-sitter parsing                   |
| `profiles`    | 6        | Profile management                    |
| `services`    | 5        | Systemd/Podman services               |
| `logs`        | 3        | Log streaming                         |
| `agents`      | 8        | Agent spawning                        |
| `settings`    | 5        | App settings                          |
| `claude`      | 4        | Claude CLI operations                 |
| `workers`     | 5        | Worker pool management                |
| `stream`      | 3        | MessagePort streaming                 |
| `update`      | 4        | Auto-update                           |
| `terminal`    | 1        | Terminal navigation                   |

### Legacy IPC (Deprecated)

Legacy `ipcMain.handle` patterns in `src/main/ipc/handlers.ts` are deprecated.
Frontend should migrate to tRPC client calls.

## Security Guidelines

- No shell injection in terminal commands
- Sanitize file paths before operations
- Validate IPC message payloads
- No sensitive data in renderer logs
- Use contextBridge for preload

## Performance Targets

| Metric       | Target  |
| ------------ | ------- |
| Cold start   | < 2s    |
| Hot reload   | < 500ms |
| Memory usage | < 300MB |
| IPC latency  | < 50ms  |

## Important Notes

- Main process handles all filesystem/subprocess operations
- Renderer is sandboxed (nodeIntegration: false)
- Use IPC for all cross-process communication
- Tail transcript.jsonl for real-time session updates
- MCP config reload without app restart

---

## Enterprise Architecture (Gemini Research)

> **Reference**: See `docs/Research/GEMINI_RESEARCH_ANALYSIS.md` for comprehensive details

### Hybrid IPC Architecture

**Control Plane (tRPC):**

- State synchronization, configuration, commands
- Type-safe with Zod validation
- Small payloads (<1KB)

**Data Plane (MessagePorts):**

- File transfers >1MB
- Binary payloads (embeddings, images)
- Zero-copy via Transferable objects

```typescript
// Pattern: tRPC for control, MessagePort for data
const { port } = await trpc.streaming.initFileTransfer.mutate({ fileId })
port.onmessage = (e) => processChunk(e.data) // Zero-copy transfer
```

### Security Architecture

**Authentication (RFC 8252):**

- System browser for OAuth (never WebViews)
- PKCE mandatory for all flows
- Loopback redirect (127.0.0.1:ephemeral-port)
- Tokens in `safeStorage` (never localStorage)

**Zero-Knowledge Vector Search:**

- AWS Nitro Enclaves for encrypted index
- WebAuthn PRF for hardware-backed key derivation
- HKDF (RFC 5869) for key expansion
- Envelope encryption for multi-device

**Required Headers:**

```typescript
// Enable SharedArrayBuffer (required for worker optimization)
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Cross-Origin-Opener-Policy': ['same-origin'],
      'Cross-Origin-Embedder-Policy': ['credentialless'],
    },
  })
})
```

### Worker Thread Patterns

**Use Piscina for worker pools:**

```typescript
import Piscina from 'piscina'

const interactivePool = new Piscina({
  filename: './workers/interactive.js',
  maxThreads: 2, // High priority
})

const backgroundPool = new Piscina({
  filename: './workers/batch.js',
  maxThreads: os.availableParallelism() - 3,
})
```

**Direct MessagePort for Renderer→Worker bypass:**

- Avoids Main process serialization overhead
- Critical for 60fps under heavy compute

### Teleport Integration

**Sidecar Pattern (tshd daemon):**

- Bundle tsh binary with installer
- gRPC over Unix socket / Named pipe
- Never embed Go SDK directly

**Local Proxy for K8s/DB:**

```bash
tsh proxy kube <cluster> --port=8443
tsh proxy db --tunnel --port=5433 <database>
```

### Configuration Hierarchy (5-Tier)

```
1. Installation Defaults (read-only)
2. System Policies (/etc/claude-pilot/)
3. User Preferences (~/.config/claude-pilot/)
4. Project Config (.claude/pilot.json)
5. Session Overrides (CLI flags, env vars)
```

Higher tiers override lower. System policies can "lock" values.

### Key Beads

| Bead          | Description                          |
| ------------- | ------------------------------------ |
| `deploy-qu36` | EPIC: Gemini Research Implementation |
| `deploy-skn3` | OAuth/OIDC (RFC 8252)                |
| `deploy-482i` | electron-trpc Production             |
| `deploy-scb9` | Worker Thread Optimization           |
| `deploy-q6dz` | Zero-Knowledge Encryption            |
| `deploy-reky` | Teleport Integration                 |
| `deploy-ji2e` | Configuration Hierarchy              |

### Research Documentation

- `docs/Research/GEMINI_RESEARCH_ANALYSIS.md` - Full synthesis
- `docs/Research/IMPLEMENTATION_TASK_MAPPING.md` - Task breakdown
- `docs/Research/ENTERPRISE_ROADMAP.md` - 10-week roadmap
- `docs/Research/Electron OAuth 2.0_OIDC Best Practices.md`
- `docs/Research/Electron-tRPC Production Patterns Research.md`
- `docs/Research/Electron Worker Thread Optimization Strategies.md`
- `docs/Research/Encrypted Vector Search for Claude Pilot.md`
- `docs/Research/Integrating Teleport into Desktop Apps.md`
- `docs/Research/Electron App Architecture Research Guide.md` - IPC patterns

---

## Migration Status (January 2026)

### Completed Milestones

| Milestone                      | Status      | Commit                        |
| ------------------------------ | ----------- | ----------------------------- |
| execSync Elimination           | ✅ Complete | 36 blocking calls → async     |
| Enterprise Audit (Antigravity) | ✅ Passed   | Security review               |
| tRPC Controller Migration      | ✅ Complete | 201 handlers → 25 controllers |

### Controller Migration (6 Sprints)

| Sprint | Controllers                                   | Handlers | Status       |
| ------ | --------------------------------------------- | -------- | ------------ |
| 1      | Security (credentials, audit, watchdog)       | 26       | ✅ `fe3f198` |
| 2      | MCP (mcp, proxy)                              | 16       | ✅ `b658e03` |
| 3      | Sessions (session, transcript, beads)         | 18       | ✅ `b658e03` |
| 4      | Context & Analysis (context, plans, branches) | 30       | ✅ `b658e03` |
| 5      | Integrations (ollama, pgvector, treesitter)   | 23       | ✅ `b658e03` |
| 6      | Utilities (10 controllers)                    | 39       | ✅ `b658e03` |

**Total**: 201 handlers migrated, 25 tRPC controllers, 299/299 tests passing

### Next Phase: Frontend Migration

Frontend components need to migrate from legacy IPC to tRPC client:

```typescript
// Before (legacy)
const status = await window.electron.invoke('system:status')

// After (tRPC)
import { trpc } from '@/lib/trpc'
const status = await trpc.system.status.query()
```

Key files to update:

- `src/renderer/hooks/useSystemStatus.ts`
- `src/renderer/stores/*.ts`
- `src/renderer/components/**/*.tsx`
