import { create } from 'zustand'
import type { Learning } from '@shared/types'

export type MemorySource = 'postgresql' | 'memgraph' | 'qdrant'

export interface MemoryStats {
  postgresql: { count: number }
  memgraph: { nodes: number; edges: number }
  qdrant: { vectors: number }
}

interface MemoryState {
  activeSource: MemorySource
  searchQuery: string
  searching: boolean
  loading: boolean
  error: string | null

  // Results
  learnings: Learning[]
  graphNodes: unknown[]
  vectors: unknown[]

  // Stats
  stats: MemoryStats | null
  statsLoading: boolean

  // Actions
  setActiveSource: (source: MemorySource) => void
  setSearchQuery: (query: string) => void
  setSearching: (searching: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setLearnings: (learnings: Learning[]) => void
  setStats: (stats: MemoryStats) => void
  setStatsLoading: (loading: boolean) => void
  clearResults: () => void
}

export const useMemoryStore = create<MemoryState>((set) => ({
  activeSource: 'postgresql',
  searchQuery: '',
  searching: false,
  loading: false,
  error: null,
  learnings: [],
  graphNodes: [],
  vectors: [],
  stats: null,
  statsLoading: true,

  setActiveSource: (source) => set({ activeSource: source }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearching: (searching) => set({ searching }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLearnings: (learnings) => set({ learnings }),
  setStats: (stats) => set({ stats, statsLoading: false }),
  setStatsLoading: (loading) => set({ statsLoading: loading }),
  clearResults: () => set({ learnings: [], graphNodes: [], vectors: [] }),
}))
