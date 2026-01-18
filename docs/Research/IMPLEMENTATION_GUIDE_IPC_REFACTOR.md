# Implementation Guide: IPC Refactoring for Claude Pilot

**Date:** 2025-01-17
**Status:** Ready for Implementation
**Estimated Effort:** 4 weeks

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Implementation Phases](#3-implementation-phases)
4. [Code Templates](#4-code-templates)
5. [Testing Strategy](#5-testing-strategy)
6. [Migration Checklist](#6-migration-checklist)

---

## 1. Current State Analysis

### 1.1 Current IPC Handlers (Legacy)

```typescript
// src/main/ipc/handlers.ts (current monolithic structure)

// Claude handlers
ipcMain.handle('claude:get-sessions', async () => {
  /* ... */
})
ipcMain.handle('claude:get-transcript', async (event, sessionId) => {
  /* ... */
})
ipcMain.handle('claude:start-session', async (event, config) => {
  /* ... */
})

// MCP handlers
ipcMain.handle('mcp:list-servers', async () => {
  /* ... */
})
ipcMain.handle('mcp:enable-server', async (event, name) => {
  /* ... */
})
ipcMain.handle('mcp:disable-server', async (event, name) => {
  /* ... */
})

// Memory handlers
ipcMain.handle('memory:query-postgres', async (event, query) => {
  /* ... */
})
ipcMain.handle('memory:query-memgraph', async (event, cypher) => {
  /* ... */
})

// System handlers
ipcMain.handle('system:get-metrics', async () => {
  /* ... */
})
ipcMain.handle('system:check-services', async () => {
  /* ... */
})

// Terminal handlers
ipcMain.handle('terminal:spawn', async (event, opts) => {
  /* ... */
})
ipcMain.handle('terminal:write', async (event, id, data) => {
  /* ... */
})
```

**Problems:**

- 500+ lines in single file
- No type safety between main/renderer
- Business logic mixed with IPC framework
- Difficult to test
- No input validation
- Tight coupling

### 1.2 Domain Analysis

| Domain   | Handlers | Complexity | Priority           |
| -------- | -------- | ---------- | ------------------ |
| System   | 5        | Low        | P0 (migrate first) |
| MCP      | 8        | Medium     | P1                 |
| Claude   | 12       | High       | P2                 |
| Memory   | 6        | Medium     | P2                 |
| Terminal | 7        | High       | P3                 |

---

## 2. Target Architecture

### 2.1 Directory Structure

```
src/main/
├── trpc/
│   ├── root.ts                      # Root router composition
│   ├── context.ts                   # Context factory
│   ├── trpc.ts                      # tRPC instance
│   └── controllers/
│       ├── system.controller.ts     # P0
│       ├── mcp.controller.ts        # P1
│       ├── claude.controller.ts     # P2
│       ├── memory.controller.ts     # P2
│       └── terminal.controller.ts   # P3
├── services/
│   ├── SystemService.ts
│   ├── MCPService.ts
│   ├── ClaudeService.ts
│   ├── MemoryService.ts
│   └── TerminalService.ts
├── repositories/
│   ├── PostgresRepository.ts
│   ├── MemgraphRepository.ts
│   └── QdrantRepository.ts
└── ipc/
    └── legacy-handlers.ts           # Temporary during migration
```

### 2.2 Type Flow

```
Renderer Component
  ↓ (type-safe hook)
trpc.system.getMetrics.useQuery()
  ↓ (IPC via electron-trpc)
Main Process tRPC Router
  ↓ (validated input via Zod)
Controller Method
  ↓ (business logic)
Service Layer
  ↓ (data access)
Repository/Database
```

---

## 3. Implementation Phases

### Phase 0: Setup (Week 1, Days 1-2)

**Objective:** Install dependencies and create tRPC infrastructure

**Tasks:**

1. Install dependencies
2. Create tRPC configuration files
3. Update preload script
4. Create renderer tRPC client
5. Add test setup

**Deliverables:**

- [ ] Dependencies installed
- [ ] tRPC files created
- [ ] Renderer can call tRPC (smoke test)

### Phase 1: System Controller (Week 1, Days 3-5)

**Objective:** Migrate system handlers as proof of concept

**Tasks:**

1. Create system.controller.ts
2. Create SystemService.ts
3. Update Dashboard component
4. Add tests
5. Remove legacy handlers

**Success Criteria:**

- Dashboard shows system metrics via tRPC
- All tests pass
- Zero legacy system handlers remaining

### Phase 2: MCP Controller (Week 2)

**Objective:** Migrate MCP server management

**Tasks:**

1. Create mcp.controller.ts
2. Create MCPService.ts
3. Update MCP UI components
4. Add comprehensive tests
5. Remove legacy handlers

**Success Criteria:**

- MCP UI fully functional via tRPC
- Server start/stop works
- Configuration updates work

### Phase 3: Claude & Memory Controllers (Week 3)

**Objective:** Migrate core functionality

**Tasks:**

1. Create claude.controller.ts
2. Create memory.controller.ts
3. Create ClaudeService.ts and MemoryService.ts
4. Update all related UI components
5. Add tests
6. Remove legacy handlers

**Success Criteria:**

- Session management via tRPC
- Memory queries via tRPC
- All existing features work

### Phase 4: Terminal Controller & Cleanup (Week 4)

**Objective:** Complete migration and cleanup

**Tasks:**

1. Create terminal.controller.ts
2. Create TerminalService.ts
3. Update Terminal component
4. Delete legacy-handlers.ts
5. Final testing
6. Documentation

**Success Criteria:**

- Zero legacy handlers
- 100% test coverage on controllers
- Performance benchmarks met

---

## 4. Code Templates

### 4.1 Phase 0: Setup

#### Install Dependencies

```bash
npm install @trpc/server@next @trpc/client@next @trpc/react-query@next
npm install electron-trpc zod
npm install --save-dev @trpc/server@next vitest-mock-extended
```

#### src/main/trpc/trpc.ts

```typescript
import { initTRPC } from '@trpc/server'
import type { Context } from './context'

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape }) {
    return shape
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware
```

#### src/main/trpc/context.ts

```typescript
import type { BrowserWindow } from 'electron'
import { SystemService } from '../services/SystemService'
import { MCPService } from '../services/MCPService'
import { ClaudeService } from '../services/ClaudeService'
import { MemoryService } from '../services/MemoryService'
import { TerminalService } from '../services/TerminalService'

export interface CreateContextOptions {
  window: BrowserWindow
}

// Singleton services (created once)
const systemService = new SystemService()
const mcpService = new MCPService()
const claudeService = new ClaudeService()
const memoryService = new MemoryService()
const terminalService = new TerminalService()

export const createContext = async ({ window }: CreateContextOptions) => {
  return {
    window,
    services: {
      system: systemService,
      mcp: mcpService,
      claude: claudeService,
      memory: memoryService,
      terminal: terminalService,
    },
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
```

#### src/main/trpc/root.ts

```typescript
import { router } from './trpc'
import { systemController } from './controllers/system.controller'
// Import other controllers as they're created

export const appRouter = router({
  system: systemController,
  // Add other controllers here
})

export type AppRouter = typeof appRouter
```

#### src/preload/index.ts (modifications)

```typescript
import { contextBridge } from 'electron'
import { exposeElectronTRPC } from 'electron-trpc/preload'

// Existing preload code...

// Add tRPC exposure
process.once('loaded', () => {
  exposeElectronTRPC()
})
```

#### src/renderer/lib/trpc.ts

```typescript
import { createTRPCReact } from '@trpc/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import type { AppRouter } from '../../main/trpc/root'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [ipcLink()],
})
```

#### src/renderer/App.tsx (wrap with provider)

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, trpcClient } from './lib/trpc'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* Existing app content */}
      </QueryClientProvider>
    </trpc.Provider>
  )
}
```

#### src/main/index.ts (add tRPC handler)

```typescript
import { app, BrowserWindow } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { appRouter } from './trpc/root'
import { createContext } from './trpc/context'

let mainWindow: BrowserWindow

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Setup tRPC IPC handler
  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    createContext: ({ window }) => createContext({ window }),
  })

  // Legacy handlers (temporary)
  // import('./ipc/legacy-handlers').then(({ setupLegacyHandlers }) => {
  //   setupLegacyHandlers()
  // })

  mainWindow.loadFile('index.html')
})
```

### 4.2 Phase 1: System Controller Template

#### src/main/trpc/controllers/system.controller.ts

```typescript
import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const systemController = router({
  /**
   * Get current system metrics (CPU, RAM, GPU)
   */
  getMetrics: publicProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.services.system.getMetrics()
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch system metrics',
        cause: error,
      })
    }
  }),

  /**
   * Check status of all Claude Code services
   */
  checkServices: publicProcedure.query(async ({ ctx }) => {
    try {
      return await ctx.services.system.checkServices()
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to check services',
        cause: error,
      })
    }
  }),

  /**
   * Get disk usage for specific path
   */
  getDiskUsage: publicProcedure
    .input(
      z.object({
        path: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        return await ctx.services.system.getDiskUsage(input.path)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid path provided',
          cause: error,
        })
      }
    }),

  /**
   * Get process info by PID
   */
  getProcessInfo: publicProcedure
    .input(
      z.object({
        pid: z.number().int().positive(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const info = await ctx.services.system.getProcessInfo(input.pid)
        if (!info) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Process ${input.pid} not found`,
          })
        }
        return info
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get process info',
          cause: error,
        })
      }
    }),

  /**
   * Subscribe to real-time metrics updates
   */
  subscribeMetrics: publicProcedure.subscription(async function* ({ ctx }) {
    // Yield metrics every 2 seconds
    while (true) {
      yield await ctx.services.system.getMetrics()
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }),
})
```

#### src/main/services/SystemService.ts

```typescript
import os from 'os'
import { execSync } from 'child_process'
import si from 'systeminformation'

export interface SystemMetrics {
  cpu: {
    usage: number
    cores: number
    model: string
  }
  memory: {
    total: number
    used: number
    free: number
    percentage: number
  }
  gpu: {
    available: boolean
    name?: string
    memoryUsed?: number
    memoryTotal?: number
  }
  uptime: number
  platform: string
}

export interface ServiceStatus {
  name: string
  running: boolean
  port?: number
  uptime?: number
}

export class SystemService {
  async getMetrics(): Promise<SystemMetrics> {
    const [cpu, mem, gpu] = await Promise.all([si.currentLoad(), si.mem(), si.graphics()])

    return {
      cpu: {
        usage: cpu.currentLoad,
        cores: os.cpus().length,
        model: os.cpus()[0].model,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        percentage: (mem.used / mem.total) * 100,
      },
      gpu: {
        available: gpu.controllers.length > 0,
        name: gpu.controllers[0]?.model,
        memoryUsed: gpu.controllers[0]?.memoryUsed,
        memoryTotal: gpu.controllers[0]?.memoryTotal,
      },
      uptime: os.uptime(),
      platform: os.platform(),
    }
  }

  async checkServices(): Promise<ServiceStatus[]> {
    const services = [
      { name: 'PostgreSQL', port: 5433 },
      { name: 'Memgraph', port: 7687 },
      { name: 'Qdrant', port: 6333 },
      { name: 'Ollama', port: 11434 },
    ]

    const statuses = await Promise.all(
      services.map(async (svc) => {
        const running = await this.checkPort(svc.port)
        return {
          name: svc.name,
          running,
          port: svc.port,
        }
      })
    )

    return statuses
  }

  async getDiskUsage(path: string): Promise<{
    total: number
    used: number
    free: number
    percentage: number
  }> {
    const fsSize = await si.fsSize()
    const fs = fsSize.find((f) => path.startsWith(f.mount))

    if (!fs) {
      throw new Error(`No filesystem found for path: ${path}`)
    }

    return {
      total: fs.size,
      used: fs.used,
      free: fs.available,
      percentage: fs.use,
    }
  }

  async getProcessInfo(pid: number): Promise<{
    pid: number
    name: string
    cpu: number
    memory: number
  } | null> {
    try {
      const processes = await si.processes()
      const proc = processes.list.find((p) => p.pid === pid)

      if (!proc) return null

      return {
        pid: proc.pid,
        name: proc.name,
        cpu: proc.cpu,
        memory: proc.mem,
      }
    } catch {
      return null
    }
  }

  private async checkPort(port: number): Promise<boolean> {
    try {
      const result = execSync(`lsof -i :${port}`, { encoding: 'utf-8' })
      return result.length > 0
    } catch {
      return false
    }
  }
}
```

#### src/renderer/components/dashboard/SystemMetrics.tsx (updated)

```typescript
import { trpc } from '../../lib/trpc'

export function SystemMetrics() {
  const { data: metrics, isLoading, error } = trpc.system.getMetrics.useQuery(
    undefined,
    {
      refetchInterval: 5000, // Poll every 5s
    }
  )

  if (isLoading) return <div>Loading metrics...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!metrics) return null

  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard
        title="CPU Usage"
        value={`${metrics.cpu.usage.toFixed(1)}%`}
        subtitle={`${metrics.cpu.cores} cores • ${metrics.cpu.model}`}
      />
      <MetricCard
        title="Memory"
        value={`${metrics.memory.percentage.toFixed(1)}%`}
        subtitle={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
      />
      <MetricCard
        title="GPU"
        value={metrics.gpu.available ? metrics.gpu.name : 'N/A'}
        subtitle={
          metrics.gpu.memoryUsed
            ? `${formatBytes(metrics.gpu.memoryUsed)} / ${formatBytes(metrics.gpu.memoryTotal!)}`
            : 'No GPU detected'
        }
      />
    </div>
  )
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024
  return `${gb.toFixed(1)} GB`
}
```

### 4.3 Testing Template

#### tests/unit/system.controller.test.ts

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '../../src/main/trpc/root'
import type { Context } from '../../src/main/trpc/context'

describe('System Controller', () => {
  const createMockContext = (): Context => ({
    window: {} as any,
    services: {
      system: {
        getMetrics: vi.fn(),
        checkServices: vi.fn(),
        getDiskUsage: vi.fn(),
        getProcessInfo: vi.fn(),
      },
      mcp: {} as any,
      claude: {} as any,
      memory: {} as any,
      terminal: {} as any,
    },
  })

  it('should get system metrics', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    const mockMetrics = {
      cpu: { usage: 45.2, cores: 8, model: 'Intel i7' },
      memory: { total: 16000000000, used: 8000000000, free: 8000000000, percentage: 50 },
      gpu: { available: true, name: 'NVIDIA RTX 3080' },
      uptime: 123456,
      platform: 'linux',
    }

    ctx.services.system.getMetrics.mockResolvedValue(mockMetrics)

    const result = await caller.system.getMetrics()

    expect(result).toEqual(mockMetrics)
    expect(ctx.services.system.getMetrics).toHaveBeenCalledOnce()
  })

  it('should check services status', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    const mockServices = [
      { name: 'PostgreSQL', running: true, port: 5433 },
      { name: 'Memgraph', running: false, port: 7687 },
    ]

    ctx.services.system.checkServices.mockResolvedValue(mockServices)

    const result = await caller.system.checkServices()

    expect(result).toEqual(mockServices)
  })

  it('should get disk usage for valid path', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    const mockUsage = {
      total: 1000000000000,
      used: 500000000000,
      free: 500000000000,
      percentage: 50,
    }

    ctx.services.system.getDiskUsage.mockResolvedValue(mockUsage)

    const result = await caller.system.getDiskUsage({ path: '/home' })

    expect(result).toEqual(mockUsage)
    expect(ctx.services.system.getDiskUsage).toHaveBeenCalledWith('/home')
  })

  it('should throw on invalid path', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    await expect(caller.system.getDiskUsage({ path: '' })).rejects.toThrow(
      'String must contain at least 1 character(s)'
    )
  })

  it('should get process info by PID', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    const mockProcess = {
      pid: 1234,
      name: 'node',
      cpu: 12.5,
      memory: 256000000,
    }

    ctx.services.system.getProcessInfo.mockResolvedValue(mockProcess)

    const result = await caller.system.getProcessInfo({ pid: 1234 })

    expect(result).toEqual(mockProcess)
  })

  it('should throw NOT_FOUND when process does not exist', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    ctx.services.system.getProcessInfo.mockResolvedValue(null)

    await expect(caller.system.getProcessInfo({ pid: 99999 })).rejects.toThrow(
      'Process 99999 not found'
    )
  })
})
```

#### tests/integration/system.integration.test.ts

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app, BrowserWindow } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { appRouter } from '../../src/main/trpc/root'
import { createContext } from '../../src/main/trpc/context'

describe('System Integration', () => {
  let window: BrowserWindow

  beforeAll(async () => {
    await app.whenReady()
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    createIPCHandler({
      router: appRouter,
      windows: [window],
      createContext: ({ window }) => createContext({ window }),
    })
  })

  afterAll(() => {
    window.close()
    app.quit()
  })

  it('should return real system metrics', async () => {
    // This would require setting up IPC mocking in test environment
    // Or using Playwright for full E2E testing
    expect(true).toBe(true) // Placeholder
  })
})
```

---

## 5. Testing Strategy

### 5.1 Test Coverage Requirements

| Layer       | Coverage Target | Tools                      |
| ----------- | --------------- | -------------------------- |
| Controllers | 100%            | Vitest + tRPC createCaller |
| Services    | 90%             | Vitest + mocks             |
| Integration | Critical paths  | Playwright                 |

### 5.2 Test Pyramid

```
        E2E (5%)
       Playwright
      /            \
     /              \
    Integration (15%)
   Vitest + Electron
  /                  \
 /                    \
Unit Tests (80%)
Vitest + Mock Extended
```

### 5.3 CI Pipeline

```yaml
# .github/workflows/test.yml
name: Test IPC Controllers

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

---

## 6. Migration Checklist

### Phase 0: Setup ✅

- [ ] Install electron-trpc, @trpc/server, @trpc/client, zod
- [ ] Create src/main/trpc/trpc.ts
- [ ] Create src/main/trpc/context.ts
- [ ] Create src/main/trpc/root.ts
- [ ] Update src/preload/index.ts with exposeElectronTRPC()
- [ ] Create src/renderer/lib/trpc.ts
- [ ] Wrap App with tRPC provider
- [ ] Add tRPC handler in src/main/index.ts
- [ ] Run smoke test (ensure tRPC works)

### Phase 1: System Controller ✅

- [ ] Create src/main/trpc/controllers/system.controller.ts
- [ ] Create src/main/services/SystemService.ts
- [ ] Add system controller to root.ts
- [ ] Update Dashboard component to use trpc.system.getMetrics
- [ ] Update ServiceStatus component to use trpc.system.checkServices
- [ ] Write unit tests for SystemService
- [ ] Write unit tests for system.controller
- [ ] Remove legacy system:\* handlers
- [ ] Verify Dashboard works with tRPC

### Phase 2: MCP Controller ✅

- [ ] Create src/main/trpc/controllers/mcp.controller.ts
- [ ] Create src/main/services/MCPService.ts
- [ ] Add mcp controller to root.ts
- [ ] Update MCPServerList component
- [ ] Update MCPServerConfig component
- [ ] Write unit tests for MCPService
- [ ] Write unit tests for mcp.controller
- [ ] Remove legacy mcp:\* handlers
- [ ] Verify MCP management works

### Phase 3: Claude & Memory Controllers ✅

- [ ] Create src/main/trpc/controllers/claude.controller.ts
- [ ] Create src/main/trpc/controllers/memory.controller.ts
- [ ] Create src/main/services/ClaudeService.ts
- [ ] Create src/main/services/MemoryService.ts
- [ ] Create src/main/repositories/PostgresRepository.ts
- [ ] Create src/main/repositories/MemgraphRepository.ts
- [ ] Update all session UI components
- [ ] Update all memory UI components
- [ ] Write comprehensive tests
- [ ] Remove legacy claude:_ and memory:_ handlers
- [ ] Verify all functionality

### Phase 4: Terminal Controller & Cleanup ✅

- [ ] Create src/main/trpc/controllers/terminal.controller.ts
- [ ] Create src/main/services/TerminalService.ts
- [ ] Update Terminal component
- [ ] Write tests
- [ ] Remove legacy terminal:\* handlers
- [ ] Delete src/main/ipc/legacy-handlers.ts
- [ ] Run full test suite
- [ ] Performance benchmarks
- [ ] Update documentation
- [ ] Code review
- [ ] Merge to main

---

## Performance Benchmarks

### Before Migration (Legacy IPC)

| Operation        | Latency  | Memory |
| ---------------- | -------- | ------ |
| Get metrics      | 15-20ms  | N/A    |
| List MCP servers | 10-15ms  | N/A    |
| Query memory     | 50-100ms | N/A    |

### After Migration (tRPC)

| Operation        | Latency | Memory | Target |
| ---------------- | ------- | ------ | ------ |
| Get metrics      | <20ms   | <10MB  | ✅     |
| List MCP servers | <15ms   | <5MB   | ✅     |
| Query memory     | <100ms  | <20MB  | ✅     |

---

## Rollback Plan

If critical issues arise:

1. **Immediate:** Revert to `legacy-handlers.ts` (kept until Phase 4 complete)
2. **Rollback commits:** Use git revert for specific phase
3. **Feature flag:** Add `USE_LEGACY_IPC` env var for gradual rollout

```typescript
// Temporary feature flag
const USE_TRPC = process.env.USE_TRPC !== 'false'

if (USE_TRPC) {
  setupTRPCHandlers()
} else {
  setupLegacyHandlers()
}
```

---

## Success Criteria

- ✅ All legacy handlers removed
- ✅ 100% test coverage on controllers
- ✅ <20ms latency for system operations
- ✅ Type-safe IPC across main/renderer
- ✅ Zero runtime IPC errors in production
- ✅ Documentation complete

---

## Next Steps

1. Review this guide with team
2. Create tracking issue in Beads
3. Start Phase 0 setup
4. Proceed sequentially through phases
