/**
 * Integration Controllers - Index
 *
 * Exports all integration-related tRPC routers:
 * - ollama: Local LLM model management
 * - pgvector: PostgreSQL vector operations
 * - treesitter: Code parsing and analysis
 */

export { ollamaRouter } from './ollama.controller'
export { pgvectorRouter } from './pgvector.controller'
export { treesitterRouter } from './treesitter.controller'
