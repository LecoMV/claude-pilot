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
  Radio,
  ExternalLink,
  Terminal,
  TrendingUp,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useContextStore, type SessionSummary } from '@/stores/context'
import type { ExternalSession } from '@shared/types'

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

  const [activeTab, setActiveTab] = useState<'active' | 'usage' | 'sessions'>('active')
  const [activeSessions, setActiveSessions] = useState<ExternalSession[]>([])
  const [selectedActiveSession, setSelectedActiveSession] = useState<ExternalSession | null>(null)

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [usage, settings, sessionList, activeList] = await Promise.all([
        window.electron.invoke('context:tokenUsage'),
        window.electron.invoke('context:compactionSettings'),
        window.electron.invoke('context:sessions'),
        window.electron.invoke('sessions:getActive'),
      ])
      setTokenUsage(usage)
      setCompactionSettings(settings)
      setSessions(sessionList)
      setActiveSessions(activeList || [])
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
          active={activeTab === 'active'}
          onClick={() => setActiveTab('active')}
          icon={Radio}
          label="Active Sessions"
          badge={activeSessions.length > 0 ? activeSessions.length : undefined}
        />
        <TabButton
          active={activeTab === 'usage'}
          onClick={() => setActiveTab('usage')}
          icon={Gauge}
          label="Token Estimation"
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

      {activeTab === 'active' && (
        <ActiveSessionsPanel
          sessions={activeSessions}
          selectedSession={selectedActiveSession}
          onSelectSession={setSelectedActiveSession}
          onRefresh={loadData}
        />
      )}

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
  badge?: number
}

function TabButton({ active, onClick, icon: Icon, label, badge }: TabButtonProps) {
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
      {badge !== undefined && (
        <span className={cn(
          'ml-1 px-1.5 py-0.5 text-xs rounded-full',
          active ? 'bg-accent-purple/20 text-accent-purple' : 'bg-accent-green/20 text-accent-green'
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}

// Active Sessions Panel - shows live Claude Code sessions
interface ActiveSessionsPanelProps {
  sessions: ExternalSession[]
  selectedSession: ExternalSession | null
  onSelectSession: (session: ExternalSession | null) => void
  onRefresh: () => void
}

function ActiveSessionsPanel({ sessions, selectedSession, onSelectSession, onRefresh }: ActiveSessionsPanelProps) {
  const formatTokens = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
    return num.toString()
  }

  const formatTime = (ts: number) => {
    const now = Date.now()
    const diff = now - ts
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  const getUsagePercentage = (session: ExternalSession) => {
    const total = session.stats.inputTokens + session.stats.outputTokens
    const maxContext = 200000 // Default max context
    return Math.min((total / maxContext) * 100, 100)
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

  // Pricing per million tokens (as of 2025)
  const MODEL_PRICING: Record<string, { input: number; output: number; cached: number }> = {
    'claude-sonnet-4': { input: 3, output: 15, cached: 0.30 },
    'claude-opus-4': { input: 15, output: 75, cached: 1.50 },
    'claude-opus-4-5': { input: 15, output: 75, cached: 1.50 },
    'claude-3-5-sonnet': { input: 3, output: 15, cached: 0.30 },
    'default': { input: 3, output: 15, cached: 0.30 },
  }

  const estimateCost = (session: ExternalSession) => {
    const model = session.model || 'default'
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default']
    const inputCost = (session.stats.inputTokens / 1_000_000) * pricing.input
    const outputCost = (session.stats.outputTokens / 1_000_000) * pricing.output
    const cachedSavings = (session.stats.cachedTokens / 1_000_000) * (pricing.input - pricing.cached)
    return {
      total: inputCost + outputCost,
      saved: cachedSavings,
    }
  }

  const getRemainingTokens = (session: ExternalSession) => {
    const used = session.stats.inputTokens + session.stats.outputTokens
    const maxContext = 200000
    return Math.max(0, maxContext - used)
  }

  const getEstimatedMessagesRemaining = (session: ExternalSession) => {
    const remaining = getRemainingTokens(session)
    const avgTokensPerMessage = session.stats.messageCount > 0
      ? (session.stats.inputTokens + session.stats.outputTokens) / session.stats.messageCount
      : 2000 // Default estimate
    return Math.floor(remaining / Math.max(avgTokensPerMessage, 500))
  }

  const openProjectFolder = async (path: string) => {
    try {
      await window.electron.invoke('shell:openPath', path)
    } catch (error) {
      console.error('Failed to open project folder:', error)
    }
  }

  // Check if any session is critically low on context
  const criticalSessions = sessions.filter(s => getUsagePercentage(s) >= 85)

  return (
    <div className="space-y-4">
      {/* Critical context warning */}
      {criticalSessions.length > 0 && (
        <div className="card p-4 border-accent-yellow/50 bg-accent-yellow/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-accent-yellow flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-text-primary">Context Running Low</p>
              <p className="text-sm text-text-secondary mt-1">
                {criticalSessions.length === 1 ? (
                  <>
                    <span className="font-medium">{criticalSessions[0].projectName}</span> is at{' '}
                    <span className="text-accent-yellow font-medium">{getUsagePercentage(criticalSessions[0]).toFixed(0)}%</span> context usage.
                  </>
                ) : (
                  <>
                    {criticalSessions.length} sessions are above 85% context usage.
                  </>
                )}
                {' '}Consider running <code className="text-accent-purple">/compact</code> or starting a new session.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active sessions */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div>
            <h3 className="font-medium text-text-primary flex items-center gap-2">
              <Radio className="w-4 h-4 text-accent-green animate-pulse" />
              Live Sessions
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Claude Code sessions currently running
            </p>
          </div>
          <span className="text-sm text-text-muted">
            {sessions.length} active
          </span>
        </div>
        <div className="card-body">
          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <Terminal className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No active Claude Code sessions</p>
              <p className="text-xs text-text-muted mt-1">
                Start a claude session in your terminal to see it here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const totalTokens = session.stats.inputTokens + session.stats.outputTokens
                const usagePercent = getUsagePercentage(session)
                const isSelected = selectedSession?.id === session.id

                return (
                  <div
                    key={session.id}
                    className={cn(
                      'rounded-lg border p-4 transition-all cursor-pointer',
                      isSelected
                        ? 'border-accent-purple bg-accent-purple/5'
                        : 'border-border hover:border-border-hover'
                    )}
                    onClick={() => onSelectSession(isSelected ? null : session)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-green/10 flex items-center justify-center">
                          <Radio className="w-5 h-5 text-accent-green" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-text-primary">{session.projectName}</p>
                            <span className="px-2 py-0.5 text-xs bg-accent-green/20 text-accent-green rounded">
                              Active
                            </span>
                          </div>
                          <p className="text-xs text-text-muted">
                            {session.model?.replace('claude-', '').replace(/-\d+$/, '') || 'Unknown model'}
                            {session.gitBranch && ` • ${session.gitBranch}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn('font-semibold', getUsageColor(usagePercent))}>
                          {usagePercent.toFixed(1)}%
                        </p>
                        <p className="text-xs text-text-muted">Context</p>
                      </div>
                    </div>

                    {/* Context usage bar */}
                    <div className="mb-3">
                      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', getProgressColor(usagePercent))}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-text-muted mt-1">
                        <span>{formatTokens(totalTokens)} tokens used</span>
                        <span>~200K max</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <div className="bg-background rounded p-2 text-center">
                        <p className="text-text-primary font-medium">{session.stats.messageCount}</p>
                        <p className="text-text-muted">Messages</p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <p className="text-text-primary font-medium">{session.stats.toolCalls}</p>
                        <p className="text-text-muted">Tool Calls</p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <p className="text-text-primary font-medium">{formatTokens(session.stats.cachedTokens)}</p>
                        <p className="text-text-muted">Cached</p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <p className="text-accent-green font-medium">~{getEstimatedMessagesRemaining(session)}</p>
                        <p className="text-text-muted">Msgs Left</p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <p className="text-accent-blue font-medium">${estimateCost(session).total.toFixed(2)}</p>
                        <p className="text-text-muted">Est. Cost</p>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-border space-y-3">
                        {/* Cost breakdown */}
                        {(() => {
                          const cost = estimateCost(session)
                          return cost.saved > 0.001 ? (
                            <div className="p-3 bg-accent-green/10 rounded-lg">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-text-muted">Cache savings</span>
                                <span className="text-accent-green font-medium">
                                  ${cost.saved.toFixed(2)} saved
                                </span>
                              </div>
                            </div>
                          ) : null
                        })()}

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-text-muted">Input Tokens</p>
                            <p className="text-text-primary font-medium">
                              {session.stats.inputTokens.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-text-muted">Output Tokens</p>
                            <p className="text-text-primary font-medium">
                              {session.stats.outputTokens.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-text-muted">User Messages</p>
                            <p className="text-text-primary font-medium">
                              {session.stats.userMessages}
                            </p>
                          </div>
                          <div>
                            <p className="text-text-muted">Assistant Messages</p>
                            <p className="text-text-primary font-medium">
                              {session.stats.assistantMessages}
                            </p>
                          </div>
                          <div>
                            <p className="text-text-muted">Tokens Remaining</p>
                            <p className={cn(
                              'font-medium',
                              getRemainingTokens(session) < 30000 ? 'text-accent-yellow' : 'text-text-primary'
                            )}>
                              {formatTokens(getRemainingTokens(session))}
                            </p>
                          </div>
                          <div>
                            <p className="text-text-muted">Last Activity</p>
                            <p className="text-text-primary font-medium">
                              {formatTime(session.lastActivity)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-text-muted truncate max-w-[300px]" title={session.projectPath}>
                            {session.projectPath}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openProjectFolder(session.projectPath)
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open Folder
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Active Sessions</p>
            <p>
              This panel shows Claude Code sessions currently running in your terminals.
              Each session tracks its own context window usage. When context fills up,
              Claude will automatically create a summary checkpoint. You can trigger
              manual compaction within each session using the <code className="text-accent-purple">/compact</code> command.
            </p>
          </div>
        </div>
      </div>
    </div>
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
            <div className="p-3 bg-background rounded-lg text-center">
              <p className="text-sm text-text-secondary mb-2">
                To compact a session, use the <code className="text-accent-purple">/compact</code> command within that session
              </p>
              <p className="text-xs text-text-muted">
                Or wait for automatic compaction when context fills up
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Token Estimation</p>
            <p>
              This panel shows estimated token usage from stored checkpoints.
              For accurate real-time usage, check the Active Sessions tab.
              Each Claude Code session maintains its own context window (typically ~200K tokens).
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
