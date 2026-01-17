/**
 * Beads Work Tracking Panel
 * In-app interface for managing beads (issues/tasks)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  ListTodo,
  Plus,
  CheckCircle,
  Circle,
  Clock,
  AlertCircle,
  Filter,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Tag,
  Calendar,
  Play,
  XCircle,
  Ban,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Bead, BeadStats, BeadStatus, BeadType, BeadPriority, BeadListFilter, BeadCreateParams } from '../../../shared/types'

type FilterStatus = BeadStatus | 'all'
type FilterPriority = BeadPriority | 'all'
type FilterType = BeadType | 'all'

const PRIORITY_COLORS: Record<BeadPriority, string> = {
  0: 'bg-accent-red/10 text-accent-red border-accent-red/30',
  1: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30',
  2: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
  3: 'bg-accent-purple/10 text-accent-purple border-accent-purple/30',
  4: 'bg-surface-hover text-text-muted border-border',
}

const TYPE_ICONS: Record<BeadType, typeof ListTodo> = {
  task: ListTodo,
  bug: AlertCircle,
  feature: Plus,
  epic: Tag,
}

const STATUS_CONFIG: Record<BeadStatus, { icon: typeof Circle; color: string; label: string }> = {
  open: { icon: Circle, color: 'text-text-muted', label: 'Open' },
  in_progress: { icon: Clock, color: 'text-accent-yellow', label: 'In Progress' },
  closed: { icon: CheckCircle, color: 'text-accent-green', label: 'Closed' },
}

export function BeadsPanel() {
  const [beads, setBeads] = useState<Bead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>('all')
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats] = useState<BeadStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    closed: 0,
    blocked: 0,
    ready: 0,
  })
  const [selectedBead, setSelectedBead] = useState<Bead | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Load beads using IPC
  const loadBeads = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Build filter
      const filter: BeadListFilter = {}
      if (statusFilter !== 'all') filter.status = statusFilter
      if (priorityFilter !== 'all') filter.priority = priorityFilter
      if (typeFilter !== 'all') filter.type = typeFilter
      if (searchQuery) filter.search = searchQuery

      // Fetch beads and stats in parallel
      const [beadsResult, statsResult] = await Promise.all([
        window.electron.invoke('beads:list', filter),
        window.electron.invoke('beads:stats'),
      ])

      setBeads(beadsResult)
      setStats(statsResult)
    } catch (err) {
      setError('Failed to load beads. Ensure beads is initialized in this project.')
      console.error('Beads load error:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter, typeFilter, searchQuery])

  useEffect(() => {
    loadBeads()
  }, [loadBeads])

  // Update bead status
  const handleStatusChange = async (beadId: string, newStatus: BeadStatus) => {
    setActionLoading(beadId)
    try {
      if (newStatus === 'closed') {
        await window.electron.invoke('beads:close', beadId)
      } else {
        await window.electron.invoke('beads:update', beadId, { status: newStatus })
      }
      await loadBeads()
    } catch (err) {
      console.error('Failed to update bead status:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // Create new bead
  const handleCreate = async (params: BeadCreateParams) => {
    setActionLoading('create')
    try {
      await window.electron.invoke('beads:create', params)
      setShowCreateModal(false)
      await loadBeads()
    } catch (err) {
      console.error('Failed to create bead:', err)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading && beads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            Work Tracking
          </h2>
          <p className="text-sm text-text-muted">Beads issue tracker</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-accent-purple text-white rounded-lg hover:bg-accent-purple/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
          <button
            onClick={loadBeads}
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="Total" value={stats.total} color="purple" />
        <StatCard label="Open" value={stats.open} color="blue" />
        <StatCard label="In Progress" value={stats.inProgress} color="yellow" />
        <StatCard label="Closed" value={stats.closed} color="green" />
        <StatCard label="Blocked" value={stats.blocked} color="red" />
        <StatCard label="Ready" value={stats.ready} color="emerald" />
      </div>

      {/* Quick Filters */}
      <div className="flex gap-2">
        <button
          onClick={async () => {
            const ready = await window.electron.invoke('beads:ready')
            setBeads(ready)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-green/10 text-accent-green rounded-lg hover:bg-accent-green/20 transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          Ready to Work
        </button>
        <button
          onClick={async () => {
            const blocked = await window.electron.invoke('beads:blocked')
            setBeads(blocked)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-red/10 text-accent-red rounded-lg hover:bg-accent-red/20 transition-colors"
        >
          <Ban className="w-3.5 h-3.5" />
          Blocked
        </button>
        <button
          onClick={loadBeads}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-surface-hover text-text-muted rounded-lg hover:bg-surface-hover/80 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          All
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search beads..."
              className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg
                         text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-accent-purple"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
              showFilters ? 'bg-accent-purple/10 text-accent-purple' : 'bg-surface-hover text-text-muted'
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 p-4 bg-surface rounded-lg border border-border">
            {/* Status Filter */}
            <div>
              <p className="text-xs text-text-muted mb-2">Status</p>
              <div className="flex gap-1">
                {(['all', 'open', 'in_progress', 'closed'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      statusFilter === status
                        ? 'bg-accent-purple text-white'
                        : 'bg-surface-hover text-text-muted hover:text-text-primary'
                    )}
                  >
                    {status === 'all' ? 'All' : status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div>
              <p className="text-xs text-text-muted mb-2">Priority</p>
              <div className="flex gap-1">
                {(['all', 0, 1, 2, 3, 4] as const).map(priority => (
                  <button
                    key={priority}
                    onClick={() => setPriorityFilter(priority)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      priorityFilter === priority
                        ? 'bg-accent-purple text-white'
                        : 'bg-surface-hover text-text-muted hover:text-text-primary'
                    )}
                  >
                    {priority === 'all' ? 'All' : `P${priority}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <p className="text-xs text-text-muted mb-2">Type</p>
              <div className="flex gap-1">
                {(['all', 'task', 'bug', 'feature', 'epic'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors capitalize',
                      typeFilter === type
                        ? 'bg-accent-purple text-white'
                        : 'bg-surface-hover text-text-muted hover:text-text-primary'
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {/* Beads List */}
      <div className="space-y-2">
        {beads.map(bead => (
          <BeadCard
            key={bead.id}
            bead={bead}
            isLoading={actionLoading === bead.id}
            onStatusChange={handleStatusChange}
            onSelect={() => setSelectedBead(bead)}
          />
        ))}

        {beads.length === 0 && !error && (
          <div className="text-center py-12">
            <ListTodo className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted">
              {searchQuery || statusFilter !== 'all' || priorityFilter !== 'all' || typeFilter !== 'all'
                ? 'No beads match your filters'
                : 'No beads found'}
            </p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateBeadModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          isLoading={actionLoading === 'create'}
        />
      )}

      {/* Detail Modal */}
      {selectedBead && (
        <BeadDetailModal
          bead={selectedBead}
          onClose={() => setSelectedBead(null)}
          onStatusChange={handleStatusChange}
          isLoading={actionLoading === selectedBead.id}
        />
      )}
    </div>
  )
}

interface BeadCardProps {
  bead: Bead
  isLoading: boolean
  onStatusChange: (id: string, status: BeadStatus) => void
  onSelect: () => void
}

function BeadCard({ bead, isLoading, onStatusChange, onSelect }: BeadCardProps) {
  const StatusIcon = STATUS_CONFIG[bead.status].icon
  const TypeIcon = TYPE_ICONS[bead.type]

  return (
    <div
      className="card p-4 hover:border-border-hover transition-colors cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon / Loading */}
        <div className={cn('mt-0.5', STATUS_CONFIG[bead.status].color)}>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <StatusIcon className="w-5 h-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-text-muted">{bead.id}</span>
            <span className={cn(
              'px-1.5 py-0.5 text-xs rounded border',
              PRIORITY_COLORS[bead.priority]
            )}>
              P{bead.priority}
            </span>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <TypeIcon className="w-3 h-3" />
              {bead.type}
            </span>
          </div>

          <h3 className="font-medium text-text-primary truncate">{bead.title}</h3>

          <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {bead.updated}
            </span>
            {bead.assignee && (
              <span>Assigned: {bead.assignee}</span>
            )}
            {bead.blockedBy && bead.blockedBy.length > 0 && (
              <span className="text-accent-red">
                Blocked by {bead.blockedBy.length}
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {bead.status === 'open' && (
            <button
              onClick={() => onStatusChange(bead.id, 'in_progress')}
              className="p-1.5 text-text-muted hover:text-accent-yellow hover:bg-accent-yellow/10 rounded transition-colors"
              title="Start"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          {bead.status === 'in_progress' && (
            <button
              onClick={() => onStatusChange(bead.id, 'closed')}
              className="p-1.5 text-text-muted hover:text-accent-green hover:bg-accent-green/10 rounded transition-colors"
              title="Complete"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          {bead.status !== 'closed' && (
            <button
              onClick={() => onStatusChange(bead.id, 'closed')}
              className="p-1.5 text-text-muted hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
              title="Close"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  color: 'purple' | 'blue' | 'yellow' | 'green' | 'red' | 'emerald'
}

function StatCard({ label, value, color }: StatCardProps) {
  const colorClasses = {
    purple: 'text-accent-purple',
    blue: 'text-accent-blue',
    yellow: 'text-accent-yellow',
    green: 'text-accent-green',
    red: 'text-accent-red',
    emerald: 'text-emerald-400',
  }

  return (
    <div className="card p-3 text-center">
      <p className={cn('text-2xl font-bold', colorClasses[color])}>{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  )
}

interface CreateBeadModalProps {
  onClose: () => void
  onCreate: (params: BeadCreateParams) => void
  isLoading: boolean
}

function CreateBeadModal({ onClose, onCreate, isLoading }: CreateBeadModalProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<BeadType>('task')
  const [priority, setPriority] = useState<BeadPriority>(2)
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onCreate({
      title: title.trim(),
      type,
      priority,
      description: description.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Create New Bead</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-purple"
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-text-muted mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BeadType)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-purple"
              >
                <option value="task">Task</option>
                <option value="bug">Bug</option>
                <option value="feature">Feature</option>
                <option value="epic">Epic</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-text-muted mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) as BeadPriority)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-purple"
              >
                <option value={0}>P0 - Critical</option>
                <option value={1}>P1 - High</option>
                <option value={2}>P2 - Medium</option>
                <option value={3}>P3 - Low</option>
                <option value={4}>P4 - Backlog</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-purple resize-none"
              placeholder="Additional details..."
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isLoading}
              className="px-4 py-2 bg-accent-purple text-white rounded-lg hover:bg-accent-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface BeadDetailModalProps {
  bead: Bead
  onClose: () => void
  onStatusChange: (id: string, status: BeadStatus) => void
  isLoading: boolean
}

function BeadDetailModal({ bead, onClose, onStatusChange, isLoading }: BeadDetailModalProps) {
  const StatusIcon = STATUS_CONFIG[bead.status].icon
  const TypeIcon = TYPE_ICONS[bead.type]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-text-muted">{bead.id}</span>
            <span className={cn(
              'px-1.5 py-0.5 text-xs rounded border',
              PRIORITY_COLORS[bead.priority]
            )}>
              P{bead.priority}
            </span>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <TypeIcon className="w-3 h-3" />
              {bead.type}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <h2 className="text-xl font-semibold text-text-primary mb-4">{bead.title}</h2>

        {bead.description && (
          <p className="text-text-secondary mb-4">{bead.description}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-text-muted mb-6">
          <span className={cn('flex items-center gap-1', STATUS_CONFIG[bead.status].color)}>
            <StatusIcon className="w-4 h-4" />
            {STATUS_CONFIG[bead.status].label}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Updated: {bead.updated}
          </span>
        </div>

        {(bead.blockedBy && bead.blockedBy.length > 0) && (
          <div className="mb-4">
            <p className="text-sm text-text-muted mb-2">Blocked by:</p>
            <div className="flex flex-wrap gap-2">
              {bead.blockedBy.map(id => (
                <span key={id} className="px-2 py-1 text-xs bg-accent-red/10 text-accent-red rounded">
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {(bead.blocks && bead.blocks.length > 0) && (
          <div className="mb-4">
            <p className="text-sm text-text-muted mb-2">Blocks:</p>
            <div className="flex flex-wrap gap-2">
              {bead.blocks.map(id => (
                <span key={id} className="px-2 py-1 text-xs bg-accent-yellow/10 text-accent-yellow rounded">
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          {bead.status === 'open' && (
            <button
              onClick={() => onStatusChange(bead.id, 'in_progress')}
              disabled={isLoading}
              className="px-4 py-2 bg-accent-yellow/10 text-accent-yellow rounded-lg hover:bg-accent-yellow/20 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start Work
            </button>
          )}
          {bead.status === 'in_progress' && (
            <button
              onClick={() => onStatusChange(bead.id, 'closed')}
              disabled={isLoading}
              className="px-4 py-2 bg-accent-green/10 text-accent-green rounded-lg hover:bg-accent-green/20 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Mark Complete
            </button>
          )}
          {bead.status !== 'closed' && (
            <button
              onClick={() => onStatusChange(bead.id, 'closed')}
              disabled={isLoading}
              className="px-4 py-2 text-text-muted hover:text-accent-red hover:bg-accent-red/10 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
