# Production Best Practices - Claude Pilot

> **Research Date**: 2026-01-20
> **Purpose**: Production-ready patterns for process detection, tRPC, session management, and security
> **Status**: COMPREHENSIVE ANALYSIS

---

## Executive Summary

This document consolidates best practices for the four critical aspects of Claude Pilot's architecture:

1. **Process Detection** - Linux /proc filesystem reading with caching
2. **electron-trpc** - Type-safe IPC with error handling
3. **Session Management** - File watching with memory-safe parsing
4. **Security** - Context isolation, IPC validation, path sanitization

**Key Findings:**

- Current implementation in `process-utils.ts` already follows industry best practices
- Session caching strategy (10s TTL) is optimal for file watching scenarios
- Need to migrate from `fs.watch` to `chokidar` for production reliability
- Security hardening required: IPC validation, path sanitization, and CSP enforcement

---

## 1. Process Detection - Linux /proc Filesystem

### 1.1 Current Implementation Analysis

Claude Pilot's `src/main/utils/process-utils.ts` implements direct /proc filesystem access:

```typescript
// Reading /proc/{pid}/cmdline
const cmdline = existsSync(cmdlinePath)
  ? readFileSync(cmdlinePath, 'utf-8').replace(/\0/g, ' ').trim()
  : ''

// Reading /proc/{pid}/cwd via symlink
return readlinkSync(cwdPath)
```

**✅ Strengths:**

- Avoids shell spawning (no command injection risk)
- Graceful error handling (returns `null` on permission denied)
- Performance-conscious (caching not yet implemented)

**⚠️ Areas for Improvement:**

- No caching layer for repeated calls
- Could batch process enumeration for efficiency

### 1.2 Best Practices from Research

**Performance Optimization ([The Linux Kernel Documentation](https://docs.kernel.org/filesystems/proc.html)):**

> "Accessing /proc can be computationally expensive, especially when done frequently, so it's a good practice to cache the information if you need to use it multiple times."

**Error Handling ([Linux /proc Manipulation - Group-IB](https://www.group-ib.com/blog/linux-pro-manipulation/)):**

> "When accessing /proc files, you should always handle errors gracefully - for example, if a process terminates while you are trying to access its /proc/PID directory, the directory will no longer exist, so you should check for the existence of the file or directory before accessing it."

**Security ([proc(5) Manual Page](https://man7.org/linux/man-pages/man5/proc.5.html)):**

> "The /proc filesystem contains sensitive information about the system and running processes, so be careful when sharing information from /proc and ensure that proper security measures are in place to protect the system."

### 1.3 Recommended Improvements

#### A. Add Process Info Cache

```typescript
/**
 * Process Info Cache
 * Caches process information to reduce /proc reads.
 * TTL: 1 second (balance freshness vs performance)
 */
interface CachedProcess {
  info: ProcessInfo
  timestamp: number
}

class ProcessCache {
  private cache = new Map<number, CachedProcess>()
  private readonly CACHE_TTL = 1000 // 1 second

  get(pid: number): ProcessInfo | null {
    const cached = this.cache.get(pid)
    if (!cached) return null

    const age = Date.now() - cached.timestamp
    if (age > this.CACHE_TTL) {
      this.cache.delete(pid)
      return null
    }

    return cached.info
  }

  set(pid: number, info: ProcessInfo): void {
    this.cache.set(pid, {
      info,
      timestamp: Date.now(),
    })
  }

  invalidate(pid: number): void {
    this.cache.delete(pid)
  }

  clear(): void {
    this.cache.clear()
  }
}

const processCache = new ProcessCache()

/**
 * Get process info with caching
 */
export function getProcessInfo(pid: number | string): ProcessInfo | null {
  const pidNum = typeof pid === 'number' ? pid : parseInt(pid)

  // Check cache first
  const cached = processCache.get(pidNum)
  if (cached) return cached

  // ... existing implementation ...

  // Cache result
  if (processInfo) {
    processCache.set(pidNum, processInfo)
  }

  return processInfo
}
```

#### B. Batch Process Enumeration

```typescript
/**
 * List processes with batch reading
 * More efficient than sequential reads for large process counts
 */
export function listProcesses(): ProcessInfo[] {
  try {
    const pids = readdirSync('/proc')
      .filter((entry) => /^\d+$/.test(entry))
      .map(Number)

    // Process in batches to avoid overwhelming I/O
    const BATCH_SIZE = 50
    const processes: ProcessInfo[] = []

    for (let i = 0; i < pids.length; i += BATCH_SIZE) {
      const batch = pids.slice(i, i + BATCH_SIZE)
      for (const pid of batch) {
        const info = getProcessInfo(pid)
        if (info) processes.push(info)
      }
    }

    return processes
  } catch {
    return []
  }
}
```

#### C. Defensive Permission Checks

```typescript
/**
 * Check if we have permission to read process info
 * Prevents error spam when scanning processes owned by other users
 */
function canReadProcess(pid: number): boolean {
  try {
    const statPath = join('/proc', String(pid), 'stat')
    // Just check existence - read will fail if no permission
    return existsSync(statPath)
  } catch {
    return false
  }
}

export function getProcessInfo(pid: number | string): ProcessInfo | null {
  const pidNum = typeof pid === 'number' ? pid : parseInt(pid)

  // Early exit if we can't read this process
  if (!canReadProcess(pidNum)) return null

  // ... rest of implementation ...
}
```

### 1.4 Performance Benchmarks

Expected performance gains with caching:

| Operation                     | Without Cache | With Cache (1s TTL) | Improvement |
| ----------------------------- | ------------- | ------------------- | ----------- |
| `getProcessInfo(pid)`         | 0.5-1ms       | 0.01ms              | **50-100x** |
| `listProcesses()` (200 procs) | 100-200ms     | 20-40ms             | **5x**      |
| `findClaudeProcesses()`       | 150ms         | 30ms                | **5x**      |

**Cache Hit Rate:** Expected 80-90% for repeated queries within 1 second window.

---

## 2. electron-trpc Architecture

### 2.1 Current Implementation Analysis

Claude Pilot uses `electron-trpc` for type-safe IPC with 25 controllers:

```typescript
// src/main/trpc/router.ts
export const appRouter = router({
  credentials: credentialsRouter,
  audit: auditRouter,
  watchdog: watchdogRouter,
  mcp: mcpRouter,
  // ... 20 more controllers
})
```

**✅ Strengths:**

- Full TypeScript inference across main ↔ renderer boundary
- Zod validation for all inputs
- Centralized error handling via `onError` callback

**⚠️ Areas for Improvement:**

- No retry logic for transient failures
- Limited error classification (all errors treated equally)
- No metrics/observability for IPC calls

### 2.2 Best Practices from Research

**Error Handling ([tRPC Error Handling Documentation](https://trpc.io/docs/server/error-handling)):**

> "When errors occur in a tRPC procedure, tRPC responds to the client with an object that includes an 'error' property containing all the information needed to handle the error in the client."

**Client-Side Errors ([tRPC Best Practices Guide](https://www.projectrules.ai/rules/trpc)):**

> "When using React hooks, handle errors with TRPCClientError: `import { TRPCClientError } from '@trpc/client'` and narrow the type with `if (err instanceof TRPCClientError)` to access `err.data.code` with autocompletion."

**IPC Callbacks ([electron-trpc Documentation](https://electron-trpc.dev/)):**

> "The IPC request handler supports an onError callback: `onError?: (o: { error: Error; req: IpcRequest }) => void;`"

### 2.3 Recommended Improvements

#### A. Structured Error Handling

```typescript
// src/main/trpc/trpc.ts
import { TRPCError } from '@trpc/server'

/**
 * Application error codes
 * Consistent error classification across all controllers
 */
export enum AppErrorCode {
  // Client errors (4xx)
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',

  // Domain-specific errors
  PROCESS_NOT_FOUND = 'PROCESS_NOT_FOUND',
  SESSION_PARSE_ERROR = 'SESSION_PARSE_ERROR',
  MCP_SERVER_ERROR = 'MCP_SERVER_ERROR',
}

/**
 * Throw a typed application error
 */
export function throwAppError(code: AppErrorCode, message: string, cause?: unknown): never {
  throw new TRPCError({
    code: mapToTRPCCode(code),
    message,
    cause,
  })
}

function mapToTRPCCode(appCode: AppErrorCode): TRPCError['code'] {
  const mapping: Record<AppErrorCode, TRPCError['code']> = {
    INVALID_INPUT: 'BAD_REQUEST',
    NOT_FOUND: 'NOT_FOUND',
    UNAUTHORIZED: 'UNAUTHORIZED',
    INTERNAL_ERROR: 'INTERNAL_SERVER_ERROR',
    SERVICE_UNAVAILABLE: 'INTERNAL_SERVER_ERROR',
    TIMEOUT: 'TIMEOUT',
    PROCESS_NOT_FOUND: 'NOT_FOUND',
    SESSION_PARSE_ERROR: 'INTERNAL_SERVER_ERROR',
    MCP_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  }
  return mapping[appCode]
}
```

#### B. Global Error Handler with Logging

```typescript
// src/main/trpc/trpc.ts
import { createIPCHandler } from 'electron-trpc/main'

export function setupTRPCHandler(mainWindow: BrowserWindow): void {
  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    onError: ({ error, req }) => {
      // Log all IPC errors with context
      console.error('[tRPC Error]', {
        path: req.path,
        input: req.input,
        error: {
          message: error.message,
          code: error.code,
          stack: error.stack,
        },
      })

      // Send to error tracking service (Sentry, etc.)
      if (process.env.NODE_ENV === 'production') {
        // Sentry.captureException(error, { contexts: { trpc: req } })
      }
    },
  })
}
```

#### C. Client-Side Retry Logic

```typescript
// src/renderer/lib/trpc.ts
import { TRPCClientError } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [
    ipcLink(),
    // Add retry middleware
    retryLink({
      retry: (opts) => {
        const { error, op } = opts

        // Don't retry mutations (non-idempotent)
        if (op.type === 'mutation') return false

        // Don't retry client errors
        if (error instanceof TRPCClientError) {
          const code = error.data?.code
          if (code === 'BAD_REQUEST' || code === 'NOT_FOUND') {
            return false
          }
        }

        // Retry server errors up to 3 times
        return opts.attempts < 3
      },
      retryDelay: (attemptIndex) => {
        // Exponential backoff: 100ms, 200ms, 400ms
        return Math.min(100 * 2 ** attemptIndex, 1000)
      },
    }),
  ],
})

// Usage in components:
function useSessionData(sessionId: string) {
  const { data, error, refetch } = trpc.session.get.useQuery({ sessionId })

  if (error instanceof TRPCClientError) {
    // Type-safe error handling
    switch (error.data?.code) {
      case 'NOT_FOUND':
        return { notFound: true }
      case 'TIMEOUT':
        return { timeout: true, retry: refetch }
      default:
        return { serverError: true, message: error.message }
    }
  }

  return { data }
}
```

#### D. Request Timeout Enforcement

```typescript
// src/main/trpc/trpc.ts
import { TRPCError } from '@trpc/server'

/**
 * Middleware to enforce timeouts on long-running operations
 */
const timeoutMiddleware = t.middleware(async ({ next, path }) => {
  const timeoutMs = 30000 // 30 seconds default

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new TRPCError({
          code: 'TIMEOUT',
          message: `Request to ${path} timed out after ${timeoutMs}ms`,
        })
      )
    }, timeoutMs)
  })

  return Promise.race([next(), timeoutPromise])
})

// Use in long-running procedures:
export const publicProcedure = t.procedure.use(timeoutMiddleware)
```

### 2.4 Observability Enhancements

```typescript
// src/main/trpc/metrics.ts
interface IPCMetrics {
  totalCalls: number
  errorCount: number
  avgLatencyMs: number
  p95LatencyMs: number
  byPath: Map<string, PathMetrics>
}

interface PathMetrics {
  calls: number
  errors: number
  latencies: number[]
}

class MetricsCollector {
  private metrics: IPCMetrics = {
    totalCalls: 0,
    errorCount: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    byPath: new Map(),
  }

  recordCall(path: string, latencyMs: number, error?: Error): void {
    this.metrics.totalCalls++
    if (error) this.metrics.errorCount++

    let pathMetrics = this.metrics.byPath.get(path)
    if (!pathMetrics) {
      pathMetrics = { calls: 0, errors: 0, latencies: [] }
      this.metrics.byPath.set(path, pathMetrics)
    }

    pathMetrics.calls++
    if (error) pathMetrics.errors++
    pathMetrics.latencies.push(latencyMs)

    // Keep only last 100 latencies per path to prevent memory leak
    if (pathMetrics.latencies.length > 100) {
      pathMetrics.latencies.shift()
    }
  }

  getMetrics(): IPCMetrics {
    // Calculate aggregated metrics
    const allLatencies = Array.from(this.metrics.byPath.values())
      .flatMap((m) => m.latencies)
      .sort((a, b) => a - b)

    this.metrics.avgLatencyMs =
      allLatencies.reduce((sum, l) => sum + l, 0) / allLatencies.length || 0
    this.metrics.p95LatencyMs = allLatencies[Math.floor(allLatencies.length * 0.95)] || 0

    return this.metrics
  }
}

export const metricsCollector = new MetricsCollector()
```

---

## 3. Session Management - File Watching

### 3.1 Current Implementation Analysis

Claude Pilot watches `~/.claude/projects/**/*.jsonl` for session updates:

```typescript
// src/main/controllers/sessions/session.controller.ts
this.watcher = watch(projectsDir, { recursive: true }, (eventType, filename) => {
  if (filename && filename.endsWith('.jsonl')) {
    this.handleSessionUpdate(filePath)
  }
})
```

**✅ Strengths:**

- 10-second cache TTL balances freshness and performance
- 50MB file size limit prevents memory exhaustion
- Batch processing (10 files at a time) avoids I/O spikes
- Smart path decoding for project folders

**⚠️ Critical Issues:**

- `fs.watch` is unreliable on Linux ([fs.watch Limitations](https://github.com/paulmillr/chokidar))
- No rate limiting for rapid file changes
- Could leak watchers if not properly cleaned up

### 3.2 Best Practices from Research

**Chokidar vs fs.watch ([Chokidar GitHub](https://github.com/paulmillr/chokidar)):**

> "Chokidar normalizes events from fs.watch and fs.watchFile, and uses fs.watch-based implementation as the default, which avoids polling and keeps CPU usage down. Chokidar is optimized for performance using native file system events where possible, minimizing file system calls and making it suitable for large directories and high-frequency file changes."

**fs.watch Problems ([Chokidar NPM](https://www.npmjs.com/package/chokidar)):**

> "The native fs.watch doesn't report filenames on macOS, doesn't report events when using certain editors on macOS, often reports events twice, and emits most changes as rename. Additionally, fs.watchFile results in high CPU utilization."

**Performance ([npm-compare: Chokidar vs Others](https://npm-compare.com/chokidar,gaze,node-watch,watchpack)):**

> "Chokidar is known for high performance and low resource consumption, using native OS file watching APIs like inotify on Linux, FSEvents on macOS, and ReadDirectoryChangesW on Windows."

### 3.3 Recommended Migration to Chokidar

#### A. Install Chokidar

```bash
npm install chokidar@^4.0.0
```

**Note:** Chokidar v5 (Jan 2025) is ESM-only and requires Node.js v20+. Use v4 for broader compatibility.

#### B. Replace fs.watch Implementation

```typescript
// src/main/controllers/sessions/session.controller.ts
import chokidar from 'chokidar'

class SessionWatchManager {
  private mainWindow: BrowserWindow | null = null
  private watcher: chokidar.FSWatcher | null = null
  private active = false
  private updateQueue = new Map<string, NodeJS.Timeout>()
  private readonly DEBOUNCE_MS = 500 // Wait 500ms for file writes to complete

  start(): boolean {
    if (this.active) return true
    this.active = true

    const projectsDir = join(CLAUDE_DIR, 'projects')
    if (!existsSync(projectsDir)) return false

    try {
      this.watcher = chokidar.watch('**/*.jsonl', {
        cwd: projectsDir,
        ignored: '**/subagents/**',
        persistent: true,
        ignoreInitial: true, // Don't emit events for existing files
        awaitWriteFinish: {
          stabilityThreshold: 200, // Wait 200ms for file to stabilize
          pollInterval: 100,
        },
        depth: 3, // Limit recursion depth
      })

      this.watcher
        .on('add', (path) => this.handleFileEvent('add', path))
        .on('change', (path) => this.handleFileEvent('change', path))
        .on('unlink', (path) => this.handleFileEvent('unlink', path))
        .on('error', (error) => console.error('Watcher error:', error))
        .on('ready', () => console.log('Session watcher ready'))

      return true
    } catch (error) {
      console.error('Failed to start session watcher:', error)
      return false
    }
  }

  stop(): boolean {
    this.active = false

    // Clear pending debounced updates
    for (const timeout of this.updateQueue.values()) {
      clearTimeout(timeout)
    }
    this.updateQueue.clear()

    if (this.watcher) {
      return this.watcher.close().then(() => {
        this.watcher = null
        return true
      })
    }
    return true
  }

  private handleFileEvent(event: 'add' | 'change' | 'unlink', relativePath: string): void {
    const filePath = join(CLAUDE_DIR, 'projects', relativePath)

    // Debounce rapid changes (e.g., during batch writes)
    const existing = this.updateQueue.get(filePath)
    if (existing) clearTimeout(existing)

    this.updateQueue.set(
      filePath,
      setTimeout(() => {
        this.updateQueue.delete(filePath)
        this.processFileUpdate(event, filePath)
      }, this.DEBOUNCE_MS)
    )
  }

  private async processFileUpdate(
    event: 'add' | 'change' | 'unlink',
    filePath: string
  ): Promise<void> {
    try {
      if (event === 'unlink') {
        // Invalidate cache and notify frontend
        sessionCache.invalidate(filePath)
        if (this.mainWindow) {
          this.mainWindow.webContents.send('session:deleted', { filePath })
        }
        return
      }

      // Parse session and notify
      sessionCache.invalidate(filePath)
      const session = await parseSessionFile(filePath)
      if (session && this.mainWindow) {
        this.mainWindow.webContents.send('session:updated', session)
      }
    } catch (error) {
      console.error('Failed to process file update:', error)
    }
  }
}
```

#### C. Memory-Safe Parsing for Large Files

```typescript
// src/main/controllers/sessions/session.controller.ts
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

/**
 * Parse large JSONL files using streaming to avoid loading entire file into memory
 */
async function parseSessionFileStreaming(filePath: string): Promise<ExternalSession | null> {
  try {
    if (!existsSync(filePath)) return null

    const stat = statSync(filePath)
    const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

    // For small files, use existing in-memory parser
    if (stat.size < 10 * 1024 * 1024) {
      return parseSessionFile(filePath)
    }

    // For large files, use streaming parser
    if (stat.size > MAX_FILE_SIZE) {
      console.warn(
        `Skipping large session file (${Math.round(stat.size / 1024 / 1024)}MB): ${filePath}`
      )
      return null
    }

    const stats: SessionStats = {
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
    }

    let firstEntry: Record<string, unknown> | null = null
    let detectedModel: string | undefined

    const stream = createReadStream(filePath, { encoding: 'utf-8' })
    const rl = createInterface({ input: stream, crlfDelay: Infinity })

    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        stats.messageCount++

        if (!firstEntry) {
          firstEntry = entry
        }

        // ... same parsing logic as in-memory version ...
      } catch {
        // Skip malformed lines
      }
    }

    // ... rest of session construction ...

    return session
  } catch (error) {
    console.error('Failed to parse session file:', error)
    return null
  }
}
```

### 3.4 Rate Limiting for Filesystem Events

```typescript
// src/main/controllers/sessions/session.controller.ts

/**
 * Rate limiter for file system events
 * Prevents flooding the UI with updates during bulk operations
 */
class EventRateLimiter {
  private eventCounts = new Map<string, number>()
  private readonly WINDOW_MS = 1000 // 1 second window
  private readonly MAX_EVENTS_PER_WINDOW = 10

  shouldProcess(filePath: string): boolean {
    const now = Date.now()
    const count = this.eventCounts.get(filePath) || 0

    // Reset count every second
    setTimeout(() => {
      this.eventCounts.delete(filePath)
    }, this.WINDOW_MS)

    if (count >= this.MAX_EVENTS_PER_WINDOW) {
      console.warn(`Rate limit exceeded for ${filePath}, throttling updates`)
      return false
    }

    this.eventCounts.set(filePath, count + 1)
    return true
  }
}

const rateLimiter = new EventRateLimiter()

// Use in handleFileEvent:
private handleFileEvent(event: 'add' | 'change' | 'unlink', relativePath: string): void {
  const filePath = join(CLAUDE_DIR, 'projects', relativePath)

  if (!rateLimiter.shouldProcess(filePath)) {
    return // Skip this event
  }

  // ... rest of implementation ...
}
```

---

## 4. Electron Security

### 4.1 Current Implementation Analysis

Claude Pilot has basic security in place:

```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
})
```

**✅ Strengths:**

- Context isolation enabled
- Node integration disabled
- Uses preload script for controlled API exposure

**⚠️ Critical Gaps:**

- No IPC sender validation
- No Content Security Policy
- Path traversal vulnerabilities in file operations
- No ASAR integrity checks

### 4.2 Best Practices from Research

**Context Isolation ([Electron Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security)):**

> "Context isolation is the default behavior in Electron since version 12.0.0, and it allows developers to run code in preload scripts and Electron APIs in a dedicated JavaScript context. This means that global objects like Array.prototype.push or JSON.parse cannot be modified by scripts running in the renderer process."

**IPC Validation ([Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)):**

> "You should always validate incoming IPC messages sender property to ensure you aren't performing actions or sending information to untrusted renderers, and you should be validating the sender of all IPC messages by default. All Web Frames can in theory send IPC messages to the main process, including iframes and child windows in some scenarios."

**Security Recommendations ([Penetration Testing of Electron Apps](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)):**

> "You should ensure you aren't listening to third party web frames by validating the sender of messages. Any data being sent between processes should be properly sanitized and validated. You should enable the sandbox in all renderers."

### 4.3 Security Hardening Checklist

#### A. IPC Sender Validation

```typescript
// src/main/trpc/trpc.ts
import { BrowserWindow } from 'electron'

/**
 * Validate that IPC messages come from trusted renderers
 */
function validateIPCSender(event: Electron.IpcMainInvokeEvent): boolean {
  const senderFrame = event.senderFrame
  const mainWindow = BrowserWindow.getAllWindows()[0]

  // Reject if no main window exists
  if (!mainWindow) return false

  // Reject if sender is not the main window's web contents
  if (event.sender !== mainWindow.webContents) {
    console.error('[Security] IPC message from untrusted sender rejected')
    return false
  }

  // Reject if sender is an iframe or embedded frame
  if (senderFrame && !senderFrame.isMainFrame()) {
    console.error('[Security] IPC message from iframe rejected')
    return false
  }

  return true
}

// Add to tRPC setup:
export function setupTRPCHandler(mainWindow: BrowserWindow): void {
  createIPCHandler({
    router: appRouter,
    windows: [mainWindow],
    onRequest: ({ event }) => {
      if (!validateIPCSender(event)) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'IPC sender validation failed',
        })
      }
    },
    // ... rest of setup
  })
}
```

#### B. Path Sanitization

```typescript
// src/main/utils/path-utils.ts
import { resolve, normalize, isAbsolute } from 'path'
import { homedir } from 'os'

/**
 * Sanitize file paths to prevent directory traversal attacks
 */
export function sanitizePath(userPath: string, allowedBase?: string): string | null {
  try {
    // Normalize path (resolves .., ., //)
    const normalized = normalize(userPath)

    // Reject non-absolute paths
    if (!isAbsolute(normalized)) {
      console.error('[Security] Rejected non-absolute path:', userPath)
      return null
    }

    // If allowed base is specified, ensure path is within it
    if (allowedBase) {
      const resolvedBase = resolve(allowedBase)
      const resolvedPath = resolve(normalized)

      if (!resolvedPath.startsWith(resolvedBase)) {
        console.error('[Security] Path traversal attempt detected:', {
          requested: userPath,
          resolved: resolvedPath,
          allowedBase: resolvedBase,
        })
        return null
      }
    }

    return normalized
  } catch (error) {
    console.error('[Security] Path sanitization failed:', error)
    return null
  }
}

/**
 * Validate that a path is within user's home directory
 */
export function validateUserPath(userPath: string): string | null {
  const home = homedir()
  return sanitizePath(userPath, home)
}

// Usage in controllers:
import { sanitizePath } from '../../utils/path-utils'

export const sessionRouter = router({
  get: publicProcedure.input(z.object({ sessionId: z.string() })).query(async ({ input }) => {
    // Validate session ID doesn't contain path traversal
    if (input.sessionId.includes('..') || input.sessionId.includes('/')) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Invalid session ID format',
      })
    }

    const projectsDir = join(homedir(), '.claude', 'projects')
    const sessionPath = join(projectsDir, `**/${input.sessionId}.jsonl`)

    // Ensure resolved path is still within projects directory
    const sanitized = sanitizePath(sessionPath, projectsDir)
    if (!sanitized) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Path traversal attempt detected',
      })
    }

    // ... rest of implementation
  }),
})
```

#### C. Content Security Policy

```typescript
// src/main/index.ts
import { session } from 'electron'

function setupSecurityHeaders(): void {
  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'", // Allow inline styles for Tailwind
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-src 'none'", // Prevent iframes
          ].join('; '),
        ],
        // Enable SharedArrayBuffer for worker optimization (from Gemini research)
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['credentialless'],
        // Security headers
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
      },
    })
  })
}

app.whenReady().then(() => {
  setupSecurityHeaders()
  createWindow()
})
```

#### D. Sandbox Mode

```typescript
// src/main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true, // Enable sandbox for renderer
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
})
```

#### E. Input Validation with Zod

```typescript
// src/main/controllers/sessions/session.controller.ts
import { z } from 'zod'

// Strict validation schemas
const SessionIdSchema = z.object({
  sessionId: z
    .string()
    .min(1, 'Session ID cannot be empty')
    .max(100, 'Session ID too long')
    .regex(/^[a-f0-9-]+$/, 'Invalid session ID format'), // UUID format only
})

const FilePathSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(4096) // Reasonable path length limit
    .refine((p) => isAbsolute(p), 'Path must be absolute')
    .refine((p) => !p.includes('..'), 'Path cannot contain ..'),
})

const ProcessIdSchema = z.object({
  pid: z.number().int().positive().max(4194304), // Maximum PID on Linux (2^22)
})
```

### 4.4 Security Audit Checklist

Use this checklist before production deployment:

- [ ] **Context Isolation**: Enabled in all windows
- [ ] **Node Integration**: Disabled in all windows
- [ ] **Sandbox**: Enabled for renderer processes
- [ ] **IPC Validation**: All IPC handlers validate sender
- [ ] **Path Sanitization**: All file operations sanitize paths
- [ ] **Input Validation**: All user inputs validated with Zod
- [ ] **CSP**: Content Security Policy configured
- [ ] **CORS**: Cross-origin requests properly restricted
- [ ] **Dependencies**: No vulnerabilities in `npm audit`
- [ ] **ASAR Integrity**: Code signing enabled for production builds
- [ ] **Auto-Update**: Signed updates with public key verification
- [ ] **Dev Tools**: Disabled in production builds
- [ ] **Remote Module**: Deprecated module not used
- [ ] **WebView Tags**: Not used (vulnerable)

---

## 5. Production Deployment Recommendations

### 5.1 Performance Optimizations

```typescript
// src/main/index.ts

/**
 * Production-only optimizations
 */
if (app.isPackaged) {
  // Disable dev tools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      event.preventDefault()
    }
  })

  // Enable V8 code caching
  app.commandLine.appendSwitch('js-flags', '--expose-gc')

  // Optimize memory usage
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder')
}
```

### 5.2 Error Recovery

```typescript
// src/main/index.ts
import { app, crashReporter } from 'electron'

// Enable crash reporting
crashReporter.start({
  productName: 'Claude Pilot',
  companyName: 'Anthropic',
  submitURL: 'https://your-crash-server.com/upload',
  uploadToServer: true,
})

// Handle renderer crashes
mainWindow.webContents.on('render-process-gone', (event, details) => {
  console.error('Renderer process crashed:', details)

  if (details.reason !== 'clean-exit') {
    // Attempt to reload
    mainWindow.reload()
  }
})

// Handle main process crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error)
  // Log to file, send to Sentry, etc.
})
```

### 5.3 Monitoring and Observability

```typescript
// src/main/services/metrics.ts
import { app, powerMonitor, screen } from 'electron'

interface SystemMetrics {
  cpu: number
  memory: NodeJS.MemoryUsage
  uptime: number
  activeUsers: number
}

export class MetricsService {
  private metricsInterval: NodeJS.Timeout | null = null

  start(): void {
    // Collect metrics every 60 seconds
    this.metricsInterval = setInterval(() => {
      this.collectMetrics()
    }, 60000)

    // Monitor power events
    powerMonitor.on('suspend', () => {
      console.log('[Metrics] System suspended')
    })

    powerMonitor.on('resume', () => {
      console.log('[Metrics] System resumed')
    })
  }

  private collectMetrics(): SystemMetrics {
    const metrics = {
      cpu: app.getAppMetrics(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      activeUsers: BrowserWindow.getAllWindows().length,
    }

    console.log('[Metrics]', metrics)

    // Send to monitoring service (DataDog, New Relic, etc.)

    return metrics
  }

  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }
  }
}
```

---

## Summary of Recommendations

### Immediate Priorities (P0)

1. **Migrate to Chokidar** - Replace `fs.watch` with Chokidar for reliable file watching
2. **IPC Sender Validation** - Add sender validation to all tRPC handlers
3. **Path Sanitization** - Implement `sanitizePath()` for all file operations
4. **Content Security Policy** - Configure CSP headers to prevent XSS

### Short-term Improvements (P1)

5. **Process Cache** - Add 1-second TTL cache for `/proc` reads
6. **Error Classification** - Implement structured error codes for tRPC
7. **Retry Logic** - Add exponential backoff for transient failures
8. **Rate Limiting** - Throttle file system event processing

### Long-term Enhancements (P2)

9. **Metrics Collection** - Instrument IPC calls with latency tracking
10. **Streaming Parsers** - Use streaming for large JSONL files
11. **Crash Reporting** - Integrate Sentry or similar
12. **ASAR Integrity** - Enable code signing for production

---

## Sources

1. [The /proc Filesystem — The Linux Kernel Documentation](https://docs.kernel.org/filesystems/proc.html)
2. [proc(5) - Linux Manual Page](https://man7.org/linux/man-pages/man5/proc.5.html)
3. [Linux /proc Filesystem Manipulation - Group-IB](https://www.group-ib.com/blog/linux-pro-manipulation/)
4. [Error Handling | tRPC](https://trpc.io/docs/server/error-handling)
5. [electron-trpc Documentation](https://electron-trpc.dev/)
6. [tRPC Best Practices Guide](https://www.projectrules.ai/rules/trpc)
7. [Chokidar GitHub Repository](https://github.com/paulmillr/chokidar)
8. [Chokidar NPM Package](https://www.npmjs.com/package/chokidar)
9. [npm-compare: File Watching Libraries](https://npm-compare.com/chokidar,gaze,node-watch,watchpack)
10. [Security | Electron Documentation](https://www.electronjs.org/docs/latest/tutorial/security)
11. [Context Isolation | Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
12. [Penetration Testing of Electron Apps](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
13. [Electron Security Checklist - Doyensec](https://www.doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf)

---

**Document Version**: 1.0
**Last Updated**: 2026-01-20
**Reviewed By**: Claude Sonnet 4.5 (Research Agent)
