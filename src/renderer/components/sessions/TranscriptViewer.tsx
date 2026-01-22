/**
 * Session Transcript Viewer
 * Hybrid terminal-style conversation viewer with syntax highlighting
 */

import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import {
  MessageSquare,
  Bot,
  User,
  Wrench,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Download,
  Search,
  Loader2,
  Terminal,
  Code,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import type { SessionMessage, ExternalSession } from '@shared/types'

interface TranscriptViewerProps {
  session: ExternalSession
  _onClose?: () => void // Prefixed with _ as unused but part of interface for future use
}

export function TranscriptViewer({ session, _onClose }: TranscriptViewerProps) {
  // tRPC hooks
  const utils = trpc.useUtils()

  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showToolCalls, setShowToolCalls] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load messages
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true)
      setError(null)
      try {
        const msgs = await utils.sessions.getMessages.fetch({ sessionId: session.id, limit: 1000 })
        setMessages(msgs)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    loadMessages()
  }, [session.id, utils])

  // Group consecutive tool calls
  const groupedMessages = useMemo(() => {
    const groups: Array<SessionMessage | { type: 'tool-group'; tools: SessionMessage[] }> = []
    let currentToolGroup: SessionMessage[] = []

    for (const msg of messages) {
      if (msg.type === 'tool-result') {
        currentToolGroup.push(msg)
      } else {
        // Flush any pending tool group
        if (currentToolGroup.length > 0) {
          groups.push({ type: 'tool-group', tools: currentToolGroup })
          currentToolGroup = []
        }
        groups.push(msg)
      }
    }
    // Flush remaining tool group
    if (currentToolGroup.length > 0) {
      groups.push({ type: 'tool-group', tools: currentToolGroup })
    }
    return groups
  }, [messages])

  // Filter messages
  const filteredGroups = useMemo(() => {
    if (!searchQuery && showToolCalls) return groupedMessages

    return groupedMessages.filter((group) => {
      // Skip tool groups if hidden
      if ('tools' in group) {
        if (!showToolCalls) return false
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          return group.tools.some(
            (t) =>
              t.toolName?.toLowerCase().includes(query) ||
              t.toolOutput?.toLowerCase().includes(query)
          )
        }
        return true
      }

      // Regular message
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return group.content?.toLowerCase().includes(query)
      }
      return true
    })
  }, [groupedMessages, showToolCalls, searchQuery])

  // Calculate token totals
  const tokenStats = useMemo(() => {
    let input = 0
    let output = 0
    let cached = 0

    for (const msg of messages) {
      if (msg.usage) {
        input += msg.usage.input_tokens || 0
        output += msg.usage.output_tokens || 0
        cached += msg.usage.cache_read_input_tokens || 0
      }
    }

    return { input, output, cached }
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

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const exportMarkdown = () => {
    let md = `# Session Transcript\n\n`
    md += `**Project:** ${session.projectName}\n`
    md += `**Started:** ${new Date(session.startTime).toLocaleString()}\n`
    md += `**Messages:** ${session.stats.messageCount}\n\n---\n\n`

    for (const msg of messages) {
      if (msg.type === 'user') {
        md += `## User\n\n${msg.content}\n\n`
      } else if (msg.type === 'assistant') {
        md += `## Assistant\n\n${msg.content}\n\n`
      } else if (msg.type === 'tool-result') {
        md += `### Tool: ${msg.toolName}\n\n\`\`\`\n${msg.toolOutput?.slice(0, 500)}...\n\`\`\`\n\n`
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${session.id}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-accent-purple" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Session Transcript</h2>
              <p className="text-sm text-text-muted font-mono">{session.projectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportMarkdown}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover text-text-muted
                         hover:text-text-primary rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-text-muted">{messages.length} messages</span>
          <span className="text-text-muted">↑ {tokenStats.input.toLocaleString()}</span>
          <span className="text-text-muted">↓ {tokenStats.output.toLocaleString()}</span>
          {tokenStats.cached > 0 && (
            <span className="text-accent-green">
              ⚡ {tokenStats.cached.toLocaleString()} cached
            </span>
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg
                         text-text-primary placeholder:text-text-muted text-sm font-mono
                         focus:outline-none focus:border-accent-purple"
            />
          </div>
          <button
            onClick={() => setShowToolCalls(!showToolCalls)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors font-mono',
              showToolCalls
                ? 'bg-accent-green/10 text-accent-green'
                : 'bg-surface-hover text-text-muted'
            )}
          >
            <Wrench className="w-4 h-4" />
            Tools
          </button>
        </div>
      </div>

      {/* Terminal-style Messages */}
      <div className="flex-1 overflow-y-auto bg-background font-mono text-sm">
        {error && (
          <div className="p-4 bg-accent-red/10 border-b border-accent-red/20">
            <p className="text-accent-red">{error}</p>
          </div>
        )}

        <div className="p-4 space-y-1">
          {filteredGroups.map((group, index) => {
            // Tool group
            if ('tools' in group) {
              return (
                <ToolCallGroup
                  key={`tool-group-${index}`}
                  tools={group.tools}
                  expandedTools={expandedTools}
                  toggleToolExpanded={toggleToolExpanded}
                  copiedId={copiedId}
                  copyToClipboard={copyToClipboard}
                />
              )
            }

            // Regular message
            const isUser = group.type === 'user'

            return (
              <TerminalMessage
                key={group.uuid}
                message={group}
                isUser={isUser}
                formatTime={formatTime}
                copiedId={copiedId}
                copyToClipboard={copyToClipboard}
              />
            )
          })}

          {filteredGroups.length === 0 && !error && (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-muted">
                {searchQuery ? 'No messages match your search' : 'No messages in this session'}
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  )
}

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
  const content = message.content || ''
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
    <div className={cn('py-2 border-b border-border/30', isUser && 'bg-surface/30')}>
      {/* Header line */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted text-xs">[{formatTime(message.timestamp)}]</span>
        {isUser ? (
          <>
            <User className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-accent-blue font-semibold">USER</span>
          </>
        ) : (
          <>
            <Bot className="w-3.5 h-3.5 text-accent-purple" />
            <span className="text-accent-purple font-semibold">ASSISTANT</span>
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
          'pl-4 text-text-primary',
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
    <div className="py-1 border-l-2 border-accent-green/30 pl-3 my-2">
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
                        <pre className="text-text-primary">
                          {JSON.stringify(tool.toolInput, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <span className="text-text-muted">Output:</span>
                        <pre className="text-text-primary whitespace-pre-wrap max-h-48 overflow-auto">
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

// Standalone viewer wrapper
export function TranscriptViewerPage() {
  // tRPC hooks
  const utils = trpc.useUtils()

  const [selectedSession, setSelectedSession] = useState<ExternalSession | null>(null)
  const [sessions, setSessions] = useState<ExternalSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const discovered = await utils.sessions.discover.fetch()
        setSessions(discovered.slice(0, 20)) // Last 20 sessions
      } catch (err) {
        console.error('Failed to load sessions:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSessions()
  }, [utils])

  if (selectedSession) {
    return (
      <div className="h-full">
        <button
          onClick={() => setSelectedSession(null)}
          className="mb-4 text-sm text-accent-purple hover:underline"
        >
          ← Back to sessions
        </button>
        <TranscriptViewer session={selectedSession} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Session Transcripts</h2>
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setSelectedSession(session)}
            className="w-full card p-4 text-left hover:border-border-hover transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">{session.projectName}</p>
                <p className="text-sm text-text-muted">
                  {session.stats.messageCount} messages •{' '}
                  {new Date(session.startTime).toLocaleString()}
                </p>
              </div>
              <ChevronDown className="w-5 h-5 text-text-muted -rotate-90" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
