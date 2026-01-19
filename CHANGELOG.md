# Changelog

All notable changes to Claude Pilot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-alpha.1] - 2026-01-19

### Added

#### Core Features (15 Views)

- **Dashboard** - System health monitoring, resource metrics, active sessions
- **Projects** - Browse Claude projects with CLAUDE.md parsing
- **Sessions** - Discover and view session transcripts
- **MCP Manager** - Configure, enable/disable, monitor MCP servers
- **Memory Browser** - Query PostgreSQL, Memgraph, Qdrant databases
- **Profiles** - Manage Claude Code work profiles
- **Context Management** - Full context operations with 15 handlers
- **Services Monitor** - Systemd and Podman service control
- **Logs Viewer** - System log streaming with filtering
- **Ollama Integration** - Model management and embeddings
- **Agents Canvas** - Agent spawning and orchestration visualization
- **Chat Interface** - Multi-turn Claude chat with streaming
- **Terminal** - Integrated xterm.js + node-pty terminal
- **Beads Panel** - Issue tracking with bd integration
- **Global Settings** - Multi-tab application settings

#### Backend Architecture

- 25 tRPC controllers with 201 type-safe handlers
- Migrated all legacy IPC to electron-trpc
- Full Zod validation on all endpoints
- Async-first architecture (no execSync blocking calls)

#### Integrations

- PostgreSQL (port 5433) with pgvector for semantic search
- Memgraph (port 7687) knowledge graph with 1.77M+ nodes
- Qdrant (port 6333) vector store with 3 collections
- Ollama (port 11434) for embeddings and LLM
- Claude CLI spawning with proper security
- MCP server lifecycle management
- Sentry error monitoring

#### Performance Optimizations

- Code splitting for large dependencies:
  - Monaco editor (~3.8MB) - lazy loaded
  - Graph libraries (~600KB) - separate chunk
  - Terminal (~390KB) - separate chunk
  - Charts (~400KB) - separate chunk
- React.lazy() with Suspense for heavy components
- File caching service for config and transcripts
- Worker thread pool with Piscina

#### UI/UX Improvements

- Loading skeleton components (text, circular, rectangular, card variants)
- Empty state components for all views
- Progressive disclosure with AdvancedSection
- StatusIndicator with multiple variants (dot, badge, pill, icon)
- BatchActions for multi-select operations
- HelpTooltip and InfoBanner components
- Responsive design for desktop window sizes
- Reduced motion support for accessibility
- VSCode-inspired dark theme

#### Security

- Content Security Policy (CSP) with dev/prod separation
- Electron sandbox enabled (contextIsolation: true)
- Node integration disabled
- IPC channel whitelist (315+ channels)
- Credential storage via Electron safeStorage
- Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers

#### Testing

- 121 unit test files with 4,442+ passing tests
- 4 E2E test files with Playwright
- Vitest with threads pool (8 max threads)
- v8 coverage provider
- 75% coverage threshold

### Changed

- Increased test coverage threshold from 70% to 75%
- Disabled require-await lint rule for test files

### Fixed

- ChatInterface test mock missing terminal.launchClaudeInProject
- ChatInterface test mock missing lucide-react icons (Zap, X, Loader2, etc.)
- Chat controller test assertions updated to match stream-json implementation

## [0.1.0] - 2026-01-01

### Added

- Initial project scaffolding
- Basic Electron + React + TypeScript setup
- electron-vite build configuration

---

## Versioning

- **Major version** (X.0.0): Breaking changes
- **Minor version** (0.X.0): New features, backwards compatible
- **Patch version** (0.0.X): Bug fixes, backwards compatible
- **Pre-release** (-alpha, -beta, -rc): Testing versions

## Release Types

- **alpha**: Feature complete, may have bugs, internal testing
- **beta**: Feature freeze, bug fixes only, external testing
- **rc**: Release candidate, final testing before stable
- **stable**: Production ready

[0.2.0-alpha.1]: https://github.com/LecoMV/claude-pilot/releases/tag/v0.2.0-alpha.1
[0.1.0]: https://github.com/LecoMV/claude-pilot/releases/tag/v0.1.0
