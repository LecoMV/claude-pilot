import { useCallback, useEffect, useState } from 'react'
import {
  Gauge,
  History,
  Zap,
  Clock,
  MessageSquare,
  Wrench,
  RefreshCw,
  Archive,
  Trash2,
  ChevronRight,
  Folder,
  Calendar,
  Hash,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useContextStore, type SessionSummary } from '@/stores/context'

export function ContextDashboard() {
  const {
    sessions,
    tokenUsage,
    compactionSettings,
    loading,
    sessionsLoading,
    selectedSession,
    setSessions,
    setTokenUsage,
    setCompactionSettings,
    setLoading,
    setSessionsLoading,
    setSelectedSession,
  } = useContextStore()

  const [activeTab, setActiveTab] = useState<'usage' | 'sessions'>('usage')

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [usage, settings, sessionList] = await Promise.all([
        window.electron.invoke('context:tokenUsage'),
        window.electron.invoke('context:compactionSettings'),
        window.electron.invoke('context:sessions'),
      ])
      setTokenUsage(usage)
      setCompactionSettings(settings)
      setSessions(sessionList)
    } catch (error) {
      console.error('Failed to load context data:', error)
    } finally {
      setLoading(false)
    }
  }, [setTokenUsage, setCompactionSettings, setSessions, setLoading])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Trigger compaction
  const handleCompact = async () => {
    try {
      await window.electron.invoke('context:compact')
      loadData()
    } catch (error) {
      console.error('Failed to compact:', error)
    }
  }

  // Toggle auto-compact
  const handleToggleAutoCompact = async () => {
    if (!compactionSettings) return
    try {
      await window.electron.invoke('context:setAutoCompact', !compactionSettings.autoCompact)
      setCompactionSettings({ ...compactionSettings, autoCompact: !compactionSettings.autoCompact })
    } catch (error) {
      console.error('Failed to toggle auto-compact:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Tab navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <TabButton
          active={activeTab === 'usage'}
          onClick={() => setActiveTab('usage')}
          icon={Gauge}
          label="Token Usage"
        />
        <TabButton
          active={activeTab === 'sessions'}
          onClick={() => setActiveTab('sessions')}
          icon={History}
          label="Session History"
        />
        <div className="flex-1" />
        <button onClick={loadData} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {activeTab === 'usage' && (
        <UsagePanel
          tokenUsage={tokenUsage}
          compactionSettings={compactionSettings}
          onCompact={handleCompact}
          onToggleAutoCompact={handleToggleAutoCompact}
        />
      )}

      {activeTab === 'sessions' && (
        <SessionsPanel
          sessions={sessions}
          loading={sessionsLoading}
          selectedSession={selectedSession}
          onSelectSession={setSelectedSession}
        />
      )}
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: typeof Gauge
  label: string
}

function TabButton({ active, onClick, icon: Icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
        active
          ? 'bg-accent-purple/10 text-accent-purple'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

interface UsagePanelProps {
  tokenUsage: { current: number; max: number; percentage: number; lastCompaction?: number } | null
  compactionSettings: { autoCompact: boolean; threshold: number } | null
  onCompact: () => void
  onToggleAutoCompact: () => void
}

function UsagePanel({ tokenUsage, compactionSettings, onCompact, onToggleAutoCompact }: UsagePanelProps) {
  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
  }

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-accent-red'
    if (percentage >= 70) return 'text-accent-yellow'
    return 'text-accent-green'
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-accent-red'
    if (percentage >= 70) return 'bg-accent-yellow'
    return 'bg-accent-green'
  }

  return (
    <div className="space-y-6">
      {/* Token meter */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Gauge className="w-4 h-4 text-accent-purple" />
            Context Window Usage
          </h3>
        </div>
        <div className="card-body">
          <div className="mb-6">
            <div className="flex items-end justify-between mb-2">
              <span className={cn('text-4xl font-bold', getUsageColor(tokenUsage?.percentage || 0))}>
                {tokenUsage?.percentage?.toFixed(1) || 0}%
              </span>
              <span className="text-text-muted">
                {formatNumber(tokenUsage?.current || 0)} / {formatNumber(tokenUsage?.max || 200000)} tokens
              </span>
            </div>
            <div className="h-3 bg-surface-hover rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getProgressColor(tokenUsage?.percentage || 0))}
                style={{ width: `${Math.min(tokenUsage?.percentage || 0, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-background rounded-lg p-3 text-center">
              <Zap className="w-5 h-5 mx-auto text-accent-yellow mb-1" />
              <p className="text-lg font-semibold text-text-primary">
                {formatNumber(tokenUsage?.current || 0)}
              </p>
              <p className="text-xs text-text-muted">Current</p>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <Hash className="w-5 h-5 mx-auto text-accent-blue mb-1" />
              <p className="text-lg font-semibold text-text-primary">
                {formatNumber(tokenUsage?.max || 200000)}
              </p>
              <p className="text-xs text-text-muted">Max Context</p>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <Clock className="w-5 h-5 mx-auto text-accent-green mb-1" />
              <p className="text-lg font-semibold text-text-primary">
                {tokenUsage?.lastCompaction ? formatDate(tokenUsage.lastCompaction) : 'Never'}
              </p>
              <p className="text-xs text-text-muted">Last Compact</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compaction controls */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Archive className="w-4 h-4 text-accent-blue" />
            Compaction Controls
          </h3>
        </div>
        <div className="card-body space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">Auto-Compact</p>
              <p className="text-xs text-text-muted">
                Automatically compact when threshold is reached
              </p>
            </div>
            <button
              onClick={onToggleAutoCompact}
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors',
                compactionSettings?.autoCompact ? 'bg-accent-green' : 'bg-surface-hover'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                  compactionSettings?.autoCompact ? 'left-7' : 'left-1'
                )}
              />
            </button>
          </div>

          <div className="pt-4 border-t border-border">
            <button onClick={onCompact} className="btn btn-primary w-full">
              <Archive className="w-4 h-4" />
              Compact Now
            </button>
            <p className="text-xs text-text-muted text-center mt-2">
              Creates a summary checkpoint and resets context
            </p>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Context Management</p>
            <p>
              Claude Code maintains conversation context to remember what you're working on.
              When the context fills up, compaction creates a summary and starts fresh while
              preserving important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SessionsPanelProps {
  sessions: SessionSummary[]
  loading: boolean
  selectedSession: SessionSummary | null
  onSelectSession: (session: SessionSummary | null) => void
}

function SessionsPanel({ sessions, loading, selectedSession, onSelectSession }: SessionsPanelProps) {
  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (start: number, end?: number) => {
    const ms = (end || Date.now()) - start
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    return `${minutes}m`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary">Recent Sessions</h3>
          <p className="text-xs text-text-muted mt-1">
            {sessions.length} sessions found
          </p>
        </div>
        <div className="card-body max-h-[500px] overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No sessions found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() =>
                    onSelectSession(selectedSession?.id === session.id ? null : session)
                  }
                  className={cn(
                    'w-full p-3 rounded-lg border text-left transition-colors',
                    selectedSession?.id === session.id
                      ? 'border-accent-purple bg-accent-purple/5'
                      : 'border-border hover:border-border-hover'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-accent-blue" />
                      <span className="font-medium text-text-primary">{session.projectName}</span>
                    </div>
                    <span className="text-xs text-text-muted">
                      {formatDuration(session.startTime, session.endTime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(session.startTime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {session.messageCount} messages
                    </span>
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      {session.toolCalls} tools
                    </span>
                    {session.model && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {session.model.replace('claude-', '').replace(/-\d+$/, '')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedSession && (
        <SessionDetail session={selectedSession} onClose={() => onSelectSession(null)} />
      )}
    </div>
  )
}

interface SessionDetailProps {
  session: SessionSummary
  onClose: () => void
}

function SessionDetail({ session, onClose }: SessionDetailProps) {
  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="font-medium text-text-primary">Session Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover"
        >
          <XCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="card-body">
        <dl className="space-y-3">
          <div className="flex justify-between">
            <dt className="text-text-muted">Project</dt>
            <dd className="font-medium text-text-primary">{session.projectName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Path</dt>
            <dd className="font-mono text-xs text-text-secondary truncate max-w-[300px]">
              {session.projectPath}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Started</dt>
            <dd className="text-text-primary">{formatDate(session.startTime)}</dd>
          </div>
          {session.endTime && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Ended</dt>
              <dd className="text-text-primary">{formatDate(session.endTime)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-text-muted">Messages</dt>
            <dd className="text-text-primary">{session.messageCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Tool Calls</dt>
            <dd className="text-text-primary">{session.toolCalls}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Tokens</dt>
            <dd className="text-text-primary">{session.tokenCount.toLocaleString()}</dd>
          </div>
          {session.model && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Model</dt>
              <dd className="text-text-primary">{session.model}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
