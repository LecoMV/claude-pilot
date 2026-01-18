# IPC Controller Migration Research

> **Date**: 2026-01-18
> **Auditor**: Antigravity (Google DeepMind)
> **Status**: Research Complete, Plan Ready

---

## Executive Summary

Following the successful elimination of 36 `execSync` blocking calls, the next architectural improvement is migrating the 201 remaining legacy IPC handlers from the `handlers.ts` monolith (5,800 lines) to type-safe tRPC controllers.

**Key Findings:**

- electron-trpc is the recommended approach (already in use)
- 22 handlers (10%) already migrated to 5 controllers
- 201 handlers remain across 30 domains
- Security domains should be prioritized first

---

## Research Sources

### Primary References

1. **Electron IPC Architecture** - Official Electron docs
2. **electron-trpc** - https://electron-trpc.dev/
3. **NestJS-style Controllers** - @doubleshot/nest-electron pattern
4. **Domain-Driven Design** - Handler grouping by business domain

### Key Articles

- [Build Electron Apps Like NestJS](https://dev.to/29_x_395a8d7880988c00d53f/build-electron-apps-like-nestjs-modular-architecture-multi-window-management-and-typed-ipc-15oh)
- [Electron IPC Response-Request Architecture](https://blog.logrocket.com/electron-ipc-response-request-architecture-with-typescript/)
- [Using React and tRPC with Electron](https://www.funtoimagine.com/blog/using-react-trpc-electron/)

---

## Architecture Decision: electron-trpc

### Why electron-trpc Over Alternatives

| Approach          | Type Safety | Bundle Size | Migration Effort | DX        |
| ----------------- | ----------- | ----------- | ---------------- | --------- |
| Legacy ipcMain    | ❌ None     | 0KB         | N/A              | Poor      |
| Channel Interface | ⚠️ Manual   | 0KB         | Medium           | Fair      |
| NestJS/Doubleshot | ✅ Full     | ~500KB      | High             | Good      |
| **electron-trpc** | ✅ Full     | ~30KB       | Low              | Excellent |
| Custom RPC        | ⚠️ Manual   | Variable    | Very High        | Variable  |

**Verdict**: electron-trpc provides the best balance of type safety, bundle size, and developer experience for Claude Pilot.

### Existing Infrastructure

```
src/main/
├── trpc/
│   ├── trpc.ts          # Base instance with audit middleware
│   ├── context.ts       # IPC context bridge
│   └── router.ts        # App router aggregation
└── controllers/
    ├── demo.controller.ts      # Pattern showcase (working)
    ├── system.controller.ts    # System status (3 procedures)
    ├── memory.controller.ts    # Memory ops (partial)
    ├── embedding.controller.ts # Embeddings (19 procedures)
    └── config.controller.ts    # 5-tier config resolver
```

---

## Handler Domain Analysis

### Current State (handlers.ts)

- **Total Lines**: 5,868
- **Total Handlers**: 223
- **Migrated**: 22 (10%)
- **Remaining**: 201 (90%)
- **Domains**: 30

### Domain Breakdown by Priority

#### P0 - Critical Security (26 handlers)

| Domain      | Handlers | Service           | Complexity |
| ----------- | -------- | ----------------- | ---------- |
| credentials | 7        | credentialService | Low        |
| audit       | 11       | auditService      | Medium     |
| watchdog    | 8        | watchdogService   | Medium     |

#### P1 - Core Integration (19 handlers)

| Domain    | Handlers | Service         | Complexity |
| --------- | -------- | --------------- | ---------- |
| mcp       | 10       | mcpProxyService | High       |
| mcp:proxy | 9        | mcpProxyService | High       |

#### P2 - Session Management (30 handlers)

| Domain     | Handlers | Service                  | Complexity |
| ---------- | -------- | ------------------------ | ---------- |
| sessions   | 4        | filesystem/watchers      | Medium     |
| transcript | 4        | transcriptService        | Medium     |
| beads      | 9        | CLI integration          | Medium     |
| context    | 13       | predictiveContextService | Medium     |

#### P3 - Analysis Tools (40 handlers)

| Domain     | Handlers | Service           | Complexity |
| ---------- | -------- | ----------------- | ---------- |
| ollama     | 8        | fetch/spawnAsync  | Medium     |
| plans      | 10       | planService       | High       |
| branches   | 8        | branchService     | High       |
| treesitter | 9        | treeSitterService | High       |
| pgvector   | 5        | postgresService   | Medium     |

#### P4 - Utilities (86 handlers)

| Domain           | Handlers | Service        | Complexity |
| ---------------- | -------- | -------------- | ---------- |
| profile/profiles | 12       | filesystem     | Low        |
| logs             | 3        | journalctl     | Low        |
| agents           | 6        | process mgmt   | Medium     |
| services         | 2        | systemd/podman | Low        |
| settings         | 3        | electron-store | Low        |
| workers          | 3        | workerPool     | Low        |
| stream           | 4        | streaming      | Low        |
| update           | 2        | autoUpdater    | Low        |
| claude           | 2        | filesystem     | Low        |
| terminal         | 1        | shell          | Low        |

---

## Controller Pattern

### Standard Controller Template

```typescript
// src/main/controllers/security/credentials.controller.ts
import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { credentialService } from '../../services/credentials'

const CredentialKeySchema = z.object({
  key: z.string().min(1).max(100),
})

export const credentialsRouter = router({
  get: publicProcedure.input(CredentialKeySchema).query(async ({ input }) => {
    return credentialService.get(input.key)
  }),

  set: auditedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await credentialService.set(input.key, input.value)
      ctx.audit.log('credential.set', { key: input.key })
      return { success: true }
    }),
})
```

### Router Composition

```typescript
// src/main/trpc/router.ts
export const appRouter = router({
  // Existing
  system: systemRouter,
  memory: memoryRouter,
  embedding: embeddingRouter,
  config: configRouter,

  // Sprint 1: Security
  credentials: credentialsRouter,
  audit: auditRouter,
  watchdog: watchdogRouter,

  // Sprint 2: MCP
  mcp: mcpRouter,
  proxy: proxyRouter,
  // ...
})

export type AppRouter = typeof appRouter
```

---

## Migration Strategy

### Coexistence Pattern

```typescript
// src/main/index.ts
app.whenReady().then(() => {
  // New: tRPC handlers (growing)
  initializeTRPC(mainWindow)

  // Legacy: Traditional IPC handlers (shrinking)
  registerIpcHandlers()
})
```

### Handler Deprecation Process

1. Create controller with equivalent tRPC procedures
2. Update frontend to use tRPC client
3. Add deprecation comment to legacy handler
4. Verify no IPC calls remain
5. Delete legacy handler

### Frontend Migration

```typescript
// Before (legacy)
const data = await window.api.invoke('credentials:get', key)

// After (tRPC)
const { data } = trpc.credentials.get.useQuery({ key })
```

---

## Testing Strategy

### Unit Tests with tRPC Caller

```typescript
const ctx = createMockContext()
const caller = appRouter.createCaller(ctx)

ctx.services.credentials.get.mockResolvedValue('secret')

const result = await caller.credentials.get({ key: 'api-key' })
expect(result).toBe('secret')
```

### spawn-async Tests

Edge cases to cover:

- Timeout handling
- Large buffer output
- Signal handling (SIGTERM, SIGKILL)
- Non-zero exit codes
- stderr vs stdout
- Command not found (ENOENT)

---

## Timeline

| Sprint | Scope               | Handlers | Duration |
| ------ | ------------------- | -------- | -------- |
| 1      | Security            | 26       | 5 days   |
| 2      | MCP                 | 19       | 5 days   |
| 3      | Sessions            | 17       | 5 days   |
| 4      | Context/Analysis    | 32       | 5 days   |
| 5      | Integrations        | 31       | 5 days   |
| 6      | Utilities + Cleanup | 76       | 5 days   |

**Total**: 6 sprints (30 days / 3 weeks with buffer)

---

## Success Metrics

| Metric            | Current | Target |
| ----------------- | ------- | ------ |
| handlers.ts lines | 5,800   | 0      |
| Legacy handlers   | 201     | 0      |
| tRPC controllers  | 5       | 25+    |
| Test coverage     | ~60%    | 95%+   |
| Type safety       | Partial | 100%   |

---

## Files Created

1. **Plan**: `/home/deploy/.claude/plans/handlers-controller-migration.md`
2. **Research**: `/home/deploy/projects/claude-command-center/docs/Research/IPC-CONTROLLER-MIGRATION-RESEARCH.md`
3. **Testing Guide**: `/home/deploy/projects/claude-command-center/docs/TESTING_SPAWN_WRAPPER_BEST_PRACTICES.md`

---

## Related Beads

- `deploy-qu36` - EPIC: Gemini Research Implementation
- `deploy-482i` - electron-trpc Production
- `deploy-scb9` - Worker Thread Optimization

---

## Next Steps

1. Review and approve migration plan
2. Start Sprint 1: Security controllers
3. Track progress in Beads
4. Verify metrics after each sprint
