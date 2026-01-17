# Claude Pilot Documentation

> Professional session control for Claude Code - manage profiles, monitor resources, and orchestrate workflows.

## What is Claude Pilot?

Claude Pilot is an Electron-based desktop application that serves as a command center for Claude Code developers. It provides:

- **Real-time monitoring** of Claude Code sessions, resource usage, and system health
- **MCP server management** with visual configuration and status tracking
- **Memory system integration** with PostgreSQL, Memgraph, and Qdrant vector search
- **Profile management** for switching between different Claude configurations
- **Transcript analysis** for reviewing conversation history with streaming support
- **Integrated terminal** for running Claude Code directly within the app
- **Beads work tracking** for task management integrated with Claude workflows

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build for production
npm run dist:linux  # or dist:mac, dist:win
```

## Documentation Index

| Document                          | Description                                     |
| --------------------------------- | ----------------------------------------------- |
| [Architecture](./ARCHITECTURE.md) | System design, component structure, data flow   |
| [Features](./FEATURES.md)         | Detailed feature documentation with screenshots |
| [API Reference](./API.md)         | IPC channels, types, and usage examples         |
| [Security](./SECURITY.md)         | Security model, threat analysis, best practices |
| [Development](./DEVELOPMENT.md)   | Setup, testing, debugging, contributing         |
| [Roadmap](./ROADMAP.md)           | Planned features and improvements               |

## Tech Stack

| Layer         | Technology                           |
| ------------- | ------------------------------------ |
| Framework     | Electron 34 + electron-vite          |
| Frontend      | React 19 + TypeScript + Tailwind CSS |
| State         | Zustand (global state management)    |
| Terminal      | xterm.js + node-pty                  |
| Visualization | Cytoscape.js + React Flow + Recharts |
| Storage       | better-sqlite3 + electron-store      |
| Testing       | Vitest + Playwright                  |
| CI/CD         | GitHub Actions + CodeRabbit AI       |

## System Requirements

- **Node.js**: 20.x or later
- **Operating System**: Linux, macOS, or Windows
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Disk**: 500MB for application, additional for logs

## Optional Integrations

Claude Pilot integrates with external services when available:

- **PostgreSQL** (port 5433): For learnings/memory persistence
- **Memgraph** (port 7687): For knowledge graph queries
- **Qdrant** (port 6333): For vector similarity search
- **Ollama**: For local LLM embeddings and inference

## License

MIT License - see LICENSE file for details.

## Links

- [GitHub Repository](https://github.com/LecoMV/claude-pilot)
- [Issue Tracker](https://github.com/LecoMV/claude-pilot/issues)
- [Releases](https://github.com/LecoMV/claude-pilot/releases)
