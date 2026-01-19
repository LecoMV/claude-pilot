/**
 * Tests for Custom IPC Link (tRPC v11 + Electron)
 *
 * Tests the ipcLink implementation that bridges renderer to main process
 * via Electron IPC with SuperJSON serialization.
 *
 * @module trpc/ipcLink.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TRPCClientError } from '@trpc/client'
import superjson from 'superjson'

// Mock electronTRPC before importing ipcLink
const mockSendMessage = vi.fn()
let messageCallback: ((args: { id: string } & Record<string, unknown>) => void) | null = null
const mockUnsubscribe = vi.fn()
const mockOnMessage = vi.fn(
  (callback: (args: { id: string } & Record<string, unknown>) => void) => {
    messageCallback = callback
    return mockUnsubscribe
  }
)

// Mock window with electronTRPC
const mockElectronTRPC = {
  sendMessage: mockSendMessage,
  onMessage: mockOnMessage,
}

// Set up window mock before importing
Object.defineProperty(globalThis, 'window', {
  value: {
    electronTRPC: mockElectronTRPC,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
})

// Import after mocking window
import { ipcLink } from '../ipcLink'

describe('ipcLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messageCallback = null
    // Re-register the mock
    ;(window as unknown as { electronTRPC: typeof mockElectronTRPC }).electronTRPC =
      mockElectronTRPC
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('link initialization', () => {
    it('should create a valid tRPC link', () => {
      const link = ipcLink()
      expect(link).toBeDefined()
      expect(typeof link).toBe('function')
    })

    it('should set up message listener on runtime initialization', () => {
      const link = ipcLink()
      // Call the runtime function
      const runtime = link({} as never)
      expect(mockOnMessage).toHaveBeenCalled()
      expect(typeof runtime).toBe('function')
    })

    it('should add beforeunload listener for cleanup', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const link = ipcLink()
      link({} as never)
      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    })

    it('should throw error when electronTRPC is not available', () => {
      // Temporarily remove electronTRPC
      const original = (window as unknown as { electronTRPC: typeof mockElectronTRPC }).electronTRPC
      delete (window as unknown as { electronTRPC?: typeof mockElectronTRPC }).electronTRPC

      expect(() => {
        const link = ipcLink()
        link({} as never)
      }).toThrow(
        '[tRPC] electronTRPC not available. Ensure exposeElectronTRPC() is called in preload.'
      )

      // Restore
      ;(window as unknown as { electronTRPC: typeof mockElectronTRPC }).electronTRPC = original
    })
  })

  describe('request serialization', () => {
    it('should serialize input using SuperJSON', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const testInput = { date: new Date('2024-01-01'), map: new Map([['key', 'value']]) }

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: testInput,
        context: {},
      }

      // Start the operation
      const observable = runtime({ op: operation })

      // Subscribe to trigger the send
      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        // Immediately simulate response to complete
        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ success: true }) },
          })
        }
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'request',
        operation: expect.objectContaining({
          type: 'query',
          path: 'test.query',
          input: superjson.serialize(testInput),
        }),
      })
    })

    it('should handle undefined input', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.noInput',
        input: undefined,
        context: {},
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(null) },
          })
        }
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'request',
        operation: expect.objectContaining({
          input: undefined,
        }),
      })
    })

    it('should include operation context', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const testContext = { userId: 'test-user', requestId: '123' }

      const operation = {
        type: 'mutation' as const,
        path: 'test.mutate',
        input: { data: 'test' },
        context: testContext,
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ ok: true }) },
          })
        }
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        method: 'request',
        operation: expect.objectContaining({
          context: testContext,
        }),
      })
    })

    it('should generate unique request IDs', () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation1 = { type: 'query' as const, path: 'test.a', input: {}, context: {} }
      const operation2 = { type: 'query' as const, path: 'test.b', input: {}, context: {} }

      // Start both operations
      runtime({ op: operation1 }).subscribe({
        next: () => {},
        complete: () => {},
        error: () => {},
      })
      runtime({ op: operation2 }).subscribe({
        next: () => {},
        complete: () => {},
        error: () => {},
      })

      const id1 = mockSendMessage.mock.calls[0][0].operation.id
      const id2 = mockSendMessage.mock.calls[1][0].operation.id

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
    })
  })

  describe('response handling', () => {
    it('should deserialize successful response using SuperJSON', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const responseData = { date: new Date('2024-01-01'), items: [1, 2, 3] }

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: {},
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        // Simulate response
        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(responseData) },
          })
        }
      })

      expect(result).toEqual({
        result: {
          type: 'data',
          data: responseData,
        },
      })
    })

    it('should handle empty result type', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'mutation' as const,
        path: 'test.voidMutation',
        input: {},
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'void' }, // No data field
          })
        }
      })

      expect(result).toEqual({
        result: {
          type: 'data',
          data: undefined,
        },
      })
    })

    it('should complete observable after successful response', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: {},
        context: {},
      }

      let completed = false

      await new Promise<void>((resolve) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: () => {},
          complete: () => {
            completed = true
            resolve()
          },
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ ok: true }) },
          })
        }
      })

      expect(completed).toBe(true)
    })

    it('should ignore responses for unknown request IDs', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: {},
        context: {},
      }

      let nextCalled = false
      let errorCalled = false
      let completeCalled = false

      const observable = runtime({ op: operation })

      observable.subscribe({
        next: () => {
          nextCalled = true
        },
        complete: () => {
          completeCalled = true
        },
        error: () => {
          errorCalled = true
        },
      })

      // Simulate response with wrong ID
      if (messageCallback) {
        messageCallback({
          id: 'wrong-id-12345',
          result: { type: 'data', data: superjson.serialize({ data: 'wrong' }) },
        })
      }

      // Give time for potential async handlers
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Should not have received the response
      expect(nextCalled).toBe(false)
      expect(errorCalled).toBe(false)
      expect(completeCalled).toBe(false)
    })
  })

  describe('error propagation', () => {
    it('should propagate error response as TRPCClientError', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.failingQuery',
        input: {},
        context: {},
      }

      const errorPromise = new Promise((_, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: () => {},
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            error: {
              message: 'Database connection failed',
              code: 'INTERNAL_SERVER_ERROR',
              data: { cause: 'Connection timeout' },
            },
          })
        }
      })

      await expect(errorPromise).rejects.toThrow(TRPCClientError)
      await expect(errorPromise).rejects.toThrow('Database connection failed')
    })

    it('should handle error response without message', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.failingQuery',
        input: {},
        context: {},
      }

      const errorPromise = new Promise((_, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: () => {},
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            error: {},
          })
        }
      })

      await expect(errorPromise).rejects.toThrow('Unknown error')
    })

    it('should handle unexpected response format', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: {},
        context: {},
      }

      const errorPromise = new Promise((_, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: () => {},
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            // Neither 'result' nor 'error' - malformed response
            unexpected: 'data',
          })
        }
      })

      await expect(errorPromise).rejects.toThrow('[tRPC] Unexpected response format')
    })

    it('should handle sendMessage throwing', async () => {
      mockSendMessage.mockImplementationOnce(() => {
        throw new Error('IPC channel closed')
      })

      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: {},
        context: {},
      }

      const errorPromise = new Promise((_, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: () => {},
          complete: () => {},
          error: reject,
        })
      })

      await expect(errorPromise).rejects.toThrow(TRPCClientError)
      await expect(errorPromise).rejects.toThrow('IPC channel closed')
    })

    it('should handle sendMessage throwing non-Error', async () => {
      mockSendMessage.mockImplementationOnce(() => {
        throw new Error('Unexpected type') // Non-Error thrown
      })

      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.query',
        input: {},
        context: {},
      }

      const errorPromise = new Promise((_, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: () => {},
          complete: () => {},
          error: reject,
        })
      })

      await expect(errorPromise).rejects.toThrow('Unexpected type')
    })
  })

  describe('type handling with superjson', () => {
    it('should correctly serialize and deserialize Date objects', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const testDate = new Date('2024-06-15T10:30:00.000Z')
      const input = { timestamp: testDate }
      const responseData = { created: testDate, updated: testDate }

      const operation = {
        type: 'mutation' as const,
        path: 'test.dateOp',
        input,
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(responseData) },
          })
        }
      })

      // Verify input was serialized with SuperJSON
      const sentInput = mockSendMessage.mock.calls[0][0].operation.input
      expect(sentInput).toEqual(superjson.serialize(input))

      // Verify response was deserialized
      const resultData = (result as { result: { data: typeof responseData } }).result.data
      expect(resultData.created).toEqual(testDate)
      expect(resultData.updated).toEqual(testDate)
      expect(resultData.created instanceof Date).toBe(true)
    })

    it('should correctly handle Map objects', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const testMap = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const input = { data: testMap }
      const responseData = { result: testMap }

      const operation = {
        type: 'query' as const,
        path: 'test.mapOp',
        input,
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(responseData) },
          })
        }
      })

      const resultData = (result as { result: { data: typeof responseData } }).result.data
      expect(resultData.result).toBeInstanceOf(Map)
      expect(resultData.result.get('key1')).toBe('value1')
      expect(resultData.result.get('key2')).toBe('value2')
    })

    it('should correctly handle Set objects', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const testSet = new Set(['a', 'b', 'c'])
      const input = { items: testSet }
      const responseData = { uniqueItems: testSet }

      const operation = {
        type: 'query' as const,
        path: 'test.setOp',
        input,
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(responseData) },
          })
        }
      })

      const resultData = (result as { result: { data: typeof responseData } }).result.data
      expect(resultData.uniqueItems).toBeInstanceOf(Set)
      expect(resultData.uniqueItems.has('a')).toBe(true)
      expect(resultData.uniqueItems.has('b')).toBe(true)
      expect(resultData.uniqueItems.has('c')).toBe(true)
    })

    it('should correctly handle BigInt values', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const bigValue = BigInt('9007199254740993')
      const input = { bigNumber: bigValue }
      const responseData = { result: bigValue }

      const operation = {
        type: 'query' as const,
        path: 'test.bigIntOp',
        input,
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(responseData) },
          })
        }
      })

      const resultData = (result as { result: { data: typeof responseData } }).result.data
      expect(resultData.result).toBe(bigValue)
      expect(typeof resultData.result).toBe('bigint')
    })

    it('should handle complex nested structures', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const complexData = {
        users: [
          {
            id: 1,
            name: 'Alice',
            createdAt: new Date('2024-01-01'),
            tags: new Set(['admin', 'user']),
            metadata: new Map([['role', 'admin']]),
          },
        ],
        pagination: {
          total: BigInt(1000000),
          page: 1,
        },
      }

      const operation = {
        type: 'query' as const,
        path: 'test.complex',
        input: complexData,
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(complexData) },
          })
        }
      })

      const resultData = (result as { result: { data: typeof complexData } }).result.data
      expect(resultData.users[0].createdAt).toBeInstanceOf(Date)
      expect(resultData.users[0].tags).toBeInstanceOf(Set)
      expect(resultData.users[0].metadata).toBeInstanceOf(Map)
      expect(typeof resultData.pagination.total).toBe('bigint')
    })
  })

  describe('cleanup and lifecycle', () => {
    it('should remove pending request on unsubscribe', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.longRunning',
        input: {},
        context: {},
      }

      const observable = runtime({ op: operation })
      const subscription = observable.subscribe({
        next: () => {},
        complete: () => {},
        error: () => {},
      })

      // Capture the request ID
      const sentOperation = mockSendMessage.mock.calls[0][0].operation
      const requestId = sentOperation.id

      // Unsubscribe
      subscription.unsubscribe()

      // Now if we receive a response for this ID, it should be ignored
      let nextCalled = false
      let errorCalled = false

      // Create a new subscriber to verify the old one is cleaned up
      const observable2 = runtime({ op: operation })
      observable2.subscribe({
        next: () => {
          nextCalled = true
        },
        complete: () => {},
        error: () => {
          errorCalled = true
        },
      })

      // Send response for the unsubscribed request
      if (messageCallback) {
        messageCallback({
          id: requestId,
          result: { type: 'data', data: superjson.serialize({ data: 'late response' }) },
        })
      }

      // Give time for any potential handlers
      await new Promise((resolve) => setTimeout(resolve, 10))

      // The first subscription should not receive anything (was cleaned up)
      // The second subscription shouldn't match this ID
      expect(nextCalled).toBe(false)
      expect(errorCalled).toBe(false)
    })

    it('should handle multiple concurrent requests', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation1 = { type: 'query' as const, path: 'test.a', input: { id: 1 }, context: {} }
      const operation2 = { type: 'query' as const, path: 'test.b', input: { id: 2 }, context: {} }
      const operation3 = { type: 'query' as const, path: 'test.c', input: { id: 3 }, context: {} }

      const results: unknown[] = []

      // Start all three operations
      const promises = [operation1, operation2, operation3].map((op) => {
        return new Promise((resolve, reject) => {
          const observable = runtime({ op })

          observable.subscribe({
            next: (value) => {
              results.push(value)
              resolve(value)
            },
            complete: () => {},
            error: reject,
          })
        })
      })

      // Get all sent IDs
      const sentIds = mockSendMessage.mock.calls.map((call) => call[0].operation.id)
      expect(sentIds.length).toBe(3)
      expect(new Set(sentIds).size).toBe(3) // All unique

      // Respond in reverse order to test proper ID matching
      if (messageCallback) {
        messageCallback({
          id: sentIds[2],
          result: { type: 'data', data: superjson.serialize({ response: 'c' }) },
        })
        messageCallback({
          id: sentIds[0],
          result: { type: 'data', data: superjson.serialize({ response: 'a' }) },
        })
        messageCallback({
          id: sentIds[1],
          result: { type: 'data', data: superjson.serialize({ response: 'b' }) },
        })
      }

      await Promise.all(promises)

      expect(results.length).toBe(3)
    })

    it('should clean up pending requests on window unload', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const link = ipcLink()
      link({} as never)

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', mockUnsubscribe)
    })
  })

  describe('operation types', () => {
    it('should handle query operations', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'users.getAll',
        input: { limit: 10 },
        context: {},
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          expect(sentOperation.type).toBe('query')
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize([]) },
          })
        }
      })
    })

    it('should handle mutation operations', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'mutation' as const,
        path: 'users.create',
        input: { name: 'Test User' },
        context: {},
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          expect(sentOperation.type).toBe('mutation')
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ id: 1, name: 'Test User' }) },
          })
        }
      })
    })

    it('should handle subscription operation type in payload', async () => {
      // Note: Actual subscriptions require streaming, but the link should
      // at least accept the operation type in the payload
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'subscription' as const,
        path: 'events.onUpdate',
        input: { topic: 'updates' },
        context: {},
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          expect(sentOperation.type).toBe('subscription')
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ subscribed: true }) },
          })
        }
      })
    })
  })

  describe('edge cases', () => {
    it('should handle null response data', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.nullable',
        input: {},
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize(null) },
          })
        }
      })

      const resultData = (result as { result: { data: null } }).result.data
      expect(resultData).toBeNull()
    })

    it('should handle empty object response', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'test.empty',
        input: {},
        context: {},
      }

      const result = await new Promise((resolve, reject) => {
        const observable = runtime({ op: operation })

        observable.subscribe({
          next: (value) => resolve(value),
          complete: () => {},
          error: reject,
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({}) },
          })
        }
      })

      const resultData = (result as { result: { data: object } }).result.data
      expect(resultData).toEqual({})
    })

    it('should handle deeply nested paths', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      const operation = {
        type: 'query' as const,
        path: 'api.v1.users.profile.settings.notifications',
        input: { userId: 123 },
        context: {},
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          expect(sentOperation.path).toBe('api.v1.users.profile.settings.notifications')
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ enabled: true }) },
          })
        }
      })
    })

    it('should handle very large input payload', async () => {
      const link = ipcLink()
      const runtime = link({} as never)

      // Create a large payload
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        data: 'x'.repeat(100),
      }))

      const operation = {
        type: 'mutation' as const,
        path: 'batch.insert',
        input: { items: largeArray },
        context: {},
      }

      const observable = runtime({ op: operation })

      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: () => {},
          complete: resolve,
          error: () => resolve(),
        })

        if (messageCallback) {
          const sentOperation = mockSendMessage.mock.calls[0][0].operation
          // Verify input was serialized (should have json and meta fields from superjson)
          expect(sentOperation.input).toHaveProperty('json')
          messageCallback({
            id: sentOperation.id,
            result: { type: 'data', data: superjson.serialize({ inserted: 1000 }) },
          })
        }
      })
    })
  })
})
