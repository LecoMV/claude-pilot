/**
 * Custom IPC Handler for tRPC v11 + Electron
 *
 * This replaces electron-trpc/main's createIPCHandler which has
 * incompatibilities with @trpc/server v11.
 *
 * Uses direct router navigation to invoke procedures.
 *
 * @module trpc/ipcHandler
 */

import { ipcMain, type IpcMainEvent } from 'electron'
import type { AnyRouter } from '@trpc/server'
import superjson from 'superjson'

// Channel name must match renderer ipcLink
const ELECTRON_TRPC_CHANNEL = 'electron-trpc'

interface TRPCRequest {
  method: 'request'
  operation: {
    id: string
    type: 'query' | 'mutation' | 'subscription'
    path: string
    input?: unknown
    context?: unknown
  }
}

interface IPCHandlerOptions<TRouter extends AnyRouter> {
  router: TRouter
  createContext: () => unknown
}

/**
 * Deserialize input using SuperJSON (matching server transformer)
 */
function deserialize<T>(data: unknown): T {
  if (data === undefined || data === null) {
    return data as T
  }
  return superjson.deserialize(data as Parameters<typeof superjson.deserialize>[0]) as T
}

/**
 * Serialize output using SuperJSON (matching server transformer)
 */
function serialize(data: unknown): unknown {
  return superjson.serialize(data)
}

/**
 * Format error for sending to client
 */
function formatError(error: unknown): { message: string; code: string; data?: unknown } {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as { code?: string }).code || 'INTERNAL_SERVER_ERROR',
      data: process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined,
    }
  }
  return {
    message: String(error),
    code: 'INTERNAL_SERVER_ERROR',
  }
}

/**
 * Create a custom IPC handler for tRPC v11 + Electron
 */
export function createIPCHandler<TRouter extends AnyRouter>(
  options: IPCHandlerOptions<TRouter>
): { dispose: () => void } {
  const { router, createContext } = options

  /**
   * Handle incoming tRPC requests
   */
  async function handleRequest(event: IpcMainEvent, request: TRPCRequest): Promise<void> {
    const { operation } = request

    if (!operation || !operation.id || !operation.path) {
      console.error('[tRPC] Invalid request: missing operation data')
      return
    }

    const { id, path, input: serializedInput } = operation

    try {
      // Deserialize the input
      const input = deserialize(serializedInput)

      // Create the context
      const ctx = createContext()

      // Parse the path segments (e.g., "system.status" -> ["system", "status"])
      const pathSegments = path.split('.')

      // Navigate the router to find the procedure
      // tRPC v11 uses nested router structure with _def.record for child routers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = router

      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i]

        // Check if this is a direct property (nested router)
        if (current[segment]) {
          current = current[segment]
        } else if (current._def?.record?.[segment]) {
          // Or accessed via _def.record
          current = current._def.record[segment]
        } else {
          throw new Error(`Path segment not found: ${segment} in ${path}`)
        }
      }

      // At this point, 'current' should be a procedure
      // In tRPC v11, procedures have _def.resolver
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const procedureDef = current._def as any

      if (!procedureDef) {
        throw new Error(`Not a valid procedure: ${path}`)
      }

      // tRPC v11 stores the resolver directly in _def.resolver
      const resolver = procedureDef.resolver
      if (typeof resolver === 'function') {
        const result = await resolver({ ctx, input, path, type: operation.type })

        event.sender.send(ELECTRON_TRPC_CHANNEL, {
          id,
          result: { type: 'data', data: serialize(result) },
        })
        return
      }

      throw new Error(`Cannot invoke procedure: ${path} (no resolver found)`)
    } catch (error) {
      console.error(`[tRPC] Error in ${operation.type} ${path}:`, error)

      // Send error response
      event.sender.send(ELECTRON_TRPC_CHANNEL, {
        id,
        error: formatError(error),
      })
    }
  }

  // Set up IPC listener
  const listener = (event: IpcMainEvent, request: TRPCRequest): void => {
    if (request?.method === 'request') {
      handleRequest(event, request).catch((err) => {
        console.error('[tRPC] Unhandled error in request handler:', err)
      })
    }
  }

  ipcMain.on(ELECTRON_TRPC_CHANNEL, listener)

  console.info('[tRPC] Custom IPC handler initialized')

  return {
    dispose: () => {
      ipcMain.removeListener(ELECTRON_TRPC_CHANNEL, listener)
      console.info('[tRPC] Custom IPC handler disposed')
    },
  }
}
