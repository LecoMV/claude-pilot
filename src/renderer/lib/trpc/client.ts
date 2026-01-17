/**
 * tRPC Client for Renderer
 *
 * Provides type-safe IPC calls to the main process.
 * Types are automatically inferred from the main process router.
 */

import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'
import type { AppRouter } from '../../../main/trpc/router'

// Create the tRPC client with electron IPC transport
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
