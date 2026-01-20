/**
 * Agent Canvas - Main Component
 * Refactored from 834 lines to ~280 lines (deploy-9mtg)
 *
 * Extracted components:
 * - constants.ts: Configuration, templates, icons
 * - SpawnAgentModal.tsx: Agent spawning modal
 * - TaskAssignmentModal.tsx: Task assignment modal
 * - TemplatesModal.tsx: Template selection modal
 * - AgentCanvasSVG.tsx: SVG visualization
 * - StatCard.tsx: Stats card component
 * - AgentDetails.tsx: Agent details panel
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Activity,
  Cpu,
  Network,
  Crown,
  RefreshCw,
  Play,
  Square,
  Plus,
  Settings,
  Send,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { useAgentsStore, type AgentType } from '@/stores/agents'
import { topologyOptions, type SwarmTopology, type AgentTemplate } from './constants'
import { SpawnAgentModal } from './SpawnAgentModal'
import { TaskAssignmentModal } from './TaskAssignmentModal'
import { TemplatesModal } from './TemplatesModal'
import { AgentCanvasSVG, type CanvasNode, type Connection } from './AgentCanvasSVG'
import { StatCard } from './StatCard'
import { AgentDetails } from './AgentDetails'

export function AgentCanvas() {
  const { selectedAgent, setAgents, setSwarm, setHiveMind, setSelectedAgent } = useAgentsStore()

  const [showSpawnModal, setShowSpawnModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [newAgentType, setNewAgentType] = useState<AgentType>('coder')
  const [newAgentName, setNewAgentName] = useState('')
  const [selectedTopology, setSelectedTopology] = useState<SwarmTopology>('mesh')
  const [taskDescription, setTaskDescription] = useState('')
  const [targetAgentId, setTargetAgentId] = useState<string | 'auto'>('auto')

  // tRPC queries for data fetching
  const listQuery = trpc.agents.list.useQuery(undefined, {
    refetchInterval: 15000,
  })
  const swarmQuery = trpc.agents.swarmStatus.useQuery(undefined, {
    refetchInterval: 15000,
  })
  const hiveMindQuery = trpc.agents.hiveMindStatus.useQuery(undefined, {
    refetchInterval: 15000,
  })

  // tRPC mutations for actions
  const spawnMutation = trpc.agents.spawn.useMutation({
    onSuccess: () => {
      listQuery.refetch()
    },
  })
  const terminateMutation = trpc.agents.terminate.useMutation({
    onSuccess: () => {
      listQuery.refetch()
    },
  })
  const initSwarmMutation = trpc.agents.initSwarm.useMutation({
    onSuccess: () => {
      swarmQuery.refetch()
      listQuery.refetch()
    },
  })
  const shutdownSwarmMutation = trpc.agents.shutdownSwarm.useMutation({
    onSuccess: () => {
      swarmQuery.refetch()
    },
  })
  const submitTaskMutation = trpc.agents.submitTask.useMutation({
    onSuccess: () => {
      listQuery.refetch()
    },
  })

  // Sync data to store for components that need it
  useEffect(() => {
    if (listQuery.data) setAgents(listQuery.data)
  }, [listQuery.data, setAgents])

  useEffect(() => {
    if (swarmQuery.data !== undefined) setSwarm(swarmQuery.data)
  }, [swarmQuery.data, setSwarm])

  useEffect(() => {
    if (hiveMindQuery.data !== undefined) setHiveMind(hiveMindQuery.data)
  }, [hiveMindQuery.data, setHiveMind])

  // Derive data from queries - wrapped in useMemo to prevent unstable deps
  const agents = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const swarm = swarmQuery.data ?? null
  const hiveMind = hiveMindQuery.data ?? null
  const loading = listQuery.isLoading || swarmQuery.isLoading || hiveMindQuery.isLoading

  const handleRefresh = () => {
    listQuery.refetch()
    swarmQuery.refetch()
    hiveMindQuery.refetch()
  }

  // Event handlers
  const handleSpawnAgent = () => {
    if (!newAgentName) return
    spawnMutation.mutate(
      { type: newAgentType, name: newAgentName },
      {
        onSuccess: () => {
          setShowSpawnModal(false)
          setNewAgentName('')
        },
        onError: (error) => {
          console.error('Failed to spawn agent:', error)
        },
      }
    )
  }

  const handleTerminateAgent = (agentId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Terminate this agent?')) return
    terminateMutation.mutate(
      { id: agentId },
      {
        onSuccess: () => {
          setSelectedAgent(null)
        },
        onError: (error) => {
          console.error('Failed to terminate agent:', error)
        },
      }
    )
  }

  const handleInitSwarm = (topology: SwarmTopology = selectedTopology) => {
    initSwarmMutation.mutate(
      { topology },
      {
        onError: (error) => {
          console.error('Failed to init swarm:', error)
        },
      }
    )
  }

  const handleSubmitTask = () => {
    if (!taskDescription.trim()) return
    submitTaskMutation.mutate(
      {
        description: taskDescription,
        targetAgent: targetAgentId === 'auto' ? undefined : targetAgentId,
      },
      {
        onSuccess: () => {
          setShowTaskModal(false)
          setTaskDescription('')
          setTargetAgentId('auto')
        },
        onError: (error) => {
          console.error('Failed to submit task:', error)
        },
      }
    )
  }

  const handleSpawnTemplate = async (template: AgentTemplate) => {
    try {
      await initSwarmMutation.mutateAsync({ topology: template.topology })
      for (const agent of template.agents) {
        await spawnMutation.mutateAsync({ type: agent.type, name: agent.name })
      }
      setShowTemplatesModal(false)
    } catch (error) {
      console.error('Failed to spawn template:', error)
    }
  }

  const handleShutdownSwarm = () => {
    // eslint-disable-next-line no-alert
    if (!confirm('Shutdown the swarm?')) return
    shutdownSwarmMutation.mutate(undefined, {
      onError: (error) => {
        console.error('Failed to shutdown swarm:', error)
      },
    })
  }

  // Canvas calculations
  const canvasNodes = useMemo((): CanvasNode[] => {
    const nodes: CanvasNode[] = []
    const centerX = 400
    const centerY = 300
    const radius = 200

    if (swarm?.status === 'active') {
      nodes.push({ id: 'swarm-center', type: 'swarm-center', x: centerX, y: centerY })
    }

    if (hiveMind?.queenId && hiveMind.status === 'active') {
      nodes.push({
        id: hiveMind.queenId,
        type: 'queen',
        x: centerX,
        y: centerY - 100,
        agent: agents.find((a) => a.id === hiveMind.queenId),
      })
    }

    agents.forEach((agent, index) => {
      if (agent.id === hiveMind?.queenId) return
      const angle = (index / agents.length) * 2 * Math.PI - Math.PI / 2
      nodes.push({
        id: agent.id,
        type: 'agent',
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        agent,
      })
    })

    return nodes
  }, [agents, swarm, hiveMind])

  const connections = useMemo((): Connection[] => {
    const conns: Connection[] = []

    if (swarm?.status === 'active') {
      agents.forEach((agent) => {
        if (agent.id !== hiveMind?.queenId) {
          conns.push({ from: agent.id, to: 'swarm-center', type: 'swarm' })
        }
      })
    }

    if (hiveMind?.queenId && hiveMind.status === 'active') {
      hiveMind.workers.forEach((workerId) => {
        conns.push({ from: workerId, to: hiveMind.queenId, type: 'hive' })
      })
    }

    return conns
  }, [agents, swarm, hiveMind])

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === 'active').length,
    busy: agents.filter((a) => a.status === 'busy').length,
  }

  return (
    <div className="space-y-4 animate-in">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard icon={Brain} value={stats.total} label="Agents" color="text-accent-purple" />
        <StatCard icon={Activity} value={stats.active} label="Active" color="text-accent-green" />
        <StatCard icon={Cpu} value={stats.busy} label="Busy" color="text-accent-yellow" />
        <StatCard
          icon={Network}
          value={swarm?.status === 'active' ? 'Active' : 'Inactive'}
          label="Swarm"
          color={swarm?.status === 'active' ? 'text-accent-blue' : 'text-text-muted'}
        />
        <StatCard
          icon={Crown}
          value={hiveMind?.status === 'active' ? 'Active' : 'Inactive'}
          label="Hive Mind"
          color={hiveMind?.status === 'active' ? 'text-accent-purple' : 'text-text-muted'}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSpawnModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Spawn Agent
          </button>
          <button onClick={() => setShowTemplatesModal(true)} className="btn btn-secondary">
            <Layers className="w-4 h-4 mr-2" />
            Templates
          </button>
        </div>

        <div className="h-6 w-px bg-border mx-2" />

        {/* Swarm Controls */}
        <div className="flex items-center gap-2">
          {!swarm || swarm.status !== 'active' ? (
            <>
              <select
                value={selectedTopology}
                onChange={(e) => setSelectedTopology(e.target.value as SwarmTopology)}
                className="input h-9 text-sm pr-8"
              >
                {topologyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button onClick={() => handleInitSwarm()} className="btn btn-secondary">
                <Play className="w-4 h-4 mr-2" />
                Init Swarm
              </button>
            </>
          ) : (
            <button onClick={handleShutdownSwarm} className="btn btn-secondary text-accent-red">
              <Square className="w-4 h-4 mr-2" />
              Shutdown
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-border mx-2" />

        <button
          onClick={() => setShowTaskModal(true)}
          className="btn btn-secondary"
          disabled={agents.length === 0}
        >
          <Send className="w-4 h-4 mr-2" />
          Assign Task
        </button>

        <div className="flex-1" />

        <button onClick={handleRefresh} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Canvas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="card bg-background h-[500px] relative overflow-hidden">
            {agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <Brain className="w-16 h-16 mb-4" />
                <p className="text-lg mb-2">No Agents Running</p>
                <p className="text-sm">Spawn an agent to get started</p>
              </div>
            ) : (
              <AgentCanvasSVG
                nodes={canvasNodes}
                connections={connections}
                selectedAgentId={selectedAgent?.id}
                onSelectAgent={setSelectedAgent}
              />
            )}
          </div>
        </div>

        {/* Details Panel */}
        <div className="space-y-4">
          {selectedAgent ? (
            <AgentDetails
              agent={selectedAgent}
              onTerminate={() => handleTerminateAgent(selectedAgent.id)}
            />
          ) : (
            <div className="card p-4 h-full flex flex-col items-center justify-center text-text-muted">
              <Settings className="w-12 h-12 mb-4" />
              <p className="text-sm">Select an agent to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSpawnModal && (
        <SpawnAgentModal
          agentType={newAgentType}
          agentName={newAgentName}
          onTypeChange={setNewAgentType}
          onNameChange={setNewAgentName}
          onSpawn={handleSpawnAgent}
          onClose={() => setShowSpawnModal(false)}
        />
      )}

      {showTaskModal && (
        <TaskAssignmentModal
          taskDescription={taskDescription}
          targetAgentId={targetAgentId}
          agents={agents}
          onDescriptionChange={setTaskDescription}
          onTargetChange={setTargetAgentId}
          onSubmit={handleSubmitTask}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {showTemplatesModal && (
        <TemplatesModal
          onSelectTemplate={handleSpawnTemplate}
          onClose={() => setShowTemplatesModal(false)}
        />
      )}
    </div>
  )
}

export default AgentCanvas
