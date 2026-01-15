import { useCallback, useEffect, useRef } from 'react'
import { useSystemStore } from '@/stores/system'

export function useSystemStatus() {
  const { status, loading, error, pollInterval, lastUpdate, setStatus, setLoading, setError } =
    useSystemStore()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electron.invoke('system:status')
      setStatus(result)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system status')
      setLoading(false)
    }
  }, [setStatus, setLoading, setError])

  const startPolling = useCallback(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Initial fetch
    fetchStatus()

    // Start polling
    intervalRef.current = setInterval(fetchStatus, pollInterval)
  }, [fetchStatus, pollInterval])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Auto-start polling on mount
  useEffect(() => {
    startPolling()
    return () => stopPolling()
  }, [startPolling, stopPolling])

  // Restart polling when interval changes
  useEffect(() => {
    if (intervalRef.current) {
      startPolling()
    }
  }, [pollInterval, startPolling])

  // Handle visibility change - pause when hidden, resume when visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [startPolling, stopPolling])

  return {
    status,
    loading,
    error,
    lastUpdate,
    refresh: fetchStatus,
  }
}
