import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Code,
  Search,
  TestTube,
  Building,
  Users,
  Shield,
  RefreshCw,
  Play,
  Square,
  Plus,
  Settings,
  Trash2,
  Activity,
  Cpu,
  Network,
  Crown,
  Send,
  Zap,
  GitBranch,
  LayoutGrid,
  Target,
  X,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentsStore, type Agent, type AgentType, type AgentStatus } from '@/stores/agents'

type SwarmTopology = 'mesh' | 'hierarchical' | 'ring' | 'star'

const topologyOptions: { value: SwarmTopology; label: string; description: string; icon: typeof LayoutGrid }[] = [
  { value: 'mesh', label: 'Mesh', description: 'All agents connected to each other', icon: LayoutGrid },
  { value: 'hierarchical', label: 'Hierarchical', description: 'Tree structure with coordinators', icon: GitBranch },
  { value: 'ring', label: 'Ring', description: 'Sequential message passing', icon: Target },
  { value: 'star', label: 'Star', description: 'Central coordinator hub', icon: Zap },
]

interface AgentTemplate {
  name: string
  description: string
  agents: { type: AgentType; name: string }[]
  topology: SwarmTopology
}

const agentTemplates: AgentTemplate[] = [
  {
    name: 'Development Team',
    description: 'Full-stack dev squad with testing',
    agents: [
      { type: 'architect', name: 'sys-architect' },
      { type: 'coder', name: 'frontend-dev' },
      { type: 'coder', name: 'backend-dev' },
      { type: 'tester', name: 'qa-engineer' },
    ],
    topology: 'hierarchical',
  },
  {
    name: 'Research Squad',
    description: 'Deep research and analysis team',
    agents: [
      { type: 'researcher', name: 'lead-researcher' },
      { type: 'researcher', name: 'data-analyst' },
      { type: 'coordinator', name: 'research-coordinator' },
    ],
    topology: 'star',
  },
  {
    name: 'Security Audit',
    description: 'Security-focused review team',
    agents: [
      { type: 'security', name: 'security-lead' },
      { type: 'security', name: 'vuln-scanner' },
      { type: 'coder', name: 'patch-developer' },
      { type: 'tester', name: 'pentest-validator' },
    ],
    topology: 'mesh',
  },
  {
    name: 'Code Review',
    description: 'Pair programming and review',
    agents: [
      { type: 'coder', name: 'reviewer-1' },
      { type: 'coder', name: 'reviewer-2' },
    ],
    topology: 'ring',
  },
]

const agentIcons: Record<AgentType, typeof Brain> = {
  coder: Code,
  researcher: Search,
  tester: TestTube,
  architect: Building,
  coordinator: Users,
  security: Shield,
}

const statusColors: Record<AgentStatus, string> = {
  idle: 'border-text-muted',
  active: 'border-accent-green',
  busy: 'border-accent-yellow',
  error: 'border-accent-red',
  terminated: 'border-text-muted opacity-50',
}

const statusBgColors: Record<AgentStatus, string> = {
  idle: 'bg-surface',
  active: 'bg-accent-green/10',
  busy: 'bg-accent-yellow/10',
  error: 'bg-accent-red/10',
  terminated: 'bg-surface opacity-50',
}

export function AgentCanvas() {
  const {
    agents,
    swarm,
    hiveMind,
    loading,
    selectedAgent,
    setAgents,
    setSwarm,
    setHiveMind,
    setLoading,
    setSelectedAgent,
  } = useAgentsStore()

  const [showSpawnModal, setShowSpawnModal] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [newAgentType, setNewAgentType] = useState<AgentType>('coder')
  const [newAgentName, setNewAgentName] = useState('')
  const [selectedTopology, setSelectedTopology] = useState<SwarmTopology>('mesh')
  const [taskDescription, setTaskDescription] = useState('')
  const [targetAgentId, setTargetAgentId] = useState<string | 'auto'>('auto')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [agentList, swarmStatus, hiveMindStatus] = await Promise.all([
        window.electron.invoke('agents:list'),
        window.electron.invoke('agents:swarmStatus'),
        window.electron.invoke('agents:hiveMindStatus'),
      ])
      setAgents(agentList)
      setSwarm(swarmStatus)
      setHiveMind(hiveMindStatus)
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoading(false)
    }
  }, [setAgents, setSwarm, setHiveMind, setLoading])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000) // Refresh every 15s
    return () => clearInterval(interval)
  }, [loadData])

  const handleSpawnAgent = async () => {
    if (!newAgentName) return

    try {
      await window.electron.invoke('agents:spawn', newAgentType, newAgentName)
      setShowSpawnModal(false)
      setNewAgentName('')
      loadData()
    } catch (error) {
      console.error('Failed to spawn agent:', error)
    }
  }

  const handleTerminateAgent = async (agentId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Terminate this agent?')) return

    try {
      await window.electron.invoke('agents:terminate', agentId)
      setSelectedAgent(null)
      loadData()
    } catch (error) {
      console.error('Failed to terminate agent:', error)
    }
  }

  const handleInitSwarm = async (topology: SwarmTopology = selectedTopology) => {
    try {
      await window.electron.invoke('agents:initSwarm', topology)
      loadData()
    } catch (error) {
      console.error('Failed to init swarm:', error)
    }
  }

  const handleSubmitTask = async () => {
    if (!taskDescription.trim()) return

    try {
      await window.electron.invoke('agents:submitTask', {
        description: taskDescription,
        targetAgent: targetAgentId === 'auto' ? undefined : targetAgentId,
      })
      setShowTaskModal(false)
      setTaskDescription('')
      setTargetAgentId('auto')
      loadData()
    } catch (error) {
      console.error('Failed to submit task:', error)
    }
  }

  const handleSpawnTemplate = async (template: AgentTemplate) => {
    try {
      // First init the swarm with the template's topology
      await window.electron.invoke('agents:initSwarm', template.topology)

      // Spawn all agents from the template
      for (const agent of template.agents) {
        await window.electron.invoke('agents:spawn', agent.type, agent.name)
      }

      setShowTemplatesModal(false)
      loadData()
    } catch (error) {
      console.error('Failed to spawn template:', error)
    }
  }

  const handleShutdownSwarm = async () => {
    // eslint-disable-next-line no-alert
    if (!confirm('Shutdown the swarm?')) return

    try {
      await window.electron.invoke('agents:shutdownSwarm')
      loadData()
    } catch (error) {
      console.error('Failed to shutdown swarm:', error)
    }
  }

  // Calculate canvas layout
  const canvasNodes = useMemo(() => {
    const nodes: {
      id: string
      type: 'agent' | 'queen' | 'swarm-center'
      x: number
      y: number
      agent?: Agent
    }[] = []

    const centerX = 400
    const centerY = 300
    const radius = 200

    // Add swarm center if active
    if (swarm?.status === 'active') {
      nodes.push({
        id: 'swarm-center',
        type: 'swarm-center',
        x: centerX,
        y: centerY,
      })
    }

    // Add hive-mind queen if active
    if (hiveMind?.queenId && hiveMind.status === 'active') {
      nodes.push({
        id: hiveMind.queenId,
        type: 'queen',
        x: centerX,
        y: centerY - 100,
        agent: agents.find((a) => a.id === hiveMind.queenId),
      })
    }

    // Arrange agents in a circle
    agents.forEach((agent, index) => {
      if (agent.id === hiveMind?.queenId) return // Skip queen (already added)

      const angle = (index / agents.length) * 2 * Math.PI - Math.PI / 2
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)

      nodes.push({
        id: agent.id,
        type: 'agent',
        x,
        y,
        agent,
      })
    })

    return nodes
  }, [agents, swarm, hiveMind])

  // Calculate connections
  const connections = useMemo(() => {
    const conns: { from: string; to: string; type: 'swarm' | 'hive' }[] = []

    // Swarm connections (all agents to center)
    if (swarm?.status === 'active') {
      agents.forEach((agent) => {
        if (agent.id !== hiveMind?.queenId) {
          conns.push({ from: agent.id, to: 'swarm-center', type: 'swarm' })
        }
      })
    }

    // Hive-mind connections (workers to queen)
    if (hiveMind?.queenId && hiveMind.status === 'active') {
      hiveMind.workers.forEach((workerId) => {
        conns.push({ from: workerId, to: hiveMind.queenId!, type: 'hive' })
      })
    }

    return conns
  }, [agents, swarm, hiveMind])

  const stats = {
    total: agents.length,
    active: agents.filter((a) => a.status === 'active').length,
    busy: agents.filter((a) => a.status === 'busy').length,
    errors: agents.filter((a) => a.status === 'error').length,
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

        {/* Task Assignment */}
        <button
          onClick={() => setShowTaskModal(true)}
          className="btn btn-secondary"
          disabled={agents.length === 0}
        >
          <Send className="w-4 h-4 mr-2" />
          Assign Task
        </button>

        <div className="flex-1" />

        <button onClick={loadData} className="btn btn-secondary">
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
              <svg className="w-full h-full">
                {/* Connection lines */}
                {connections.map((conn, i) => {
                  const from = canvasNodes.find((n) => n.id === conn.from)
                  const to = canvasNodes.find((n) => n.id === conn.to)
                  if (!from || !to) return null

                  return (
                    <line
                      key={i}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={conn.type === 'hive' ? '#cba6f7' : '#89b4fa'}
                      strokeWidth={2}
                      strokeDasharray={conn.type === 'swarm' ? '5,5' : undefined}
                      opacity={0.5}
                    />
                  )
                })}

                {/* Swarm center */}
                {canvasNodes
                  .filter((n) => n.type === 'swarm-center')
                  .map((node) => (
                    <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                      <circle r={30} fill="#89b4fa" opacity={0.2} />
                      <circle r={20} fill="#89b4fa" opacity={0.4} />
                      <circle r={10} fill="#89b4fa" />
                    </g>
                  ))}

                {/* Agent nodes */}
                {canvasNodes
                  .filter((n) => n.type === 'agent' || n.type === 'queen')
                  .map((node) => {
                    const agent = node.agent
                    if (!agent) return null

                    const Icon = agentIcons[agent.type] || Brain
                    const isQueen = node.type === 'queen'
                    const isSelected = selectedAgent?.id === agent.id

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className="cursor-pointer"
                        onClick={() => setSelectedAgent(isSelected ? null : agent)}
                      >
                        {/* Selection ring */}
                        {isSelected && (
                          <circle
                            r={45}
                            fill="none"
                            stroke="#cba6f7"
                            strokeWidth={2}
                            strokeDasharray="5,5"
                          />
                        )}

                        {/* Queen crown */}
                        {isQueen && (
                          <circle r={38} fill="#cba6f7" opacity={0.3} />
                        )}

                        {/* Agent circle */}
                        <circle
                          r={30}
                          className={cn(
                            'transition-colors',
                            statusBgColors[agent.status]
                          )}
                          fill="currentColor"
                          stroke={
                            agent.status === 'active'
                              ? '#a6e3a1'
                              : agent.status === 'busy'
                              ? '#f9e2af'
                              : agent.status === 'error'
                              ? '#f38ba8'
                              : '#6c7086'
                          }
                          strokeWidth={3}
                        />

                        {/* Agent icon - rendered as foreignObject */}
                        <foreignObject x={-12} y={-12} width={24} height={24}>
                          <div className="w-full h-full flex items-center justify-center text-text-primary">
                            {isQueen ? '👑' : <Icon className="w-5 h-5" />}
                          </div>
                        </foreignObject>

                        {/* Agent name */}
                        <text
                          y={45}
                          textAnchor="middle"
                          className="fill-text-primary text-xs font-medium"
                        >
                          {agent.name || agent.id.slice(0, 8)}
                        </text>

                        {/* Status indicator */}
                        {agent.status === 'busy' && (
                          <circle
                            cx={22}
                            cy={-22}
                            r={6}
                            fill="#f9e2af"
                            className="animate-pulse"
                          />
                        )}
                        {agent.status === 'error' && (
                          <circle cx={22} cy={-22} r={6} fill="#f38ba8" />
                        )}
                      </g>
                    )
                  })}
              </svg>
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

      {/* Spawn Modal */}
      {showSpawnModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Spawn Agent</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-muted mb-2 block">Agent Type</label>
                <select
                  value={newAgentType}
                  onChange={(e) => setNewAgentType(e.target.value as AgentType)}
                  className="input w-full"
                >
                  <option value="coder">Coder</option>
                  <option value="researcher">Researcher</option>
                  <option value="tester">Tester</option>
                  <option value="architect">Architect</option>
                  <option value="coordinator">Coordinator</option>
                  <option value="security">Security</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-text-muted mb-2 block">Agent Name</label>
                <input
                  type="text"
                  placeholder="e.g., code-assistant-1"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowSpawnModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleSpawnAgent} disabled={!newAgentName} className="btn btn-primary">
                Spawn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Assignment Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Send className="w-5 h-5 text-accent-blue" />
                Assign Task
              </h2>
              <button onClick={() => setShowTaskModal(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-muted mb-2 block">Task Description</label>
                <textarea
                  placeholder="Describe the task for the agent(s)..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="input w-full h-32 resize-none"
                  rows={4}
                />
              </div>

              <div>
                <label className="text-sm text-text-muted mb-2 block">Target Agent</label>
                <select
                  value={targetAgentId}
                  onChange={(e) => setTargetAgentId(e.target.value)}
                  className="input w-full"
                >
                  <option value="auto">Auto-route (best fit)</option>
                  {agents.filter(a => a.status !== 'terminated').map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name || agent.id} ({agent.type})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  {targetAgentId === 'auto'
                    ? 'The system will automatically route to the most suitable agent'
                    : 'Task will be assigned directly to the selected agent'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowTaskModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSubmitTask}
                disabled={!taskDescription.trim()}
                className="btn btn-primary"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Layers className="w-5 h-5 text-accent-purple" />
                Agent Templates
              </h2>
              <button onClick={() => setShowTemplatesModal(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-text-muted mb-4">
              Quick-start with pre-configured agent teams. Select a template to spawn all agents and initialize the swarm.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {agentTemplates.map((template) => {
                const TopologyIcon = topologyOptions.find(t => t.value === template.topology)?.icon || LayoutGrid
                return (
                  <div
                    key={template.name}
                    className="card p-4 hover:bg-surface/80 cursor-pointer transition-colors border border-border hover:border-accent-purple/50"
                    onClick={() => handleSpawnTemplate(template)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-text-primary">{template.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-text-muted">
                        <TopologyIcon className="w-3 h-3" />
                        {template.topology}
                      </div>
                    </div>
                    <p className="text-sm text-text-muted mb-3">{template.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {template.agents.map((agent, i) => {
                        const Icon = agentIcons[agent.type] || Brain
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-1 px-2 py-1 bg-surface rounded text-xs text-text-muted"
                          >
                            <Icon className="w-3 h-3" />
                            {agent.name}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowTemplatesModal(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StatCardProps {
  icon: typeof Brain
  value: number | string
  label: string
  color: string
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <Icon className={cn('w-5 h-5', color)} />
        <div>
          <p className="text-lg font-semibold text-text-primary">{value}</p>
          <p className="text-xs text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}

interface AgentDetailsProps {
  agent: Agent
  onTerminate: () => void
}

function AgentDetails({ agent, onTerminate }: AgentDetailsProps) {
  const Icon = agentIcons[agent.type] || Brain

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-3 rounded-lg', statusBgColors[agent.status])}>
          <Icon className="w-6 h-6 text-text-primary" />
        </div>
        <div>
          <p className="font-semibold text-text-primary">{agent.name || agent.id}</p>
          <p className="text-sm text-text-muted capitalize">{agent.type}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Status</span>
          <span className={cn('capitalize', statusColors[agent.status].replace('border-', 'text-'))}>
            {agent.status}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Health</span>
          <span className="text-text-primary">{(agent.health * 100).toFixed(0)}%</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Tasks</span>
          <span className="text-text-primary">{agent.taskCount}</span>
        </div>

        {agent.domain && (
          <div className="flex justify-between text-sm">
            <span className="text-text-muted">Domain</span>
            <span className="text-text-primary">{agent.domain}</span>
          </div>
        )}
      </div>

      {/* Health bar */}
      <div>
        <p className="text-xs text-text-muted mb-1">Health</p>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all',
              agent.health > 0.7 ? 'bg-accent-green' : agent.health > 0.3 ? 'bg-accent-yellow' : 'bg-accent-red'
            )}
            style={{ width: `${agent.health * 100}%` }}
          />
        </div>
      </div>

      <button
        onClick={onTerminate}
        className="w-full btn btn-secondary text-accent-red"
        disabled={agent.status === 'terminated'}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Terminate
      </button>
    </div>
  )
}
