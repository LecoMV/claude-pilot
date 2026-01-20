/**
 * App Router
 *
 * Combines all domain controllers into a single router.
 * This is the main entry point for tRPC in the main process.
 *
 * Migration Complete: All 201 legacy handlers migrated to tRPC controllers.
 */

import { router } from './trpc'
import { demoRouter } from '../controllers/demo.controller'
import { systemRouter } from '../controllers/system.controller'
import { memoryRouter } from '../controllers/memory.controller'
import { embeddingRouter } from '../controllers/embedding.controller'
import { configRouter } from '../controllers/config.controller'

// Sprint 1: Security controllers
import { credentialsRouter, auditRouter, watchdogRouter } from '../controllers/security'

// Sprint 2: MCP controllers
import { mcpRouter, proxyRouter } from '../controllers/mcp'

// Sprint 3: Session controllers
import { sessionRouter, transcriptRouter, beadsRouter } from '../controllers/sessions'

// Sprint 4: Context & Analysis controllers
import { contextRouter } from '../controllers/context'
import { plansRouter, branchesRouter } from '../controllers/analysis'

// Sprint 5: Integration controllers
import { ollamaRouter, pgvectorRouter, treesitterRouter } from '../controllers/integrations'

// Sprint 6: Utility controllers
import {
  profilesRouter,
  servicesRouter,
  logsRouter,
  agentsRouter,
  settingsRouter,
  claudeRouter,
  workersRouter,
  streamRouter,
  updateRouter,
  terminalRouter,
  diagnosticsRouter,
} from '../controllers/utilities'

// Chat controller
import { chatRouter } from '../controllers/chat'

// ============================================================================
// MAIN APP ROUTER
// ============================================================================

export const appRouter = router({
  // Demo controller - proves the pattern works
  demo: demoRouter,

  // System status and resources
  system: systemRouter,

  // Memory operations - Postgres/Qdrant/Memgraph
  memory: memoryRouter,

  // Embedding operations - Ollama/pgvector/Qdrant
  embedding: embeddingRouter,

  // Configuration - 5-tier hierarchical config resolver
  config: configRouter,

  // Sprint 1: Security (26 handlers)
  credentials: credentialsRouter,
  audit: auditRouter,
  watchdog: watchdogRouter,

  // Sprint 2: MCP (16 handlers)
  mcp: mcpRouter,
  proxy: proxyRouter,

  // Sprint 3: Sessions (18 handlers)
  session: sessionRouter,
  sessions: sessionRouter, // Alias for frontend compatibility (sessions.getActive etc.)
  transcript: transcriptRouter,
  beads: beadsRouter,

  // Sprint 4: Context & Analysis (30 handlers)
  context: contextRouter,
  plans: plansRouter,
  branches: branchesRouter,

  // Sprint 5: Integrations (23 handlers)
  ollama: ollamaRouter,
  pgvector: pgvectorRouter,
  treesitter: treesitterRouter,

  // Sprint 6: Utilities (39 handlers)
  profiles: profilesRouter,
  services: servicesRouter,
  logs: logsRouter,
  agents: agentsRouter,
  settings: settingsRouter,
  claude: claudeRouter,
  workers: workersRouter,
  stream: streamRouter,
  update: updateRouter,
  terminal: terminalRouter,
  diagnostics: diagnosticsRouter,

  // Chat controller
  chat: chatRouter,
})

// Export type for frontend - this is the magic!
// Frontend gets full type inference for all procedures
export type AppRouter = typeof appRouter
