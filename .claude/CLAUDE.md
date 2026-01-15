# Claude Command Center - Project Memory

## Project Overview
All-in-one desktop command center for Claude Code management, monitoring, and orchestration.
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
│   ├── ipc/                  # IPC handlers
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
| Name | Hex | Use |
|------|-----|-----|
| Background | `#1e1e2e` | Main background |
| Surface | `#2a2a3d` | Cards, panels |
| Border | `#3d3d5c` | Borders, dividers |
| Text Primary | `#cdd6f4` | Main text |
| Text Muted | `#6c7086` | Secondary text |
| Accent Blue | `#89b4fa` | Links, active states |
| Accent Green | `#a6e3a1` | Success, online |
| Accent Yellow | `#f9e2af` | Warnings |
| Accent Red | `#f38ba8` | Errors, offline |
| Accent Purple | `#cba6f7` | Claude branding |

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
Main ↔ Renderer communication via typed IPC:
- `claude:*` - Claude Code operations
- `mcp:*` - MCP server management
- `memory:*` - Memory system queries
- `system:*` - System status/metrics
- `terminal:*` - PTY operations

## Security Guidelines
- No shell injection in terminal commands
- Sanitize file paths before operations
- Validate IPC message payloads
- No sensitive data in renderer logs
- Use contextBridge for preload

## Performance Targets
| Metric | Target |
|--------|--------|
| Cold start | < 2s |
| Hot reload | < 500ms |
| Memory usage | < 300MB |
| IPC latency | < 50ms |

## Important Notes
- Main process handles all filesystem/subprocess operations
- Renderer is sandboxed (nodeIntegration: false)
- Use IPC for all cross-process communication
- Tail transcript.jsonl for real-time session updates
- MCP config reload without app restart
