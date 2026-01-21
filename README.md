# Claude Pilot

Professional session control for Claude Code - manage profiles, monitor resources, and orchestrate workflows.

## Features

- **Dashboard** - System health monitoring, resource usage, and active session tracking
- **Profile Management** - Create and manage multiple Claude Code profiles with custom settings
- **MCP Server Management** - Configure, enable/disable, and monitor MCP servers
- **Memory Browser** - Query and explore PostgreSQL learnings, Memgraph knowledge graph, and vector memories
- **Services Monitor** - Track systemd services and Podman containers
- **Ollama Integration** - Manage local LLM models with Ollama
- **Integrated Terminal** - Built-in terminal with Claude Code support
- **Agent Canvas** - Visualize and orchestrate Claude Flow agents

## Screenshots

_Coming soon_

## Installation

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn
- Linux, macOS, or Windows

### Development Setup

```bash
# Clone the repository
git clone https://github.com/alexmayhew/claude-pilot.git
cd claude-pilot

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Build the application
npm run build

# Create distributable packages
npm run dist          # For current platform
npm run dist:linux    # Linux only (AppImage, deb, tar.gz)
npm run dist:mac      # macOS only (dmg, zip)
npm run dist:win      # Windows only (nsis, portable)
npm run dist:all      # All platforms
```

The built packages will be in the `release/` directory.

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure your database connections:

```bash
cp .env.example .env
```

Available environment variables:

| Variable             | Description              | Default         |
| -------------------- | ------------------------ | --------------- |
| `CLAUDE_PG_HOST`     | PostgreSQL host          | `localhost`     |
| `CLAUDE_PG_PORT`     | PostgreSQL port          | `5433`          |
| `CLAUDE_PG_USER`     | PostgreSQL username      | `deploy`        |
| `CLAUDE_PG_DATABASE` | PostgreSQL database name | `claude_memory` |
| `CLAUDE_PG_PASSWORD` | PostgreSQL password      | (empty)         |

### Optional Services

Claude Pilot integrates with optional services for enhanced functionality:

- **PostgreSQL** - Stores learnings and conversation history
- **Memgraph** - Knowledge graph for CybersecKB and relationships
- **Qdrant** - Vector database for Mem0 semantic search
- **Ollama** - Local LLM model management

## Development

### Available Scripts

```bash
npm run dev           # Start development server with hot reload
npm run build         # Build for production
npm run preview       # Preview production build
npm run start         # Start built application

npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint errors
npm run format        # Format code with Prettier
npm run typecheck     # Run TypeScript type checking

npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run tests with coverage report
npm run test:e2e      # Run Playwright E2E tests
```

### Project Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # Main entry point
│   ├── trpc/                # tRPC router and context
│   ├── controllers/         # Domain-grouped tRPC controllers (25)
│   │   ├── security/        # credentials, audit, watchdog
│   │   ├── sessions/        # session, transcript, beads
│   │   ├── mcp/             # mcp, proxy
│   │   └── ...              # 7 more controller groups
│   ├── services/            # Backend services
│   └── utils/               # Main process utilities
├── renderer/                # React frontend
│   ├── components/          # UI components
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand stores
│   ├── lib/trpc/            # tRPC client setup
│   └── lib/                 # Utilities
├── preload/                 # Preload scripts (contextBridge)
└── shared/                  # Shared types/utilities
```

### Tech Stack

- **Framework**: Electron 34 + electron-vite
- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **IPC**: electron-trpc (type-safe RPC with Zod validation)
- **Terminal**: xterm.js + node-pty
- **Visualization**: Cytoscape.js + React Flow + Recharts
- **State Management**: Zustand + TanStack Query
- **Testing**: Vitest (80% coverage) + Playwright (E2E)

## Security

Claude Pilot implements multiple security layers:

- **Context Isolation**: Renderer process is sandboxed with `contextIsolation: true`
- **Node Integration Disabled**: `nodeIntegration: false` prevents renderer access to Node.js
- **Sandbox Enabled**: `sandbox: true` for all renderer processes
- **Type-Safe IPC**: All 201 handlers use tRPC with Zod validation (no raw IPC)
- **Credential Storage**: OS-level encryption via Electron safeStorage
- **Content Security Policy**: Strict CSP prevents XSS and data injection
- **Input Sanitization**: Shell commands are sanitized to prevent injection
- **Permission Handling**: Sensitive permissions (camera, microphone, geolocation) are denied by default

### Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via GitHub Security Advisories.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm run test:run`)
5. Run linting (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

- TypeScript: Prettier formatting, 2-space indentation, explicit types
- Commit messages: Use conventional commits format
- Tests: Write tests for new features and bug fixes

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Anthropic](https://anthropic.com) - Claude AI
- [Electron](https://electronjs.org) - Desktop framework
- [React](https://react.dev) - UI library
- [Tailwind CSS](https://tailwindcss.com) - Styling

## Support

- **Documentation**: [https://alexmayhew.dev/claude-pilot](https://alexmayhew.dev/claude-pilot)
- **Issues**: [GitHub Issues](https://github.com/alexmayhew/claude-pilot/issues)

---

Made with care by [Alex Mayhew](https://alexmayhew.dev)
