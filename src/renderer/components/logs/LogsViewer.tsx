import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Terminal,
  Search,
  Filter,
  Trash2,
  Pause,
  Play,
  Download,
  ArrowDown,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Server,
  Brain,
  Cpu,
  Workflow,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLogsStore, type LogSource, type LogLevel, type LogEntry } from '@/stores/logs'

const sourceColors: Record<LogSource | 'all', string> = {
  all: 'text-text-primary',
  claude: 'text-accent-purple',
  mcp: 'text-accent-blue',
  system: 'text-accent-green',
  agent: 'text-accent-yellow',
  workflow: 'text-cyan-400',
}

const sourceIcons: Record<LogSource, typeof Terminal> = {
  claude: Terminal,
  mcp: Server,
  system: Cpu,
  agent: Brain,
  workflow: Workflow,
  all: Terminal,
}

const levelColors: Record<LogLevel, string> = {
  debug: 'text-text-muted',
  info: 'text-accent-blue',
  warn: 'text-accent-yellow',
  error: 'text-accent-red',
}

const levelIcons: Record<LogLevel, typeof Info> = {
  debug: Bug,
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
}

export function LogsViewer() {
  const {
    logs,
    filter,
    levelFilter,
    searchQuery,
    paused,
    autoScroll,
    addLogs,
    clearLogs,
    setFilter,
    setLevelFilter,
    setSearchQuery,
    setPaused,
    setAutoScroll,
  } = useLogsStore()

  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load initial logs
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true)
      const recentLogs = await window.electron.invoke('logs:recent', 200)
      addLogs(recentLogs)
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      setLoading(false)
    }
  }, [addLogs])

  useEffect(() => {
    loadLogs()

    // Subscribe to real-time logs
    const unsubscribe = window.electron.on('logs:entry', (log: LogEntry) => {
      useLogsStore.getState().addLog(log)
    })

    return () => unsubscribe()
  }, [loadLogs])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filter !== 'all' && log.source !== filter) return false
    if (levelFilter !== 'all' && log.level !== levelFilter) return false
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  const exportLogs = () => {
    const content = filteredLogs
      .map((log) => `[${new Date(log.timestamp).toISOString()}] [${log.source}] [${log.level}] ${log.message}`)
      .join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const logCounts = {
    total: logs.length,
    error: logs.filter((l) => l.level === 'error').length,
    warn: logs.filter((l) => l.level === 'warn').length,
  }

  return (
    <div className="space-y-4 animate-in">
      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard icon={Terminal} value={logCounts.total} label="Total Logs" color="text-text-primary" />
        <StatCard icon={AlertCircle} value={logCounts.error} label="Errors" color="text-accent-red" />
        <StatCard icon={AlertTriangle} value={logCounts.warn} label="Warnings" color="text-accent-yellow" />
        <StatCard
          icon={paused ? Pause : Play}
          value={paused ? 'Paused' : 'Live'}
          label="Stream Status"
          color={paused ? 'text-accent-yellow' : 'text-accent-green'}
        />
        <StatCard
          icon={ArrowDown}
          value={autoScroll ? 'On' : 'Off'}
          label="Auto-scroll"
          color={autoScroll ? 'text-accent-blue' : 'text-text-muted'}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Source filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-muted" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as LogSource)}
            className="input py-1.5 text-sm"
          >
            <option value="all">All Sources</option>
            <option value="claude">Claude</option>
            <option value="mcp">MCP</option>
            <option value="system">System</option>
            <option value="agent">Agents</option>
            <option value="workflow">Workflows</option>
          </select>
        </div>

        {/* Level filter */}
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
          className="input py-1.5 text-sm"
        >
          <option value="all">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 w-full py-1.5 text-sm"
          />
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={() => setPaused(!paused)}
          className={cn('btn btn-secondary', paused && 'bg-accent-yellow/20')}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn('btn btn-secondary', autoScroll && 'bg-accent-blue/20')}
          title="Toggle auto-scroll"
        >
          <ArrowDown className="w-4 h-4" />
        </button>

        <button onClick={loadLogs} className="btn btn-secondary" title="Refresh">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>

        <button onClick={exportLogs} className="btn btn-secondary" title="Export logs">
          <Download className="w-4 h-4" />
        </button>

        <button onClick={clearLogs} className="btn btn-secondary text-accent-red" title="Clear logs">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Log Output */}
      <div
        ref={containerRef}
        className="card bg-background font-mono text-sm h-[calc(100vh-340px)] overflow-auto"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Terminal className="w-12 h-12 mb-4" />
            <p>{loading ? 'Loading logs...' : 'No logs to display'}</p>
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {filteredLogs.map((log) => (
              <LogLine key={log.id} log={log} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}

function LogLine({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const SourceIcon = sourceIcons[log.source] || Terminal
  const LevelIcon = levelIcons[log.level]
  const timestamp = new Date(log.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })

  return (
    <div
      className={cn(
        'flex items-start gap-2 px-2 py-1 rounded hover:bg-surface-hover cursor-pointer',
        log.level === 'error' && 'bg-accent-red/5',
        log.level === 'warn' && 'bg-accent-yellow/5'
      )}
      onClick={() => log.metadata && setExpanded(!expanded)}
    >
      <span className="text-text-muted text-xs shrink-0">{timestamp}</span>
      <SourceIcon className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', sourceColors[log.source])} />
      <LevelIcon className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', levelColors[log.level])} />
      <span className={cn('text-xs uppercase w-14 shrink-0', sourceColors[log.source])}>
        {log.source}
      </span>
      <span className={cn('flex-1 break-all', levelColors[log.level])}>{log.message}</span>
      {log.metadata && (
        <span className="text-text-muted text-xs">{expanded ? '▼' : '▶'}</span>
      )}
      {expanded && log.metadata && (
        <div className="w-full mt-1 p-2 bg-surface rounded text-xs">
          <pre className="whitespace-pre-wrap text-text-muted">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

interface StatCardProps {
  icon: typeof Terminal
  value: number | string
  label: string
  color: string
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <Icon className={cn('w-5 h-5', color)} />
        <div>
          <p className="text-lg font-semibold text-text-primary">{value}</p>
          <p className="text-xs text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}
