/**
 * Custom IPC Link for tRPC v11 + Electron
 *
 * This replaces electron-trpc/renderer's ipcLink which has serialization
 * incompatibilities with @trpc/client v11.
 *
 * The electron-trpc package expects runtime.transformer.serialize but tRPC v11
 * changed the transformer API. This implementation uses SuperJSON directly.
 *
 * @module trpc/ipcLink
 */

import { TRPCClientError, TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import type { AnyRouter } from '@trpc/server'
import superjson from 'superjson'

interface ElectronTRPC {
  sendMessage: (args: { method: 'request'; operation: unknown }) => void
  onMessage: (callback: (args: { id: string } & Record<string, unknown>) => void) => () => void
}

/**
 * Get the electronTRPC API exposed by the preload script
 */
function getElectronTRPC(): ElectronTRPC {
  const electronTRPC = (window as unknown as { electronTRPC?: ElectronTRPC }).electronTRPC

  if (!electronTRPC) {
    throw new Error(
      '[tRPC] electronTRPC not available. Ensure exposeElectronTRPC() is called in preload.'
    )
  }

  return electronTRPC
}

/**
 * Serialize data using SuperJSON (matching server transformer)
 */
function serialize(data: unknown): unknown {
  return superjson.serialize(data)
}

/**
 * Deserialize data using SuperJSON (matching server transformer)
 */
function deserialize<T>(data: unknown): T {
  return superjson.deserialize(data as Parameters<typeof superjson.deserialize>[0]) as T
}

/**
 * Generate a unique request ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * Custom IPC link for tRPC v11 + Electron
 *
 * Handles request/response over Electron IPC with proper SuperJSON serialization.
 */
export function ipcLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
  return () => {
    const electronTRPC = getElectronTRPC()

    // Map of pending requests awaiting responses
    const pendingRequests = new Map<
      string,
      {
        resolve: (value: unknown) => void
        reject: (error: Error) => void
      }
    >()

    // Set up message listener for responses
    const unsubscribe = electronTRPC.onMessage((response) => {
      const { id, ...rest } = response

      const pending = pendingRequests.get(id)
      if (!pending) {
        // Response for unknown request - might be from a previous session
        return
      }

      pendingRequests.delete(id)

      // Check for error response
      if ('error' in rest) {
        const error = rest.error as { message?: string; code?: string; data?: unknown }
        pending.reject(
          new TRPCClientError(error.message || 'Unknown error', {
            result: rest,
          })
        )
        return
      }

      // Success response
      if ('result' in rest) {
        const result = rest.result as { type: string; data?: unknown }
        if (result.type === 'data' && 'data' in result) {
          pending.resolve(deserialize(result.data))
        } else {
          pending.resolve(undefined)
        }
        return
      }

      // Unexpected response format
      pending.reject(new Error('[tRPC] Unexpected response format'))
    })

    // Cleanup on window unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', unsubscribe)
    }

    return ({ op }) => {
      return observable((observer) => {
        const id = generateId()

        // Serialize the input
        const serializedInput = op.input !== undefined ? serialize(op.input) : undefined

        // Create the operation payload
        const operation = {
          id,
          type: op.type,
          path: op.path,
          input: serializedInput,
          context: op.context,
        }

        // Register the pending request
        pendingRequests.set(id, {
          resolve: (value) => {
            observer.next({
              result: {
                type: 'data',
                data: value,
              },
            })
            observer.complete()
          },
          reject: (error) => {
            observer.error(error)
          },
        })

        // Send the request
        try {
          electronTRPC.sendMessage({
            method: 'request',
            operation,
          })
        } catch (err) {
          pendingRequests.delete(id)
          observer.error(
            new TRPCClientError(err instanceof Error ? err.message : 'Failed to send IPC message')
          )
        }

        // Return cleanup function
        return () => {
          pendingRequests.delete(id)
        }
      })
    }
  }
}

export default ipcLink
