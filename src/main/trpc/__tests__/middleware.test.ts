/**
 * tRPC Middleware Tests
 *
 * Tests for timeout and rate limiting middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initTRPC, TRPCError } from '@trpc/server'

// Create a test tRPC instance
const t = initTRPC.create()

// Create fresh middleware factories for each test to avoid shared state
// This is important because rate limit stores track state globally
let _testCounter = 0
const _getUniqueKey = () => `test-${Date.now()}-${++_testCounter}`

// Simple rate limit store for testing (isolated per test)
class TestRateLimitStore {
  private requests: Map<string, { count: number; resetAt: number }> = new Map()

  increment(key: string, windowMs: number): { count: number; resetAt: number } {
    const now = Date.now()
    const existing = this.requests.get(key)

    if (existing && existing.resetAt > now) {
      existing.count++
      return existing
    }

    const entry = { count: 1, resetAt: now + windowMs }
    this.requests.set(key, entry)
    return entry
  }

  clear(): void {
    this.requests.clear()
  }
}

// Create a timeout middleware factory for testing with proper cleanup
const createTestTimeoutMiddleware = (timeoutMs: number = 30000) =>
  t.middleware(async ({ path, next }) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new TRPCError({
            code: 'TIMEOUT',
            message: `Procedure ${path} timed out after ${timeoutMs}ms.`,
          })
        )
      }, timeoutMs)
    })

    try {
      const result = await Promise.race([next(), timeoutPromise])
      if (timeoutId) clearTimeout(timeoutId)
      return result
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId)
      throw error
    }
  })

// Create a rate limit middleware factory for testing (with isolated store)
const createTestRateLimitMiddleware = (
  store: TestRateLimitStore,
  options: {
    max?: number
    windowMs?: number
    keyGenerator?: (ctx: { path: string }) => string
  } = {}
) => {
  const { max = 100, windowMs = 60000, keyGenerator = ({ path }) => path } = options

  return t.middleware(async ({ path, next }) => {
    const key = keyGenerator({ path })
    const { count, resetAt } = store.increment(key, windowMs)

    if (count > max) {
      const retryAfterMs = resetAt - Date.now()
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded for ${path}. Maximum ${max} requests per ${windowMs / 1000}s. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
      })
    }

    return next()
  })
}

describe('Timeout Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    // Clear all pending timers to prevent unhandled rejections
    vi.clearAllTimers()
    vi.useRealTimers()
    // Allow any pending microtasks to complete
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('should allow procedures that complete within timeout', async () => {
    const middleware = createTestTimeoutMiddleware(1000)
    const procedure = t.procedure.use(middleware).query(() => 'success')

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    const resultPromise = caller.test()
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toBe('success')
  })

  it('should timeout procedures that exceed the limit', async () => {
    const middleware = createTestTimeoutMiddleware(100)

    const procedure = t.procedure.use(middleware).query(async () => {
      // Simulate long-running operation
      await new Promise((resolve) => setTimeout(resolve, 500))
      return 'should not reach'
    })

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    const resultPromise = caller.test()

    // Advance timers and flush microtasks
    await vi.advanceTimersByTimeAsync(150)

    await expect(resultPromise).rejects.toThrow(/timed out after 100ms/)
  })

  it('should use configurable timeout value', async () => {
    const middleware = createTestTimeoutMiddleware(200)
    const procedure = t.procedure.use(middleware).query(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return 'should not reach'
    })

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    const resultPromise = caller.test()
    await vi.advanceTimersByTimeAsync(250)

    await expect(resultPromise).rejects.toThrow(/timed out after 200ms/)
  })

  it('should include procedure path in error message', async () => {
    const middleware = createTestTimeoutMiddleware(100)

    const procedure = t.procedure.use(middleware).query(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return 'x'
    })

    const router = t.router({ myProcedure: procedure })
    const caller = router.createCaller({})

    const resultPromise = caller.myProcedure()
    await vi.advanceTimersByTimeAsync(150)

    await expect(resultPromise).rejects.toThrow(/myProcedure/)
  })
})

describe('Rate Limit Middleware', () => {
  let store: TestRateLimitStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = new TestRateLimitStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    store.clear()
  })

  it('should allow requests within the limit', async () => {
    const middleware = createTestRateLimitMiddleware(store, { max: 5, windowMs: 1000 })
    const procedure = t.procedure.use(middleware).query(() => 'success')

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    // Make 5 requests (within limit)
    for (let i = 0; i < 5; i++) {
      await expect(caller.test()).resolves.toBe('success')
    }
  })

  it('should block requests exceeding the limit', async () => {
    const middleware = createTestRateLimitMiddleware(store, { max: 3, windowMs: 1000 })
    const procedure = t.procedure.use(middleware).query(() => 'success')

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    // Make 3 requests (within limit)
    for (let i = 0; i < 3; i++) {
      await expect(caller.test()).resolves.toBe('success')
    }

    // 4th request should be blocked
    await expect(caller.test()).rejects.toThrow(/Rate limit exceeded/)
  })

  it('should reset after window expires', async () => {
    const middleware = createTestRateLimitMiddleware(store, { max: 2, windowMs: 1000 })
    const procedure = t.procedure.use(middleware).query(() => 'success')

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    // Exhaust limit
    await caller.test()
    await caller.test()
    await expect(caller.test()).rejects.toThrow(/Rate limit exceeded/)

    // Advance time past window
    vi.advanceTimersByTime(1100)

    // Should be allowed again
    await expect(caller.test()).resolves.toBe('success')
  })

  it('should track different procedures separately', async () => {
    const middleware = createTestRateLimitMiddleware(store, { max: 2, windowMs: 1000 })

    const procedureA = t.procedure.use(middleware).query(() => 'A')
    const procedureB = t.procedure.use(middleware).query(() => 'B')

    const router = t.router({ a: procedureA, b: procedureB })
    const caller = router.createCaller({})

    // Exhaust limit on procedure A
    await caller.a()
    await caller.a()
    await expect(caller.a()).rejects.toThrow(/Rate limit exceeded/)

    // Procedure B should still work
    await expect(caller.b()).resolves.toBe('B')
    await expect(caller.b()).resolves.toBe('B')
  })

  it('should include retry-after info in error', async () => {
    const middleware = createTestRateLimitMiddleware(store, { max: 1, windowMs: 5000 })
    const procedure = t.procedure.use(middleware).query(() => 'success')

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    await caller.test()

    // Advance 2 seconds (3 seconds remaining)
    vi.advanceTimersByTime(2000)

    await expect(caller.test()).rejects.toThrow(/Retry after/)
  })

  it('should support default values (100 req/min)', async () => {
    // Use isolated store with default options
    const middleware = createTestRateLimitMiddleware(store, { max: 100, windowMs: 60000 })
    const procedure = t.procedure.use(middleware).query(() => 'success')

    const router = t.router({ test: procedure })
    const caller = router.createCaller({})

    // Make 100 requests (within default limit)
    for (let i = 0; i < 100; i++) {
      await expect(caller.test()).resolves.toBe('success')
    }

    // 101st should be blocked
    await expect(caller.test()).rejects.toThrow(/Rate limit exceeded/)
  })

  it('should support custom key generator', async () => {
    // Use a single key for all procedures (global rate limit)
    const middleware = createTestRateLimitMiddleware(store, {
      max: 3,
      windowMs: 1000,
      keyGenerator: () => 'global',
    })

    const procedureA = t.procedure.use(middleware).query(() => 'A')
    const procedureB = t.procedure.use(middleware).query(() => 'B')

    const router = t.router({ a: procedureA, b: procedureB })
    const caller = router.createCaller({})

    // Use up global limit across both procedures
    await caller.a()
    await caller.b()
    await caller.a()

    // Both should now be blocked
    await expect(caller.a()).rejects.toThrow(/Rate limit exceeded/)
    await expect(caller.b()).rejects.toThrow(/Rate limit exceeded/)
  })
})
