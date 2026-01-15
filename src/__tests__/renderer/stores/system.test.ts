import { describe, it, expect, beforeEach } from 'vitest'
import { useSystemStore } from '@/stores/system'

describe('System Store', () => {
  beforeEach(() => {
    // Reset the store
    useSystemStore.setState({
      status: null,
      loading: true,
      error: null,
      pollInterval: 5000,
      lastUpdate: 0,
    })
  })

  describe('setStatus', () => {
    it('should set system status', () => {
      const status = {
        cpu: 45.5,
        memory: {
          total: 16000000000,
          used: 8000000000,
          free: 8000000000,
        },
        uptime: 3600,
        platform: 'linux',
        nodeVersion: 'v22.0.0',
        electronVersion: '34.0.0',
        claudeCodeVersion: '1.0.0',
      }

      useSystemStore.getState().setStatus(status)

      const state = useSystemStore.getState()
      expect(state.status).toEqual(status)
      expect(state.error).toBeNull()
      expect(state.lastUpdate).toBeGreaterThan(0)
    })

    it('should update lastUpdate timestamp', () => {
      const before = Date.now()

      useSystemStore.getState().setStatus({
        cpu: 50,
        memory: { total: 16000000000, used: 8000000000, free: 8000000000 },
        uptime: 3600,
        platform: 'linux',
        nodeVersion: 'v22.0.0',
        electronVersion: '34.0.0',
        claudeCodeVersion: '1.0.0',
      })

      const after = Date.now()
      const lastUpdate = useSystemStore.getState().lastUpdate

      expect(lastUpdate).toBeGreaterThanOrEqual(before)
      expect(lastUpdate).toBeLessThanOrEqual(after)
    })

    it('should clear error when setting status', () => {
      useSystemStore.getState().setError('Previous error')
      useSystemStore.getState().setStatus({
        cpu: 50,
        memory: { total: 16000000000, used: 8000000000, free: 8000000000 },
        uptime: 3600,
        platform: 'linux',
        nodeVersion: 'v22.0.0',
        electronVersion: '34.0.0',
        claudeCodeVersion: '1.0.0',
      })

      expect(useSystemStore.getState().error).toBeNull()
    })
  })

  describe('setLoading', () => {
    it('should set loading to true', () => {
      useSystemStore.getState().setLoading(true)
      expect(useSystemStore.getState().loading).toBe(true)
    })

    it('should set loading to false', () => {
      useSystemStore.getState().setLoading(false)
      expect(useSystemStore.getState().loading).toBe(false)
    })
  })

  describe('setError', () => {
    it('should set error message', () => {
      useSystemStore.getState().setError('Failed to fetch system status')
      expect(useSystemStore.getState().error).toBe('Failed to fetch system status')
    })

    it('should clear error when set to null', () => {
      useSystemStore.getState().setError('Some error')
      useSystemStore.getState().setError(null)
      expect(useSystemStore.getState().error).toBeNull()
    })
  })

  describe('setPollInterval', () => {
    it('should set poll interval', () => {
      useSystemStore.getState().setPollInterval(10000)
      expect(useSystemStore.getState().pollInterval).toBe(10000)
    })

    it('should handle short intervals', () => {
      useSystemStore.getState().setPollInterval(1000)
      expect(useSystemStore.getState().pollInterval).toBe(1000)
    })

    it('should handle long intervals', () => {
      useSystemStore.getState().setPollInterval(60000)
      expect(useSystemStore.getState().pollInterval).toBe(60000)
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useSystemStore.getState()
      expect(state.status).toBeNull()
      expect(state.loading).toBe(true)
      expect(state.error).toBeNull()
      expect(state.pollInterval).toBe(5000)
      expect(state.lastUpdate).toBe(0)
    })
  })
})
