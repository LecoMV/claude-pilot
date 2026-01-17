# Claude Pilot Gap Analysis

Based on Gemini Deep Research audit dated 2026-01-17.

## Implementation Status Summary

| Category         | Implemented | Partial | Missing |
| ---------------- | ----------- | ------- | ------- |
| Security         | 5           | 0       | 0       |
| Configuration    | 1           | 1       | 4       |
| MCP Protocol     | 2           | 1       | 4       |
| Desktop/Electron | 3           | 1       | 2       |
| Data Persistence | 3           | 0       | 3       |
| Hybrid Inference | 2           | 0       | 2       |
| Observability    | 2           | 1       | 2       |

---

## ✅ FULLY IMPLEMENTED

### Security (5/5)

- [x] **IPC Security** - contextBridge with typed channel whitelist (212 channels)
- [x] **safeStorage** - OS keychain credential encryption
- [x] **OCSF Audit Logging** - Structured security events
- [x] **Input Sanitization** - Shell injection prevention
- [x] **SQL/Cypher Injection Prevention** - Parameterized queries, dangerous pattern blocking

### Data Persistence (3/6)

- [x] **RRF Hybrid Search** - `memory:unified-search` with Reciprocal Rank Fusion
- [x] **pgvector Embeddings** - Vector similarity search
- [x] **Cytoscape Graph Visualization** - Knowledge graph rendering

### Desktop/Electron (3/6)

- [x] **safeStorage Credentials** - Linux libsecret, macOS Keychain, Windows DPAPI
- [x] **contextBridge IPC** - Typed, validated inter-process communication
- [x] **Streaming Transcript Service** - Efficient large file handling

### Observability (2/5)

- [x] **Session/Transcript Viewer** - Real-time message display
- [x] **OCSF Audit Trail** - Query and export events

### Features Already Built

- [x] Ollama integration (model management)
- [x] Beads work tracking
- [x] Predictive context
- [x] Smart compaction
- [x] Plan execution
- [x] Conversation branching
- [x] GPU monitoring (NVIDIA)
- [x] **Cost Ticker & Budget Controls** - Real-time cost tracking, budget limits, alerts, model breakdown

---

## ⚠️ PARTIALLY IMPLEMENTED

### Configuration (Audit Section 2)

| Feature                               | Status | Gap                     |
| ------------------------------------- | ------ | ----------------------- |
| User scope (~/.claude/settings.json)  | ✅     | -                       |
| Project scope (.claude/settings.json) | ⚠️     | Read-only, no UI editor |
| Local scope (settings.local.json)     | ❌     | Not implemented         |
| CLI flags                             | ⚠️     | Not in desktop app      |
| Managed scope                         | ❌     | Enterprise feature      |

### MCP Protocol (Audit Section 3)

| Feature             | Status | Gap                      |
| ------------------- | ------ | ------------------------ |
| Stdio transport     | ✅     | Via MCP servers          |
| SSE transport       | ✅     | Via config               |
| WebSocket transport | ❌     | Not implemented          |
| Sampling protocol   | ❌     | Server-to-LLM requests   |
| Elicitation         | ❌     | Form/URL user input      |
| Proxy/Federation    | ❌     | Multi-server aggregation |

### Desktop/Electron (Audit Section 5)

| Feature                  | Status | Gap                 |
| ------------------------ | ------ | ------------------- |
| Large log virtualization | ❌     | No react-window     |
| Auto-update              | ❌     | No electron-updater |
| electron-trpc            | ❌     | Using raw IPC       |

---

## ❌ NOT IMPLEMENTED

### Priority 1: Configuration Architecture (Section 2)

1. **5-Tier Configuration Scope System**
   - Managed scope (system-level enforcement)
   - CLI flags scope
   - Local scope (gitignored, machine-specific)
   - Project scope (team-shared)
   - User scope (global personal)
   - Cascading merge logic with precedence

2. **Config Diagnostics Command**
   - Show merged configuration
   - Highlight which scope overrides which key
   - Debug shadowing issues

3. **Schema Validation**
   - JSON Schema for settings.json
   - VS Code IntelliSense support
   - Real-time validation

### Priority 2: MCP Advanced Features (Section 3)

4. **MCP Sampling Protocol**
   - Handle `sampling/createMessage` requests from servers
   - Security gate with user approval
   - Cost budget controls

5. **MCP Elicitation**
   - Form mode: Dynamic form rendering from JSON schema
   - URL mode: OAuth/browser-based auth flows
   - Security: Never proxy credentials inline

6. **MCP Proxy/Federation**
   - Aggregate multiple MCP servers
   - Federated search across all connected tools
   - Capability routing

### Priority 3: Hybrid Inference (Section 7)

7. **Smart Inference Router**
   - Route low-stakes tasks to Ollama (local)
   - Route complex tasks to Claude API
   - Configurable routing rules

8. ~~**Cost Ticker/Budget Controls**~~ ✅ **IMPLEMENTED**
   - ~~Real-time cost display per session~~ → Dashboard CostTracker component
   - ~~max_budget_usd circuit breaker~~ → Budget settings with alerts
   - ~~Extended thinking controls~~ → Partial (model pricing tracked)

### Priority 4: Visualization (Section 6)

9. **Cosmograph Integration**
   - GPU-accelerated graph rendering
   - Handle 100k+ nodes
   - Replace Cytoscape for large codebases

10. **Tree-sitter Codebase Parser**
    - Extract imports/exports
    - Build dependency graph
    - "Visual RAG" interface

### Priority 5: Observability (Section 8)

11. **OpenTelemetry Integration**
    - Implement otelHeadersHelper
    - Trace agent activities
    - Enterprise observability platform support

12. **Context Inspector**
    - Show what's in context window
    - Debug hallucinations
    - Token allocation visualization

### Priority 6: Desktop Polish (Section 5)

13. **react-window Virtualization**
    - Large log rendering
    - Prevent UI freezes
    - Constant DOM size

14. **Auto-Update (electron-updater)**
    - Background download
    - Install on quit
    - Multiple update providers

### Priority 7: Local-First Data (Section 6)

15. **RxDB/CR-SQLite Integration**
    - Offline-first session history
    - Peer-to-peer sync (CRDT)
    - No cloud dependency

---

## Implementation Roadmap

### Q1 (Immediate)

1. Configuration scope system (5-tier)
2. MCP Sampling protocol
3. Cost ticker UI

### Q2 (Strategic)

4. MCP Elicitation (forms/OAuth)
5. Smart inference router
6. react-window virtualization

### Q3 (Expansion)

7. Cosmograph integration
8. Tree-sitter parser
9. OpenTelemetry

### Q4 (Enterprise)

10. MCP Proxy/Federation
11. Auto-update system
12. RxDB/CR-SQLite sync

---

## Beads Created

| Bead ID     | Title                                           | Priority | Type    |
| ----------- | ----------------------------------------------- | -------- | ------- |
| deploy-qu36 | EPIC: Gemini Deep Research Audit Implementation | P0       | epic    |
| deploy-ein4 | Implement 5-tier configuration scope system     | P1       | feature |
| deploy-toag | Add MCP Sampling protocol support               | P1       | feature |
| deploy-kc80 | Add cost ticker and budget controls UI          | P1       | feature |
| deploy-uz39 | Implement MCP Elicitation (forms/OAuth)         | P2       | feature |
| deploy-rfl5 | Add smart inference router (Ollama/Claude)      | P2       | feature |
| deploy-nnea | Add react-window virtualization for logs        | P2       | task    |
| deploy-98xz | Add context inspector panel                     | P2       | feature |
| deploy-6elk | Integrate Cosmograph for large graph viz        | P3       | feature |
| deploy-4u2e | Add Tree-sitter codebase parsing                | P3       | feature |
| deploy-rjvh | Add OpenTelemetry observability support         | P3       | feature |
| deploy-9xfr | Add electron-updater auto-update                | P3       | task    |
| deploy-zebp | Add MCP Proxy/Federation support                | P3       | feature |
