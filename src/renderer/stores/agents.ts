import { create } from 'zustand'

export type AgentStatus = 'idle' | 'active' | 'busy' | 'error' | 'terminated'
export type AgentType = 'coder' | 'researcher' | 'tester' | 'architect' | 'coordinator' | 'security'

export interface Agent {
  id: string
  name: string
  type: AgentType
  status: AgentStatus
  taskCount: number
  health: number
  domain?: string
  config?: Record<string, unknown>
}

export interface SwarmInfo {
  id: string
  topology: string
  agents: string[]
  status: 'active' | 'idle' | 'shutdown'
  createdAt: number
}

export interface HiveMindInfo {
  queenId?: string
  workers: string[]
  topology: string
  status: 'active' | 'idle' | 'shutdown'
}

interface AgentsState {
  agents: Agent[]
  swarm: SwarmInfo | null
  hiveMind: HiveMindInfo | null
  loading: boolean
  selectedAgent: Agent | null

  setAgents: (agents: Agent[]) => void
  setSwarm: (swarm: SwarmInfo | null) => void
  setHiveMind: (hiveMind: HiveMindInfo | null) => void
  setLoading: (loading: boolean) => void
  setSelectedAgent: (agent: Agent | null) => void
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  swarm: null,
  hiveMind: null,
  loading: false,
  selectedAgent: null,

  setAgents: (agents) => set({ agents }),
  setSwarm: (swarm) => set({ swarm }),
  setHiveMind: (hiveMind) => set({ hiveMind }),
  setLoading: (loading) => set({ loading }),
  setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
}))
