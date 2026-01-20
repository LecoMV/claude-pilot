import { useEffect, useState } from 'react'
import {
  Server,
  Power,
  PowerOff,
  RefreshCw,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Wrench,
  Clock,
  X,
  Copy,
  FileJson,
  Save,
  FolderOpen,
  Database,
  Globe,
  Plug,
  Brain,
  Code,
  Sparkles,
  CheckSquare,
  Shield,
  Tag,
} from 'lucide-react'
import type { MCPServerCategory } from '@shared/types'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { useMCPStore } from '@/stores/mcp'
import type { MCPServer } from '@shared/types'
import { CodeEditor } from '@/components/common/CodeEditor'

export function MCPManager() {
  const {
    selectedServer,
    showDetail,
    setServers,
    setSelectedServer,
    setShowDetail,
    getActiveCount,
    getDisabledCount,
  } = useMCPStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'servers' | 'config'>('servers')
  const [configContent, setConfigContent] = useState('')
  const [configError, setConfigError] = useState<string | null>(null)

  // tRPC queries
  const listQuery = trpc.mcp.list.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30s
  })
  const configQuery = trpc.mcp.getConfig.useQuery(undefined, {
    enabled: activeTab === 'config', // Only fetch when on config tab
  })
  const homePathQuery = trpc.system.homePath.useQuery()

  // tRPC mutations
  const toggleMutation = trpc.mcp.toggle.useMutation({
    onSuccess: () => {
      listQuery.refetch()
    },
  })
  const reloadMutation = trpc.mcp.reload.useMutation({
    onSuccess: () => {
      listQuery.refetch()
    },
  })
  const saveConfigMutation = trpc.mcp.saveConfig.useMutation({
    onSuccess: () => {
      listQuery.refetch()
    },
  })
  const openPathMutation = trpc.system.openPath.useMutation()

  // Sync data to store
  useEffect(() => {
    if (listQuery.data) setServers(listQuery.data)
  }, [listQuery.data, setServers])

  // Sync config content when loaded
  useEffect(() => {
    if (configQuery.data) setConfigContent(configQuery.data)
  }, [configQuery.data])

  // Derive data from queries
  const servers = listQuery.data ?? []
  const loading = listQuery.isLoading
  const refreshing = listQuery.isFetching || reloadMutation.isPending
  const configLoading = configQuery.isLoading
  const configSaving = saveConfigMutation.isPending

  const loadConfig = () => {
    configQuery.refetch()
  }

  const handleRefresh = () => {
    listQuery.refetch()
  }

  const handleToggle = (name: string, enable: boolean) => {
    toggleMutation.mutate(
      { name, enabled: enable },
      {
        onError: (error) => {
          console.error('Failed to toggle server:', error)
        },
      }
    )
  }

  const handleReload = () => {
    reloadMutation.mutate(undefined, {
      onError: (error) => {
        console.error('Failed to reload MCP config:', error)
      },
    })
  }

  const handleSaveConfig = () => {
    // Validate JSON before saving
    try {
      JSON.parse(configContent)
    } catch {
      setConfigError('Invalid JSON. Please fix syntax errors before saving.')
      return
    }

    setConfigError(null)
    saveConfigMutation.mutate(
      { content: configContent },
      {
        onError: (error) => {
          console.error('Failed to save MCP config:', error)
          setConfigError('Failed to save configuration')
        },
      }
    )
  }

  const openMCPSettings = () => {
    const homePath = homePathQuery.data
    if (!homePath) return
    openPathMutation.mutate(
      { path: `${homePath}/.claude` },
      {
        onError: (error) => {
          console.error('Failed to open MCP settings:', error)
        },
      }
    )
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
      {/* Main content */}
      <div
        className={cn(
          'flex-1 space-y-6 transition-all',
          showDetail && activeTab === 'servers' && 'mr-[400px]'
        )}
      >
        {/* Tab navigation */}
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <button
            onClick={() => setActiveTab('servers')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
              activeTab === 'servers'
                ? 'bg-accent-purple/10 text-accent-purple'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            <Server className="w-4 h-4" />
            Servers
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
              activeTab === 'config'
                ? 'bg-accent-purple/10 text-accent-purple'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            <FileJson className="w-4 h-4" />
            Config Editor
          </button>
        </div>

        {activeTab === 'servers' && (
          <>
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
                <button onClick={handleRefresh} className="btn btn-secondary" disabled={refreshing}>
                  <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
                  Refresh
                </button>
                <button
                  onClick={openMCPSettings}
                  className="btn btn-primary"
                  title="Open MCP config folder"
                >
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
          </>
        )}

        {activeTab === 'config' && (
          <div className="space-y-4">
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">MCP Configuration</h3>
                  <p className="text-xs text-text-muted mt-1">
                    ~/.claude/settings.json (mcpServers section)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openMCPSettings}
                    className="btn btn-secondary"
                    title="Open folder"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  <button
                    onClick={loadConfig}
                    className="btn btn-secondary"
                    disabled={configLoading}
                  >
                    <RefreshCw className={cn('w-4 h-4', configLoading && 'animate-spin')} />
                    Reload
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    className="btn btn-primary"
                    disabled={configSaving}
                  >
                    {configSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </button>
                </div>
              </div>
              <div className="card-body">
                {configLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <CodeEditor
                    value={configContent}
                    onChange={setConfigContent}
                    language="json"
                    height="500px"
                    minimap={true}
                  />
                )}
              </div>
            </div>

            {configError && (
              <div className="card p-4 bg-accent-red/10 border-accent-red">
                <div className="flex items-center gap-3 text-accent-red">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{configError}</p>
                </div>
              </div>
            )}

            <div className="card p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
                <div className="text-sm text-text-secondary">
                  <p className="font-medium text-text-primary mb-1">About MCP Configuration</p>
                  <p>
                    Edit the MCP servers configuration directly. Changes are validated as JSON
                    before saving. After saving, the servers will be automatically reloaded.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel - only show on servers tab */}
      {activeTab === 'servers' && showDetail && selectedServer && (
        <ServerDetailPanel
          server={selectedServer}
          onClose={() => {
            setShowDetail(false)
            setSelectedServer(null)
          }}
          onToggle={(enable) => handleToggle(selectedServer.name, enable)}
          onReload={handleReload}
          isReloading={refreshing}
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
  const category = server.metadata?.category || 'other'
  const CategoryIcon = CATEGORY_ICONS[category]

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
          <div className={cn('p-2 rounded-lg', CATEGORY_COLORS[category].split(' ')[1])}>
            <CategoryIcon className={cn('w-5 h-5', CATEGORY_COLORS[category].split(' ')[0])} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-text-primary">{server.name}</span>
              <StatusBadge status={server.status} disabled={server.config.disabled} />
              <CategoryBadge category={category} />
            </div>
            {server.metadata?.description && (
              <p className="text-xs text-text-muted mt-1 truncate max-w-md">
                {server.metadata.description}
              </p>
            )}
            <p className="text-xs text-text-muted/70 font-mono mt-1">{server.config.command}</p>
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
            {server.config.disabled ? (
              <Power className="w-4 h-4" />
            ) : (
              <PowerOff className="w-4 h-4" />
            )}
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
  onReload: () => void
  isReloading: boolean
}

function ServerDetailPanel({
  server,
  onClose,
  onToggle,
  onReload,
  isReloading,
}: ServerDetailPanelProps) {
  const [copied, setCopied] = useState(false)
  const category = server.metadata?.category || 'other'
  const CategoryIcon = CATEGORY_ICONS[category]

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
          <div className={cn('p-2 rounded-lg', CATEGORY_COLORS[category].split(' ')[1])}>
            <CategoryIcon className={cn('w-5 h-5', CATEGORY_COLORS[category].split(' ')[0])} />
          </div>
          <div>
            <h2 className="font-medium text-text-primary">{server.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={server.status} disabled={server.config.disabled} />
              <CategoryBadge category={category} />
            </div>
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
          <button onClick={onReload} disabled={isReloading} className="btn btn-sm btn-secondary">
            <RefreshCw className={cn('w-4 h-4', isReloading && 'animate-spin')} />
            Reload
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
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-accent-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
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

        {/* Description */}
        {server.metadata?.description && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-2">Description</h3>
            <p className="text-sm text-text-primary bg-background rounded-lg p-3">
              {server.metadata.description}
            </p>
          </section>
        )}

        {/* Capabilities */}
        {server.metadata?.capabilities && server.metadata.capabilities.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-2">Capabilities</h3>
            <div className="flex flex-wrap gap-2">
              {server.metadata.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-accent-purple/10 text-accent-purple"
                >
                  <Sparkles className="w-3 h-3" />
                  {cap}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Tags */}
        {server.metadata?.tags && server.metadata.tags.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-text-secondary mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {server.metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-surface-hover text-text-muted"
                >
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Statistics */}
        <section>
          <h3 className="text-sm font-medium text-text-secondary mb-2">Statistics</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background rounded-lg p-3 text-center">
              <p className="text-2xl font-semibold text-text-primary">{server.toolCount ?? '--'}</p>
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

// Category icon and color helpers
const CATEGORY_ICONS: Record<MCPServerCategory, typeof Server> = {
  database: Database,
  filesystem: FolderOpen,
  browser: Globe,
  api: Plug,
  memory: Brain,
  developer: Code,
  ai: Sparkles,
  productivity: CheckSquare,
  security: Shield,
  other: Server,
}

const CATEGORY_COLORS: Record<MCPServerCategory, string> = {
  database: 'text-accent-blue bg-accent-blue/10',
  filesystem: 'text-accent-yellow bg-accent-yellow/10',
  browser: 'text-accent-purple bg-accent-purple/10',
  api: 'text-accent-green bg-accent-green/10',
  memory: 'text-accent-blue bg-accent-blue/10',
  developer: 'text-accent-purple bg-accent-purple/10',
  ai: 'text-accent-purple bg-accent-purple/10',
  productivity: 'text-accent-green bg-accent-green/10',
  security: 'text-accent-red bg-accent-red/10',
  other: 'text-text-muted bg-surface-hover',
}

interface CategoryBadgeProps {
  category: MCPServerCategory
}

function CategoryBadge({ category }: CategoryBadgeProps) {
  const Icon = CATEGORY_ICONS[category]
  const colorClass = CATEGORY_COLORS[category]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium capitalize',
        colorClass
      )}
    >
      <Icon className="w-3 h-3" />
      {category}
    </span>
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
