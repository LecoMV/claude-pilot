import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Search,
  LayoutDashboard,
  FolderOpen,
  Server,
  Database,
  User,
  Settings,
  Terminal,
  Cpu,
  Logs,
  Brain,
  RefreshCw,
  Plug,
  MessageSquare,
  Activity,
  Zap,
} from 'lucide-react'

interface CommandAction {
  id: string
  title: string
  description?: string
  category: 'navigation' | 'mcp' | 'session' | 'memory' | 'action'
  icon: React.ReactNode
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: string) => void
}

export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Define all available commands
  const commands: CommandAction[] = useMemo(
    () => [
      // Navigation
      {
        id: 'nav-dashboard',
        title: 'Go to Dashboard',
        description: 'View system status and metrics',
        category: 'navigation',
        icon: <LayoutDashboard className="w-4 h-4" />,
        shortcut: 'G D',
        action: () => onNavigate('dashboard'),
      },
      {
        id: 'nav-projects',
        title: 'Go to Projects',
        description: 'Browse Claude projects',
        category: 'navigation',
        icon: <FolderOpen className="w-4 h-4" />,
        shortcut: 'G P',
        action: () => onNavigate('projects'),
      },
      {
        id: 'nav-sessions',
        title: 'Go to Sessions',
        description: 'View external Claude sessions',
        category: 'navigation',
        icon: <Activity className="w-4 h-4" />,
        shortcut: 'G S',
        action: () => onNavigate('sessions'),
      },
      {
        id: 'nav-mcp',
        title: 'Go to MCP Servers',
        description: 'Manage MCP server connections',
        category: 'navigation',
        icon: <Server className="w-4 h-4" />,
        shortcut: 'G M',
        action: () => onNavigate('mcp'),
      },
      {
        id: 'nav-memory',
        title: 'Go to Memory Browser',
        description: 'Search PostgreSQL, Memgraph, Qdrant',
        category: 'navigation',
        icon: <Database className="w-4 h-4" />,
        shortcut: 'G B',
        action: () => onNavigate('memory'),
      },
      {
        id: 'nav-profiles',
        title: 'Go to Profiles',
        description: 'Manage Claude profiles',
        category: 'navigation',
        icon: <User className="w-4 h-4" />,
        action: () => onNavigate('profiles'),
      },
      {
        id: 'nav-agents',
        title: 'Go to Agents',
        description: 'View agent swarm status',
        category: 'navigation',
        icon: <Brain className="w-4 h-4" />,
        action: () => onNavigate('agents'),
      },
      {
        id: 'nav-terminal',
        title: 'Go to Terminal',
        description: 'Open integrated terminal',
        category: 'navigation',
        icon: <Terminal className="w-4 h-4" />,
        shortcut: 'G T',
        action: () => onNavigate('terminal'),
      },
      {
        id: 'nav-services',
        title: 'Go to Services',
        description: 'Manage systemd and containers',
        category: 'navigation',
        icon: <Cpu className="w-4 h-4" />,
        action: () => onNavigate('services'),
      },
      {
        id: 'nav-logs',
        title: 'Go to Logs',
        description: 'View application logs',
        category: 'navigation',
        icon: <Logs className="w-4 h-4" />,
        action: () => onNavigate('logs'),
      },
      {
        id: 'nav-settings',
        title: 'Go to Settings',
        description: 'Application preferences',
        category: 'navigation',
        icon: <Settings className="w-4 h-4" />,
        shortcut: ',',
        action: () => onNavigate('settings'),
      },
      // Actions
      {
        id: 'action-refresh',
        title: 'Refresh System Status',
        description: 'Reload all system data',
        category: 'action',
        icon: <RefreshCw className="w-4 h-4" />,
        shortcut: 'R',
        action: async () => {
          await window.electron.invoke('system:status')
          onClose()
        },
      },
      {
        id: 'action-mcp-reload',
        title: 'Reload MCP Servers',
        description: 'Restart all MCP connections',
        category: 'mcp',
        icon: <Plug className="w-4 h-4" />,
        action: async () => {
          await window.electron.invoke('mcp:reload')
          onClose()
        },
      },
      {
        id: 'action-new-terminal',
        title: 'New Terminal',
        description: 'Open a new terminal tab',
        category: 'action',
        icon: <Terminal className="w-4 h-4" />,
        action: async () => {
          await window.electron.invoke('terminal:create')
          onNavigate('terminal')
        },
      },
      // Memory
      {
        id: 'memory-search',
        title: 'Search Memory',
        description: 'Unified search across all databases',
        category: 'memory',
        icon: <Search className="w-4 h-4" />,
        action: () => onNavigate('memory'),
      },
      // Sessions
      {
        id: 'session-discover',
        title: 'Discover Sessions',
        description: 'Find all Claude Code sessions',
        category: 'session',
        icon: <Activity className="w-4 h-4" />,
        action: () => onNavigate('sessions'),
      },
      {
        id: 'session-chat',
        title: 'Open Chat Interface',
        description: 'Chat with Claude in a project',
        category: 'session',
        icon: <MessageSquare className="w-4 h-4" />,
        action: () => onNavigate('chat'),
      },
    ],
    [onNavigate, onClose]
  )

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands
    const lowerQuery = query.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery) ||
        cmd.category.toLowerCase().includes(lowerQuery)
    )
  }, [commands, query])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action()
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filteredCommands, selectedIndex, onClose]
  )

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.children[selectedIndex] as HTMLElement
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!isOpen) return null

  const getCategoryColor = (category: CommandAction['category']) => {
    switch (category) {
      case 'navigation':
        return 'text-accent-blue'
      case 'mcp':
        return 'text-accent-green'
      case 'session':
        return 'text-accent-purple'
      case 'memory':
        return 'text-accent-teal'
      case 'action':
        return 'text-accent-yellow'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Search className="w-5 h-5 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted focus:outline-none text-lg"
          />
          <kbd className="px-2 py-1 text-xs bg-surface text-text-muted rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-text-muted">No commands found</div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action()
                  onClose()
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent-purple/20 text-text-primary'
                    : 'text-text-muted hover:bg-surface'
                }`}
              >
                <span className={getCategoryColor(cmd.category)}>{cmd.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-text-primary">{cmd.title}</div>
                  {cmd.description && (
                    <div className="text-sm text-text-muted truncate">{cmd.description}</div>
                  )}
                </div>
                {cmd.shortcut && (
                  <kbd className="px-2 py-1 text-xs bg-surface text-text-muted rounded shrink-0">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t border-border text-xs text-text-muted bg-surface/50">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface rounded">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface rounded">↵</kbd> Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface rounded">ESC</kbd> Close
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-accent-purple" />
            <span>Claude Pilot</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook to manage command palette state
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  }
}

export default CommandPalette
