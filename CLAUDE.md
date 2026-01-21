# Claude Pilot - Claude Code Project Instructions

## Project Identity

**Name:** Claude Pilot (claude-command-center)
**Purpose:** Electron-based desktop app for AI-assisted development workflows
**Stack:** Electron + React + TypeScript + tRPC

## Issue Tracking (Beads)

This project uses **project-level beads** stored in `.beads/`. Issue IDs are prefixed with `claude-pilot-`.

```bash
bd ready              # Available work (no blockers)
bd list --status=open # All open issues
bd create --title="..." --type=task --priority=2
bd close <id>         # Mark complete
bd sync               # Sync to git (run at session end)
```

**Memory Labeling:** When saving learnings, use prefix `[claude-pilot]`:

```bash
/learn "[claude-pilot] - Electron IPC pattern for secure credential storage"
```

## Tech Stack

| Layer     | Technology              |
| --------- | ----------------------- |
| Framework | Electron 33+            |
| Frontend  | React 18 + TypeScript   |
| IPC       | tRPC with electron-trpc |
| Styling   | TailwindCSS             |
| State     | Zustand                 |
| Testing   | Vitest + Playwright     |

## Architecture Rules

See `~/.claude/rules/electron-architecture.md` for:

- File size limits (250 lines components, 400 lines modules)
- tRPC for ALL IPC (no raw ipcMain/ipcRenderer)
- Mandatory Zod validation on all handlers
- BrowserWindow security config

## Key Features

- Ghost session detection
- Session bloat analyzer
- Global credential management
- Gemini deep research integration
- Webmin-style system management

## Commands

```bash
npm run dev           # Development with hot reload
npm run build         # Production build
npm run test          # Run tests
npm run test:e2e      # Playwright E2E tests
```

## Security Non-Negotiables

1. `contextIsolation: true` - Always
2. `nodeIntegration: false` - Always
3. `sandbox: true` - Always
4. Zod validation on ALL IPC handlers
5. No secrets in renderer process
