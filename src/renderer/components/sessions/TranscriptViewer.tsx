/**
 * Session Transcript Viewer
 * Full conversation replay with tool call visualization
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  MessageSquare,
  Bot,
  User,
  Wrench,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
  Search,
  Loader2,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import type { SessionMessage, ExternalSession } from '@shared/types'

interface TranscriptViewerProps {
  session: ExternalSession
  _onClose?: () => void // Prefixed with _ as unused but part of interface for future use
}

const MESSAGE_TYPE_CONFIG = {
  user: {
    icon: User,
    label: 'User',
    bgColor: 'bg-accent-blue/10',
    borderColor: 'border-accent-blue/30',
    iconColor: 'text-accent-blue',
  },
  assistant: {
    icon: Bot,
    label: 'Assistant',
    bgColor: 'bg-accent-purple/10',
    borderColor: 'border-accent-purple/30',
    iconColor: 'text-accent-purple',
  },
  'tool-result': {
    icon: Wrench,
    label: 'Tool Result',
    bgColor: 'bg-accent-green/10',
    borderColor: 'border-accent-green/30',
    iconColor: 'text-accent-green',
  },
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
  const [showToolResults, setShowToolResults] = useState(true)
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

  // Filter messages
  const filteredMessages = useMemo(() => {
    let filtered = messages

    // Filter by type
    if (!showToolResults) {
      filtered = filtered.filter((m) => m.type !== 'tool-result')
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (m) =>
          m.content?.toLowerCase().includes(query) ||
          m.toolName?.toLowerCase().includes(query) ||
          m.toolOutput?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [messages, showToolResults, searchQuery])

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

  const toggleToolExpanded = (id: string) => {
    const newExpanded = new Set(expandedTools)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedTools(newExpanded)
  }

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
    return new Date(timestamp).toLocaleTimeString()
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
          <div>
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Session Transcript
            </h2>
            <p className="text-sm text-text-muted">{session.projectName}</p>
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
        <div className="flex items-center gap-4 text-sm">
          <span className="text-text-muted">{filteredMessages.length} messages</span>
          <span className="text-text-muted">Input: {tokenStats.input.toLocaleString()} tokens</span>
          <span className="text-text-muted">
            Output: {tokenStats.output.toLocaleString()} tokens
          </span>
          {tokenStats.cached > 0 && (
            <span className="text-accent-green">
              Cached: {tokenStats.cached.toLocaleString()} tokens
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
              placeholder="Search messages..."
              className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg
                         text-text-primary placeholder:text-text-muted text-sm
                         focus:outline-none focus:border-accent-purple"
            />
          </div>
          <button
            onClick={() => setShowToolResults(!showToolResults)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              showToolResults
                ? 'bg-accent-green/10 text-accent-green'
                : 'bg-surface-hover text-text-muted'
            )}
          >
            <Wrench className="w-4 h-4" />
            Tools
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="p-4 bg-accent-red/10 border border-accent-red/20 rounded-lg">
            <p className="text-accent-red text-sm">{error}</p>
          </div>
        )}

        {filteredMessages.map((message, _index) => {
          const config = MESSAGE_TYPE_CONFIG[message.type as keyof typeof MESSAGE_TYPE_CONFIG]
          if (!config) return null

          const Icon = config.icon
          const isToolResult = message.type === 'tool-result'
          const isExpanded = expandedTools.has(message.uuid)

          return (
            <div
              key={message.uuid}
              className={cn('rounded-lg border', config.bgColor, config.borderColor)}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-inherit">
                <div className="flex items-center gap-2">
                  <Icon className={cn('w-4 h-4', config.iconColor)} />
                  <span className={cn('text-sm font-medium', config.iconColor)}>
                    {config.label}
                  </span>
                  {isToolResult && message.toolName && (
                    <span className="text-xs text-text-muted font-mono">{message.toolName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">{formatTime(message.timestamp)}</span>
                  {message.usage && (
                    <span className="text-xs text-text-muted">
                      {message.usage.input_tokens + message.usage.output_tokens} tokens
                    </span>
                  )}
                  <button
                    onClick={() =>
                      copyToClipboard(message.content || message.toolOutput || '', message.uuid)
                    }
                    className="p-1 text-text-muted hover:text-text-primary rounded"
                  >
                    {copiedId === message.uuid ? (
                      <Check className="w-3 h-3 text-accent-green" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Message Content */}
              <div className="px-4 py-3">
                {isToolResult ? (
                  <div>
                    {message.toolInput && (
                      <div className="mb-2">
                        <button
                          onClick={() => toggleToolExpanded(message.uuid)}
                          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                          Input
                        </button>
                        {isExpanded && (
                          <pre className="mt-1 p-2 bg-background rounded text-xs overflow-x-auto">
                            {JSON.stringify(message.toolInput, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                    <div className="text-sm text-text-primary">
                      <pre className="whitespace-pre-wrap font-mono text-xs overflow-x-auto max-h-48">
                        {message.toolOutput?.slice(0, 1000)}
                        {(message.toolOutput?.length || 0) > 1000 && '...'}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-sm text-text-primary whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {filteredMessages.length === 0 && !error && (
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
  )
}

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
