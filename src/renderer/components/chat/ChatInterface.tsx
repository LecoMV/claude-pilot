import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Send,
  Loader,
  Plus,
  Trash2,
  User,
  Bot,
  Terminal,
  FolderOpen,
  RefreshCw,
  Code,
  Wrench,
  Maximize2,
  Minimize2,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore, type ChatMessage, type ChatSession } from '@/stores/chat'

export function ChatInterface() {
  const {
    currentSession,
    inputValue,
    isStreaming,
    isLoading,
    setCurrentSession,
    setInputValue,
    setIsStreaming,
    setIsLoading,
    addMessage,
    updateMessage,
    clearMessages,
  } = useChatStore()

  const [projects, setProjects] = useState<{ path: string; name: string }[]>([])
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectList = await window.electron.invoke('claude:projects')
        setProjects(projectList.map((p: { path: string; name: string }) => ({
          path: p.path,
          name: p.name,
        })))
      } catch (error) {
        console.error('Failed to load projects:', error)
      }
    }
    loadProjects()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  // Listen for streamed responses
  useEffect(() => {
    const unsubscribe = window.electron.on('chat:response', (data: {
      type: 'chunk' | 'done' | 'error'
      content?: string
      messageId?: string
      error?: string
    }) => {
      if (data.type === 'chunk' && data.messageId && data.content) {
        updateMessage(data.messageId, data.content)
      } else if (data.type === 'done') {
        setIsStreaming(false)
      } else if (data.type === 'error') {
        setIsStreaming(false)
        console.error('Chat error:', data.error)
      }
    })

    return () => unsubscribe()
  }, [updateMessage, setIsStreaming])

  const startNewSession = useCallback((projectPath: string, projectName: string) => {
    const session: ChatSession = {
      id: `session-${Date.now()}`,
      projectPath,
      projectName,
      startedAt: Date.now(),
      messages: [],
    }
    setCurrentSession(session)
    setShowProjectSelector(false)
  }, [setCurrentSession])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || !currentSession || isStreaming) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now(),
    }
    addMessage(userMessage)
    setInputValue('')
    setIsStreaming(true)

    // Create placeholder for assistant response
    const assistantMessageId = `msg-${Date.now()}-assistant`
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }
    addMessage(assistantMessage)

    try {
      await window.electron.invoke('chat:send', currentSession.projectPath, inputValue.trim(), assistantMessageId)
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsStreaming(false)
      updateMessage(assistantMessageId, 'Error: Failed to get response from Claude Code.')
    }
  }, [inputValue, currentSession, isStreaming, addMessage, setInputValue, setIsStreaming, updateMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center animate-in">
        <Bot className="w-16 h-16 text-accent-purple mb-4" />
        <h2 className="text-xl font-semibold text-text-primary mb-2">Claude Code Chat</h2>
        <p className="text-text-muted mb-6">Start a chat session with Claude Code</p>

        {showProjectSelector ? (
          <div className="card p-4 w-full max-w-md max-h-80 overflow-auto">
            <h3 className="text-sm font-medium text-text-primary mb-3">Select Project</h3>
            {projects.length === 0 ? (
              <p className="text-sm text-text-muted">No projects found</p>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <button
                    key={project.path}
                    onClick={() => startNewSession(project.path, project.name)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface hover:bg-surface-hover text-left transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-accent-blue" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text-primary truncate">{project.name}</p>
                      <p className="text-xs text-text-muted truncate">{project.path}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowProjectSelector(false)}
              className="w-full mt-4 btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowProjectSelector(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Chat Session
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      'flex flex-col h-full animate-in',
      expanded && 'fixed inset-0 z-50 bg-background p-4'
    )}>
      {/* Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent-purple" />
          <div>
            <p className="font-medium text-text-primary">{currentSession.projectName}</p>
            <p className="text-xs text-text-muted truncate max-w-xs">{currentSession.projectPath}</p>
          </div>
        </div>

        <div className="flex-1" />

        <button
          onClick={clearMessages}
          className="btn btn-secondary btn-sm"
          title="Clear messages"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => setExpanded(!expanded)}
          className="btn btn-secondary btn-sm"
          title={expanded ? 'Minimize' : 'Maximize'}
        >
          {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setCurrentSession(null)}
          className="btn btn-secondary btn-sm text-accent-red"
          title="Close session"
        >
          End Session
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {currentSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Bot className="w-12 h-12 mb-4" />
            <p>Start chatting with Claude Code</p>
            <p className="text-sm mt-2">Ask questions or give instructions</p>
          </div>
        ) : (
          currentSession.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pt-4 border-t border-border">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="input w-full min-h-[44px] max-h-32 py-3 pr-12 resize-none"
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
              className={cn(
                'absolute right-2 bottom-2 p-2 rounded-lg transition-colors',
                inputValue.trim() && !isStreaming
                  ? 'bg-accent-purple text-white hover:bg-accent-purple/80'
                  : 'text-text-muted'
              )}
            >
              {isStreaming ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Parse code blocks
  const parts = message.content.split(/(```[\s\S]*?```)/g)

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-accent-blue/20' : 'bg-accent-purple/20'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-accent-blue" />
        ) : (
          <Bot className="w-4 h-4 text-accent-purple" />
        )}
      </div>

      <div
        className={cn(
          'flex-1 max-w-[80%] rounded-lg p-4',
          isUser ? 'bg-accent-blue/10' : 'bg-surface',
          message.isStreaming && 'animate-pulse'
        )}
      >
        {parts.map((part, i) => {
          if (part.startsWith('```')) {
            const match = part.match(/```(\w+)?\n?([\s\S]*?)```/)
            if (match) {
              const [, lang, code] = match
              return (
                <div key={i} className="my-2 rounded-lg overflow-hidden bg-background">
                  <div className="flex items-center justify-between px-3 py-2 bg-surface-hover">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Code className="w-3 h-3" />
                      {lang || 'code'}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(code.trim())
                      }}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <pre className="p-3 text-sm overflow-x-auto font-mono">
                    <code>{code.trim()}</code>
                  </pre>
                </div>
              )
            }
          }
          return (
            <span key={i} className="whitespace-pre-wrap text-text-primary">
              {part}
            </span>
          )
        })}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-2 text-xs text-text-muted"
              >
                <Wrench className="w-3 h-3" />
                <span>{tool.name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-text-muted">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
          {!isUser && (
            <button
              onClick={handleCopy}
              className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
