# Legacy IPC Migration Status

> **Generated**: 2026-01-18
> **Audit**: Antigravity Enterprise Audit Remediation

## Summary

| Metric                            | Count |
| --------------------------------- | ----- |
| Total Legacy Handlers             | 223   |
| Handlers with ZERO frontend usage | 97    |
| Handlers still in use             | 74    |
| tRPC Controllers                  | 36    |
| Frontend Legacy IPC Calls         | 116   |

## Migration Architecture

### Hybrid IPC Pattern (Per Research)

```
┌─────────────────────────────────────────────────────────────┐
│                       FRONTEND                               │
├─────────────────────────────────────────────────────────────┤
│  Control Operations        │        Data Streaming          │
│  ──────────────────────    │   ────────────────────────     │
│  trpc.terminal.create()    │   window.electron.send()       │
│  trpc.terminal.resize()    │   window.electron.on()         │
│  trpc.system.status()      │   (terminal:write/data)        │
└─────────────────────────────────────────────────────────────┘
                    │                        │
                    ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                       MAIN PROCESS                           │
├─────────────────────────────────────────────────────────────┤
│  tRPC Controllers          │   Legacy IPC Handlers          │
│  ──────────────────────    │   (terminal.ts service)        │
│  36 routers                │   terminal:write               │
│  Type-safe + Zod           │   terminal:data:*              │
└─────────────────────────────────────────────────────────────┘
```

## Handlers with ZERO Frontend Usage (Safe to Remove)

These 97 handlers have tRPC equivalents and no frontend calls:

### Audit Domain

- `audit:siem:flush`
- `audit:siem:getEndpoints`
- `audit:siem:getStats`
- `audit:siem:setEnabled`
- `audit:siem:unregister`
- `audit:stats`

### Branches Domain

- `branches:abandon`
- `branches:delete`
- `branches:get`
- `branches:getActiveBranch`
- `branches:getTree`
- `branches:list`
- `branches:merge`
- `branches:rename`
- `branches:stats`
- `branches:switch`

### Credentials Domain

- `credentials:has`
- `credentials:retrieve`

### Embedding Domain

- `embedding:cacheStats`
- `embedding:clearCache`
- `embedding:clearDeadLetterQueue`
- `embedding:deadLetterQueue`
- `embedding:embed`
- `embedding:metrics`
- `embedding:processSession`
- `embedding:resetAllSessionPositions`
- `embedding:resetMetrics`
- `embedding:retryDeadLetterQueue`
- `embedding:startAutoEmbed`
- `embedding:status`
- `embedding:stopAutoEmbed`
- `embedding:unloadModel`
- `embedding:vectorStoreStats`
- `embedding:warmupModel`

### Logs Domain

- `logs:stopStream`
- `logs:stream`

### MCP Proxy Domain

- `mcp:getServer`
- `mcp:proxy:config`
- `mcp:proxy:connect`
- `mcp:proxy:connectAll`
- `mcp:proxy:disconnect`
- `mcp:proxy:prompts`
- `mcp:proxy:resources`
- `mcp:proxy:servers`
- `mcp:proxy:stats`
- `mcp:proxy:tools`

### Observability Domain

- `observability:getActiveSpans`
- `observability:getConfig`
- `observability:getMetrics`
- `observability:getRecentSpans`
- `observability:getStats`

### Other Domains

- `beads:get`
- `claude:version`
- `pgvector:collections`
- `pgvector:embed`
- `pgvector:rebuildIndex`
- `plans:get`
- `plans:update`
- `profiles:get`
- `sessions:get`
- `sessions:watch`
- `settings:get`
- `settings:save`
- `settings:setBudget`
- `shell:openExternal`
- `stream:close`
- `stream:getStatus`
- `stream:list`
- `stream:stats`
- `system:resources`
- `transcript:last`
- `transcript:parse`
- `transcript:stats`
- `transcript:watch`
- `treesitter:*` (all)
- `update:download`
- `update:install`
- `watchdog:*` (all)
- `workers:*` (all)

## Handlers Still in Use (74) - Need Component Migration

### Agents Domain → `agentsRouter`

- `agents:hiveMindStatus`
- `agents:initSwarm`
- `agents:list`
- `agents:shutdownSwarm`
- `agents:spawn`
- `agents:swarmStatus`
- `agents:terminate`

### Beads Domain → `beadsRouter`

- `beads:blocked`
- `beads:close`
- `beads:create`
- `beads:hasBeads`
- `beads:list`
- `beads:ready`
- `beads:stats`
- `beads:update`

### Claude Domain → `claudeRouter`

- `claude:projects`

### Context Domain → `contextRouter`

- `context:clearCache`
- `context:compact`
- `context:compactionSettings`
- `context:getConfig`
- `context:patterns`
- `context:sessions`
- `context:setAutoCompact`
- `context:setConfig`
- `context:stats`
- `context:tokenUsage`

### Credentials Domain → `credentialsRouter`

- `credentials:delete`
- `credentials:isEncryptionAvailable`
- `credentials:list`
- `credentials:store`

### Dialog Domain → `systemRouter`

- `dialog:openDirectory`

### Logs Domain → `logsRouter`

- `logs:recent`

### MCP Domain → `mcpRouter`

- `mcp:getConfig`
- `mcp:list`
- `mcp:reload`
- `mcp:saveConfig`
- `mcp:toggle`

### Memory Domain → `memoryRouter`

- `memory:learnings`

### Ollama Domain → `ollamaRouter`

- `ollama:delete`
- `ollama:list`
- `ollama:pull`
- `ollama:run`
- `ollama:running`
- `ollama:status`
- `ollama:stop`

### PgVector Domain → `pgvectorRouter`

- `pgvector:getAutoConfig`
- `pgvector:status`
- `pgvector:vacuum`

### Plans Domain → `plansRouter`

- `plans:cancel`
- `plans:create`
- `plans:delete`
- `plans:execute`
- `plans:list`
- `plans:pause`
- `plans:resume`
- `plans:stats`

### Profiles Domain → `profilesRouter`

- `profile:claudemd`
- `profile:rules`
- `profile:saveClaudemd`
- `profile:saveRule`
- `profile:saveSettings`
- `profile:settings`
- `profile:toggleRule`
- `profiles:activate`
- `profiles:delete`
- `profiles:getActive`
- `profiles:list`

### Services Domain → `servicesRouter`

- `services:podman`
- `services:systemd`

### Sessions Domain → `sessionRouter`

- `sessions:discover`
- `sessions:getActive`
- `sessions:getMessages`

### Shell/System Domain → `systemRouter`

- `shell:openPath`
- `system:getHomePath`
- `system:status`

### Terminal Domain → `terminalRouter`

- `terminal:openAt`

## Terminal Data Streaming (Keep in Legacy IPC)

Per hybrid architecture, these stay in `src/main/services/terminal.ts`:

```typescript
// HIGH-FREQUENCY DATA - Keep in legacy IPC
ipcMain.on('terminal:write', ...)   // Input to PTY
ipcMain.on('terminal:resize', ...)  // Resize events
ipcMain.on('terminal:close', ...)   // Close session
```

## Migration Pattern for Components

```typescript
// BEFORE (Legacy IPC)
const result = await window.electron.invoke('system:status')

// AFTER (tRPC)
import { trpc } from '@/lib/trpc/react'
const { data, isLoading, error } = trpc.system.status.useQuery()
```

## Cleanup Roadmap

### Phase 1: ✅ Complete

- WatchdogService async refactor
- Frontend hooks migration
- Frontend stores migration
- Terminal hybrid implementation

### Phase 2: In Progress

- Document migration status (this file)
- Add deprecation logging to handlers.ts
- Incremental component migration

### Phase 3: Future

- Delete unused handlers (97)
- Migrate remaining components (74 handlers)
- Remove handlers.ts entirely
- Update preload.ts to remove legacy channel allowlist

## Verification Commands

```bash
# Count legacy IPC calls in frontend
grep -r "invoke(" src/renderer/ --include="*.ts" --include="*.tsx" | wc -l

# List handlers with no usage
comm -23 \
  <(grep -oP "ipcMain.handle\('\K[^']+" src/main/ipc/handlers.ts | sort -u) \
  <(grep -r "invoke(" src/renderer/ | grep -oP "invoke\('\K[^']+" | sort -u)

# Verify tRPC controllers
find src/main/controllers -name "*.ts" -type f | wc -l
```
