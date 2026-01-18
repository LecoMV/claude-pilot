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
import { embeddingRouter } from '../controllers/embedding.controller'
import { configRouter } from '../controllers/config.controller'

// Sprint 1: Security controllers
import { credentialsRouter, auditRouter, watchdogRouter } from '../controllers/security'

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

  // Embedding operations - Ollama/pgvector/Qdrant (migrated from handlers.ts)
  embedding: embeddingRouter,

  // Configuration - 5-tier hierarchical config resolver
  config: configRouter,

  // Sprint 1: Security controllers (migrated from handlers.ts)
  credentials: credentialsRouter, // Secure credential storage via OS keychain
  audit: auditRouter, // OCSF-compliant audit logging + SIEM integration
  watchdog: watchdogRouter, // Service health monitoring + auto-recovery

  // Future controllers (migrate from handlers.ts):
  // session: sessionRouter,     // Claude process management
  // mcp: mcpRouter,             // MCP proxy/federation
})

// Export type for frontend - this is the magic!
// Frontend gets full type inference for all procedures
export type AppRouter = typeof appRouter
