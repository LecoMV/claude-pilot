/**
 * Context Inspector Panel
 *
 * Detailed inspection of Claude Code session context including:
 * - Token breakdown by source
 * - Files accessed in session
 * - Tool usage summary
 * - Message timeline
 */

import { useState, useMemo } from 'react'
import {
  Eye,
  FileText,
  MessageSquare,
  Wrench,
  Hash,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Filter,
  Download,
  User,
  Bot,
  Terminal,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'

interface ContextInspectorProps {
  transcriptPath: string | null
  className?: string
}

interface TokenBreakdown {
  source: string
  count: number
  percentage: number
  color: string
}

export function ContextInspector({ transcriptPath, className }: ContextInspectorProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'messages' | 'files' | 'tools'>(
    'overview'
  )
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Fetch transcript stats
  const statsQuery = trpc.transcript.stats.useQuery(
    { filePath: transcriptPath || '' },
    { enabled: !!transcriptPath, refetchInterval: 30000 }
  )

  // Fetch last 100 messages for inspection
  const messagesQuery = trpc.transcript.last.useQuery(
    { filePath: transcriptPath || '', count: 100 },
    { enabled: !!transcriptPath, refetchInterval: 30000 }
  )

  // Calculate token breakdown
  const tokenBreakdown = useMemo((): TokenBreakdown[] => {
    if (!messagesQuery.data) return []

    const counts: Record<string, number> = {
      user: 0,
      assistant: 0,
      tool_use: 0,
      tool_result: 0,
      system: 0,
    }

    for (const msg of messagesQuery.data) {
      // Estimate tokens (rough: 4 chars per token)
      const content =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
      const estimatedTokens = Math.ceil(content.length / 4)
      counts[msg.type] = (counts[msg.type] || 0) + estimatedTokens
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    if (total === 0) return []

    const colors: Record<string, string> = {
      user: 'bg-accent-blue',
      assistant: 'bg-accent-purple',
      tool_use: 'bg-accent-yellow',
      tool_result: 'bg-accent-green',
      system: 'bg-text-muted',
    }

    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([source, count]) => ({
        source,
        count,
        percentage: (count / total) * 100,
        color: colors[source] || 'bg-text-muted',
      }))
      .sort((a, b) => b.count - a.count)
  }, [messagesQuery.data])

  // Extract files accessed from messages
  const filesAccessed = useMemo(() => {
    if (!messagesQuery.data) return []

    const files = new Map<string, { path: string; action: string; timestamp: number }>()

    for (const msg of messagesQuery.data) {
      if (msg.type === 'tool_use' || msg.type === 'tool_result') {
        try {
          const content =
            typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
          if (content?.name === 'Read' || content?.name === 'Edit' || content?.name === 'Write') {
            const filePath = content.input?.file_path || content.input?.path
            if (filePath) {
              files.set(filePath, {
                path: filePath,
                action: content.name,
                timestamp: msg.timestamp,
              })
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return Array.from(files.values()).sort((a, b) => b.timestamp - a.timestamp)
  }, [messagesQuery.data])

  // Extract tool usage stats
  const toolUsage = useMemo(() => {
    if (!messagesQuery.data) return []

    const tools = new Map<string, number>()

    for (const msg of messagesQuery.data) {
      if (msg.type === 'tool_use') {
        try {
          const content =
            typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
          const toolName = content?.name || 'Unknown'
          tools.set(toolName, (tools.get(toolName) || 0) + 1)
        } catch {
          // Ignore parse errors
        }
      }
    }

    return Array.from(tools.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [messagesQuery.data])

  // Filter messages
  const filteredMessages = useMemo(() => {
    if (!messagesQuery.data) return []

    return messagesQuery.data.filter((msg) => {
      if (typeFilter !== 'all' && msg.type !== typeFilter) return false
      if (searchQuery) {
        const content =
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '')
        if (!content.toLowerCase().includes(searchQuery.toLowerCase())) return false
      }
      return true
    })
  }, [messagesQuery.data, typeFilter, searchQuery])

  const loading = statsQuery.isLoading || messagesQuery.isLoading

  const toggleMessage = (index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const exportContext = () => {
    if (!messagesQuery.data) return

    const content = messagesQuery.data
      .map((msg) => {
        const timestamp = new Date(msg.timestamp).toISOString()
        const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        return `[${timestamp}] [${msg.type}]\n${text}\n`
      })
      .join('\n---\n\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `context-export-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!transcriptPath) {
    return (
      <div className={cn('card p-6', className)}>
        <div className="flex flex-col items-center justify-center h-48 text-text-muted">
          <Eye className="w-12 h-12 mb-4 opacity-50" />
          <p>Select a session to inspect context</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('card', className)}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-accent-purple" />
          <h3 className="font-medium text-text-primary">Context Inspector</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              statsQuery.refetch()
              messagesQuery.refetch()
            }}
            className="btn btn-secondary btn-sm"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={exportContext} className="btn btn-secondary btn-sm" title="Export">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['overview', 'messages', 'files', 'tools'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors capitalize',
              activeTab === tab
                ? 'text-accent-purple border-b-2 border-accent-purple'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                icon={MessageSquare}
                label="Messages"
                value={statsQuery.data?.totalMessages ?? 0}
                color="text-accent-blue"
              />
              <StatCard
                icon={User}
                label="User"
                value={statsQuery.data?.userMessages ?? 0}
                color="text-accent-green"
              />
              <StatCard
                icon={Bot}
                label="Assistant"
                value={statsQuery.data?.assistantMessages ?? 0}
                color="text-accent-purple"
              />
              <StatCard
                icon={Wrench}
                label="Tool Calls"
                value={statsQuery.data?.toolCalls ?? 0}
                color="text-accent-yellow"
              />
            </div>

            {/* Token Breakdown */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Token Breakdown (estimated)
              </h4>
              <div className="h-4 flex rounded overflow-hidden bg-surface">
                {tokenBreakdown.map((item) => (
                  <div
                    key={item.source}
                    className={cn(item.color, 'transition-all')}
                    style={{ width: `${item.percentage}%` }}
                    title={`${item.source}: ${item.count.toLocaleString()} tokens (${item.percentage.toFixed(1)}%)`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                {tokenBreakdown.map((item) => (
                  <div key={item.source} className="flex items-center gap-2">
                    <div className={cn('w-3 h-3 rounded', item.color)} />
                    <span className="text-text-muted capitalize">{item.source}</span>
                    <span className="text-text-primary font-medium">
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Files Accessed ({filesAccessed.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {filesAccessed.slice(0, 5).map((file) => (
                    <div
                      key={file.path}
                      className="text-xs text-text-muted truncate flex items-center gap-2"
                    >
                      <span
                        className={cn(
                          'px-1 py-0.5 rounded text-[10px] font-medium',
                          file.action === 'Read' && 'bg-accent-blue/20 text-accent-blue',
                          file.action === 'Edit' && 'bg-accent-yellow/20 text-accent-yellow',
                          file.action === 'Write' && 'bg-accent-green/20 text-accent-green'
                        )}
                      >
                        {file.action}
                      </span>
                      <span className="truncate">{file.path.split('/').pop()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Top Tools ({toolUsage.length})
                </h4>
                <div className="space-y-1">
                  {toolUsage.slice(0, 5).map((tool) => (
                    <div
                      key={tool.name}
                      className="text-xs flex items-center justify-between gap-2"
                    >
                      <span className="text-text-muted truncate">{tool.name}</span>
                      <span className="text-text-primary font-medium">{tool.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 w-full py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-text-muted" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="input py-1.5 text-sm"
                >
                  <option value="all">All Types</option>
                  <option value="user">User</option>
                  <option value="assistant">Assistant</option>
                  <option value="tool_use">Tool Use</option>
                  <option value="tool_result">Tool Result</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>

            {/* Messages List */}
            <div className="space-y-2 max-h-96 overflow-auto">
              {filteredMessages.length === 0 ? (
                <div className="text-center text-text-muted py-8">No messages found</div>
              ) : (
                filteredMessages.map((msg, index) => (
                  <MessageRow
                    key={index}
                    message={msg}
                    expanded={expandedMessages.has(index)}
                    onToggle={() => toggleMessage(index)}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-2 max-h-96 overflow-auto">
            {filesAccessed.length === 0 ? (
              <div className="text-center text-text-muted py-8">No files accessed</div>
            ) : (
              filesAccessed.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded bg-surface hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-text-muted shrink-0" />
                    <span className="text-sm truncate">{file.path}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        file.action === 'Read' && 'bg-accent-blue/20 text-accent-blue',
                        file.action === 'Edit' && 'bg-accent-yellow/20 text-accent-yellow',
                        file.action === 'Write' && 'bg-accent-green/20 text-accent-green'
                      )}
                    >
                      {file.action}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(file.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-2 max-h-96 overflow-auto">
            {toolUsage.length === 0 ? (
              <div className="text-center text-text-muted py-8">No tools used</div>
            ) : (
              toolUsage.map((tool, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded bg-surface hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <Terminal className="w-4 h-4 text-text-muted" />
                    <span className="text-sm">{tool.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{tool.count}</span>
                    <span className="text-xs text-text-muted">calls</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  icon: typeof Eye
  label: string
  value: number
  color: string
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className="p-3 rounded bg-surface">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('w-4 h-4', color)} />
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-xl font-semibold text-text-primary">{value.toLocaleString()}</p>
    </div>
  )
}

interface MessageRowProps {
  message: {
    type: string
    timestamp: number
    content: unknown
  }
  expanded: boolean
  onToggle: () => void
}

function MessageRow({ message, expanded, onToggle }: MessageRowProps) {
  const typeIcons: Record<string, typeof User> = {
    user: User,
    assistant: Bot,
    tool_use: Wrench,
    tool_result: Terminal,
    system: AlertCircle,
  }

  const typeColors: Record<string, string> = {
    user: 'text-accent-blue',
    assistant: 'text-accent-purple',
    tool_use: 'text-accent-yellow',
    tool_result: 'text-accent-green',
    system: 'text-text-muted',
  }

  const Icon = typeIcons[message.type] || MessageSquare
  const color = typeColors[message.type] || 'text-text-muted'

  const content =
    typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)
  const preview = content.slice(0, 100) + (content.length > 100 ? '...' : '')

  return (
    <div
      className="p-2 rounded bg-surface hover:bg-surface-hover cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-2 shrink-0">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
          <Icon className={cn('w-4 h-4', color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-medium uppercase', color)}>{message.type}</span>
            <span className="text-xs text-text-muted">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {expanded ? (
            <pre className="text-xs text-text-muted whitespace-pre-wrap break-all overflow-auto max-h-64">
              {content}
            </pre>
          ) : (
            <p className="text-xs text-text-muted truncate">{preview}</p>
          )}
        </div>
      </div>
    </div>
  )
}
