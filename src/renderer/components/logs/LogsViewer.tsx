import { useEffect, useState, useCallback, memo } from 'react'
import { List, useListRef, type RowComponentProps } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
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
import { trpc } from '@/lib/trpc/react'
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

interface StatCardProps {
  icon: typeof Terminal
  value: number | string
  label: string
  color: string
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className={cn('text-2xl font-bold', color)}>{value}</p>
          <p className="text-xs text-text-muted">{label}</p>
        </div>
        <Icon className={cn('w-6 h-6', color)} />
      </div>
    </div>
  )
}

// Fixed row height for react-window v2
const ROW_HEIGHT = 32

// Row props type for react-window v2
interface LogRowProps {
  filteredLogs: LogEntry[]
  expandedRows: Set<string>
  toggleExpand: (id: string) => void
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

  const listRef = useListRef()
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // tRPC query for initial logs
  const recentLogsQuery = trpc.logs.recent.useQuery(
    { limit: 500 },
    { refetchInterval: false, enabled: true }
  )
  const loading = recentLogsQuery.isLoading

  // Sync logs to store when data arrives
  useEffect(() => {
    if (recentLogsQuery.data) {
      addLogs(recentLogsQuery.data)
    }
  }, [recentLogsQuery.data, addLogs])

  // Subscribe to real-time logs (keep legacy IPC for streaming)
  useEffect(() => {
    const unsubscribe = window.electron.on('logs:entry', (log: LogEntry) => {
      useLogsStore.getState().addLog(log)
    })
    return () => unsubscribe()
  }, [])

  const loadLogs = () => {
    recentLogsQuery.refetch()
  }

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filter !== 'all' && log.source !== filter) return false
    if (levelFilter !== 'all' && log.level !== levelFilter) return false
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && listRef.current && filteredLogs.length > 0) {
      listRef.current.scrollToRow(filteredLogs.length - 1)
    }
  }, [filteredLogs.length, autoScroll, listRef])

  // Toggle row expansion
  const toggleExpand = useCallback((logId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }, [])

  const exportLogs = () => {
    const content = filteredLogs
      .map(
        (log) =>
          `[${new Date(log.timestamp).toISOString()}] [${log.source}] [${log.level}] ${log.message}`
      )
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

  // Row component for virtualized list (react-window v2 API)
  const LogRow = useCallback(({ index, style, data }: RowComponentProps<LogRowProps>) => {
    const log = data.filteredLogs[index]
    if (!log) return null

    return (
      <div style={style}>
        <LogLine
          log={log}
          expanded={data.expandedRows.has(log.id)}
          onToggle={() => data.toggleExpand(log.id)}
        />
      </div>
    )
  }, [])

  return (
    <div className="space-y-4 animate-in h-full flex flex-col">
      {/* Header Stats */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          icon={Terminal}
          value={logCounts.total}
          label="Total Logs"
          color="text-text-primary"
        />
        <StatCard
          icon={AlertCircle}
          value={logCounts.error}
          label="Errors"
          color="text-accent-red"
        />
        <StatCard
          icon={AlertTriangle}
          value={logCounts.warn}
          label="Warnings"
          color="text-accent-yellow"
        />
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
            className="input pl-9 py-1.5 text-sm w-full"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={loadLogs}
          disabled={loading}
          className="btn btn-secondary"
          title="Refresh logs"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>

        <button
          onClick={() => setPaused(!paused)}
          className={cn('btn', paused ? 'btn-primary' : 'btn-secondary')}
          title={paused ? 'Resume stream' : 'Pause stream'}
        >
          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn('btn', autoScroll ? 'btn-primary' : 'btn-secondary')}
          title="Toggle auto-scroll"
        >
          <ArrowDown className="w-4 h-4" />
        </button>

        <button onClick={exportLogs} className="btn btn-secondary" title="Export logs">
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={clearLogs}
          className="btn btn-secondary text-accent-red"
          title="Clear logs"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Virtualized Log Output */}
      <div className="card bg-background font-mono text-sm flex-1 min-h-0">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Terminal className="w-12 h-12 mb-4" />
            <p>{loading ? 'Loading logs...' : 'No logs to display'}</p>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <List
                listRef={listRef}
                rowCount={filteredLogs.length}
                rowHeight={ROW_HEIGHT}
                rowComponent={LogRow}
                rowProps={{ filteredLogs, expandedRows, toggleExpand }}
                className="scrollbar-thin"
                style={{ height, width }}
              />
            )}
          </AutoSizer>
        )}
      </div>

      {/* Footer stats */}
      <div className="text-xs text-text-muted flex items-center justify-between px-2">
        <span>
          Showing {filteredLogs.length.toLocaleString()} of {logs.length.toLocaleString()} logs
        </span>
        <span>Virtualized rendering enabled</span>
      </div>
    </div>
  )
}

interface LogLineProps {
  log: LogEntry
  expanded: boolean
  onToggle: () => void
}

const LogLine = memo(function LogLine({ log, expanded, onToggle }: LogLineProps) {
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
        'flex flex-col px-2 py-1 rounded hover:bg-surface-hover cursor-pointer h-full',
        log.level === 'error' && 'bg-accent-red/5',
        log.level === 'warn' && 'bg-accent-yellow/5'
      )}
      onClick={() => log.metadata && onToggle()}
    >
      <div className="flex items-start gap-2">
        <span className="text-text-muted text-xs shrink-0">{timestamp}</span>
        <SourceIcon className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', sourceColors[log.source])} />
        <LevelIcon className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', levelColors[log.level])} />
        <span className={cn('text-xs uppercase w-14 shrink-0', sourceColors[log.source])}>
          {log.source}
        </span>
        <span className={cn('flex-1 break-all truncate', levelColors[log.level])}>
          {log.message}
        </span>
        {log.metadata && (
          <span className="text-text-muted text-xs shrink-0">{expanded ? '▼' : '▶'}</span>
        )}
      </div>
      {expanded && log.metadata && (
        <div className="mt-1 p-2 bg-surface rounded text-xs overflow-auto flex-1">
          <pre className="whitespace-pre-wrap text-text-muted">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
})
