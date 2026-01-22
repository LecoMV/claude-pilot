import { useEffect, useMemo, memo, useState, useCallback } from 'react'
import { Virtuoso } from 'react-virtuoso'
import {
  Activity,
  Clock,
  FileText,
  FolderOpen,
  Hash,
  MessageSquare,
  RefreshCw,
  Search,
  Zap,
  DollarSign,
  Eye,
  Radio,
  GitBranch,
  Terminal,
  User,
  Play,
  RotateCcw,
  Shield,
  Plug,
  Cpu,
  Shrink,
  Bot,
  ChevronDown,
  ChevronRight,
  Code,
  Check,
  Copy,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessionsStore, selectFilteredSessions } from '../../stores/sessions'
import type { ExternalSession, SessionMessage } from '../../../shared/types'
import { BranchPanel } from '../branches/BranchPanel'
import { SmartCompactionPanel } from '../context/SmartCompactionPanel'

type SessionTab = 'messages' | 'branches' | 'compaction'

export function SessionManager() {
  const {
    sessions,
    activeSessions,
    selectedSession,
    selectedMessages,
    isLoading,
    isWatching,
    searchQuery,
    filter,
    sortBy,
    fetchSessions,
    fetchActiveSessions,
    selectSession,
    toggleWatching,
    setSearchQuery,
    setFilter,
    setSortBy,
    updateSession,
  } = useSessionsStore()

  const filteredSessions = useMemo(
    () => selectFilteredSessions(useSessionsStore.getState()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps trigger recomputation on filter changes
    [sessions, searchQuery, filter, sortBy]
  )

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions()
    fetchActiveSessions()

    // Listen for session updates
    const unsubscribe = window.electron.on('session:updated', (session: ExternalSession) => {
      updateSession(session)
    })

    return () => {
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store methods are stable
  }, [])

  // Refresh active sessions periodically when watching
  useEffect(() => {
    if (!isWatching) return

    const interval = setInterval(() => {
      fetchActiveSessions()
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchActiveSessions is stable
  }, [isWatching])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - timestamp

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString()
  }

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
    return tokens.toString()
  }

  const formatCost = (cost: number | undefined) => {
    if (!cost) return '$0.00'
    return `$${cost.toFixed(2)}`
  }

  return (
    <div className="flex h-full">
      {/* Session List */}
      <div className="w-96 border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-text-primary">Sessions</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleWatching}
                className={`p-2 rounded-lg transition-colors ${
                  isWatching
                    ? 'bg-accent-green/20 text-accent-green'
                    : 'bg-surface text-text-muted hover:text-text-primary'
                }`}
                title={isWatching ? 'Stop watching' : 'Watch for changes'}
              >
                <Radio className="w-4 h-4" />
              </button>
              <button
                onClick={fetchSessions}
                className="p-2 rounded-lg bg-surface text-text-muted hover:text-text-primary transition-colors"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple/50"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'active' | 'recent')}
              className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-purple/50"
            >
              <option value="all">All Sessions</option>
              <option value="active">Active Now</option>
              <option value="recent">Last 24h</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'lastActivity' | 'startTime' | 'tokens' | 'messages')
              }
              className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-purple/50"
            >
              <option value="lastActivity">Last Activity</option>
              <option value="startTime">Start Time</option>
              <option value="tokens">Token Usage</option>
              <option value="messages">Messages</option>
            </select>
          </div>
        </div>

        {/* Active Sessions Banner */}
        {activeSessions.length > 0 && (
          <div className="px-4 py-2 bg-accent-green/10 border-b border-accent-green/30">
            <div className="flex items-center gap-2 text-accent-green text-sm">
              <Activity className="w-4 h-4" />
              <span>
                {activeSessions.length} active session{activeSessions.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Session List - Virtualized for performance */}
        <div className="flex-1">
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-text-muted">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No sessions found</p>
            </div>
          ) : (
            <Virtuoso
              data={filteredSessions}
              itemContent={(index, session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isSelected={selectedSession?.id === session.id}
                  onSelect={() => selectSession(session.id)}
                  formatDate={formatDate}
                  formatTokens={formatTokens}
                  formatCost={formatCost}
                />
              )}
              overscan={100}
            />
          )}
        </div>

        {/* Stats Footer */}
        <div className="p-3 border-t border-border bg-surface/50 text-xs text-text-muted">
          <div className="flex justify-between">
            <span>{filteredSessions.length} sessions</span>
            <span>
              {formatTokens(
                filteredSessions.reduce(
                  (sum, s) => sum + s.stats.inputTokens + s.stats.outputTokens,
                  0
                )
              )}{' '}
              total tokens
            </span>
          </div>
        </div>
      </div>

      {/* Session Detail */}
      <div className="flex-1 flex flex-col">
        {selectedSession ? (
          <SessionDetail
            session={selectedSession}
            messages={selectedMessages}
            formatDate={formatDate}
            formatTokens={formatTokens}
            formatCost={formatCost}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <Eye className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">Select a session to view details</p>
              <p className="text-sm mt-2">
                Sessions from external Claude Code instances appear here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Context Usage Bar Component
const MAX_CONTEXT_TOKENS = 200000 // Claude's context window

function ContextBar({
  inputTokens,
  outputTokens,
  cachedTokens,
}: {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
}) {
  const totalTokens = inputTokens + outputTokens
  const usagePercent = Math.min((totalTokens / MAX_CONTEXT_TOKENS) * 100, 100)
  const cachedPercent = Math.min((cachedTokens / MAX_CONTEXT_TOKENS) * 100, 100)

  // Color based on usage
  const getBarColor = () => {
    if (usagePercent >= 90) return 'bg-accent-red'
    if (usagePercent >= 70) return 'bg-accent-yellow'
    return 'bg-accent-purple'
  }

  // Format compact token display
  const formatCompact = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
    return tokens.toString()
  }

  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
        <span>{formatCompact(totalTokens)} / 200K</span>
        <span>{usagePercent.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden relative">
        {/* Cached tokens (shown as lighter shade behind) */}
        {cachedTokens > 0 && (
          <div
            className="absolute h-full bg-accent-blue/30 rounded-full"
            style={{ width: `${cachedPercent}%` }}
          />
        )}
        {/* Active tokens */}
        <div
          className={`h-full rounded-full transition-all ${getBarColor()}`}
          style={{ width: `${usagePercent}%` }}
        />
      </div>
    </div>
  )
}

// Session Card Component (memoized for performance)
interface SessionCardProps {
  session: ExternalSession
  isSelected: boolean
  onSelect: () => void
  formatDate: (ts: number) => string
  formatTokens: (t: number) => string
  formatCost: (c: number | undefined) => string
}

const SessionCard = memo(function SessionCard({
  session,
  isSelected,
  onSelect,
  formatDate,
  formatTokens,
  formatCost,
}: SessionCardProps) {
  const processInfo = session.processInfo

  // Get profile badge color
  const getProfileColor = (profile: string) => {
    switch (profile) {
      case 'engineering':
        return 'bg-accent-blue/20 text-accent-blue'
      case 'security':
        return 'bg-accent-red/20 text-accent-red'
      default:
        return 'bg-surface text-text-muted'
    }
  }

  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 text-left border-b border-border transition-colors ${
        isSelected ? 'bg-accent-purple/10 border-l-2 border-l-accent-purple' : 'hover:bg-surface'
      }`}
    >
      {/* Header: Name + Time */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {session.isActive && (
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          )}
          <span className="font-medium text-text-primary truncate max-w-[200px]">
            {session.slug || session.projectName}
          </span>
        </div>
        <span className="text-xs text-text-muted">{formatDate(session.lastActivity)}</span>
      </div>

      {/* Process Info Row (for active sessions) */}
      {processInfo && (
        <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
          {/* Profile Badge */}
          <span className={`px-1.5 py-0.5 rounded ${getProfileColor(processInfo.profile)}`}>
            <User className="w-3 h-3 inline mr-1" />
            {processInfo.profile}
          </span>
          {/* Terminal */}
          <span className="flex items-center gap-1 text-text-muted">
            <Terminal className="w-3 h-3" />
            {processInfo.terminal}
          </span>
          {/* Launch Mode */}
          <span className="flex items-center gap-1 text-text-muted">
            {processInfo.launchMode === 'resume' ? (
              <RotateCcw className="w-3 h-3" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            {processInfo.launchMode}
          </span>
          {/* Permission Mode */}
          {processInfo.permissionMode && (
            <span className="flex items-center gap-1 text-accent-yellow">
              <Shield className="w-3 h-3" />
              {processInfo.permissionMode.replace('Permissions', '')}
            </span>
          )}
        </div>
      )}

      {/* MCP Servers (for active sessions) */}
      {processInfo && processInfo.activeMcpServers.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-text-muted mb-2">
          <Plug className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{processInfo.activeMcpServers.join(', ')}</span>
        </div>
      )}

      {/* Working Directory - use process cwd if available (more accurate for active sessions) */}
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
        <FolderOpen className="w-3 h-3 flex-shrink-0" />
        <span
          className="truncate"
          title={processInfo?.cwd || session.workingDirectory || session.projectName}
        >
          {processInfo?.cwd || session.workingDirectory || session.projectName}
        </span>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3 text-xs mb-2">
        <span className="flex items-center gap-1 text-text-muted">
          <MessageSquare className="w-3 h-3" />
          {session.stats.messageCount}
        </span>
        <span className="flex items-center gap-1 text-text-muted">
          <Hash className="w-3 h-3" />
          {session.stats.toolCalls} tools
        </span>
        <span className="flex items-center gap-1 text-text-muted">
          <Zap className="w-3 h-3" />
          {formatTokens(session.stats.inputTokens + session.stats.outputTokens)}
        </span>
        <span className="flex items-center gap-1 text-accent-yellow">
          <DollarSign className="w-3 h-3" />
          {formatCost(session.stats.estimatedCost)}
        </span>
        {processInfo && (
          <span className="flex items-center gap-1 text-text-muted ml-auto">
            <Cpu className="w-3 h-3" />
            PID {processInfo.pid}
          </span>
        )}
      </div>

      {/* Context Usage Bar */}
      <ContextBar
        inputTokens={session.stats.inputTokens}
        outputTokens={session.stats.outputTokens}
        cachedTokens={session.stats.cachedTokens}
      />
    </button>
  )
})

// Session Detail Component
interface SessionDetailProps {
  session: ExternalSession
  messages: SessionMessage[]
  formatDate: (ts: number) => string
  formatTokens: (t: number) => string
  formatCost: (c: number | undefined) => string
}

function SessionDetail({
  session,
  messages,
  formatDate,
  formatTokens,
  formatCost,
}: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<SessionTab>('messages')
  const [showCompaction, setShowCompaction] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const tabs = [
    { id: 'messages' as const, label: 'Messages', icon: MessageSquare },
    { id: 'branches' as const, label: 'Branches', icon: GitBranch },
  ]

  // Group consecutive tool calls for terminal view
  const groupedMessages = useMemo(() => {
    const groups: Array<SessionMessage | { type: 'tool-group'; tools: SessionMessage[] }> = []
    let currentToolGroup: SessionMessage[] = []

    for (const msg of messages) {
      if (msg.type === 'tool-result') {
        currentToolGroup.push(msg)
      } else {
        if (currentToolGroup.length > 0) {
          groups.push({ type: 'tool-group', tools: currentToolGroup })
          currentToolGroup = []
        }
        groups.push(msg)
      }
    }
    if (currentToolGroup.length > 0) {
      groups.push({ type: 'tool-group', tools: currentToolGroup })
    }
    return groups
  }, [messages])

  const toggleToolExpanded = useCallback((id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const formatTime = useCallback((ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }, [])

  return (
    <>
      {/* Compaction Modal */}
      {showCompaction && (
        <SmartCompactionPanel session={session} onClose={() => setShowCompaction(false)} />
      )}

      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
              {session.isActive && (
                <span className="w-3 h-3 rounded-full bg-accent-green animate-pulse" />
              )}
              {session.slug || session.projectName}
            </h2>
            <p className="text-sm text-text-muted flex items-center gap-2 mt-1">
              <FolderOpen className="w-4 h-4" />
              {session.projectPath}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCompaction(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-purple/10 text-accent-purple hover:bg-accent-purple/20 transition-colors text-sm font-medium"
            >
              <Shrink className="w-4 h-4" />
              Smart Compact
            </button>
            <div className="text-right text-sm text-text-muted">
              <p>Started {formatDate(session.startTime)}</p>
              <p>Last activity {formatDate(session.lastActivity)}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            icon={<MessageSquare className="w-4 h-4" />}
            label="Messages"
            value={session.stats.messageCount.toString()}
          />
          <StatCard
            icon={<Hash className="w-4 h-4" />}
            label="Tool Calls"
            value={session.stats.toolCalls.toString()}
          />
          <StatCard
            icon={<Zap className="w-4 h-4" />}
            label="Input Tokens"
            value={formatTokens(session.stats.inputTokens)}
          />
          <StatCard
            icon={<Zap className="w-4 h-4" />}
            label="Output Tokens"
            value={formatTokens(session.stats.outputTokens)}
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label="Cached"
            value={formatTokens(session.stats.cachedTokens)}
          />
          <StatCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Est. Cost"
            value={formatCost(session.stats.estimatedCost)}
            highlight
          />
        </div>

        {/* Metadata Row 1 */}
        <div className="flex items-center gap-4 mt-3 text-xs text-text-muted flex-wrap">
          {session.model && (
            <span className="flex items-center gap-1">
              <span className="font-medium">Model:</span> {session.model}
            </span>
          )}
          {session.version && (
            <span className="flex items-center gap-1">
              <span className="font-medium">Claude Code:</span> v{session.version}
            </span>
          )}
          {session.gitBranch && (
            <span className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {session.gitBranch}
            </span>
          )}
          {session.stats.serviceTier && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                session.stats.serviceTier === 'standard'
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : session.stats.serviceTier === 'scale'
                    ? 'bg-accent-purple/20 text-accent-purple'
                    : 'bg-accent-green/20 text-accent-green'
              }`}
            >
              {session.stats.serviceTier.toUpperCase()}
            </span>
          )}
        </div>

        {/* Process Info Row (for active sessions) */}
        {session.processInfo && (
          <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
            {/* Profile */}
            <span
              className={`px-2 py-0.5 rounded font-medium ${
                session.processInfo.profile === 'engineering'
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : session.processInfo.profile === 'security'
                    ? 'bg-accent-red/20 text-accent-red'
                    : 'bg-surface text-text-muted'
              }`}
            >
              <User className="w-3 h-3 inline mr-1" />
              {session.processInfo.profile}
            </span>
            {/* Terminal */}
            <span className="flex items-center gap-1 text-text-muted">
              <Terminal className="w-3 h-3" />
              {session.processInfo.terminal}
            </span>
            {/* PID */}
            <span className="flex items-center gap-1 text-text-muted">
              <Cpu className="w-3 h-3" />
              PID {session.processInfo.pid}
            </span>
            {/* Launch Mode */}
            <span className="flex items-center gap-1 text-text-muted">
              {session.processInfo.launchMode === 'resume' ? (
                <RotateCcw className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {session.processInfo.launchMode}
            </span>
            {/* Permission Mode */}
            {session.processInfo.permissionMode && (
              <span className="flex items-center gap-1 text-accent-yellow">
                <Shield className="w-3 h-3" />
                {session.processInfo.permissionMode}
              </span>
            )}
            {/* Wrapper */}
            {session.processInfo.wrapper && (
              <span className="flex items-center gap-1 text-text-muted">
                <span className="font-medium">via</span> {session.processInfo.wrapper}
              </span>
            )}
          </div>
        )}

        {/* MCP Servers Row */}
        {session.processInfo && session.processInfo.activeMcpServers.length > 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
            <Plug className="w-3 h-3" />
            <span className="font-medium">Active MCPs:</span>
            <div className="flex gap-1 flex-wrap">
              {session.processInfo.activeMcpServers.map((mcp) => (
                <span
                  key={mcp}
                  className="px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green"
                >
                  {mcp}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Working Directory */}
        {session.workingDirectory && (
          <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
            <FolderOpen className="w-3 h-3" />
            <span className="font-medium">Launched from:</span>
            <span className="font-mono">{session.workingDirectory}</span>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex items-center gap-1 mt-4 border-t border-border pt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent-purple/10 text-accent-purple'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'messages' && (
          <div className="h-full flex flex-col bg-background">
            <div className="p-4 pb-0 border-b border-border bg-surface">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent-purple" />
                <h3 className="text-sm font-medium text-text-primary font-mono">
                  Session Transcript
                </h3>
                <span className="text-xs text-text-muted ml-auto font-mono">
                  {messages.length} messages
                </span>
              </div>
            </div>
            {messages.length === 0 ? (
              <p className="text-text-muted text-center py-8 font-mono">No messages to display</p>
            ) : (
              <div className="flex-1 overflow-auto font-mono text-sm">
                <Virtuoso
                  data={groupedMessages}
                  itemContent={(_index, item) => {
                    if ('tools' in item) {
                      return (
                        <ToolCallGroup
                          key={`tool-group-${item.tools[0]?.uuid}`}
                          tools={item.tools}
                          expandedTools={expandedTools}
                          toggleToolExpanded={toggleToolExpanded}
                          copiedId={copiedId}
                          copyToClipboard={copyToClipboard}
                        />
                      )
                    }
                    return (
                      <TerminalMessage
                        key={item.uuid}
                        message={item}
                        isUser={item.type === 'user'}
                        formatTime={formatTime}
                        copiedId={copiedId}
                        copyToClipboard={copyToClipboard}
                      />
                    )
                  }}
                  overscan={50}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'branches' && <BranchPanel session={session} />}
      </div>
    </>
  )
}

// Stat Card Component
function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-accent-yellow/10' : 'bg-surface'}`}>
      <div
        className={`flex items-center gap-2 mb-1 ${highlight ? 'text-accent-yellow' : 'text-text-muted'}`}
      >
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p
        className={`text-lg font-semibold ${highlight ? 'text-accent-yellow' : 'text-text-primary'}`}
      >
        {value}
      </p>
    </div>
  )
}

// Helper to extract displayable text from message content
function getDisplayContent(message: SessionMessage): string {
  // Handle tool output
  if (message.toolOutput) {
    return typeof message.toolOutput === 'string'
      ? message.toolOutput
      : JSON.stringify(message.toolOutput, null, 2)
  }

  // Handle content
  if (!message.content) {
    return '(no content)'
  }

  // If content is a string, return it directly
  if (typeof message.content === 'string') {
    return message.content
  }

  // If content is an array (common for Claude responses with multiple blocks)
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (typeof block === 'string') return block
        if (block?.type === 'text' && block?.text) return block.text
        if (block?.type === 'thinking' && block?.thinking)
          return `[Thinking: ${block.thinking.slice(0, 100)}...]`
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  // If content is an object with text property
  if (typeof message.content === 'object') {
    const content = message.content as Record<string, unknown>
    if (content.text && typeof content.text === 'string') return content.text
    if (content.type === 'thinking') return '[Thinking block]'
    // Fallback: stringify the object
    return JSON.stringify(content, null, 2)
  }

  return '(unknown content format)'
}

// Message Card Component (memoized for performance) - kept for fallback
const _MessageCard = memo(function _MessageCard({
  message,
  formatDate,
}: {
  message: SessionMessage
  formatDate: (ts: number) => string
}) {
  const getTypeStyles = () => {
    switch (message.type) {
      case 'user':
        return 'bg-accent-blue/10 border-accent-blue/30'
      case 'assistant':
        return 'bg-accent-purple/10 border-accent-purple/30'
      case 'tool-result':
        return 'bg-accent-green/10 border-accent-green/30'
      default:
        return 'bg-surface border-border'
    }
  }

  const getTypeLabel = () => {
    switch (message.type) {
      case 'user':
        return 'User'
      case 'assistant':
        return 'Assistant'
      case 'tool-result':
        return message.toolName || 'Tool'
      default:
        return message.type
    }
  }

  return (
    <div className={`p-3 rounded-lg border ${getTypeStyles()}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-primary">{getTypeLabel()}</span>
        <span className="text-xs text-text-muted">{formatDate(message.timestamp)}</span>
      </div>
      <p className="text-sm text-text-primary whitespace-pre-wrap line-clamp-4">
        {getDisplayContent(message)}
      </p>
      {message.usage && (
        <div className="mt-2 text-xs text-text-muted flex items-center gap-2">
          <Zap className="w-3 h-3" />
          {message.usage.input_tokens} in / {message.usage.output_tokens} out
        </div>
      )}
    </div>
  )
})

// Terminal-style message component
interface TerminalMessageProps {
  message: SessionMessage
  isUser: boolean
  formatTime: (timestamp: number) => string
  copiedId: string | null
  copyToClipboard: (text: string, id: string) => void
}

const TerminalMessage = memo(function TerminalMessage({
  message,
  isUser,
  formatTime,
  copiedId,
  copyToClipboard,
}: TerminalMessageProps) {
  const [expanded, setExpanded] = useState(true)
  const content = getDisplayContent(message)
  const needsTruncation = content.length > 2000

  // Parse code blocks
  const renderContent = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
        if (match) {
          const [, lang, code] = match
          return (
            <div
              key={i}
              className="my-2 rounded-lg overflow-hidden bg-surface border border-border"
            >
              <div className="flex items-center justify-between px-3 py-1.5 bg-surface-hover border-b border-border">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Code className="w-3 h-3" />
                  {lang || 'code'}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(code.trim())}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              <pre className="p-3 text-xs overflow-x-auto">
                <code className="text-accent-green">{code.trim()}</code>
              </pre>
            </div>
          )
        }
      }
      return (
        <span key={i} className="whitespace-pre-wrap">
          {part}
        </span>
      )
    })
  }

  return (
    <div className={cn('py-2 px-4 border-b border-border/30', isUser && 'bg-surface/30')}>
      {/* Header line */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted text-xs">[{formatTime(message.timestamp)}]</span>
        {isUser ? (
          <>
            <User className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-accent-blue font-semibold text-xs">USER</span>
          </>
        ) : (
          <>
            <Bot className="w-3.5 h-3.5 text-accent-purple" />
            <span className="text-accent-purple font-semibold text-xs">ASSISTANT</span>
          </>
        )}
        {message.usage && (
          <span className="text-text-muted text-xs ml-auto">
            {(message.usage.input_tokens || 0) + (message.usage.output_tokens || 0)} tokens
          </span>
        )}
        <button
          onClick={() => copyToClipboard(content, message.uuid)}
          className="p-1 text-text-muted hover:text-text-primary rounded"
        >
          {copiedId === message.uuid ? (
            <Check className="w-3 h-3 text-accent-green" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Content */}
      <div
        className={cn(
          'pl-4 text-text-primary text-sm',
          !expanded && needsTruncation && 'max-h-48 overflow-hidden'
        )}
      >
        {isUser ? (
          <span className="text-text-primary">
            {'> '}
            {content}
          </span>
        ) : (
          renderContent(expanded || !needsTruncation ? content : content.slice(0, 2000) + '...')
        )}
      </div>

      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="pl-4 mt-1 text-xs text-accent-purple hover:underline"
        >
          {expanded ? '▲ Collapse' : `▼ Expand (${content.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  )
})

// Tool call group component
interface ToolCallGroupProps {
  tools: SessionMessage[]
  expandedTools: Set<string>
  toggleToolExpanded: (id: string) => void
  copiedId: string | null
  copyToClipboard: (text: string, id: string) => void
}

const ToolCallGroup = memo(function ToolCallGroup({
  tools,
  expandedTools,
  toggleToolExpanded,
  copiedId,
  copyToClipboard,
}: ToolCallGroupProps) {
  const [groupExpanded, setGroupExpanded] = useState(false)

  // Categorize tools
  const reads = tools.filter((t) => t.toolName?.toLowerCase().includes('read'))
  const edits = tools.filter(
    (t) => t.toolName?.toLowerCase().includes('edit') || t.toolName?.toLowerCase().includes('write')
  )
  const others = tools.filter(
    (t) =>
      !t.toolName?.toLowerCase().includes('read') &&
      !t.toolName?.toLowerCase().includes('edit') &&
      !t.toolName?.toLowerCase().includes('write')
  )

  const summary = [
    reads.length > 0 && `${reads.length} read${reads.length > 1 ? 's' : ''}`,
    edits.length > 0 && `${edits.length} edit${edits.length > 1 ? 's' : ''}`,
    others.length > 0 && `${others.length} other`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="py-1 px-4 border-l-2 border-accent-green/30 ml-4 my-2">
      <button
        onClick={() => setGroupExpanded(!groupExpanded)}
        className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary w-full text-left"
      >
        {groupExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Wrench className="w-3 h-3 text-accent-green" />
        <span className="text-accent-green font-medium">{tools.length} tool calls</span>
        <span className="text-text-muted">({summary})</span>
      </button>

      {groupExpanded && (
        <div className="mt-2 space-y-2 pl-4">
          {tools.map((tool) => {
            const isExpanded = expandedTools.has(tool.uuid)
            return (
              <div key={tool.uuid} className="text-xs">
                <button
                  onClick={() => toggleToolExpanded(tool.uuid)}
                  className="flex items-center gap-2 text-text-muted hover:text-text-primary"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <span className="font-mono text-accent-yellow">{tool.toolName}</span>
                </button>
                {isExpanded && (
                  <div className="mt-1 p-2 bg-surface rounded border border-border overflow-x-auto">
                    {tool.toolInput && (
                      <div className="mb-2">
                        <span className="text-text-muted">Input:</span>
                        <pre className="text-text-primary text-xs">
                          {JSON.stringify(tool.toolInput, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="text-text-muted">Output:</span>
                        <pre className="text-text-primary whitespace-pre-wrap max-h-48 overflow-auto text-xs">
                          {tool.toolOutput?.slice(0, 2000)}
                          {(tool.toolOutput?.length || 0) > 2000 && '...'}
                        </pre>
                      </div>
                      <button
                        onClick={() => copyToClipboard(tool.toolOutput || '', tool.uuid)}
                        className="p-1 text-text-muted hover:text-text-primary ml-2 flex-shrink-0"
                      >
                        {copiedId === tool.uuid ? (
                          <Check className="w-3 h-3 text-accent-green" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
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
  )
})

export default SessionManager
