import { describe, it, expect, beforeEach } from 'vitest'
import { useContextStore } from '@/stores/context'
import type { SessionSummary, TokenUsage, CompactionSettings } from '@/stores/context'

describe('Context Store', () => {
  const mockSession: SessionSummary = {
    id: 'session-1',
    projectPath: '/home/user/project',
    projectName: 'my-project',
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    messageCount: 50,
    tokenCount: 15000,
    toolCalls: 25,
    model: 'claude-opus-4-5-20251101',
  }

  const mockTokenUsage: TokenUsage = {
    current: 50000,
    max: 200000,
    percentage: 25,
    lastCompaction: Date.now() - 86400000,
  }

  const mockCompactionSettings: CompactionSettings = {
    autoCompact: true,
    threshold: 80,
  }

  beforeEach(() => {
    // Reset the store
    useContextStore.setState({
      sessions: [],
      tokenUsage: null,
      compactionSettings: null,
      loading: true,
      sessionsLoading: false,
      selectedSession: null,
    })
  })

  describe('setSessions', () => {
    it('should set sessions array', () => {
      useContextStore.getState().setSessions([mockSession])
      expect(useContextStore.getState().sessions).toEqual([mockSession])
    })

    it('should handle multiple sessions', () => {
      const sessions: SessionSummary[] = [
        mockSession,
        { ...mockSession, id: 'session-2', projectName: 'other-project' },
      ]
      useContextStore.getState().setSessions(sessions)
      expect(useContextStore.getState().sessions).toHaveLength(2)
    })

    it('should handle sessions without endTime', () => {
      const activeSession: SessionSummary = {
        ...mockSession,
        endTime: undefined,
      }
      useContextStore.getState().setSessions([activeSession])
      expect(useContextStore.getState().sessions[0].endTime).toBeUndefined()
    })
  })

  describe('setTokenUsage', () => {
    it('should set token usage', () => {
      useContextStore.getState().setTokenUsage(mockTokenUsage)
      expect(useContextStore.getState().tokenUsage).toEqual(mockTokenUsage)
    })

    it('should handle usage without lastCompaction', () => {
      const usage: TokenUsage = {
        current: 10000,
        max: 200000,
        percentage: 5,
      }
      useContextStore.getState().setTokenUsage(usage)
      expect(useContextStore.getState().tokenUsage?.lastCompaction).toBeUndefined()
    })

    it('should handle high percentage usage', () => {
      const highUsage: TokenUsage = {
        current: 180000,
        max: 200000,
        percentage: 90,
      }
      useContextStore.getState().setTokenUsage(highUsage)
      expect(useContextStore.getState().tokenUsage?.percentage).toBe(90)
    })
  })

  describe('setCompactionSettings', () => {
    it('should set compaction settings', () => {
      useContextStore.getState().setCompactionSettings(mockCompactionSettings)
      expect(useContextStore.getState().compactionSettings).toEqual(mockCompactionSettings)
    })

    it('should handle disabled auto compact', () => {
      const settings: CompactionSettings = {
        autoCompact: false,
        threshold: 90,
      }
      useContextStore.getState().setCompactionSettings(settings)
      expect(useContextStore.getState().compactionSettings?.autoCompact).toBe(false)
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useContextStore.getState().setLoading(false)
      expect(useContextStore.getState().loading).toBe(false)
    })
  })

  describe('setSessionsLoading', () => {
    it('should set sessions loading state', () => {
      useContextStore.getState().setSessionsLoading(true)
      expect(useContextStore.getState().sessionsLoading).toBe(true)
    })
  })

  describe('setSelectedSession', () => {
    it('should set selected session', () => {
      useContextStore.getState().setSelectedSession(mockSession)
      expect(useContextStore.getState().selectedSession).toEqual(mockSession)
    })

    it('should clear selected session when set to null', () => {
      useContextStore.getState().setSelectedSession(mockSession)
      useContextStore.getState().setSelectedSession(null)
      expect(useContextStore.getState().selectedSession).toBeNull()
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useContextStore.getState()
      expect(state.sessions).toEqual([])
      expect(state.tokenUsage).toBeNull()
      expect(state.compactionSettings).toBeNull()
      expect(state.loading).toBe(true)
      expect(state.sessionsLoading).toBe(false)
      expect(state.selectedSession).toBeNull()
    })
  })
})
