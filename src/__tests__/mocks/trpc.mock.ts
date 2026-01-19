/**
 * tRPC Mock Factory
 *
 * Provides mock factories for tRPC client and router testing.
 * Use these utilities for testing React components that use tRPC hooks
 * and for testing tRPC procedures directly.
 *
 * @module trpc.mock
 */

import { vi } from 'vitest'

// Mock factories for tRPC client testing

// ===========================================================================
// TRPC QUERY RESULT MOCK
// ===========================================================================

export interface MockQueryResult<TData> {
  data: TData | undefined
  error: Error | null
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  isFetching: boolean
  isStale: boolean
  refetch: ReturnType<typeof vi.fn>
  status: 'pending' | 'error' | 'success'
}

export interface MockMutationResult<TData, _TVariables = unknown> {
  data: TData | undefined
  error: Error | null
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  isIdle: boolean
  mutate: ReturnType<typeof vi.fn>
  mutateAsync: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  status: 'idle' | 'pending' | 'error' | 'success'
}

export const createMockQueryResult = <TData>(
  options: {
    data?: TData
    error?: Error | null
    isLoading?: boolean
    isFetching?: boolean
    isStale?: boolean
  } = {}
): MockQueryResult<TData> => {
  const {
    data = undefined,
    error = null,
    isLoading = false,
    isFetching = false,
    isStale = false,
  } = options

  const isError = error !== null
  const isSuccess = data !== undefined && !isError && !isLoading

  return {
    data,
    error,
    isLoading,
    isError,
    isSuccess,
    isFetching,
    isStale,
    refetch: vi.fn().mockResolvedValue({ data }),
    status: isLoading ? 'pending' : isError ? 'error' : 'success',
  }
}

export const createMockMutationResult = <TData, TVariables = unknown>(
  options: {
    data?: TData
    error?: Error | null
    isLoading?: boolean
    mutateResult?: TData
  } = {}
): MockMutationResult<TData, TVariables> => {
  const { data = undefined, error = null, isLoading = false, mutateResult = data } = options

  const isError = error !== null
  const isSuccess = data !== undefined && !isError && !isLoading
  const isIdle = !isLoading && !isError && data === undefined

  return {
    data,
    error,
    isLoading,
    isError,
    isSuccess,
    isIdle,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(mutateResult),
    reset: vi.fn(),
    status: isIdle ? 'idle' : isLoading ? 'pending' : isError ? 'error' : 'success',
  }
}

// ===========================================================================
// LOADING, ERROR, AND SUCCESS HELPERS
// ===========================================================================

export const createLoadingQueryResult = <TData>(): MockQueryResult<TData> =>
  createMockQueryResult<TData>({ isLoading: true })

export const createErrorQueryResult = <TData>(error: Error): MockQueryResult<TData> =>
  createMockQueryResult<TData>({ error })

export const createSuccessQueryResult = <TData>(data: TData): MockQueryResult<TData> =>
  createMockQueryResult<TData>({ data })

export const createLoadingMutationResult = <TData, TVariables = unknown>(): MockMutationResult<
  TData,
  TVariables
> => createMockMutationResult<TData, TVariables>({ isLoading: true })

export const createErrorMutationResult = <TData, TVariables = unknown>(
  error: Error
): MockMutationResult<TData, TVariables> =>
  createMockMutationResult<TData, TVariables>({ error })

export const createSuccessMutationResult = <TData, TVariables = unknown>(
  data: TData
): MockMutationResult<TData, TVariables> =>
  createMockMutationResult<TData, TVariables>({ data })

// ===========================================================================
// TRPC ERROR MOCK
// ===========================================================================

export type TRPCErrorCode =
  | 'PARSE_ERROR'
  | 'BAD_REQUEST'
  | 'INTERNAL_SERVER_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_SUPPORTED'
  | 'TIMEOUT'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNPROCESSABLE_CONTENT'
  | 'TOO_MANY_REQUESTS'
  | 'CLIENT_CLOSED_REQUEST'

export interface MockTRPCError {
  code: TRPCErrorCode
  message: string
  data?: {
    code: TRPCErrorCode
    httpStatus: number
    path?: string
    stack?: string
  }
}

export const createTRPCError = (
  code: TRPCErrorCode,
  message: string,
  path?: string
): MockTRPCError => {
  const httpStatusMap: Record<TRPCErrorCode, number> = {
    PARSE_ERROR: 400,
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_SUPPORTED: 405,
    TIMEOUT: 408,
    CONFLICT: 409,
    PRECONDITION_FAILED: 412,
    PAYLOAD_TOO_LARGE: 413,
    UNPROCESSABLE_CONTENT: 422,
    TOO_MANY_REQUESTS: 429,
    CLIENT_CLOSED_REQUEST: 499,
  }

  return {
    code,
    message,
    data: {
      code,
      httpStatus: httpStatusMap[code],
      path,
    },
  }
}

// ===========================================================================
// TRPC PROCEDURE MOCK
// ===========================================================================

export interface MockProcedure<_TInput = unknown, _TOutput = unknown> {
  query: ReturnType<typeof vi.fn>
  mutate: ReturnType<typeof vi.fn>
  useQuery: ReturnType<typeof vi.fn>
  useMutation: ReturnType<typeof vi.fn>
}

export const createMockProcedure = <TInput, TOutput>(
  defaultOutput?: TOutput
): MockProcedure<TInput, TOutput> => ({
  query: vi.fn().mockResolvedValue(defaultOutput),
  mutate: vi.fn().mockResolvedValue(defaultOutput),
  useQuery: vi.fn().mockReturnValue(createSuccessQueryResult(defaultOutput)),
  useMutation: vi.fn().mockReturnValue(createSuccessMutationResult(defaultOutput)),
})

// ===========================================================================
// TRPC CLIENT MOCK
// ===========================================================================

export interface MockTRPCClient {
  system: {
    status: MockProcedure<void, { cpu: number; memory: number; uptime: number }>
    health: MockProcedure<void, { healthy: boolean; services: string[] }>
  }
  credentials: {
    store: MockProcedure<{ key: string; value: string }, boolean>
    retrieve: MockProcedure<{ key: string }, string | null>
    delete: MockProcedure<{ key: string }, boolean>
    has: MockProcedure<{ key: string }, boolean>
    list: MockProcedure<void, string[]>
    isEncryptionAvailable: MockProcedure<void, boolean>
  }
  session: {
    discover: MockProcedure<void, unknown[]>
    get: MockProcedure<{ sessionId: string }, unknown | null>
    getMessages: MockProcedure<{ sessionId: string; limit?: number }, unknown[]>
    getActive: MockProcedure<void, unknown[]>
    watch: MockProcedure<{ enable: boolean }, boolean>
  }
  mcp: {
    list: MockProcedure<void, unknown[]>
    enable: MockProcedure<{ serverId: string }, boolean>
    disable: MockProcedure<{ serverId: string }, boolean>
    getStatus: MockProcedure<{ serverId: string }, unknown>
  }
  profiles: {
    list: MockProcedure<void, unknown[]>
    get: MockProcedure<{ name: string }, unknown | null>
    switch: MockProcedure<{ name: string }, boolean>
  }
}

export const createMockTRPCClient = (): MockTRPCClient => ({
  system: {
    status: createMockProcedure({ cpu: 25.5, memory: 45.2, uptime: 123456 }),
    health: createMockProcedure({ healthy: true, services: ['postgresql', 'memgraph', 'qdrant'] }),
  },
  credentials: {
    store: createMockProcedure(true),
    retrieve: createMockProcedure('mock-secret-value'),
    delete: createMockProcedure(true),
    has: createMockProcedure(true),
    list: createMockProcedure(['github.token', 'anthropic.apiKey']),
    isEncryptionAvailable: createMockProcedure(true),
  },
  session: {
    discover: createMockProcedure([]),
    get: createMockProcedure(null),
    getMessages: createMockProcedure([]),
    getActive: createMockProcedure([]),
    watch: createMockProcedure(true),
  },
  mcp: {
    list: createMockProcedure([]),
    enable: createMockProcedure(true),
    disable: createMockProcedure(true),
    getStatus: createMockProcedure({ enabled: true, status: 'running' }),
  },
  profiles: {
    list: createMockProcedure([]),
    get: createMockProcedure(null),
    switch: createMockProcedure(true),
  },
})

// ===========================================================================
// UTILS PROVIDER MOCK
// ===========================================================================

export interface MockTRPCUtils {
  invalidate: ReturnType<typeof vi.fn>
  prefetch: ReturnType<typeof vi.fn>
  ensureData: ReturnType<typeof vi.fn>
  getData: ReturnType<typeof vi.fn>
  setData: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
}

export const createMockTRPCUtils = (): MockTRPCUtils => ({
  invalidate: vi.fn().mockResolvedValue(undefined),
  prefetch: vi.fn().mockResolvedValue(undefined),
  ensureData: vi.fn().mockResolvedValue(undefined),
  getData: vi.fn().mockReturnValue(undefined),
  setData: vi.fn(),
  cancel: vi.fn().mockResolvedValue(undefined),
})

// ===========================================================================
// TEST SETUP HELPERS
// ===========================================================================

/**
 * Sets up a mock tRPC hook return value for testing.
 * Use this in beforeEach to configure how a tRPC hook should behave.
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   setupMockQuery(trpc.session.discover, [mockSession1, mockSession2])
 * })
 * ```
 */
export const setupMockQuery = <TData>(
  procedure: { useQuery: ReturnType<typeof vi.fn> },
  data: TData
): void => {
  procedure.useQuery.mockReturnValue(createSuccessQueryResult(data))
}

/**
 * Sets up a mock tRPC mutation for testing.
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   setupMockMutation(trpc.credentials.store, true)
 * })
 * ```
 */
export const setupMockMutation = <TData>(
  procedure: { useMutation: ReturnType<typeof vi.fn> },
  data: TData
): void => {
  procedure.useMutation.mockReturnValue(createSuccessMutationResult(data))
}

/**
 * Sets up a mock tRPC query to simulate a loading state.
 */
export const setupLoadingQuery = <TData>(procedure: {
  useQuery: ReturnType<typeof vi.fn>
}): void => {
  procedure.useQuery.mockReturnValue(createLoadingQueryResult<TData>())
}

/**
 * Sets up a mock tRPC query to simulate an error state.
 */
export const setupErrorQuery = <TData>(
  procedure: { useQuery: ReturnType<typeof vi.fn> },
  error: Error
): void => {
  procedure.useQuery.mockReturnValue(createErrorQueryResult<TData>(error))
}
