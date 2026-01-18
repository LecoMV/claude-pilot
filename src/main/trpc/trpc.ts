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
