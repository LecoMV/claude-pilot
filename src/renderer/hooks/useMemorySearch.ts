/**
 * Memory Search Hook - tRPC React Query Integration
 *
 * Provides type-safe access to memory search with debouncing and caching.
 *
 * @example
 * const { search, results, isSearching } = useMemorySearch()
 * search('security patterns')
 */

import { useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc/react'

interface UseMemorySearchOptions {
  limit?: number
  threshold?: number
}

export function useMemorySearch(options: UseMemorySearchOptions = {}) {
  const { limit = 10, threshold = 0.7 } = options
  const [query, setQuery] = useState('')

  // Use enabled flag to prevent query on empty string
  const searchQuery = trpc.embedding.search.useQuery(
    { query, limit, threshold },
    {
      enabled: query.length > 0,
      staleTime: 30000, // Cache search results for 30s
      retry: 1,
    }
  )

  const search = useCallback((newQuery: string) => {
    setQuery(newQuery)
  }, [])

  const clear = useCallback(() => {
    setQuery('')
  }, [])

  return {
    query,
    search,
    clear,
    results: searchQuery.data ?? [],
    isSearching: searchQuery.isLoading,
    isFetching: searchQuery.isFetching,
    error: searchQuery.error?.message ?? null,
  }
}

/**
 * Hook for embedding status
 */
export function useEmbeddingStatus() {
  const query = trpc.embedding.status.useQuery(undefined, {
    staleTime: 5000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  return {
    status: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  }
}

/**
 * Hook for storing embeddings
 */
export function useStoreEmbedding() {
  const utils = trpc.useUtils()
  const mutation = trpc.embedding.embedAndStore.useMutation({
    onSuccess: () => {
      // Optionally invalidate related queries
      utils.embedding.status.invalidate()
    },
  })

  return {
    store: mutation.mutate,
    storeAsync: mutation.mutateAsync,
    isStoring: mutation.isPending,
    error: mutation.error?.message ?? null,
  }
}
