import { create } from 'zustand'
import type { MCPServer } from '@shared/types'

interface MCPState {
  servers: MCPServer[]
  selectedServer: MCPServer | null
  loading: boolean
  refreshing: boolean
  error: string | null
  showDetail: boolean
  setServers: (servers: MCPServer[]) => void
  setSelectedServer: (server: MCPServer | null) => void
  setLoading: (loading: boolean) => void
  setRefreshing: (refreshing: boolean) => void
  setError: (error: string | null) => void
  setShowDetail: (show: boolean) => void
  getActiveCount: () => number
  getDisabledCount: () => number
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [],
  selectedServer: null,
  loading: true,
  refreshing: false,
  error: null,
  showDetail: false,

  setServers: (servers) => set({ servers }),
  setSelectedServer: (server) => set({ selectedServer: server }),
  setLoading: (loading) => set({ loading }),
  setRefreshing: (refreshing) => set({ refreshing }),
  setError: (error) => set({ error }),
  setShowDetail: (show) => set({ showDetail: show }),

  getActiveCount: () => {
    return get().servers.filter((s) => s.status === 'online' && !s.config.disabled).length
  },

  getDisabledCount: () => {
    return get().servers.filter((s) => s.config.disabled).length
  },
}))
