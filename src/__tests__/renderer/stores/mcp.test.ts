import { describe, it, expect, beforeEach } from 'vitest'
import { useMCPStore } from '@/stores/mcp'

describe('MCP Store', () => {
  const mockServer = {
    name: 'test-server',
    status: 'online' as const,
    config: {
      command: 'node',
      args: ['server.js'],
      disabled: false,
    },
  }

  const mockDisabledServer = {
    name: 'disabled-server',
    status: 'offline' as const,
    config: {
      command: 'node',
      args: ['disabled.js'],
      disabled: true,
    },
  }

  beforeEach(() => {
    // Reset the store
    useMCPStore.setState({
      servers: [],
      selectedServer: null,
      loading: true,
      refreshing: false,
      error: null,
      showDetail: false,
    })
  })

  describe('setServers', () => {
    it('should set servers array', () => {
      useMCPStore.getState().setServers([mockServer])
      expect(useMCPStore.getState().servers).toEqual([mockServer])
    })

    it('should handle multiple servers', () => {
      const servers = [mockServer, mockDisabledServer]
      useMCPStore.getState().setServers(servers)
      expect(useMCPStore.getState().servers).toHaveLength(2)
    })

    it('should handle empty array', () => {
      useMCPStore.getState().setServers([])
      expect(useMCPStore.getState().servers).toHaveLength(0)
    })
  })

  describe('setSelectedServer', () => {
    it('should set selected server', () => {
      useMCPStore.getState().setSelectedServer(mockServer)
      expect(useMCPStore.getState().selectedServer).toEqual(mockServer)
    })

    it('should clear selected server when set to null', () => {
      useMCPStore.getState().setSelectedServer(mockServer)
      useMCPStore.getState().setSelectedServer(null)
      expect(useMCPStore.getState().selectedServer).toBeNull()
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useMCPStore.getState().setLoading(false)
      expect(useMCPStore.getState().loading).toBe(false)
    })
  })

  describe('setRefreshing', () => {
    it('should set refreshing state', () => {
      useMCPStore.getState().setRefreshing(true)
      expect(useMCPStore.getState().refreshing).toBe(true)
    })
  })

  describe('setError', () => {
    it('should set error message', () => {
      useMCPStore.getState().setError('Failed to load MCP servers')
      expect(useMCPStore.getState().error).toBe('Failed to load MCP servers')
    })

    it('should clear error when set to null', () => {
      useMCPStore.getState().setError('Some error')
      useMCPStore.getState().setError(null)
      expect(useMCPStore.getState().error).toBeNull()
    })
  })

  describe('setShowDetail', () => {
    it('should set show detail state', () => {
      useMCPStore.getState().setShowDetail(true)
      expect(useMCPStore.getState().showDetail).toBe(true)
    })
  })

  describe('getActiveCount', () => {
    it('should return count of active servers', () => {
      useMCPStore.getState().setServers([
        mockServer,
        mockDisabledServer,
        {
          name: 'another-active',
          status: 'online' as const,
          config: { command: 'node', args: [], disabled: false },
        },
      ])

      expect(useMCPStore.getState().getActiveCount()).toBe(2)
    })

    it('should return 0 when no active servers', () => {
      useMCPStore.getState().setServers([mockDisabledServer])
      expect(useMCPStore.getState().getActiveCount()).toBe(0)
    })

    it('should not count offline servers as active', () => {
      useMCPStore.getState().setServers([
        {
          name: 'offline-server',
          status: 'offline' as const,
          config: { command: 'node', args: [], disabled: false },
        },
      ])
      expect(useMCPStore.getState().getActiveCount()).toBe(0)
    })
  })

  describe('getDisabledCount', () => {
    it('should return count of disabled servers', () => {
      useMCPStore.getState().setServers([mockServer, mockDisabledServer])
      expect(useMCPStore.getState().getDisabledCount()).toBe(1)
    })

    it('should return 0 when no disabled servers', () => {
      useMCPStore.getState().setServers([mockServer])
      expect(useMCPStore.getState().getDisabledCount()).toBe(0)
    })
  })
})
