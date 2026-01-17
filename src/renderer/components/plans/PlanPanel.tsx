import { useCallback, useEffect, useState } from 'react'
import {
  ListTodo,
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Code,
  Search,
  Eye,
  FileEdit,
  TestTube2,
  User,
  BarChart3,
  TrendingUp,
  Zap,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  Plan,
  PlanStep,
  PlanStatus,
  StepStatus,
  StepType,
  PlanExecutionStats,
  PlanCreateParams,
} from '@shared/types'

// Status colors
const statusColors: Record<PlanStatus, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  ready: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  executing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  paused: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
}

const stepStatusColors: Record<StepStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  skipped: 'text-gray-500',
}

const stepTypeIcons: Record<StepType, typeof Terminal> = {
  shell: Terminal,
  code: Code,
  research: Search,
  review: Eye,
  test: TestTube2,
  manual: User,
}

// Format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
}

interface PlanPanelProps {
  projectPath?: string
}

export function PlanPanel({ projectPath }: PlanPanelProps) {
  // State
  const [plans, setPlans] = useState<Plan[]>([])
  const [stats, setStats] = useState<PlanExecutionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [plansData, statsData] = await Promise.all([
        window.electron.invoke('plans:list', projectPath),
        window.electron.invoke('plans:stats'),
      ])
      setPlans(plansData)
      setStats(statsData)
    } catch (error) {
      console.error('Failed to load plans:', error)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    loadData()

    // Listen for plan updates
    const unsubscribe = window.electron.on('plan:updated', (plan: Plan) => {
      setPlans(prev => {
        const index = prev.findIndex(p => p.id === plan.id)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = plan
          return updated
        }
        return [...prev, plan]
      })
      if (selectedPlan?.id === plan.id) {
        setSelectedPlan(plan)
      }
    })

    return () => unsubscribe()
  }, [loadData, selectedPlan?.id])

  // Plan actions
  const handleExecute = useCallback(async (id: string) => {
    await window.electron.invoke('plans:execute', id)
  }, [])

  const handlePause = useCallback(async (id: string) => {
    await window.electron.invoke('plans:pause', id)
  }, [])

  const handleResume = useCallback(async (id: string) => {
    await window.electron.invoke('plans:resume', id)
  }, [])

  const handleCancel = useCallback(async (id: string) => {
    await window.electron.invoke('plans:cancel', id)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await window.electron.invoke('plans:delete', id)
    loadData()
    if (selectedPlan?.id === id) {
      setSelectedPlan(null)
    }
  }, [loadData, selectedPlan?.id])

  const handleStepComplete = useCallback(async (planId: string, stepId: string) => {
    await window.electron.invoke('plans:stepComplete', planId, stepId, 'Manually completed')
  }, [])

  // Toggle step expansion
  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-purple/20">
            <ListTodo className="w-5 h-5 text-accent-purple" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Autonomous Plans</h2>
            <p className="text-sm text-text-muted">
              Create and execute multi-step task plans
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-purple text-white hover:bg-accent-purple/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Plan
          </button>
          <button
            onClick={loadData}
            className="p-2 hover:bg-surface rounded-lg transition-colors text-text-muted hover:text-text-primary"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent-purple" />
            <span className="text-sm text-text-muted">Total:</span>
            <span className="text-sm font-medium text-text-primary">{stats.totalPlans}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-sm text-text-muted">Success:</span>
            <span className="text-sm font-medium text-text-primary">
              {(stats.successRate * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-text-muted">Steps:</span>
            <span className="text-sm font-medium text-text-primary">{stats.totalStepsExecuted}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent-blue" />
            <span className="text-sm text-text-muted">Avg:</span>
            <span className="text-sm font-medium text-text-primary">
              {formatDuration(stats.avgDuration)}
            </span>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Plan list */}
        <div className="w-80 border-r border-border overflow-y-auto">
          {plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <ListTodo className="w-12 h-12 text-text-muted/50 mb-3" />
              <p className="text-text-muted">No plans created yet</p>
              <p className="text-sm text-text-muted/70 mt-1">
                Create a new plan to start automating tasks
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-colors',
                    selectedPlan?.id === plan.id
                      ? 'border-accent-purple bg-accent-purple/10'
                      : 'border-border hover:border-accent-purple/50 hover:bg-surface'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-text-primary truncate">
                      {plan.title}
                    </span>
                    <span className={cn(
                      'px-2 py-0.5 rounded-md text-xs border',
                      statusColors[plan.status]
                    )}>
                      {plan.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>{plan.steps.length} steps</span>
                    <span>
                      {plan.steps.filter(s => s.status === 'completed').length}/{plan.steps.length} done
                    </span>
                  </div>
                  {plan.status === 'executing' && (
                    <div className="mt-2 h-1 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-purple transition-all"
                        style={{
                          width: `${(plan.steps.filter(s => s.status === 'completed').length / plan.steps.length) * 100}%`
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan details */}
        <div className="flex-1 overflow-y-auto">
          {selectedPlan ? (
            <div className="p-4 space-y-4">
              {/* Plan header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{selectedPlan.title}</h3>
                  <p className="text-sm text-text-muted">{selectedPlan.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedPlan.status === 'draft' || selectedPlan.status === 'ready' ? (
                    <button
                      onClick={() => handleExecute(selectedPlan.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Execute
                    </button>
                  ) : selectedPlan.status === 'executing' ? (
                    <button
                      onClick={() => handlePause(selectedPlan.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
                    >
                      <Pause className="w-4 h-4" />
                      Pause
                    </button>
                  ) : selectedPlan.status === 'paused' ? (
                    <button
                      onClick={() => handleResume(selectedPlan.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Resume
                    </button>
                  ) : null}

                  {(selectedPlan.status === 'executing' || selectedPlan.status === 'paused') && (
                    <button
                      onClick={() => handleCancel(selectedPlan.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                    >
                      <Square className="w-4 h-4" />
                      Cancel
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(selectedPlan.id)}
                    className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Error display */}
              {selectedPlan.error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{selectedPlan.error}</p>
                </div>
              )}

              {/* Steps */}
              <div className="space-y-2">
                <h4 className="font-medium text-text-primary">Steps</h4>
                {selectedPlan.steps.map((step, index) => {
                  const StepIcon = stepTypeIcons[step.type]
                  const isExpanded = expandedSteps.has(step.id)

                  return (
                    <div
                      key={step.id}
                      className="border border-border rounded-lg overflow-hidden"
                    >
                      <div
                        onClick={() => toggleStep(step.id)}
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-surface/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-text-muted" />
                          )}
                          <span className="text-sm text-text-muted">{index + 1}</span>
                        </div>

                        <div className={cn('p-1.5 rounded', stepStatusColors[step.status])}>
                          {step.status === 'running' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : step.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : step.status === 'failed' ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <StepIcon className="w-4 h-4" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-text-primary truncate">{step.name}</p>
                          <p className="text-xs text-text-muted truncate">{step.description}</p>
                        </div>

                        {step.status === 'running' && step.type === 'manual' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStepComplete(selectedPlan.id, step.id)
                            }}
                            className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                          >
                            Mark Done
                          </button>
                        )}

                        {step.completedAt && step.startedAt && (
                          <span className="text-xs text-text-muted">
                            {formatDuration(step.completedAt - step.startedAt)}
                          </span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border p-3 bg-surface/30 space-y-2">
                          {step.command && (
                            <div>
                              <p className="text-xs text-text-muted mb-1">Command:</p>
                              <code className="block text-xs bg-background p-2 rounded font-mono text-text-primary">
                                {step.command}
                              </code>
                            </div>
                          )}
                          {step.output && (
                            <div>
                              <p className="text-xs text-text-muted mb-1">Output:</p>
                              <pre className="text-xs bg-background p-2 rounded font-mono text-text-primary whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {step.output}
                              </pre>
                            </div>
                          )}
                          {step.error && (
                            <div>
                              <p className="text-xs text-red-400 mb-1">Error:</p>
                              <pre className="text-xs bg-red-500/10 p-2 rounded font-mono text-red-400 whitespace-pre-wrap">
                                {step.error}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Timing info */}
              {selectedPlan.startedAt && (
                <div className="text-sm text-text-muted space-y-1">
                  <p>Started: {new Date(selectedPlan.startedAt).toLocaleString()}</p>
                  {selectedPlan.completedAt && (
                    <p>
                      Completed: {new Date(selectedPlan.completedAt).toLocaleString()}
                      {' '}
                      ({formatDuration(selectedPlan.totalDuration || 0)})
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileEdit className="w-12 h-12 text-text-muted/50 mb-3" />
              <p className="text-text-muted">Select a plan to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreatePlanModal
          projectPath={projectPath || ''}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  )
}

// Create plan modal
interface CreatePlanModalProps {
  projectPath: string
  onClose: () => void
  onCreated: () => void
}

function CreatePlanModal({ projectPath, onClose, onCreated }: CreatePlanModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<Array<{ name: string; description: string; type: StepType; command?: string }>>([
    { name: '', description: '', type: 'shell' }
  ])
  const [creating, setCreating] = useState(false)

  const addStep = () => {
    setSteps([...steps, { name: '', description: '', type: 'shell' }])
  }

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index))
  }

  const updateStep = (index: number, field: string, value: string) => {
    const updated = [...steps]
    updated[index] = { ...updated[index], [field]: value }
    setSteps(updated)
  }

  const handleCreate = async () => {
    if (!title || steps.some(s => !s.name)) return

    setCreating(true)
    try {
      const params: PlanCreateParams = {
        title,
        description,
        projectPath,
        steps: steps.map(s => ({
          name: s.name,
          description: s.description,
          type: s.type,
          command: s.command,
        })),
      }
      await window.electron.invoke('plans:create', params)
      onCreated()
      onClose()
    } catch (error) {
      console.error('Failed to create plan:', error)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-xl p-6 w-[600px] max-h-[80vh] overflow-y-auto space-y-4">
        <h3 className="text-lg font-semibold text-text-primary">Create New Plan</h3>

        <div>
          <label className="text-sm text-text-muted mb-1 block">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Plan title"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-purple"
          />
        </div>

        <div>
          <label className="text-sm text-text-muted mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this plan accomplish?"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-purple resize-none"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-text-muted">Steps</label>
            <button
              onClick={addStep}
              className="flex items-center gap-1 text-sm text-accent-purple hover:text-accent-purple/80"
            >
              <Plus className="w-4 h-4" />
              Add Step
            </button>
          </div>

          {steps.map((step, index) => (
            <div key={index} className="p-3 bg-surface rounded-lg border border-border space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted w-6">{index + 1}.</span>
                <input
                  type="text"
                  value={step.name}
                  onChange={(e) => updateStep(index, 'name', e.target.value)}
                  placeholder="Step name"
                  className="flex-1 px-2 py-1 rounded bg-background border border-border text-sm text-text-primary"
                />
                <select
                  value={step.type}
                  onChange={(e) => updateStep(index, 'type', e.target.value)}
                  className="px-2 py-1 rounded bg-background border border-border text-sm text-text-primary"
                >
                  <option value="shell">Shell</option>
                  <option value="code">Code</option>
                  <option value="research">Research</option>
                  <option value="review">Review</option>
                  <option value="test">Test</option>
                  <option value="manual">Manual</option>
                </select>
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(index)}
                    className="p-1 text-text-muted hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={step.description}
                onChange={(e) => updateStep(index, 'description', e.target.value)}
                placeholder="Step description"
                className="w-full px-2 py-1 rounded bg-background border border-border text-sm text-text-primary"
              />
              {step.type === 'shell' && (
                <input
                  type="text"
                  value={step.command || ''}
                  onChange={(e) => updateStep(index, 'command', e.target.value)}
                  placeholder="Command to execute"
                  className="w-full px-2 py-1 rounded bg-background border border-border text-sm text-text-primary font-mono"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-text-muted hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !title || steps.some(s => !s.name)}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              creating || !title || steps.some(s => !s.name)
                ? 'bg-surface text-text-muted cursor-not-allowed'
                : 'bg-accent-purple text-white hover:bg-accent-purple/80'
            )}
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
