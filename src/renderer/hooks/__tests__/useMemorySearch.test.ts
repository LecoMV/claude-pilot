/**
 * Tests for useMemorySearch hooks
 *
 * Tests useMemorySearch, useEmbeddingStatus, and useStoreEmbedding hooks
 * that provide memory search and embedding functionality.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMemorySearch, useEmbeddingStatus, useStoreEmbedding } from '../useMemorySearch'

// Mock tRPC hooks
const mockSearchUseQuery = vi.fn()
const mockStatusUseQuery = vi.fn()
const mockEmbedAndStoreUseMutation = vi.fn()
const mockUseUtils = vi.fn()
const mockInvalidate = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    embedding: {
      search: {
        useQuery: (...args: unknown[]) => mockSearchUseQuery(...args),
      },
      status: {
        useQuery: (...args: unknown[]) => mockStatusUseQuery(...args),
      },
      embedAndStore: {
        useMutation: (...args: unknown[]) => mockEmbedAndStoreUseMutation(...args),
      },
    },
    useUtils: () => mockUseUtils(),
  },
}))

describe('useMemorySearch hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUtils.mockReturnValue({
      embedding: {
        status: {
          invalidate: mockInvalidate,
        },
      },
    })
  })

  describe('useMemorySearch', () => {
    it('should return initial state with empty query', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.query).toBe('')
      expect(result.current.results).toEqual([])
      expect(result.current.isSearching).toBe(false)
      expect(result.current.isFetching).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should update query when search is called', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      act(() => {
        result.current.search('test query')
      })

      expect(result.current.query).toBe('test query')
    })

    it('should clear query when clear is called', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      act(() => {
        result.current.search('test query')
      })

      act(() => {
        result.current.clear()
      })

      expect(result.current.query).toBe('')
    })

    it('should return search results', () => {
      const mockResults = [
        { id: '1', content: 'Result 1', score: 0.9 },
        { id: '2', content: 'Result 2', score: 0.8 },
      ]

      mockSearchUseQuery.mockReturnValue({
        data: mockResults,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.results).toEqual(mockResults)
    })

    it('should track loading state', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.isSearching).toBe(true)
    })

    it('should track fetching state', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: true,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.isFetching).toBe(true)
    })

    it('should return error when query fails', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: { message: 'Search failed' },
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.error).toBe('Search failed')
    })

    it('should pass default options to query', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      renderHook(() => useMemorySearch())

      expect(mockSearchUseQuery).toHaveBeenCalledWith(
        { query: '', limit: 10, threshold: 0.7 },
        expect.objectContaining({
          enabled: false, // Empty query should be disabled
          staleTime: 30000,
          retry: 1,
        })
      )
    })

    it('should pass custom options to query', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      renderHook(() => useMemorySearch({ limit: 20, threshold: 0.5 }))

      expect(mockSearchUseQuery).toHaveBeenCalledWith(
        { query: '', limit: 20, threshold: 0.5 },
        expect.objectContaining({
          enabled: false,
        })
      )
    })

    it('should enable query when query string is not empty', () => {
      mockSearchUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result, rerender } = renderHook(() => useMemorySearch())

      act(() => {
        result.current.search('search term')
      })

      rerender()

      // The query should now be called with enabled: true for non-empty query
      const lastCall = mockSearchUseQuery.mock.calls[mockSearchUseQuery.mock.calls.length - 1]
      expect(lastCall[0].query).toBe('search term')
      expect(lastCall[1].enabled).toBe(true)
    })

    it('should handle empty results array', () => {
      mockSearchUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.results).toEqual([])
    })

    it('should handle null data gracefully', () => {
      mockSearchUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isFetching: false,
        error: null,
      })

      const { result } = renderHook(() => useMemorySearch())

      expect(result.current.results).toEqual([])
    })
  })

  describe('useEmbeddingStatus', () => {
    it('should return loading state initially', () => {
      mockStatusUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useEmbeddingStatus())

      expect(result.current.loading).toBe(true)
      expect(result.current.status).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should return status when data is loaded', () => {
      const mockStatus = {
        modelLoaded: true,
        modelName: 'text-embedding-3-small',
        dimension: 1536,
        indexCount: 1000,
      }

      mockStatusUseQuery.mockReturnValue({
        data: mockStatus,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useEmbeddingStatus())

      expect(result.current.loading).toBe(false)
      expect(result.current.status).toEqual(mockStatus)
      expect(result.current.error).toBeNull()
    })

    it('should return error when query fails', () => {
      mockStatusUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to get embedding status' },
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useEmbeddingStatus())

      expect(result.current.loading).toBe(false)
      expect(result.current.status).toBeNull()
      expect(result.current.error).toBe('Failed to get embedding status')
    })

    it('should call useQuery with correct options', () => {
      mockStatusUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      renderHook(() => useEmbeddingStatus())

      expect(mockStatusUseQuery).toHaveBeenCalledWith(undefined, {
        staleTime: 5000,
        refetchOnWindowFocus: true,
        retry: 1,
      })
    })

    it('should provide refresh function', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({})
      mockStatusUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useEmbeddingStatus())

      await act(async () => {
        await result.current.refresh()
      })

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('useStoreEmbedding', () => {
    it('should return store function and initial states', () => {
      const mockMutate = vi.fn()
      const mockMutateAsync = vi.fn()

      mockEmbedAndStoreUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useStoreEmbedding())

      expect(result.current.store).toBe(mockMutate)
      expect(result.current.storeAsync).toBe(mockMutateAsync)
      expect(result.current.isStoring).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should track storing state', () => {
      mockEmbedAndStoreUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: true,
        error: null,
      })

      const { result } = renderHook(() => useStoreEmbedding())

      expect(result.current.isStoring).toBe(true)
    })

    it('should return error message when mutation fails', () => {
      mockEmbedAndStoreUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
        error: { message: 'Store failed' },
      })

      const { result } = renderHook(() => useStoreEmbedding())

      expect(result.current.error).toBe('Store failed')
    })

    it('should invalidate status on successful store', () => {
      let onSuccessCallback: (() => void) | undefined

      mockEmbedAndStoreUseMutation.mockImplementation((options: { onSuccess?: () => void }) => {
        onSuccessCallback = options?.onSuccess
        return {
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
          isPending: false,
          error: null,
        }
      })

      renderHook(() => useStoreEmbedding())

      // Simulate success callback
      if (onSuccessCallback) {
        onSuccessCallback()
      }

      expect(mockInvalidate).toHaveBeenCalled()
    })

    it('should call store with embedding data', () => {
      const mockMutate = vi.fn()

      mockEmbedAndStoreUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useStoreEmbedding())

      const embeddingData = {
        content: 'Test content',
        metadata: { source: 'test' },
      }

      act(() => {
        result.current.store(embeddingData)
      })

      expect(mockMutate).toHaveBeenCalledWith(embeddingData)
    })

    it('should handle async store', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'embedding-1' })

      mockEmbedAndStoreUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useStoreEmbedding())

      const embeddingData = {
        content: 'Test content',
        metadata: { source: 'test' },
      }

      await act(async () => {
        const response = await result.current.storeAsync(embeddingData)
        expect(response).toEqual({ id: 'embedding-1' })
      })

      expect(mockMutateAsync).toHaveBeenCalledWith(embeddingData)
    })

    it('should handle null error gracefully', () => {
      mockEmbedAndStoreUseMutation.mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      })

      const { result } = renderHook(() => useStoreEmbedding())

      expect(result.current.error).toBeNull()
    })
  })
})
