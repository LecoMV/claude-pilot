# Features Documentation

## Dashboard

The main dashboard provides a real-time overview of system health and Claude Code activity.

### System Status Panel

- **Claude Code Version**: Displays installed Claude Code version
- **MCP Server Status**: Count of enabled/disabled servers
- **Memory System Status**: Connection status for PostgreSQL, Memgraph, Qdrant
- **Active Sessions**: List of running Claude Code sessions

### Resource Monitor

Real-time charts showing:

- CPU usage (per-core breakdown)
- Memory usage (used/available/cached)
- GPU usage and temperature (NVIDIA via nvidia-smi)
- Disk I/O statistics

### Quick Actions

- Launch new Claude Code session
- Toggle MCP servers
- Open terminal
- Trigger memory compaction

---

## MCP Server Manager

Comprehensive management of Model Context Protocol (MCP) servers.

### Server List View

| Column  | Description                   |
| ------- | ----------------------------- |
| Name    | Server identifier             |
| Status  | Running/Stopped/Error         |
| Type    | stdio, sse, http              |
| Actions | Enable/Disable, Edit, Restart |

### Configuration Editor

Monaco-based JSON editor for direct MCP configuration editing:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Server Monitoring

- Connection status polling
- Tool discovery and listing
- Error log viewing
- Restart/reload without app restart

---

## Memory Browser

Unified search interface across multiple memory backends.

### PostgreSQL Integration

Query learnings stored in the claude_memory database:

- **Full-text search** with ILIKE
- **Recent learnings** sorted by timestamp
- **Category filtering** (concept, tool, pattern, bug, security)
- **Bulk operations** (export, delete)

### Memgraph Graph View

Interactive Cytoscape.js visualization:

- **Node types**: Concept, Tool, Pattern, Decision
- **Relationship display**: RELATES_TO, SOLVES, DEPENDS_ON
- **Layout options**: Force-directed, hierarchical, circular
- **Zoom/pan controls**

### Qdrant Vector Search

Semantic similarity search across memories:

- **Embedding generation** via Ollama
- **Similarity threshold** configuration
- **Collection browser** with point counts
- **Hybrid search** combining vector + keyword

### Global Search

Reciprocal Rank Fusion (RRF) across all sources:

```
Score = Σ (1 / (k + rank_i))
where k = 60 (standard RRF constant)
```

---

## Profile Manager

Manage Claude Code profiles with different configurations.

### Profile List

- **Default profile**: System-wide settings
- **Custom profiles**: Project-specific configurations
- **Quick switcher**: One-click profile activation

### CLAUDE.md Editor

Monaco editor with:

- Markdown syntax highlighting
- Preview pane
- Auto-save with debouncing
- Template insertion

### Rules Configuration

Per-profile rules management:

| Rule Type     | Description                                 |
| ------------- | ------------------------------------------- |
| Always        | Rules that always apply                     |
| Auto-attached | Automatically attached to matching contexts |
| Disabled      | Temporarily disabled rules                  |

---

## Terminal

Integrated xterm.js terminal with Claude Code CLI support.

### Features

- **Multi-tab support**: Multiple concurrent terminals
- **WebGL rendering**: Hardware-accelerated display
- **Auto-fit**: Resize to container automatically
- **Session persistence**: Reconnect to running sessions

### Claude Code Integration

- Launch sessions with profile context
- Streaming output display
- Interactive input support
- Session discovery and attachment

---

## Context Dashboard

Monitor and analyze Claude Code session context.

### Session List

- Active and recent sessions
- Project association
- Token usage statistics
- Duration and cost estimates

### Transcript Viewer

- Real-time message streaming
- Message type filtering (user, assistant, tool)
- Search within transcript
- Export to JSON/Markdown

### Predictive Context Panel

Machine learning-based context prediction:

- File access patterns
- Tool usage predictions
- Compaction recommendations

### Smart Compaction Panel

Intelligent context management:

- Token count monitoring
- Automatic compaction triggers
- Checkpoint management
- Rollback support

---

## Services Manager

Monitor and control system services.

### Systemd Services

Control Linux system services:

| Service    | Actions              |
| ---------- | -------------------- |
| nginx      | Start, Stop, Restart |
| postgresql | Start, Stop, Restart |
| redis      | Start, Stop, Restart |
| docker     | Start, Stop, Restart |

### Podman Containers

Container management:

- List running containers
- Start/stop containers
- View container logs
- Resource usage per container

---

## Ollama Integration

Local LLM management via Ollama.

### Model Library

- Available models listing
- Model download/pull
- Model deletion
- Storage usage tracking

### Running Models

- Active model instances
- VRAM usage monitoring
- Load/unload controls
- Inference testing

---

## Beads Work Tracking

Integrated issue/task tracking for Claude workflows.

### Issue List

- Open/closed/in-progress filtering
- Priority sorting (P0-P4)
- Type categorization (bug, feature, task)
- Dependency visualization

### Quick Actions

- Create new issue
- Update status
- Add dependencies
- Close with reason

---

## Settings

Application configuration and preferences.

### General Settings

- Theme (dark/light/system)
- Default profile
- Startup behavior
- Notification preferences

### Credential Manager

Secure credential storage via OS keychain:

- API key management
- Token storage
- Credential listing
- Secure deletion

### Data Sources

Configure external service connections:

```yaml
PostgreSQL:
  host: localhost
  port: 5433
  database: claude_memory

Memgraph:
  host: localhost
  port: 7687

Qdrant:
  host: localhost
  port: 6333
```

### Audit Logs

OCSF-compliant audit trail:

- Event category filtering
- Time range queries
- Export to JSON/CSV
- Retention management

---

## Keyboard Shortcuts

| Shortcut   | Action             |
| ---------- | ------------------ |
| `Ctrl+K`   | Command palette    |
| `Ctrl+,`   | Settings           |
| `Ctrl+``   | Toggle terminal    |
| `Ctrl+1-9` | Switch to tab      |
| `Ctrl+N`   | New terminal       |
| `Ctrl+W`   | Close terminal     |
| `F5`       | Refresh status     |
| `Esc`      | Close modal/dialog |
