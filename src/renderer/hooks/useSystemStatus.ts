/**
 * System Status Hook - tRPC React Query Integration
 *
 * Provides type-safe system status queries with automatic:
 * - Caching and deduplication
 * - Background refetching
 * - Visibility-based polling (pause when tab hidden)
 * - Loading/error states
 *
 * @example
 * const { data: status, isLoading, error, refetch } = useSystemStatus()
 */

import { useEffect } from 'react'
import { trpc } from '@/lib/trpc/react'
import { useSystemStore } from '@/stores/system'

export function useSystemStatus() {
  const { pollInterval } = useSystemStore()

  // tRPC query with React Query's built-in features
  const query = trpc.system.status.useQuery(undefined, {
    // Poll at configured interval (defaults to 10s)
    refetchInterval: pollInterval,
    // Pause polling when tab is hidden
    refetchIntervalInBackground: false,
    // Refetch when window regains focus
    refetchOnWindowFocus: true,
    // Data stays fresh for 5 seconds
    staleTime: 5000,
    // Retry once on failure
    retry: 1,
  })

  // Sync with store for components that still use it
  const { setStatus, setLoading, setError } = useSystemStore()

  useEffect(() => {
    if (query.data) {
      setStatus(query.data)
    }
  }, [query.data, setStatus])

  useEffect(() => {
    setLoading(query.isLoading)
  }, [query.isLoading, setLoading])

  useEffect(() => {
    if (query.error) {
      setError(query.error.message)
    } else {
      setError(null)
    }
  }, [query.error, setError])

  return {
    status: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    lastUpdate: query.dataUpdatedAt,
    refresh: query.refetch,
    // Additional React Query helpers
    isRefetching: query.isRefetching,
    isFetching: query.isFetching,
  }
}
