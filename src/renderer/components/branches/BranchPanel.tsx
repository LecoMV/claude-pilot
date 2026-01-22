/**
 * Conversation Branch Panel
 * Git-like branching visualization and management for conversations
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  GitBranch,
  GitMerge,
  GitCommit,
  Plus,
  ArrowRightLeft,
  AlertCircle,
  Archive,
  Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import type { ConversationBranch, BranchDiff, BranchStats, ExternalSession } from '@shared/types'

interface BranchPanelProps {
  session?: ExternalSession
}

// Custom node for branch visualization
function BranchNode({
  data,
}: {
  data: {
    label: string
    status: string
    messageCount: number
    isActive: boolean
    isMain: boolean
    onSwitch: () => void
    onRename: () => void
    onDelete: () => void
    onAbandon: () => void
  }
}) {
  const statusColors = {
    active: 'border-accent-green bg-accent-green/10',
    merged: 'border-accent-blue bg-accent-blue/10',
    abandoned: 'border-text-muted bg-surface',
  }

  const statusIcons = {
    active: <GitBranch className="w-3 h-3" />,
    merged: <GitMerge className="w-3 h-3" />,
    abandoned: <Archive className="w-3 h-3" />,
  }

  return (
    <div
      className={cn(
        'p-3 rounded-lg border-2 min-w-[140px] transition-all',
        statusColors[data.status as keyof typeof statusColors] || statusColors.active,
        data.isActive && 'ring-2 ring-accent-purple ring-offset-2 ring-offset-background'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {statusIcons[data.status as keyof typeof statusIcons]}
        <span className="font-medium text-sm text-text-primary truncate max-w-[100px]">
          {data.label}
        </span>
        {data.isMain && (
          <span className="text-[10px] px-1.5 py-0.5 bg-accent-purple/20 text-accent-purple rounded">
            main
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{data.messageCount} messages</span>
        {data.status === 'active' && !data.isActive && (
          <button onClick={data.onSwitch} className="text-accent-blue hover:underline">
            switch
          </button>
        )}
      </div>
    </div>
  )
}

const nodeTypes = {
  branch: BranchNode,
}

export function BranchPanel({ session }: BranchPanelProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDiffModal, setShowDiffModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [_selectedBranch, setSelectedBranch] = useState<ConversationBranch | null>(null)
  const [diffResult, setDiffResult] = useState<BranchDiff | null>(null)

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // tRPC queries
  const branchesQuery = trpc.branches.list.useQuery(
    { sessionId: session?.id ?? '' },
    { enabled: !!session?.id }
  )
  const statsQuery = trpc.branches.stats.useQuery(
    { sessionId: session?.id },
    { enabled: !!session?.id }
  )
  const activeBranchQuery = trpc.branches.getActiveBranch.useQuery(
    { sessionId: session?.id ?? '' },
    { enabled: !!session?.id }
  )

  // tRPC mutations
  const switchMutation = trpc.branches.switch.useMutation()
  const deleteMutation = trpc.branches.delete.useMutation()
  const abandonMutation = trpc.branches.abandon.useMutation()
  const createMutation = trpc.branches.create.useMutation()
  const mergeMutation = trpc.branches.merge.useMutation()

  // tRPC utils for imperative queries
  const trpcUtils = trpc.useUtils()

  // Derived state - use useMemo to avoid reference changes
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const stats: BranchStats | null = statsQuery.data ?? null
  const activeBranchId = activeBranchQuery.data ?? null
  const loading = branchesQuery.isLoading
  const error = branchesQuery.error?.message ?? null

  // Refetch helper
  const refetchAll = useCallback(() => {
    branchesQuery.refetch()
    statsQuery.refetch()
    activeBranchQuery.refetch()
  }, [branchesQuery, statsQuery, activeBranchQuery])

  // Build React Flow graph from branches - wrapped in useCallback
  const buildGraph = useCallback(
    (branchList: ConversationBranch[], activeId: string | null) => {
      if (branchList.length === 0) {
        setNodes([])
        setEdges([])
        return
      }

      const newNodes: Node[] = []
      const newEdges: Edge[] = []

      // Calculate positions using tree layout
      const branchMap = new Map(branchList.map((b) => [b.id, b]))
      const processed = new Set<string>()
      let yOffset = 0

      function processNode(branchId: string, x: number, level: number) {
        if (processed.has(branchId)) return
        processed.add(branchId)

        const branch = branchMap.get(branchId)
        if (!branch) return

        const y = yOffset * 120
        yOffset++

        newNodes.push({
          id: branch.id,
          type: 'branch',
          position: { x: level * 200, y },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: branch.name,
            status: branch.status,
            messageCount: branch.messages.length,
            isActive: branch.id === activeId,
            isMain: branch.parentBranchId === null,
            onSwitch: () => handleSwitch(branch.id),
            onRename: () => handleRename(branch),
            onDelete: () => handleDelete(branch.id),
            onAbandon: () => handleAbandon(branch.id),
          },
        })

        // Add edge from parent
        if (branch.parentBranchId) {
          newEdges.push({
            id: `${branch.parentBranchId}-${branch.id}`,
            source: branch.parentBranchId,
            target: branch.id,
            type: 'smoothstep',
            animated: branch.status === 'active',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: branch.status === 'merged' ? '#89b4fa' : '#6c7086',
            },
            style: {
              stroke: branch.status === 'merged' ? '#89b4fa' : '#3d3d5c',
              strokeWidth: 2,
            },
          })
        }

        // Process children
        const children = branchList.filter((b) => b.parentBranchId === branchId)
        for (const child of children) {
          processNode(child.id, x + 200, level + 1)
        }
      }

      // Start with main branch
      const mainBranch = branchList.find((b) => b.parentBranchId === null)
      if (mainBranch) {
        processNode(mainBranch.id, 0, 0)
      }

      setNodes(newNodes)
      setEdges(newEdges)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Build graph when branches or active branch changes
  useEffect(() => {
    if (branches.length > 0) {
      buildGraph(branches, activeBranchId)
    }
  }, [branches, activeBranchId, buildGraph])

  // Handlers using tRPC mutations
  const handleSwitch = async (branchId: string) => {
    try {
      await switchMutation.mutateAsync({ branchId })
      refetchAll()
    } catch (err) {
      console.error('Failed to switch branch:', err)
    }
  }

  const handleRename = (branch: ConversationBranch) => {
    setSelectedBranch(branch)
    // Could show a modal for renaming
  }

  const handleDelete = async (branchId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Delete this branch? This cannot be undone.')) return

    try {
      await deleteMutation.mutateAsync({ branchId })
      refetchAll()
    } catch (err) {
      console.error('Failed to delete branch:', err)
    }
  }

  const handleAbandon = async (branchId: string) => {
    try {
      await abandonMutation.mutateAsync({ branchId })
      refetchAll()
    } catch (err) {
      console.error('Failed to abandon branch:', err)
    }
  }

  const handleCreateBranch = async (name: string, description?: string) => {
    if (!session || !activeBranchId) return

    const activeBranch = branches.find((b) => b.id === activeBranchId)
    if (!activeBranch) return

    // Use last message as branch point
    const lastMessage = activeBranch.messages[activeBranch.messages.length - 1]
    const branchPointId = lastMessage?.id || activeBranch.branchPointMessageId

    try {
      await createMutation.mutateAsync({
        sessionId: session.id,
        branchPointMessageId: branchPointId,
        name,
        description,
      })
      setShowCreateModal(false)
      refetchAll()
    } catch (err) {
      console.error('Failed to create branch:', err)
    }
  }

  const handleDiff = async (branchA: string, branchB: string) => {
    // For diff, we'll query imperatively since it's a one-off action
    try {
      const diff = await trpcUtils.branches.diff.fetch({ branchA, branchB })
      setDiffResult(diff)
      setShowDiffModal(true)
    } catch (err) {
      console.error('Failed to diff branches:', err)
    }
  }

  const handleMerge = async (
    sourceBranchId: string,
    targetBranchId: string,
    strategy: 'replace' | 'append' | 'cherry-pick'
  ) => {
    try {
      await mergeMutation.mutateAsync({
        sourceBranchId,
        targetBranchId,
        strategy,
      })
      setShowMergeModal(false)
      refetchAll()
    } catch (err) {
      console.error('Failed to merge branches:', err)
    }
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-muted">
        <GitBranch className="w-12 h-12 mb-4 opacity-50" />
        <p>Select a session to view branches</p>
      </div>
    )
  }

  if (loading && branches.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-purple" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-accent-purple" />
            <h2 className="text-lg font-semibold text-text-primary">Conversation Branches</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDiffModal(true)}
              className="btn btn-secondary btn-sm"
              disabled={branches.length < 2}
              title="Compare branches"
            >
              <ArrowRightLeft className="w-4 h-4 mr-1" />
              Diff
            </button>

            <button
              onClick={() => setShowMergeModal(true)}
              className="btn btn-secondary btn-sm"
              disabled={branches.length < 2}
              title="Merge branches"
            >
              <GitMerge className="w-4 h-4 mr-1" />
              Merge
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary btn-sm"
              title="Create new branch"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Branch
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <span className="flex items-center gap-1">
              <GitBranch className="w-4 h-4" />
              {stats.totalBranches} total
            </span>
            <span className="flex items-center gap-1 text-accent-green">
              <Play className="w-4 h-4" />
              {stats.activeBranches} active
            </span>
            <span className="flex items-center gap-1 text-accent-blue">
              <GitMerge className="w-4 h-4" />
              {stats.mergedBranches} merged
            </span>
            <span className="flex items-center gap-1">
              <Archive className="w-4 h-4" />
              {stats.abandonedBranches} abandoned
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-accent-red flex-shrink-0 mt-0.5" />
            <p className="text-sm text-accent-red">{error}</p>
          </div>
        )}
      </div>

      {/* Branch Graph */}
      <div className="flex-1 relative">
        {branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <GitCommit className="w-12 h-12 mb-4 opacity-50" />
            <p className="mb-2">No branches yet</p>
            <p className="text-sm">Create a branch to explore different conversation paths</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#3d3d5c" gap={20} />
            <Controls className="bg-surface border border-border rounded-lg" />
            <MiniMap
              className="bg-surface border border-border rounded-lg"
              nodeColor={(node) => {
                if (node.data.isActive) return '#cba6f7'
                if (node.data.status === 'merged') return '#89b4fa'
                if (node.data.status === 'abandoned') return '#6c7086'
                return '#a6e3a1'
              }}
            />
          </ReactFlow>
        )}
      </div>

      {/* Create Branch Modal */}
      {showCreateModal && (
        <CreateBranchModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateBranch}
        />
      )}

      {/* Diff Modal */}
      {showDiffModal && (
        <DiffModal
          branches={branches}
          diff={diffResult}
          onClose={() => {
            setShowDiffModal(false)
            setDiffResult(null)
          }}
          onCompare={handleDiff}
        />
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <MergeModal
          branches={branches.filter((b) => b.status === 'active')}
          onClose={() => setShowMergeModal(false)}
          onMerge={handleMerge}
        />
      )}
    </div>
  )
}

// Create Branch Modal
function CreateBranchModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, description?: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), description.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Create Branch</h3>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Branch Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., alternative-approach"
                className="input w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What are you exploring in this branch?"
                className="input w-full h-20 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Create Branch
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Diff Modal
function DiffModal({
  branches,
  diff,
  onClose,
  onCompare,
}: {
  branches: ConversationBranch[]
  diff: BranchDiff | null
  onClose: () => void
  onCompare: (branchA: string, branchB: string) => void
}) {
  const [branchA, setBranchA] = useState(branches[0]?.id || '')
  const [branchB, setBranchB] = useState(branches[1]?.id || '')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Compare Branches</h3>

        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm text-text-muted mb-1">Branch A</label>
            <select
              value={branchA}
              onChange={(e) => setBranchA(e.target.value)}
              className="input w-full"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm text-text-muted mb-1">Branch B</label>
            <select
              value={branchB}
              onChange={(e) => setBranchB(e.target.value)}
              className="input w-full"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onCompare(branchA, branchB)}
            className="btn btn-primary self-end"
            disabled={branchA === branchB}
          >
            Compare
          </button>
        </div>

        {diff && (
          <div className="flex-1 overflow-auto border border-border rounded-lg">
            <div className="grid grid-cols-2 gap-0 divide-x divide-border">
              <div className="p-4">
                <h4 className="text-sm font-medium text-text-primary mb-2">
                  Only in {branches.find((b) => b.id === diff.branchA)?.name}
                </h4>
                <div className="space-y-2">
                  {diff.messagesOnlyInA.length === 0 ? (
                    <p className="text-sm text-text-muted">No unique messages</p>
                  ) : (
                    diff.messagesOnlyInA.map((msg) => (
                      <div key={msg.id} className="p-2 bg-accent-red/10 rounded text-sm">
                        <span className="text-text-muted text-xs">{msg.role}</span>
                        <p className="text-text-primary truncate">
                          {msg.content.substring(0, 100)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4">
                <h4 className="text-sm font-medium text-text-primary mb-2">
                  Only in {branches.find((b) => b.id === diff.branchB)?.name}
                </h4>
                <div className="space-y-2">
                  {diff.messagesOnlyInB.length === 0 ? (
                    <p className="text-sm text-text-muted">No unique messages</p>
                  ) : (
                    diff.messagesOnlyInB.map((msg) => (
                      <div key={msg.id} className="p-2 bg-accent-green/10 rounded text-sm">
                        <span className="text-text-muted text-xs">{msg.role}</span>
                        <p className="text-text-primary truncate">
                          {msg.content.substring(0, 100)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Merge Modal
function MergeModal({
  branches,
  onClose,
  onMerge,
}: {
  branches: ConversationBranch[]
  onClose: () => void
  onMerge: (
    sourceBranchId: string,
    targetBranchId: string,
    strategy: 'replace' | 'append' | 'cherry-pick'
  ) => void
}) {
  const [source, setSource] = useState(branches[0]?.id || '')
  const [target, setTarget] = useState(branches.find((b) => b.parentBranchId === null)?.id || '')
  const [strategy, setStrategy] = useState<'replace' | 'append' | 'cherry-pick'>('append')

  const handleMerge = () => {
    if (source === target) return
    onMerge(source, target, strategy)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Merge Branch</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Source Branch</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="input w-full"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center">
            <GitMerge className="w-6 h-6 text-text-muted" />
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">Target Branch</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="input w-full"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-2">Merge Strategy</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={strategy === 'append'}
                  onChange={() => setStrategy('append')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm text-text-primary">Append</p>
                  <p className="text-xs text-text-muted">
                    Add source messages after target messages
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={strategy === 'replace'}
                  onChange={() => setStrategy('replace')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm text-text-primary">Replace</p>
                  <p className="text-xs text-text-muted">
                    Replace target messages with source messages
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={strategy === 'cherry-pick'}
                  onChange={() => setStrategy('cherry-pick')}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm text-text-primary">Cherry-pick</p>
                  <p className="text-xs text-text-muted">Select specific messages to merge</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={handleMerge} className="btn btn-primary" disabled={source === target}>
            <GitMerge className="w-4 h-4 mr-1" />
            Merge
          </button>
        </div>
      </div>
    </div>
  )
}

export default BranchPanel
