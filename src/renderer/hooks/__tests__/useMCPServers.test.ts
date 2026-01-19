/**
 * Tests for useMCPServers hooks
 *
 * Tests useMCPServers, useMCPConnect, and useMCPDisconnect hooks
 * that provide MCP server management functionality.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMCPServers, useMCPConnect, useMCPDisconnect } from '../useMCPServers'

// Mock tRPC hooks
const mockListUseQuery = vi.fn()
const mockConnectUseMutation = vi.fn()
const mockDisconnectUseMutation = vi.fn()
const mockUseUtils = vi.fn()
const mockInvalidate = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    mcp: {
      list: {
        useQuery: (...args: unknown[]) => mockListUseQuery(...args),
      },
      connect: {
        useMutation: (...args: unknown[]) => mockConnectUseMutation(...args),
      },
      disconnect: {
        useMutation: (...args: unknown[]) => mockDisconnectUseMutation(...args),
      },
    },
    useUtils: () => mockUseUtils(),
  },
}))

describe('useMCPServers hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUtils.mockReturnValue({
      mcp: {
        list: {
          invalidate: mockInvalidate,
        },
      },
    })
  })

  describe('useMCPServers', () => {
    it('should return loading state initially', () => {
      mockListUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isRefetching: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useMCPServers())

      expect(result.current.loading).toBe(true)
      expect(result.current.servers).toEqual([])
      expect(result.current.error).toBeNull()
      expect(result.current.isRefetching).toBe(false)
    })

    it('should return servers when data is loaded', () => {
      const mockServers = [
        { name: 'server-1', status: 'connected', url: 'http://localhost:3001' },
        { name: 'server-2', status: 'disconnected', url: 'http://localhost:3002' },
      ]

      mockListUseQuery.mockReturnValue({
        data: mockServers,
        isLoading: false,
        isRefetching: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useMCPServers())

      expect(result.current.loading).toBe(false)
      expect(result.current.servers).toEqual(mockServers)
      expect(result.current.error).toBeNull()
    })

    it('should return error when query fails', () => {
      mockListUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isRefetching: false,
        error: { message: 'Failed to fetch MCP servers' },
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useMCPServers())

      expect(result.current.loading).toBe(false)
      expect(result.current.servers).toEqual([])
      expect(result.current.error).toBe('Failed to fetch MCP servers')
    })

    it('should call useQuery with correct options', () => {
      mockListUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isRefetching: false,
        error: null,
        refetch: vi.fn(),
      })

      renderHook(() => useMCPServers())

      expect(mockListUseQuery).toHaveBeenCalledWith(undefined, {
        staleTime: 10000,
        refetchOnWindowFocus: true,
        retry: 1,
      })
    })

    it('should provide refresh function', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({ data: [] })
      mockListUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isRefetching: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useMCPServers())

      await act(async () => {
        await result.current.refresh()
      })

      expect(mockRefetch).toHaveBeenCalled()
    })

    it('should track refetching state', () => {
      mockListUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isRefetching: true,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useMCPServers())

      expect(result.current.isRefetching).toBe(true)
    })

    it('should handle empty servers array', () => {
      mockListUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isRefetching: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useMCPServers())

      expect(result.current.servers).toEqual([])
    })

    it('should handle null data gracefully', () => {
      mockListUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isRefetching: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useMCPServers())

      expect(result.current.servers).toEqual([])
    })
  })

  describe('useMCPConnect', () => {
    it('should return connect function and initial states', () => {
      const mockMutate = vi.fn()
      const mockMutateAsync = vi.fn()

      mockConnectUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useMCPConnect())

      expect(result.current.connect).toBe(mockMutate)
      expect(result.current.connectAsync).toBe(mockMutateAsync)
      expect(result.current.isConnecting).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should track connecting state', () => {
      mockConnectUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: true,
        error: null,
      })

      const { result } = renderHook(() => useMCPConnect())

      expect(result.current.isConnecting).toBe(true)
    })

    it('should return error message when mutation fails', () => {
      mockConnectUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
        error: { message: 'Connection failed' },
      })

      const { result } = renderHook(() => useMCPConnect())

      expect(result.current.error).toBe('Connection failed')
    })

    it('should invalidate list on successful connect', () => {
      let onSuccessCallback: (() => void) | undefined

      mockConnectUseMutation.mockImplementation((options: { onSuccess?: () => void }) => {
        onSuccessCallback = options?.onSuccess
        return {
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
          isPending: false,
          error: null,
        }
      })

      renderHook(() => useMCPConnect())

      // Simulate success callback
      if (onSuccessCallback) {
        onSuccessCallback()
      }

      expect(mockInvalidate).toHaveBeenCalled()
    })

    it('should call connect with server name', () => {
      const mockMutate = vi.fn()

      mockConnectUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useMCPConnect())

      act(() => {
        result.current.connect({ name: 'test-server' })
      })

      expect(mockMutate).toHaveBeenCalledWith({ name: 'test-server' })
    })

    it('should handle null error gracefully', () => {
      mockConnectUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useMCPConnect())

      expect(result.current.error).toBeNull()
    })
  })

  describe('useMCPDisconnect', () => {
    it('should return disconnect function and initial states', () => {
      const mockMutate = vi.fn()
      const mockMutateAsync = vi.fn()

      mockDisconnectUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useMCPDisconnect())

      expect(result.current.disconnect).toBe(mockMutate)
      expect(result.current.disconnectAsync).toBe(mockMutateAsync)
      expect(result.current.isDisconnecting).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should track disconnecting state', () => {
      mockDisconnectUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: true,
        error: null,
      })

      const { result } = renderHook(() => useMCPDisconnect())

      expect(result.current.isDisconnecting).toBe(true)
    })

    it('should return error message when mutation fails', () => {
      mockDisconnectUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
        error: { message: 'Disconnection failed' },
      })

      const { result } = renderHook(() => useMCPDisconnect())

      expect(result.current.error).toBe('Disconnection failed')
    })

    it('should invalidate list on successful disconnect', () => {
      let onSuccessCallback: (() => void) | undefined

      mockDisconnectUseMutation.mockImplementation((options: { onSuccess?: () => void }) => {
        onSuccessCallback = options?.onSuccess
        return {
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
          isPending: false,
          error: null,
        }
      })

      renderHook(() => useMCPDisconnect())

      // Simulate success callback
      if (onSuccessCallback) {
        onSuccessCallback()
      }

      expect(mockInvalidate).toHaveBeenCalled()
    })

    it('should call disconnect with server name', () => {
      const mockMutate = vi.fn()

      mockDisconnectUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useMCPDisconnect())

      act(() => {
        result.current.disconnect({ name: 'test-server' })
      })

      expect(mockMutate).toHaveBeenCalledWith({ name: 'test-server' })
    })

    it('should handle async disconnect', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ success: true })

      mockDisconnectUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useMCPDisconnect())

      await act(async () => {
        const response = await result.current.disconnectAsync({ name: 'test-server' })
        expect(response).toEqual({ success: true })
      })

      expect(mockMutateAsync).toHaveBeenCalledWith({ name: 'test-server' })
    })
  })
})
