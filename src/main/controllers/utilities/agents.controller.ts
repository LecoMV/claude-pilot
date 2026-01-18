/**
 * Agents Controller
 *
 * Type-safe tRPC controller for agent management.
 * Handles spawning, terminating, and monitoring agents and swarms.
 *
 * Migrated from handlers.ts (7 handlers):
 * - agents:list
 * - agents:spawn
 * - agents:terminate
 * - agents:swarmStatus
 * - agents:hiveMindStatus
 * - agents:initSwarm
 * - agents:shutdownSwarm
 *
 * @module agents.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import type { Agent, AgentType, SwarmInfo, HiveMindInfo } from '../../../shared/types'

// ============================================================================
// Schemas
// ============================================================================

const AgentTypeSchema = z.enum([
  'coder',
  'researcher',
  'tester',
  'architect',
  'coordinator',
  'security',
])

const SpawnAgentSchema = z.object({
  type: AgentTypeSchema,
  name: z.string().min(1).max(50),
})

const TerminateAgentSchema = z.object({
  id: z.string().min(1),
})

const InitSwarmSchema = z.object({
  topology: z.string().min(1),
})

const SubmitTaskSchema = z.object({
  description: z.string().min(1).max(1000),
  targetAgent: z.string().optional(),
})

// ============================================================================
// Agent State
// ============================================================================

interface AgentState {
  agents: Agent[]
  swarm: SwarmInfo | null
  hiveMind: HiveMindInfo | null
}

const agentState: AgentState = {
  agents: [],
  swarm: null,
  hiveMind: null,
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function getAgentList(): Agent[] {
  // Update agent statuses randomly for demo purposes
  agentState.agents.forEach((agent) => {
    if (agent.status !== 'terminated') {
      // Randomly update health slightly
      agent.health = Math.min(1, Math.max(0.1, agent.health + (Math.random() - 0.5) * 0.1))
      // Randomly toggle between idle/active/busy
      const rand = Math.random()
      if (rand < 0.1 && agent.status === 'active') agent.status = 'busy'
      else if (rand < 0.2 && agent.status === 'busy') agent.status = 'active'
    }
  })
  return agentState.agents
}

function spawnAgent(type: AgentType, name: string): Agent | null {
  const agent: Agent = {
    id: generateAgentId(),
    name,
    type,
    status: 'idle',
    taskCount: 0,
    health: 1.0,
  }
  agentState.agents.push(agent)

  // Simulate agent becoming active after spawn
  setTimeout(() => {
    const idx = agentState.agents.findIndex((a) => a.id === agent.id)
    if (idx >= 0 && agentState.agents[idx].status === 'idle') {
      agentState.agents[idx].status = 'active'
    }
  }, 1000)

  return agent
}

function terminateAgent(id: string): boolean {
  const index = agentState.agents.findIndex((a) => a.id === id)
  if (index >= 0) {
    agentState.agents[index].status = 'terminated'
    // Remove after a short delay
    setTimeout(() => {
      agentState.agents = agentState.agents.filter((a) => a.id !== id)
    }, 500)
    return true
  }
  return false
}

function getSwarmStatus(): SwarmInfo | null {
  return agentState.swarm
}

function getHiveMindStatus(): HiveMindInfo | null {
  return agentState.hiveMind
}

function initSwarm(topology: string): boolean {
  agentState.swarm = {
    id: `swarm-${Date.now()}`,
    topology,
    agents: agentState.agents.map((a) => a.id),
    status: 'active',
    createdAt: Date.now(),
  }
  return true
}

function shutdownSwarm(): boolean {
  agentState.swarm = null
  return true
}

function submitTask(description: string, targetAgent?: string): boolean {
  // Assign task to target agent or first available agent
  const agent = targetAgent
    ? agentState.agents.find((a) => a.id === targetAgent)
    : agentState.agents.find((a) => a.status === 'active' || a.status === 'idle')

  if (agent) {
    agent.status = 'busy'
    agent.taskCount++
    // Simulate task completion after some time
    setTimeout(
      () => {
        const idx = agentState.agents.findIndex((a) => a.id === agent.id)
        if (idx >= 0 && agentState.agents[idx].status === 'busy') {
          agentState.agents[idx].status = 'active'
        }
      },
      5000 + Math.random() * 5000
    )
    return true
  }
  return false
}

// ============================================================================
// Router
// ============================================================================

export const agentsRouter = router({
  /**
   * List all agents
   */
  list: publicProcedure.query((): Agent[] => {
    return getAgentList()
  }),

  /**
   * Spawn a new agent
   */
  spawn: auditedProcedure.input(SpawnAgentSchema).mutation(({ input }): Agent | null => {
    return spawnAgent(input.type, input.name)
  }),

  /**
   * Terminate an agent
   */
  terminate: auditedProcedure.input(TerminateAgentSchema).mutation(({ input }): boolean => {
    return terminateAgent(input.id)
  }),

  /**
   * Get swarm status
   */
  swarmStatus: publicProcedure.query((): SwarmInfo | null => {
    return getSwarmStatus()
  }),

  /**
   * Get hive mind status
   */
  hiveMindStatus: publicProcedure.query((): HiveMindInfo | null => {
    return getHiveMindStatus()
  }),

  /**
   * Initialize a swarm
   */
  initSwarm: auditedProcedure.input(InitSwarmSchema).mutation(({ input }): boolean => {
    return initSwarm(input.topology)
  }),

  /**
   * Shutdown the swarm
   */
  shutdownSwarm: auditedProcedure.mutation((): boolean => {
    return shutdownSwarm()
  }),

  /**
   * Submit a task to an agent
   */
  submitTask: auditedProcedure.input(SubmitTaskSchema).mutation(({ input }): boolean => {
    return submitTask(input.description, input.targetAgent)
  }),
})
