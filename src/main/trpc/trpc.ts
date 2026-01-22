/**
 * tRPC Instance
 *
 * Core tRPC configuration with middleware support.
 * This is the foundation for type-safe IPC.
 */

import { initTRPC } from '@trpc/server'
import superjson from 'superjson'
import type { TRPCContext } from './context'

const t = initTRPC.context<TRPCContext>().create({
  // SuperJSON transformer for proper Date, Map, Set, etc. serialization
  transformer: superjson,
  errorFormatter({ shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Add custom error data here
        timestamp: Date.now(),
      },
    }
  },
})

// Base router and procedure helpers
export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware

// Audit middleware - logs all procedure calls
export const auditMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  const duration = Date.now() - start

  // Log to audit service (can be extended later)
  console.info(`[tRPC] ${type} ${path} - ${duration}ms`)

  return result
})

// Audited procedure - automatically logs calls
export const auditedProcedure = publicProcedure.use(auditMiddleware)

// =============================================================================
// TIMEOUT MIDDLEWARE
// =============================================================================

/**
 * Timeout middleware - enforces maximum execution time for procedures
 * Uses Promise.race() pattern for clean timeout handling with proper cleanup
 */
export const createTimeoutMiddleware = (timeoutMs: number = 30000) =>
  middleware(async ({ path, next }) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Procedure ${path} timed out after ${timeoutMs}ms. ` +
              'Consider breaking this into smaller operations or increasing the timeout.'
          )
        )
      }, timeoutMs)
    })

    try {
      const result = await Promise.race([next(), timeoutPromise])
      // Clear timeout if procedure completed successfully
      if (timeoutId) clearTimeout(timeoutId)
      return result
    } catch (error) {
      // Clear timeout on error to prevent memory leaks
      if (timeoutId) clearTimeout(timeoutId)
      throw error
    }
  })

// Default timeout middleware (30 seconds)
export const timeoutMiddleware = createTimeoutMiddleware(30000)

// Timed procedure - enforces 30s timeout
export const timedProcedure = publicProcedure.use(timeoutMiddleware)

// =============================================================================
// RATE LIMITING MIDDLEWARE
// =============================================================================

/**
 * Simple in-memory rate limiter store
 * Tracks request counts per key with automatic cleanup
 */
class RateLimitStore {
  private requests: Map<string, { count: number; resetAt: number }> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

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

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.requests) {
      if (entry.resetAt <= now) {
        this.requests.delete(key)
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.requests.clear()
  }
}

// Global rate limit store instance
const rateLimitStore = new RateLimitStore()

interface RateLimitOptions {
  /** Maximum requests per window (default: 100) */
  max?: number
  /** Window duration in ms (default: 60000 = 1 minute) */
  windowMs?: number
  /** Key generator function (default: uses procedure path) */
  keyGenerator?: (ctx: { path: string }) => string
}

/**
 * Rate limiting middleware - prevents abuse with configurable limits
 * Uses sliding window algorithm with in-memory store
 */
export const createRateLimitMiddleware = (options: RateLimitOptions = {}) => {
  const { max = 100, windowMs = 60000, keyGenerator = ({ path }) => path } = options

  return middleware(async ({ path, next }) => {
    const key = keyGenerator({ path })
    const { count, resetAt } = rateLimitStore.increment(key, windowMs)

    if (count > max) {
      const retryAfterMs = resetAt - Date.now()
      throw new Error(
        `Rate limit exceeded for ${path}. ` +
          `Maximum ${max} requests per ${windowMs / 1000}s. ` +
          `Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
      )
    }

    return next()
  })
}

// Default rate limit middleware (100 requests per minute)
export const rateLimitMiddleware = createRateLimitMiddleware({ max: 100, windowMs: 60000 })

// Rate limited procedure - enforces 100 req/min limit
export const rateLimitedProcedure = publicProcedure.use(rateLimitMiddleware)

// =============================================================================
// COMBINED MIDDLEWARE PROCEDURES
// =============================================================================

// Protected procedure - combines audit, timeout, and rate limiting
export const protectedProcedure = publicProcedure
  .use(auditMiddleware)
  .use(timeoutMiddleware)
  .use(rateLimitMiddleware)
