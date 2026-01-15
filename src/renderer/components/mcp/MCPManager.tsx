import { useCallback, useEffect, useState } from 'react'
import {
  Server,
  Power,
  PowerOff,
  Settings,
  RefreshCw,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Terminal,
  Wrench,
  Clock,
  X,
  ExternalLink,
  Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMCPStore } from '@/stores/mcp'
import type { MCPServer } from '@shared/types'

export function MCPManager() {
  const {
    servers,
    selectedServer,
    loading,
    refreshing,
    showDetail,
    setServers,
    setSelectedServer,
    setLoading,
    setRefreshing,
    setShowDetail,
    getActiveCount,
    getDisabledCount,
  } = useMCPStore()

  const [searchQuery, setSearchQuery] = useState('')

  const loadServers = useCallback(async () => {
    try {
      const result = await window.electron.invoke('mcp:list')
      setServers(result)
    } catch (error) {
      console.error('Failed to load MCP servers:', error)
    } finally {
      setLoading(false)
    }
  }, [setServers, setLoading])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadServers()
    setRefreshing(false)
  }

  const handleToggle = async (name: string, enable: boolean) => {
    try {
      await window.electron.invoke('mcp:toggle', name, enable)
      await loadServers()
    } catch (error) {
      console.error('Failed to toggle server:', error)
    }
  }

  const handleSelectServer = (server: MCPServer) => {
    setSelectedServer(server)
    setShowDetail(true)
  }

  const filteredServers = servers.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex h-full animate-in">
      {/* Main list */}
      <div className={cn('flex-1 space-y-6 transition-all', showDetail && 'mr-[400px]')}>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard value={servers.length} label="Total Servers" />
          <StatCard value={getActiveCount()} label="Active" className="text-accent-green" />
          <StatCard value={getDisabledCount()} label="Disabled" className="text-text-muted" />
        </div>

        {/* Search and actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="btn btn-secondary"
              disabled={refreshing}
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              Refresh
            </button>
            <button className="btn btn-primary">
              <Plus className="w-4 h-4" />
              Add Server
            </button>
          </div>
        </div>

        {/* Server list */}
        <div className="space-y-2">
          {filteredServers.map((server) => (
            <ServerCard
              key={server.name}
              server={server}
              selected={selectedServer?.name === server.name}
              onSelect={() => handleSelectServer(server)}
              onToggle={(enable) => handleToggle(server.name, enable)}
            />
          ))}

          {filteredServers.length === 0 && (
            <div className="card text-center py-12">
              <Server className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">
                {searchQuery ? 'No servers found' : 'No MCP servers configured'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {showDetail && selectedServer && (
        <ServerDetailPanel
          server={selectedServer}
          onClose={() => {
            setShowDetail(false)
            setSelectedServer(null)
          }}
          onToggle={(enable) => handleToggle(selectedServer.name, enable)}
        />
      )}
    </div>
  )
}

interface StatCardProps {
  value: number
  label: string
  className?: string
}

function StatCard({ value, label, className }: StatCardProps) {
  return (
    <div className="card p-4">
      <p className={cn('text-2xl font-semibold text-text-primary', className)}>{value}</p>
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  )
}

interface ServerCardProps {
  server: MCPServer
  selected: boolean
  onSelect: () => void
  onToggle: (enable: boolean) => void
}

function ServerCard({ server, selected, onSelect, onToggle }: ServerCardProps) {
  return (
    <div
      className={cn(
        'card p-4 cursor-pointer transition-all hover:border-border-hover',
        selected && 'border-accent-purple'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-lg bg-surface-hover">
            <Server className="w-5 h-5 text-text-secondary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{server.name}</span>
              <StatusBadge status={server.status} disabled={server.config.disabled} />
            </div>
            <p className="text-xs text-text-muted font-mono mt-1">{server.config.command}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {server.toolCount !== undefined && (
            <span className="text-sm text-text-muted flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {server.toolCount} tools
            </span>
          )}
          {server.lastPing !== undefined && (
            <span className="text-sm text-text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {server.lastPing}ms
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle(!server.config.disabled)
            }}
            className={cn(
              'p-2 rounded-lg transition-colors',
              server.config.disabled
                ? 'text-accent-green hover:bg-accent-green/10'
                : 'text-accent-red hover:bg-accent-red/10'
            )}
            title={server.config.disabled ? 'Enable' : 'Disable'}
          >
            {server.config.disabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </button>
          <ChevronRight className="w-4 h-4 text-text-muted" />
        </div>
      </div>
    </div>
  )
}

interface ServerDetailPanelProps {
  server: MCPServer
  onClose: () => void
  onToggle: (enable: boolean) => void
}

function ServerDetailPanel({ server, onClose, onToggle }: ServerDetailPanelProps) {
  const [copied, setCopied] = useState(false)

  const copyCommand = () => {
    const fullCommand = [server.config.command, ...(server.config.args || [])].join(' ')
    navigator.clipboard.writeText(fullCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-surface border-l border-border shadow-modal animate-in overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-surface-hover">
            <Server className="w-5 h-5 text-text-secondary" />
          </div>
          <div>
            <h2 className="font-medium text-text-primary">{server.name}</h2>
            <StatusBadge status={server.status} disabled={server.config.disabled} />
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Quick actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onToggle(!server.config.disabled)}
            className={cn(
              'btn btn-sm flex-1',
              server.config.disabled ? 'btn-primary' : 'btn-danger'
            )}
          >
            {server.config.disabled ? (
              <>
                <Power className="w-4 h-4" />
                Enable
              </>
            ) : (
              <>
                <PowerOff className="w-4 h-4" />
                Disable
              </>
            )}
          </button>
          <button className="btn btn-sm btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Restart
          </button>
        </div>

        {/* Command */}
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Command</h3>
          <div className="bg-background rounded-lg p-3 font-mono text-sm">
            <div className="flex items-start justify-between gap-2">
              <code className="text-text-primary break-all">{server.config.command}</code>
              <button
                onClick={copyCommand}
                className="p-1 rounded text-text-muted hover:text-text-primary flex-shrink-0"
                title="Copy command"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            {server.config.args && server.config.args.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-text-muted">Args:</span>{' '}
                <span className="text-text-primary">{server.config.args.join(' ')}</span>
              </div>
            )}
          </div>
        </section>

        {/* Environment variables */}
        {server.config.env && Object.keys(server.config.env).length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-2">Environment Variables</h3>
            <div className="bg-background rounded-lg divide-y divide-border">
              {Object.entries(server.config.env).map(([key, value]) => (
                <div key={key} className="px-3 py-2 flex items-center justify-between">
                  <span className="font-mono text-sm text-accent-blue">{key}</span>
                  <span className="font-mono text-sm text-text-muted truncate max-w-[200px]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Statistics */}
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Statistics</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-text-primary">
                {server.toolCount ?? '--'}
              </p>
              <p className="text-xs text-text-muted">Tools</p>
            </div>
            <div className="bg-background rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-text-primary">
                {server.lastPing !== undefined ? `${server.lastPing}ms` : '--'}
              </p>
              <p className="text-xs text-text-muted">Latency</p>
            </div>
          </div>
        </section>

        {/* Settings hint */}
        <section className="pt-4 border-t border-border">
          <p className="text-xs text-text-muted">
            Configuration is stored in{' '}
            <code className="bg-background px-1 py-0.5 rounded">~/.claude/settings.json</code>
          </p>
        </section>
      </div>
    </div>
  )
}

interface StatusBadgeProps {
  status: MCPServer['status']
  disabled?: boolean
}

function StatusBadge({ status, disabled }: StatusBadgeProps) {
  if (disabled) {
    return (
      <span className="status-badge bg-text-muted/20 text-text-muted">
        <PowerOff className="w-3 h-3" />
        Disabled
      </span>
    )
  }

  switch (status) {
    case 'online':
      return (
        <span className="status-badge status-online">
          <CheckCircle className="w-3 h-3" />
          Online
        </span>
      )
    case 'error':
      return (
        <span className="status-badge status-warning">
          <AlertCircle className="w-3 h-3" />
          Error
        </span>
      )
    default:
      return (
        <span className="status-badge status-offline">
          <XCircle className="w-3 h-3" />
          Offline
        </span>
      )
  }
}
