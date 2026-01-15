import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentsStore } from '@/stores/agents'
import type { Agent, SwarmInfo, HiveMindInfo } from '@/stores/agents'

describe('Agents Store', () => {
  const mockAgent: Agent = {
    id: 'agent-1',
    name: 'Coder Agent',
    type: 'coder',
    status: 'active',
    taskCount: 5,
    health: 0.95,
    domain: 'development',
    config: { maxConcurrency: 3 },
  }

  const mockSwarm: SwarmInfo = {
    id: 'swarm-1',
    topology: 'mesh',
    agents: ['agent-1', 'agent-2'],
    status: 'active',
    createdAt: Date.now(),
  }

  const mockHiveMind: HiveMindInfo = {
    queenId: 'queen-1',
    workers: ['worker-1', 'worker-2'],
    topology: 'hierarchical',
    status: 'active',
  }

  beforeEach(() => {
    // Reset the store
    useAgentsStore.setState({
      agents: [],
      swarm: null,
      hiveMind: null,
      loading: false,
      selectedAgent: null,
    })
  })

  describe('setAgents', () => {
    it('should set agents array', () => {
      useAgentsStore.getState().setAgents([mockAgent])
      expect(useAgentsStore.getState().agents).toEqual([mockAgent])
    })

    it('should handle multiple agents', () => {
      const agents: Agent[] = [
        mockAgent,
        { ...mockAgent, id: 'agent-2', name: 'Researcher', type: 'researcher' },
        { ...mockAgent, id: 'agent-3', name: 'Tester', type: 'tester', status: 'idle' },
      ]
      useAgentsStore.getState().setAgents(agents)
      expect(useAgentsStore.getState().agents).toHaveLength(3)
    })

    it('should handle all agent types', () => {
      const agents: Agent[] = [
        { ...mockAgent, type: 'coder' },
        { ...mockAgent, id: '2', type: 'researcher' },
        { ...mockAgent, id: '3', type: 'tester' },
        { ...mockAgent, id: '4', type: 'architect' },
        { ...mockAgent, id: '5', type: 'coordinator' },
        { ...mockAgent, id: '6', type: 'security' },
      ]
      useAgentsStore.getState().setAgents(agents)
      expect(useAgentsStore.getState().agents).toHaveLength(6)
    })
  })

  describe('setSwarm', () => {
    it('should set swarm info', () => {
      useAgentsStore.getState().setSwarm(mockSwarm)
      expect(useAgentsStore.getState().swarm).toEqual(mockSwarm)
    })

    it('should clear swarm when set to null', () => {
      useAgentsStore.getState().setSwarm(mockSwarm)
      useAgentsStore.getState().setSwarm(null)
      expect(useAgentsStore.getState().swarm).toBeNull()
    })
  })

  describe('setHiveMind', () => {
    it('should set hive mind info', () => {
      useAgentsStore.getState().setHiveMind(mockHiveMind)
      expect(useAgentsStore.getState().hiveMind).toEqual(mockHiveMind)
    })

    it('should clear hive mind when set to null', () => {
      useAgentsStore.getState().setHiveMind(mockHiveMind)
      useAgentsStore.getState().setHiveMind(null)
      expect(useAgentsStore.getState().hiveMind).toBeNull()
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useAgentsStore.getState().setLoading(true)
      expect(useAgentsStore.getState().loading).toBe(true)
    })
  })

  describe('setSelectedAgent', () => {
    it('should set selected agent', () => {
      useAgentsStore.getState().setSelectedAgent(mockAgent)
      expect(useAgentsStore.getState().selectedAgent).toEqual(mockAgent)
    })

    it('should clear selected agent when set to null', () => {
      useAgentsStore.getState().setSelectedAgent(mockAgent)
      useAgentsStore.getState().setSelectedAgent(null)
      expect(useAgentsStore.getState().selectedAgent).toBeNull()
    })
  })

  describe('agent statuses', () => {
    it('should handle all agent statuses', () => {
      const statuses = ['idle', 'active', 'busy', 'error', 'terminated'] as const
      statuses.forEach((status, index) => {
        const agent: Agent = { ...mockAgent, id: `agent-${index}`, status }
        useAgentsStore.getState().setAgents([agent])
        expect(useAgentsStore.getState().agents[0].status).toBe(status)
      })
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useAgentsStore.getState()
      expect(state.agents).toEqual([])
      expect(state.swarm).toBeNull()
      expect(state.hiveMind).toBeNull()
      expect(state.loading).toBe(false)
      expect(state.selectedAgent).toBeNull()
    })
  })
})
