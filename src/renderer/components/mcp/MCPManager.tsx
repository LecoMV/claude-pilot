import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MCPServer } from '@shared/types'

export function MCPManager() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    try {
      const result = await window.electron.invoke('mcp:list')
      setServers(result)
    } catch (error) {
      console.error('Failed to load MCP servers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadServers()
    setRefreshing(false)
  }

  const handleToggle = async (name: string, currentlyEnabled: boolean) => {
    try {
      await window.electron.invoke('mcp:toggle', name, !currentlyEnabled)
      await loadServers()
    } catch (error) {
      console.error('Failed to toggle server:', error)
    }
  }

  const filteredServers = servers.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeCount = servers.filter((s) => s.status === 'online').length
  const disabledCount = servers.filter((s) => s.config.disabled).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-2xl font-semibold text-text-primary">{servers.length}</p>
          <p className="text-sm text-text-muted">Total Servers</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold text-accent-green">{activeCount}</p>
          <p className="text-sm text-text-muted">Active</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold text-text-muted">{disabledCount}</p>
          <p className="text-sm text-text-muted">Disabled</p>
        </div>
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
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Server</th>
              <th>Status</th>
              <th>Command</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredServers.map((server) => (
              <tr key={server.name}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-surface-hover">
                      <Server className="w-4 h-4 text-text-secondary" />
                    </div>
                    <span className="font-medium text-text-primary">{server.name}</span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={server.status} disabled={server.config.disabled} />
                </td>
                <td>
                  <code className="text-xs text-text-muted bg-background px-2 py-1 rounded">
                    {server.config.command}
                  </code>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(server.name, !server.config.disabled)}
                      className={cn(
                        'btn btn-sm btn-icon',
                        server.config.disabled ? 'text-accent-green' : 'text-accent-red'
                      )}
                      title={server.config.disabled ? 'Enable' : 'Disable'}
                    >
                      {server.config.disabled ? (
                        <Power className="w-4 h-4" />
                      ) : (
                        <PowerOff className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      className="btn btn-sm btn-icon text-text-muted hover:text-text-primary"
                      title="Settings"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredServers.length === 0 && (
          <div className="text-center py-12">
            <Server className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">
              {searchQuery ? 'No servers found' : 'No MCP servers configured'}
            </p>
          </div>
        )}
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
