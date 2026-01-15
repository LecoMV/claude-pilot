import { describe, it, expect, beforeEach } from 'vitest'
import { useServicesStore } from '@/stores/services'

describe('Services Store', () => {
  beforeEach(() => {
    // Reset the store
    useServicesStore.setState({
      systemdServices: [],
      podmanContainers: [],
      loading: true,
      activeTab: 'podman',
      selectedService: null,
      selectedContainer: null,
      filter: '',
    })
  })

  describe('setSystemdServices', () => {
    it('should set systemd services', () => {
      const services = [
        {
          name: 'nginx',
          description: 'Web server',
          status: 'running' as const,
          enabled: true,
          activeState: 'active',
          subState: 'running',
        },
      ]

      useServicesStore.getState().setSystemdServices(services)

      expect(useServicesStore.getState().systemdServices).toEqual(services)
    })
  })

  describe('setPodmanContainers', () => {
    it('should set podman containers', () => {
      const containers = [
        {
          id: 'abc123',
          name: 'postgres',
          image: 'postgres:15',
          status: 'running' as const,
          created: '2024-01-01',
          ports: ['5432:5432'],
          state: 'running',
        },
      ]

      useServicesStore.getState().setPodmanContainers(containers)

      expect(useServicesStore.getState().podmanContainers).toEqual(containers)
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useServicesStore.getState().setLoading(false)

      expect(useServicesStore.getState().loading).toBe(false)
    })
  })

  describe('setActiveTab', () => {
    it('should set active tab', () => {
      useServicesStore.getState().setActiveTab('systemd')

      expect(useServicesStore.getState().activeTab).toBe('systemd')
    })
  })

  describe('setSelectedService', () => {
    it('should set selected service', () => {
      const service = {
        name: 'nginx',
        description: 'Web server',
        status: 'running' as const,
        enabled: true,
        activeState: 'active',
        subState: 'running',
      }

      useServicesStore.getState().setSelectedService(service)

      expect(useServicesStore.getState().selectedService).toEqual(service)
    })

    it('should clear selected service when set to null', () => {
      useServicesStore.getState().setSelectedService({
        name: 'nginx',
        description: 'Web server',
        status: 'running' as const,
        enabled: true,
        activeState: 'active',
        subState: 'running',
      })

      useServicesStore.getState().setSelectedService(null)

      expect(useServicesStore.getState().selectedService).toBeNull()
    })
  })

  describe('setSelectedContainer', () => {
    it('should set selected container', () => {
      const container = {
        id: 'abc123',
        name: 'postgres',
        image: 'postgres:15',
        status: 'running' as const,
        created: '2024-01-01',
        ports: ['5432:5432'],
        state: 'running',
      }

      useServicesStore.getState().setSelectedContainer(container)

      expect(useServicesStore.getState().selectedContainer).toEqual(container)
    })
  })

  describe('setFilter', () => {
    it('should set filter', () => {
      useServicesStore.getState().setFilter('nginx')

      expect(useServicesStore.getState().filter).toBe('nginx')
    })
  })

  describe('service filtering', () => {
    it('should count running services correctly', () => {
      useServicesStore.getState().setSystemdServices([
        {
          name: 'nginx',
          description: 'Web server',
          status: 'running',
          enabled: true,
          activeState: 'active',
          subState: 'running',
        },
        {
          name: 'postgres',
          description: 'Database',
          status: 'stopped',
          enabled: true,
          activeState: 'inactive',
          subState: 'dead',
        },
        {
          name: 'redis',
          description: 'Cache',
          status: 'running',
          enabled: true,
          activeState: 'active',
          subState: 'running',
        },
      ])

      const state = useServicesStore.getState()
      const runningCount = state.systemdServices.filter(
        (s) => s.status === 'running'
      ).length

      expect(runningCount).toBe(2)
    })

    it('should filter services by name', () => {
      useServicesStore.getState().setSystemdServices([
        {
          name: 'nginx',
          description: 'Web server',
          status: 'running',
          enabled: true,
          activeState: 'active',
          subState: 'running',
        },
        {
          name: 'nginx-proxy',
          description: 'Proxy',
          status: 'running',
          enabled: true,
          activeState: 'active',
          subState: 'running',
        },
        {
          name: 'redis',
          description: 'Cache',
          status: 'running',
          enabled: true,
          activeState: 'active',
          subState: 'running',
        },
      ])

      useServicesStore.getState().setFilter('nginx')

      const state = useServicesStore.getState()
      const filteredServices = state.systemdServices.filter((s) =>
        s.name.includes(state.filter)
      )

      expect(filteredServices).toHaveLength(2)
    })
  })
})
