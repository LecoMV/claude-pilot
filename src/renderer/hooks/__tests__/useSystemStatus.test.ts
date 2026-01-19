/**
 * Tests for useSystemStatus hook
 *
 * Tests useSystemStatus hook that provides system status information
 * with integration to the system store.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSystemStatus } from '../useSystemStatus'
import { useSystemStore } from '@/stores/system'

// Mock tRPC hooks
const mockStatusUseQuery = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    system: {
      status: {
        useQuery: (...args: unknown[]) => mockStatusUseQuery(...args),
      },
    },
  },
}))

// Reset store between tests
const resetStore = () => {
  useSystemStore.setState({
    status: null,
    loading: true,
    error: null,
    pollInterval: 30000,
    lastUpdate: 0,
  })
}

describe('useSystemStatus hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  afterEach(() => {
    resetStore()
  })

  const mockSystemStatus = {
    cpu: 45.5,
    memory: {
      total: 16000000000,
      used: 8000000000,
      free: 8000000000,
    },
    uptime: 3600,
    platform: 'linux',
    nodeVersion: 'v22.0.0',
    electronVersion: '34.0.0',
    claudeCodeVersion: '1.0.0',
  }

  it('should return loading state initially', () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.loading).toBe(true)
    expect(result.current.status).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should return status when data is loaded', () => {
    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.loading).toBe(false)
    expect(result.current.status).toEqual(mockSystemStatus)
    expect(result.current.error).toBeNull()
  })

  it('should return error when query fails', () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: { message: 'Failed to fetch system status' },
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.loading).toBe(false)
    expect(result.current.status).toBeNull()
    expect(result.current.error).toBe('Failed to fetch system status')
  })

  it('should use poll interval from store', () => {
    useSystemStore.setState({ pollInterval: 15000 })

    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    expect(mockStatusUseQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        refetchInterval: 15000,
      })
    )
  })

  it('should call useQuery with correct options', () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    expect(mockStatusUseQuery).toHaveBeenCalledWith(undefined, {
      refetchInterval: 30000, // Default from store
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      staleTime: 5000,
      retry: 1,
    })
  })

  it('should provide refresh function', async () => {
    const mockRefetch = vi.fn().mockResolvedValue({ data: mockSystemStatus })
    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetch,
    })

    const { result } = renderHook(() => useSystemStatus())

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockRefetch).toHaveBeenCalled()
  })

  it('should track refetching state', () => {
    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: true,
      isFetching: true,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.isRefetching).toBe(true)
    expect(result.current.isFetching).toBe(true)
  })

  it('should track lastUpdate timestamp', () => {
    const timestamp = Date.now()
    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: timestamp,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.lastUpdate).toBe(timestamp)
  })

  it('should sync status to store when data changes', async () => {
    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    await waitFor(() => {
      expect(useSystemStore.getState().status).toEqual(mockSystemStatus)
    })
  })

  it('should sync loading state to store', async () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    await waitFor(() => {
      expect(useSystemStore.getState().loading).toBe(true)
    })
  })

  it('should sync error to store when query fails', async () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: { message: 'Connection failed' },
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    await waitFor(() => {
      expect(useSystemStore.getState().error).toBe('Connection failed')
    })
  })

  it('should clear error in store when query succeeds', async () => {
    // First, set an error
    useSystemStore.getState().setError('Previous error')

    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    await waitFor(() => {
      expect(useSystemStore.getState().error).toBeNull()
    })
  })

  it('should handle null data gracefully', () => {
    mockStatusUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.status).toBeNull()
  })

  it('should respond to poll interval changes', () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    const { rerender } = renderHook(() => useSystemStatus())

    // Change poll interval
    act(() => {
      useSystemStore.getState().setPollInterval(5000)
    })

    rerender()

    // The last call should have the new interval
    const calls = mockStatusUseQuery.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1].refetchInterval).toBe(5000)
  })

  it('should not refetch in background when tab is hidden', () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: null,
      refetch: vi.fn(),
    })

    renderHook(() => useSystemStatus())

    expect(mockStatusUseQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        refetchIntervalInBackground: false,
      })
    )
  })

  it('should handle rapid state changes', async () => {
    const mockRefetch = vi.fn()

    mockStatusUseQuery.mockReturnValue({
      data: mockSystemStatus,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      error: null,
      refetch: mockRefetch,
    })

    const { result } = renderHook(() => useSystemStatus())

    // Rapid refresh calls
    await act(async () => {
      result.current.refresh()
      result.current.refresh()
      result.current.refresh()
    })

    expect(mockRefetch).toHaveBeenCalledTimes(3)
  })

  it('should handle error with null message', () => {
    mockStatusUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      isFetching: false,
      dataUpdatedAt: 0,
      error: { message: null },
      refetch: vi.fn(),
    })

    const { result } = renderHook(() => useSystemStatus())

    expect(result.current.error).toBeNull()
  })
})
