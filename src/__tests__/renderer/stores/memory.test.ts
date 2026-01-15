import { describe, it, expect, beforeEach } from 'vitest'
import { useMemoryStore } from '@/stores/memory'

describe('Memory Store', () => {
  beforeEach(() => {
    // Reset the store
    useMemoryStore.setState({
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
    })
  })

  describe('setActiveSource', () => {
    it('should set active source to postgresql', () => {
      useMemoryStore.getState().setActiveSource('postgresql')
      expect(useMemoryStore.getState().activeSource).toBe('postgresql')
    })

    it('should set active source to memgraph', () => {
      useMemoryStore.getState().setActiveSource('memgraph')
      expect(useMemoryStore.getState().activeSource).toBe('memgraph')
    })

    it('should set active source to qdrant', () => {
      useMemoryStore.getState().setActiveSource('qdrant')
      expect(useMemoryStore.getState().activeSource).toBe('qdrant')
    })
  })

  describe('setSearchQuery', () => {
    it('should set search query', () => {
      useMemoryStore.getState().setSearchQuery('test query')
      expect(useMemoryStore.getState().searchQuery).toBe('test query')
    })

    it('should handle empty query', () => {
      useMemoryStore.getState().setSearchQuery('')
      expect(useMemoryStore.getState().searchQuery).toBe('')
    })
  })

  describe('setSearching', () => {
    it('should set searching to true', () => {
      useMemoryStore.getState().setSearching(true)
      expect(useMemoryStore.getState().searching).toBe(true)
    })

    it('should set searching to false', () => {
      useMemoryStore.getState().setSearching(false)
      expect(useMemoryStore.getState().searching).toBe(false)
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useMemoryStore.getState().setLoading(true)
      expect(useMemoryStore.getState().loading).toBe(true)
    })
  })

  describe('setError', () => {
    it('should set error message', () => {
      useMemoryStore.getState().setError('Connection failed')
      expect(useMemoryStore.getState().error).toBe('Connection failed')
    })

    it('should clear error when set to null', () => {
      useMemoryStore.getState().setError('Some error')
      useMemoryStore.getState().setError(null)
      expect(useMemoryStore.getState().error).toBeNull()
    })
  })

  describe('setLearnings', () => {
    it('should set learnings array', () => {
      const learnings = [
        {
          id: 1,
          topic: 'TypeScript',
          content: 'TypeScript is great',
          source: 'manual',
          created_at: '2024-01-01',
        },
      ]
      useMemoryStore.getState().setLearnings(learnings)
      expect(useMemoryStore.getState().learnings).toEqual(learnings)
    })

    it('should handle empty learnings', () => {
      useMemoryStore.getState().setLearnings([])
      expect(useMemoryStore.getState().learnings).toHaveLength(0)
    })
  })

  describe('setStats', () => {
    it('should set stats and set statsLoading to false', () => {
      const stats = {
        postgresql: { count: 100 },
        memgraph: { nodes: 500, edges: 1000 },
        qdrant: { vectors: 50000 },
      }
      useMemoryStore.getState().setStats(stats)

      const state = useMemoryStore.getState()
      expect(state.stats).toEqual(stats)
      expect(state.statsLoading).toBe(false)
    })
  })

  describe('setStatsLoading', () => {
    it('should set stats loading state', () => {
      useMemoryStore.getState().setStatsLoading(true)
      expect(useMemoryStore.getState().statsLoading).toBe(true)
    })
  })

  describe('clearResults', () => {
    it('should clear all results', () => {
      // Set some data first
      useMemoryStore.getState().setLearnings([
        { id: 1, topic: 'Test', content: 'Test', source: 'manual', created_at: '2024-01-01' },
      ])

      // Clear results
      useMemoryStore.getState().clearResults()

      const state = useMemoryStore.getState()
      expect(state.learnings).toHaveLength(0)
      expect(state.graphNodes).toHaveLength(0)
      expect(state.vectors).toHaveLength(0)
    })
  })
})
