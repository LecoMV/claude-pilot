/**
 * tRPC Client for Renderer
 *
 * Provides type-safe IPC calls to the main process.
 * Types are automatically inferred from the main process router.
 *
 * Uses custom ipcLink for tRPC v11 compatibility.
 */

import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from './ipcLink'
import type { AppRouter } from '../../../main/trpc/router'

// Create the tRPC client with electron IPC transport
// Note: transformer is handled inside ipcLink for v11 compatibility
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [ipcLink()],
})

// Export the client type for use in components
export type TRPCClient = typeof trpc

/**
 * Example usage in components:
 *
 * import { trpc } from '@/lib/trpc/client'
 *
 * // Query
 * const result = await trpc.demo.ping.query({ message: 'hello' })
 *
 * // Mutation
 * await trpc.demo.logMessage.mutate({ level: 'info', message: 'test' })
 *
 * // With type safety - these would cause TypeScript errors:
 * // trpc.demo.ping.query({ wrong: 'type' }) // Error!
 * // trpc.nonexistent.query() // Error!
 */
