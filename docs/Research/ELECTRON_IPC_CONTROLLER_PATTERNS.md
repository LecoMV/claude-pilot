# Enterprise Electron IPC Controller Patterns

**Research Date:** 2025-01-17
**Focus:** Controller patterns, tRPC organization, migration strategies, testing

---

## Executive Summary

This research covers enterprise-grade patterns for organizing Electron IPC handlers, focusing on:

- **Controller Pattern Architecture** - Domain-driven IPC organization
- **electron-trpc Integration** - Type-safe IPC with tRPC routers
- **Migration Strategies** - Safe refactoring from monolithic handlers
- **Coexistence Patterns** - Running legacy ipcMain alongside tRPC
- **Testing Strategies** - Unit testing approaches for IPC handlers

---

## Table of Contents

1. [Controller Pattern for Electron](#1-controller-pattern-for-electron)
2. [tRPC Router Organization](#2-trpc-router-organization)
3. [Migration Strategies](#3-migration-strategies)
4. [Coexistence Patterns](#4-coexistence-patterns)
5. [Testing Strategies](#5-testing-strategies)
6. [Code Examples](#6-code-examples)
7. [Architectural Recommendations](#7-architectural-recommendations)

---

## 1. Controller Pattern for Electron

### 1.1 NestJS-Inspired Architecture

The most mature approach for organizing Electron main processes uses NestJS-like decorators and modular architecture.

**Key Libraries:**

- [@doubleshot/nest-electron](https://socket.dev/npm/package/@doubleshot/nest-electron) - Full NestJS integration
- [nestjs-electron-ipc-transport](https://www.npmjs.com/package/nestjs-electron-ipc-transport) - Custom transport layer

**Core Concepts:**

```typescript
// Traditional tangled approach ❌
app.whenReady().then(() => {
  ipcMain.handle('get-user', async () => {
    /* ... */
  })
  ipcMain.handle('save-user', async () => {
    /* ... */
  })
  ipcMain.handle('get-project', async () => {
    /* ... */
  })
  // Scattered handlers everywhere
})

// Controller-based approach ✅
@Controller()
export class UserController {
  @IpcHandle('get-user')
  async getUser(@Payload() id: string) {
    return this.userService.findById(id)
  }

  @IpcHandle('save-user')
  async saveUser(@Payload() user: User) {
    return this.userService.save(user)
  }
}
```

### 1.2 Channel-Based Architecture (Without NestJS)

For projects not using NestJS, a channel interface pattern provides clean separation:

```typescript
// src/main/ipc/IpcChannelInterface.ts
export interface IpcChannelInterface {
  getName(): string
  handle(event: IpcMainInvokeEvent, ...args: any[]): Promise<any>
}

// src/main/ipc/channels/UserChannel.ts
export class UserChannel implements IpcChannelInterface {
  getName(): string {
    return 'user'
  }

  async handle(event: IpcMainInvokeEvent, action: string, ...args: any[]): Promise<any> {
    switch (action) {
      case 'get':
        return this.getUser(args[0])
      case 'save':
        return this.saveUser(args[0])
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  private async getUser(id: string) {
    return this.userService.findById(id)
  }

  private async saveUser(user: User) {
    return this.userService.save(user)
  }
}

// src/main/ipc/ChannelRegistry.ts
export class ChannelRegistry {
  static registerChannels(channels: IpcChannelInterface[]) {
    channels.forEach((channel) => {
      ipcMain.handle(channel.getName(), async (event, action, ...args) => {
        return channel.handle(event, action, ...args)
      })
    })
  }
}

// Usage in main.ts
ChannelRegistry.registerChannels([new UserChannel(), new ProjectChannel(), new MCPChannel()])
```

**Source:** [LogRocket - Electron IPC Response/Request Architecture](https://blog.logrocket.com/electron-ipc-response-request-architecture-with-typescript/)

### 1.3 Service Layer Separation

**Critical Pattern:** Never access databases/external systems directly from IPC handlers.

```typescript
// ❌ BAD - Direct database access in handler
@IpcHandle('get-users')
async getUsers() {
  return db.query('SELECT * FROM users') // Tight coupling
}

// ✅ GOOD - Service layer abstraction
@IpcHandle('get-users')
async getUsers() {
  return this.userService.getAll() // Testable, reusable
}

// services/UserService.ts
export class UserService {
  constructor(private db: Database) {}

  async getAll(): Promise<User[]> {
    return this.db.users.findMany()
  }
}
```

---

## 2. tRPC Router Organization

### 2.1 Feature-Based Structure

Organize routers by domain/feature rather than technical layers:

```
src/main/
├── trpc/
│   ├── root.ts              # Root router composition
│   ├── context.ts           # tRPC context creation
│   ├── routers/
│   │   ├── user.router.ts   # User domain
│   │   ├── project.router.ts
│   │   ├── mcp.router.ts
│   │   ├── memory.router.ts
│   │   └── system.router.ts
│   └── procedures/          # Shared procedures
│       ├── authed.ts
│       └── public.ts
├── services/                # Business logic
│   ├── UserService.ts
│   ├── ProjectService.ts
│   └── MCPService.ts
└── repositories/            # Data access
    ├── UserRepository.ts
    └── ProjectRepository.ts
```

### 2.2 Router Composition Pattern

```typescript
// src/main/trpc/root.ts
import { router } from './trpc'
import { userRouter } from './routers/user.router'
import { projectRouter } from './routers/project.router'
import { mcpRouter } from './routers/mcp.router'

export const appRouter = router({
  user: userRouter,
  project: projectRouter,
  mcp: mcpRouter,
})

export type AppRouter = typeof appRouter

// src/main/trpc/routers/user.router.ts
import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

export const userRouter = router({
  getById: publicProcedure.input(z.string()).query(async ({ input, ctx }) => {
    return ctx.services.user.findById(input)
  }),

  save: publicProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.services.user.save(input)
    }),
})
```

**Source:** [tRPC Best Practices Guide](https://www.projectrules.ai/rules/trpc)

### 2.3 Context Pattern

Use context to inject services and window references:

```typescript
// src/main/trpc/context.ts
import type { BrowserWindow } from 'electron'
import { UserService } from '../services/UserService'
import { ProjectService } from '../services/ProjectService'

export interface CreateContextOptions {
  window: BrowserWindow
}

export const createContext = async ({ window }: CreateContextOptions) => {
  return {
    window,
    services: {
      user: new UserService(),
      project: new ProjectService(),
    },
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>

// Main process setup
import { createIPCHandler } from 'electron-trpc/main'

createIPCHandler({
  router: appRouter,
  windows: [mainWindow],
  createContext: async (opts) => createContext({ window: opts.window }),
})
```

**Source:** [electron-trpc Documentation](https://electron-trpc.dev/)

### 2.4 Best Practices

**Initialize Once:**

```typescript
// ❌ BAD - Multiple tRPC instances
function createRouter() {
  return router({
    /* ... */
  })
}

// ✅ GOOD - Single instance
export const appRouter = router({
  /* ... */
})
```

**Error Handling:**

```typescript
import { TRPCError } from '@trpc/server'

export const userRouter = router({
  getById: publicProcedure.input(z.string()).query(async ({ input, ctx }) => {
    const user = await ctx.services.user.findById(input)
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `User ${input} not found`,
      })
    }
    return user
  }),
})
```

**Source:** [electron-trpc Best Practices](https://discord-questions.trpc.io/m/1073852263510048799)

---

## 3. Migration Strategies

### 3.1 Gradual Migration Approach

**Phase 1: Add tRPC Alongside Legacy Handlers**

```typescript
// src/main/index.ts
import { app, ipcMain } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { appRouter } from './trpc/root'

app.whenReady().then(() => {
  // NEW: tRPC handler
  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
  })

  // LEGACY: Existing handlers (keep for now)
  ipcMain.handle('legacy:get-user', async (event, id) => {
    return getUserLegacy(id)
  })

  ipcMain.handle('legacy:save-project', async (event, data) => {
    return saveProjectLegacy(data)
  })
})
```

**Phase 2: Migrate One Domain at a Time**

```typescript
// Migration checklist:
// 1. Create tRPC router for domain (e.g., user.router.ts)
// 2. Move service logic to dedicated service class
// 3. Update renderer to use tRPC client
// 4. Test thoroughly
// 5. Remove legacy handler
// 6. Repeat for next domain

// OLD (renderer)
const user = await window.electron.ipcRenderer.invoke('legacy:get-user', id)

// NEW (renderer)
const user = await trpc.user.getById.query(id)
```

**Phase 3: Remove Legacy Handlers**

Track migration progress:

```typescript
// src/main/legacy-handlers.ts
// MIGRATION TRACKER
// ✅ user:get - Migrated to trpc.user.getById
// ✅ user:save - Migrated to trpc.user.save
// ⏳ project:get - In progress
// ⏳ project:save - In progress
// ❌ mcp:list - Not started
// ❌ mcp:enable - Not started

// Temporary deprecation warnings
ipcMain.handle('legacy:get-user', async (event, id) => {
  console.warn('[DEPRECATED] Use trpc.user.getById instead')
  return getUserLegacy(id)
})
```

### 3.2 Custom IPC Request Handler (Advanced)

For complex migrations, you can route legacy handlers through tRPC:

```typescript
// src/main/ipc/custom-handler.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { ipcMain } from 'electron'

interface IpcRequest {
  method: string
  path: string
  body?: any
}

export const ipcRequestHandler = async ({
  endpoint,
  req,
  router,
  createContext,
}: {
  endpoint: string
  req: IpcRequest
  router: any
  createContext: () => Promise<any>
}) => {
  // Convert IPC request to fetch-like request
  const fetchRequest = new Request(`http://localhost${endpoint}${req.path}`, {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    body: req.body ? JSON.stringify(req.body) : undefined,
  })

  const response = await fetchRequestHandler({
    req: fetchRequest,
    router,
    createContext,
    endpoint,
  })

  // Convert response back to plain JSON for IPC
  return {
    status: response.status,
    data: await response.json(),
  }
}

// Main process
ipcMain.handle('trpc', async (event, req: IpcRequest) => {
  return ipcRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: async () => ({ window: BrowserWindow.fromWebContents(event.sender) }),
  })
})
```

**Source:** [Using React and tRPC with Electron](https://www.funtoimagine.com/blog/using-react-trpc-electron/)

---

## 4. Coexistence Patterns

### 4.1 Dual Client Pattern

Run both HTTP tRPC (for backend API) and IPC tRPC (for main process) simultaneously:

```typescript
// src/renderer/trpc.ts
import { createTRPCClient } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'
import type { AppRouter } from '../main/trpc/root'
import type { BackendRouter } from '../backend/router'

// IPC client for main process
export const trpcIpc = createTRPCReact<AppRouter>()

export const ipcClient = trpcIpc.createClient({
  links: [ipcLink()],
})

// HTTP client for backend API
export const trpcHttp = createTRPCReact<BackendRouter>()

export const httpClient = trpcHttp.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api/trpc',
      headers: async () => {
        const token = await window.electron.getAuthToken()
        return { Authorization: `Bearer ${token}` }
      },
    }),
  ],
})

// Provider setup
export function Providers({ children }) {
  return (
    <trpcIpc.Provider client={ipcClient} queryClient={queryClient}>
      <trpcHttp.Provider client={httpClient} queryClient={queryClient}>
        {children}
      </trpcHttp.Provider>
    </trpcIpc.Provider>
  )
}

// Usage in components
function UserProfile() {
  // IPC call to main process
  const { data: localUser } = trpcIpc.user.getCurrent.useQuery()

  // HTTP call to backend
  const { data: serverUser } = trpcHttp.user.getProfile.useQuery()

  return <div>{localUser?.name} - {serverUser?.email}</div>
}
```

**Source:** [tRPC Discussion #4675](https://github.com/trpc/trpc/discussions/4675)

### 4.2 Namespace Separation

Keep legacy and new handlers clearly separated:

```typescript
// src/main/index.ts
import { setupLegacyHandlers } from './ipc/legacy'
import { setupTRPCHandlers } from './trpc/setup'

app.whenReady().then(() => {
  // Legacy handlers with 'legacy:' prefix
  setupLegacyHandlers(ipcMain)

  // tRPC handlers (no prefix needed)
  setupTRPCHandlers(mainWindow)
})

// src/main/ipc/legacy.ts
export function setupLegacyHandlers(ipc: typeof ipcMain) {
  // All legacy handlers use 'legacy:' prefix
  ipc.handle('legacy:get-user', async (event, id) => {
    /* ... */
  })
  ipc.handle('legacy:save-project', async (event, data) => {
    /* ... */
  })
}

// Renderer
// Legacy calls
await window.electron.invoke('legacy:get-user', id)

// tRPC calls (type-safe)
await trpc.user.getById.query(id)
```

---

## 5. Testing Strategies

### 5.1 Testing Philosophy

> "What you need to test is that given a function is called with the correct parameters, the correct action occurs. Test your handler logic separately from the IPC framework itself, since Electron's IPC framework is already thoroughly tested."

**Source:** [Electron Official Testing Docs](https://www.electronjs.org/docs/latest/development/testing)

### 5.2 Mock Libraries

**electron-mock-ipc** (Jest/Mocha)

```typescript
// vitest.setup.ts
import { mockIpcMain, mockIpcRenderer } from 'electron-mock-ipc'
import { vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  ipcRenderer: mockIpcRenderer,
}))

// test/user.channel.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mockIpcMain, mockIpcRenderer } from 'electron-mock-ipc'
import { UserChannel } from '../src/main/ipc/channels/UserChannel'

describe('UserChannel', () => {
  let channel: UserChannel

  beforeEach(() => {
    mockIpcMain.removeAllListeners()
    channel = new UserChannel()
    mockIpcMain.handle('user', channel.handle.bind(channel))
  })

  it('should get user by id', async () => {
    const result = await mockIpcRenderer.invoke('user', 'get', 'user-123')

    expect(result).toEqual({
      id: 'user-123',
      name: 'Test User',
    })
  })

  it('should save user', async () => {
    const userData = { name: 'New User', email: 'new@test.com' }
    const result = await mockIpcRenderer.invoke('user', 'save', userData)

    expect(result).toHaveProperty('id')
    expect(result.name).toBe('New User')
  })
})
```

**Source:** [electron-mock-ipc on npm](https://www.npmjs.com/package/electron-mock-ipc)

### 5.3 Testing tRPC Routers

Use tRPC's built-in testing utilities:

```typescript
// test/user.router.test.ts
import { describe, it, expect, vi } from 'vitest'
import { appRouter } from '../src/main/trpc/root'
import type { Context } from '../src/main/trpc/context'

describe('User Router', () => {
  const createMockContext = (): Context => ({
    window: {} as any,
    services: {
      user: {
        findById: vi.fn(),
        save: vi.fn(),
      },
    },
  })

  it('should get user by id', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    ctx.services.user.findById.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
    })

    const result = await caller.user.getById('user-123')

    expect(result).toEqual({
      id: 'user-123',
      name: 'Test User',
    })
    expect(ctx.services.user.findById).toHaveBeenCalledWith('user-123')
  })

  it('should throw on invalid input', async () => {
    const ctx = createMockContext()
    const caller = appRouter.createCaller(ctx)

    await expect(caller.user.getById('')).rejects.toThrow(
      'String must contain at least 1 character(s)'
    )
  })
})
```

### 5.4 Service Layer Testing

Test services independently of IPC:

```typescript
// test/UserService.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { UserService } from '../src/main/services/UserService'
import { mockDeep } from 'vitest-mock-extended'
import type { Database } from '../src/main/db'

describe('UserService', () => {
  let service: UserService
  let mockDb: ReturnType<typeof mockDeep<Database>>

  beforeEach(() => {
    mockDb = mockDeep<Database>()
    service = new UserService(mockDb)
  })

  it('should find user by id', async () => {
    mockDb.users.findUnique.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
    })

    const result = await service.findById('user-123')

    expect(result).toEqual({
      id: 'user-123',
      name: 'Test User',
    })
    expect(mockDb.users.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
    })
  })

  it('should return null when user not found', async () => {
    mockDb.users.findUnique.mockResolvedValue(null)

    const result = await service.findById('nonexistent')

    expect(result).toBeNull()
  })
})
```

### 5.5 Integration Testing Pattern

Test full IPC flow with custom driver:

```typescript
// test/integration/ipc.test.ts
import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import { join } from 'path'

describe('IPC Integration', () => {
  it('should handle user.getById request', async () => {
    const appPath = join(__dirname, '../../')
    const app = spawn('electron', [appPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    // Send IPC request
    app.send({
      channel: 'trpc',
      method: 'query',
      path: '/user.getById',
      input: 'user-123',
    })

    // Wait for response
    const response = await new Promise((resolve) => {
      app.on('message', resolve)
    })

    expect(response).toMatchObject({
      result: {
        data: {
          id: 'user-123',
          name: expect.any(String),
        },
      },
    })

    app.kill()
  })
})
```

**Source:** [Electron Custom Test Drivers](https://www.electronjs.org/docs/latest/development/testing)

---

## 6. Code Examples

### 6.1 Complete Controller Setup (NestJS-style)

```typescript
// src/main/app.module.ts
import { Module } from '@nestjs/common'
import { UserModule } from './modules/user/user.module'
import { ProjectModule } from './modules/project/project.module'
import { MCPModule } from './modules/mcp/mcp.module'

@Module({
  imports: [UserModule, ProjectModule, MCPModule],
})
export class AppModule {}

// src/main/modules/user/user.module.ts
import { Module } from '@nestjs/common'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

// src/main/modules/user/user.controller.ts
import { Controller, Payload } from '@nestjs/common'
import { IpcHandle } from '@doubleshot/nest-electron'
import { UserService } from './user.service'
import { z } from 'zod'

const GetUserSchema = z.string().uuid()
const SaveUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @IpcHandle('user:getById')
  async getById(@Payload() id: string) {
    const validated = GetUserSchema.parse(id)
    return this.userService.findById(validated)
  }

  @IpcHandle('user:save')
  async save(@Payload() data: unknown) {
    const validated = SaveUserSchema.parse(data)
    return this.userService.save(validated)
  }

  @IpcHandle('user:list')
  async list() {
    return this.userService.findAll()
  }
}

// src/main/modules/user/user.service.ts
import { Injectable } from '@nestjs/common'
import { Database } from '../../db'

@Injectable()
export class UserService {
  constructor(private db: Database) {}

  async findById(id: string) {
    return this.db.users.findUnique({ where: { id } })
  }

  async findAll() {
    return this.db.users.findMany()
  }

  async save(data: { name: string; email: string }) {
    return this.db.users.create({ data })
  }
}

// src/main/index.ts
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

app.whenReady().then(async () => {
  const nestApp = await NestFactory.createApplicationContext(AppModule)
  // Handlers are automatically registered via decorators
})
```

**Source:** [@doubleshot/nest-electron](https://socket.dev/npm/package/@doubleshot/nest-electron)

### 6.2 Complete tRPC Setup (Without NestJS)

```typescript
// src/main/trpc/trpc.ts
import { initTRPC } from '@trpc/server'
import type { CreateContextOptions } from './context'

const t = initTRPC.context<CreateContextOptions>().create()

export const router = t.router
export const publicProcedure = t.procedure

// src/main/trpc/context.ts
import type { BrowserWindow } from 'electron'
import { UserService } from '../services/UserService'
import { ProjectService } from '../services/ProjectService'
import { Database } from '../db'

export interface CreateContextOptions {
  window: BrowserWindow
}

const db = new Database()

export const createContext = async ({ window }: CreateContextOptions) => {
  return {
    window,
    db,
    services: {
      user: new UserService(db),
      project: new ProjectService(db),
    },
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>

// src/main/trpc/routers/user.router.ts
import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import { TRPCError } from '@trpc/server'

export const userRouter = router({
  getById: publicProcedure
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      const user = await ctx.services.user.findById(input)
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `User ${input} not found`,
        })
      }
      return user
    }),

  list: publicProcedure
    .query(async ({ ctx }) => {
      return ctx.services.user.findAll()
    }),

  save: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      return ctx.services.user.save(input)
    }),

  delete: publicProcedure
    .input(z.string().uuid())
    .mutation(async ({ input, ctx }) => {
      await ctx.services.user.delete(input)
      return { success: true }
    }),
})

// src/main/trpc/root.ts
import { router } from './trpc'
import { userRouter } from './routers/user.router'
import { projectRouter } from './routers/project.router'
import { mcpRouter } from './routers/mcp.router'
import { memoryRouter } from './routers/memory.router'
import { systemRouter } from './routers/system.router'

export const appRouter = router({
  user: userRouter,
  project: projectRouter,
  mcp: mcpRouter,
  memory: memoryRouter,
  system: systemRouter,
})

export type AppRouter = typeof appRouter

// src/main/index.ts
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

  mainWindow.loadFile('index.html')
})

// src/preload/index.ts
import { exposeElectronTRPC } from 'electron-trpc/preload'

process.once('loaded', () => {
  exposeElectronTRPC()
})

// src/renderer/trpc.ts
import { createTRPCReact } from '@trpc/react-query'
import { ipcLink } from 'electron-trpc/renderer'
import type { AppRouter } from '../main/trpc/root'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [ipcLink()],
})

// src/renderer/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, trpcClient } from './trpc'

const queryClient = new QueryClient()

function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <UserList />
      </QueryClientProvider>
    </trpc.Provider>
  )
}

function UserList() {
  const { data: users, isLoading } = trpc.user.list.useQuery()
  const saveMutation = trpc.user.save.useMutation()

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      {users?.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
      <button
        onClick={() => saveMutation.mutate({
          name: 'New User',
          email: 'new@example.com',
        })}
      >
        Add User
      </button>
    </div>
  )
}
```

### 6.3 Hybrid Migration Example

```typescript
// src/main/index.ts
import { app, ipcMain } from 'electron'
import { createIPCHandler } from 'electron-trpc/main'
import { appRouter } from './trpc/root'
import { legacyHandlers } from './ipc/legacy-handlers'

app.whenReady().then(() => {
  // Phase 1: Setup tRPC (new handlers)
  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
  })

  // Phase 2: Keep legacy handlers (deprecated)
  legacyHandlers.register(ipcMain, {
    onDeprecatedCall: (channel) => {
      console.warn(`[DEPRECATED] ${channel} - migrate to tRPC`)
      // Optional: track in analytics
    },
  })
})

// src/main/ipc/legacy-handlers.ts
export const legacyHandlers = {
  register(ipc: typeof ipcMain, opts: { onDeprecatedCall?: (channel: string) => void }) {
    // MIGRATION STATUS:
    // ✅ user:get -> trpc.user.getById
    // ✅ user:save -> trpc.user.save
    // ⏳ project:get -> in progress
    // ❌ mcp:list -> not started

    // Keep until renderer migration complete
    ipc.handle('legacy:project:get', async (event, id) => {
      opts.onDeprecatedCall?.('legacy:project:get')
      return getProjectLegacy(id)
    })

    ipc.handle('legacy:mcp:list', async (event) => {
      opts.onDeprecatedCall?.('legacy:mcp:list')
      return listMCPServersLegacy()
    })
  },

  unregister(ipc: typeof ipcMain) {
    ipc.removeHandler('legacy:project:get')
    ipc.removeHandler('legacy:mcp:list')
  },
}

// src/renderer/hooks/useLegacyMigration.ts
import { useEffect } from 'react'

export function useLegacyMigration() {
  useEffect(() => {
    // Log when legacy APIs are still being used
    const originalInvoke = window.electron.ipcRenderer.invoke

    window.electron.ipcRenderer.invoke = async (channel, ...args) => {
      if (channel.startsWith('legacy:')) {
        console.warn(`Still using legacy IPC: ${channel}`)
      }
      return originalInvoke(channel, ...args)
    }
  }, [])
}
```

---

## 7. Architectural Recommendations

### 7.1 For Claude Pilot

Based on the current architecture analysis:

**Current State:**

```
src/main/ipc/handlers.ts  (monolithic - 500+ lines)
```

**Recommended Structure:**

```
src/main/
├── trpc/
│   ├── root.ts
│   ├── context.ts
│   ├── trpc.ts
│   └── controllers/
│       ├── claude.controller.ts      # claude:* handlers
│       ├── mcp.controller.ts         # mcp:* handlers
│       ├── memory.controller.ts      # memory:* handlers
│       ├── system.controller.ts      # system:* handlers
│       └── terminal.controller.ts    # terminal:* handlers
├── services/
│   ├── ClaudeService.ts              # Claude Code integration
│   ├── MCPService.ts                 # MCP server management
│   ├── MemoryService.ts              # Memory system connectors
│   ├── SystemService.ts              # System metrics
│   └── TerminalService.ts            # PTY operations
└── repositories/
    ├── PostgresRepository.ts         # PostgreSQL queries
    ├── MemgraphRepository.ts         # Cypher queries
    └── QdrantRepository.ts           # Vector search
```

### 7.2 Migration Plan for Claude Pilot

**Week 1: Setup**

- [ ] Install electron-trpc and dependencies
- [ ] Create tRPC setup (root.ts, context.ts, trpc.ts)
- [ ] Add preload script modifications
- [ ] Setup renderer tRPC client

**Week 2: Migrate System Controller**

- [ ] Create system.controller.ts (tRPC router)
- [ ] Create SystemService.ts
- [ ] Update renderer components
- [ ] Add tests
- [ ] Remove legacy handlers

**Week 3: Migrate MCP Controller**

- [ ] Create mcp.controller.ts
- [ ] Create MCPService.ts
- [ ] Update renderer components
- [ ] Add tests
- [ ] Remove legacy handlers

**Week 4: Migrate Remaining Controllers**

- [ ] Create claude.controller.ts
- [ ] Create memory.controller.ts
- [ ] Create terminal.controller.ts
- [ ] Update all renderer components
- [ ] Add comprehensive tests
- [ ] Remove all legacy handlers

### 7.3 Security Considerations

**Context Isolation (Required):**

```typescript
// main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true, // REQUIRED
    nodeIntegration: false, // REQUIRED
    sandbox: true, // RECOMMENDED
  },
})
```

**Input Validation:**

```typescript
// ALWAYS validate with Zod
export const mcpRouter = router({
  enable: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        config: z.record(z.unknown()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Input is guaranteed valid
      return ctx.services.mcp.enable(input.name, input.config)
    }),
})
```

**Error Handling:**

```typescript
// DON'T expose internal errors
throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Failed to enable MCP server', // Generic message
  cause: error, // Original error for logging only
})
```

**Source:** [Electron Security Best Practices](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)

### 7.4 Performance Guidelines

**Avoid sendSync:**

```typescript
// ❌ NEVER use sendSync (blocks renderer)
const result = ipcRenderer.sendSync('get-user', id)

// ✅ ALWAYS use invoke (async)
const result = await ipcRenderer.invoke('get-user', id)

// ✅✅ BEST: Use tRPC (type-safe async)
const result = await trpc.user.getById.query(id)
```

**Batch Operations:**

```typescript
// ❌ BAD - Multiple IPC calls
const users = await Promise.all(ids.map((id) => trpc.user.getById.query(id)))

// ✅ GOOD - Single batched call
const users = await trpc.user.getByIds.query(ids)
```

**Source:** [Building High-Performance Electron Apps](https://www.johnnyle.io/read/electron-performance)

---

## Sources

### Controller Patterns

- [Build Electron Apps Like NestJS](https://dev.to/29_x_395a8d7880988c00d53f/build-electron-apps-like-nestjs-modular-architecture-multi-window-management-and-typed-ipc-15oh)
- [@doubleshot/nest-electron](https://socket.dev/npm/package/@doubleshot/nest-electron)
- [nestjs-electron-ipc-transport](https://www.npmjs.com/package/nestjs-electron-ipc-transport)
- [LogRocket - Electron IPC Response/Request Architecture](https://blog.logrocket.com/electron-ipc-response-request-architecture-with-typescript/)
- [Electron Official IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)

### tRPC Integration

- [electron-trpc Official Docs](https://electron-trpc.dev/)
- [electron-trpc GitHub](https://github.com/jsonnull/electron-trpc)
- [tRPC Best Practices](https://www.projectrules.ai/rules/trpc)
- [tRPC Router Organization](https://discord-questions.trpc.io/m/1073852263510048799)
- [Using React and tRPC with Electron](https://www.funtoimagine.com/blog/using-react-trpc-electron/)
- [Using Prisma and tRPC with Electron](https://www.funtoimagine.com/blog/an-electron-app-architecture/)

### Migration Strategies

- [electron-prisma-trpc-example](https://github.com/awohletz/electron-prisma-trpc-example)
- [electron-trpc-prisma](https://github.com/NickyMeuleman/electron-trpc-prisma)
- [tRPC Discussion #4675 - HTTP and IPC](https://github.com/trpc/trpc/discussions/4675)

### Testing

- [Electron Official Testing Docs](https://www.electronjs.org/docs/latest/development/testing)
- [electron-mock-ipc](https://www.npmjs.com/package/electron-mock-ipc)
- [electron-mock-ipc GitHub](https://github.com/h3poteto/electron-mock-ipc)
- [Electron Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

### Security & Performance

- [Penetration Testing of Electron Apps](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
- [Building High-Performance Electron Apps](https://www.johnnyle.io/read/electron-performance)
- [Electron IPC Module Guide](https://www.intelligentproduct.solutions/blog/electron-ipc-module)

---

## Conclusion

The enterprise-grade approach to Electron IPC organization involves:

1. **Controller/Service Separation** - Use NestJS-like decorators or channel interfaces to organize handlers by domain
2. **tRPC for Type Safety** - Leverage electron-trpc for end-to-end type safety and automatic serialization
3. **Gradual Migration** - Migrate one domain at a time while keeping legacy handlers operational
4. **Service Layer Abstraction** - Never access databases directly from IPC handlers
5. **Comprehensive Testing** - Test services independently, use mocks for IPC layer, create integration tests for full flow

For Claude Pilot specifically, the recommended path is:

- Adopt electron-trpc for new controllers
- Migrate existing handlers to domain-specific routers
- Use service layer for all business logic
- Implement comprehensive test coverage
- Follow security best practices (context isolation, input validation)
