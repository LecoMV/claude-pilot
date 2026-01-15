import { describe, it, expect, beforeEach } from 'vitest'
import { useLogsStore } from '@/stores/logs'
import type { LogEntry } from '@/stores/logs'

describe('Logs Store', () => {
  const createLogEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    source: 'system',
    level: 'info',
    message: 'Test log message',
    ...overrides,
  })

  beforeEach(() => {
    // Reset the store
    useLogsStore.setState({
      logs: [],
      filter: 'all',
      levelFilter: 'all',
      searchQuery: '',
      paused: false,
      maxLogs: 1000,
      autoScroll: true,
    })
  })

  describe('addLog', () => {
    it('should add a log entry', () => {
      const log = createLogEntry({ id: 'log-1' })
      useLogsStore.getState().addLog(log)
      expect(useLogsStore.getState().logs).toHaveLength(1)
      expect(useLogsStore.getState().logs[0]).toEqual(log)
    })

    it('should not add log when paused', () => {
      useLogsStore.getState().setPaused(true)
      useLogsStore.getState().addLog(createLogEntry({ id: 'log-1' }))
      expect(useLogsStore.getState().logs).toHaveLength(0)
    })

    it('should respect maxLogs limit', () => {
      // Set a small limit for testing
      useLogsStore.setState({ maxLogs: 3 })

      // Add 5 logs
      for (let i = 0; i < 5; i++) {
        useLogsStore.getState().addLog(createLogEntry({ id: `log-${i}` }))
      }

      const logs = useLogsStore.getState().logs
      expect(logs).toHaveLength(3)
      // Should keep the most recent logs
      expect(logs[0].id).toBe('log-2')
      expect(logs[2].id).toBe('log-4')
    })
  })

  describe('addLogs', () => {
    it('should add multiple log entries', () => {
      const logs = [
        createLogEntry({ id: 'log-1' }),
        createLogEntry({ id: 'log-2' }),
        createLogEntry({ id: 'log-3' }),
      ]
      useLogsStore.getState().addLogs(logs)
      expect(useLogsStore.getState().logs).toHaveLength(3)
    })

    it('should not add logs when paused', () => {
      useLogsStore.getState().setPaused(true)
      useLogsStore.getState().addLogs([createLogEntry(), createLogEntry()])
      expect(useLogsStore.getState().logs).toHaveLength(0)
    })

    it('should respect maxLogs limit when adding multiple', () => {
      useLogsStore.setState({ maxLogs: 5 })

      const logs = Array.from({ length: 10 }, (_, i) =>
        createLogEntry({ id: `log-${i}` })
      )
      useLogsStore.getState().addLogs(logs)

      expect(useLogsStore.getState().logs).toHaveLength(5)
    })
  })

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      useLogsStore.getState().addLogs([
        createLogEntry({ id: 'log-1' }),
        createLogEntry({ id: 'log-2' }),
      ])

      useLogsStore.getState().clearLogs()
      expect(useLogsStore.getState().logs).toHaveLength(0)
    })
  })

  describe('setFilter', () => {
    it('should set source filter', () => {
      useLogsStore.getState().setFilter('claude')
      expect(useLogsStore.getState().filter).toBe('claude')
    })

    it('should handle all source types', () => {
      const sources = ['claude', 'mcp', 'system', 'agent', 'workflow', 'all'] as const
      sources.forEach((source) => {
        useLogsStore.getState().setFilter(source)
        expect(useLogsStore.getState().filter).toBe(source)
      })
    })
  })

  describe('setLevelFilter', () => {
    it('should set level filter', () => {
      useLogsStore.getState().setLevelFilter('error')
      expect(useLogsStore.getState().levelFilter).toBe('error')
    })

    it('should handle all level types', () => {
      const levels = ['debug', 'info', 'warn', 'error', 'all'] as const
      levels.forEach((level) => {
        useLogsStore.getState().setLevelFilter(level)
        expect(useLogsStore.getState().levelFilter).toBe(level)
      })
    })
  })

  describe('setSearchQuery', () => {
    it('should set search query', () => {
      useLogsStore.getState().setSearchQuery('error message')
      expect(useLogsStore.getState().searchQuery).toBe('error message')
    })

    it('should handle empty query', () => {
      useLogsStore.getState().setSearchQuery('')
      expect(useLogsStore.getState().searchQuery).toBe('')
    })
  })

  describe('setPaused', () => {
    it('should set paused state', () => {
      useLogsStore.getState().setPaused(true)
      expect(useLogsStore.getState().paused).toBe(true)
    })
  })

  describe('setAutoScroll', () => {
    it('should set auto scroll state', () => {
      useLogsStore.getState().setAutoScroll(false)
      expect(useLogsStore.getState().autoScroll).toBe(false)
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useLogsStore.getState()
      expect(state.logs).toEqual([])
      expect(state.filter).toBe('all')
      expect(state.levelFilter).toBe('all')
      expect(state.searchQuery).toBe('')
      expect(state.paused).toBe(false)
      expect(state.maxLogs).toBe(1000)
      expect(state.autoScroll).toBe(true)
    })
  })
})
