/**
 * App Router
 *
 * Combines all domain controllers into a single router.
 * This is the main entry point for tRPC in the main process.
 *
 * Migration Strategy (Hybrid IPC):
 * - New features use tRPC procedures
 * - Legacy handlers remain in handlers.ts
 * - Gradually migrate 1 controller per sprint
 */

import { router } from './trpc'
import { demoRouter } from '../controllers/demo.controller'
import { systemRouter } from '../controllers/system.controller'
import { memoryRouter } from '../controllers/memory.controller'

// ============================================================================
// MAIN APP ROUTER
// ============================================================================

export const appRouter = router({
  // Spike/Demo controller - proves the pattern works
  demo: demoRouter,

  // System status and resources (migrated from handlers.ts)
  system: systemRouter,

  // Memory operations - Postgres/Qdrant/Memgraph (migrated from handlers.ts)
  memory: memoryRouter,

  // Future controllers (migrate from handlers.ts):
  // session: sessionRouter,     // Claude process management
  // embedding: embeddingRouter, // Vector operations
  // mcp: mcpRouter,             // MCP proxy/federation
  // audit: auditRouter,         // Logging, SIEM
  // security: securityRouter,   // Credentials, governance
})

// Export type for frontend - this is the magic!
// Frontend gets full type inference for all procedures
export type AppRouter = typeof appRouter
