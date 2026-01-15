import { create } from 'zustand'
import type { SystemStatus, ResourceUsage } from '@shared/types'

interface SystemState {
  status: SystemStatus | null
  loading: boolean
  error: string | null
  pollInterval: number
  lastUpdate: number
  setStatus: (status: SystemStatus) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setPollInterval: (interval: number) => void
}

export const useSystemStore = create<SystemState>((set) => ({
  status: null,
  loading: true,
  error: null,
  pollInterval: 5000, // 5 seconds default
  lastUpdate: 0,

  setStatus: (status) => set({ status, lastUpdate: Date.now(), error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setPollInterval: (pollInterval) => set({ pollInterval }),
}))
