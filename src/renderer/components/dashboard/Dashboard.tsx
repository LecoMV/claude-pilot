import {
  Activity,
  Cpu,
  HardDrive,
  Database,
  Server,
  Layers,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  Bot,
  Monitor,
  Thermometer,
  AlertTriangle,
} from 'lucide-react'
import { formatBytes, cn } from '@/lib/utils'
import { useSystemStatus } from '@/hooks/useSystemStatus'
import { MetricsChart } from './MetricsChart'
import { GPUPanel } from './GPUPanel'
import { CostTracker } from './CostTracker'
import type { GPUUsage } from '@shared/types'

interface DashboardProps {
  onNavigate?: (view: string) => void
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { status, loading, error, lastUpdate, refresh } = useSystemStatus()

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <XCircle className="w-12 h-12 text-accent-red" />
        <p className="text-text-muted">{error}</p>
        <button
          onClick={refresh}
          className="btn btn-primary"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header with refresh indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">System Status</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">
            Updated {formatTimeAgo(lastUpdate)}
          </span>
          <button
            onClick={refresh}
            className={cn(
              'p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors',
              loading && 'animate-spin'
            )}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cost & Budget Tracking */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Cost & Budget</h2>
        <CostTracker onNavigate={onNavigate} />
      </section>

      {/* Status overview */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatusCard
            icon={Activity}
            title="Claude Code"
            status={status?.claude.online ? 'online' : 'offline'}
            detail={status?.claude.version || 'Not installed'}
          />
          <StatusCard
            icon={Server}
            title="MCP Servers"
            status={status?.mcp.totalActive ? 'online' : 'offline'}
            detail={`${status?.mcp.totalActive || 0} active, ${status?.mcp.totalDisabled || 0} disabled`}
          />
          <StatusCard
            icon={Bot}
            title="Ollama"
            status={status?.ollama?.online ? 'online' : 'offline'}
            detail={status?.ollama?.online ? `${status.ollama.modelCount} models` : 'Not running'}
          />
          <StatusCard
            icon={Database}
            title="PostgreSQL"
            status={status?.memory.postgresql.online ? 'online' : 'offline'}
            detail="Learnings database"
          />
          <StatusCard
            icon={Layers}
            title="Memgraph"
            status={status?.memory.memgraph.online ? 'online' : 'offline'}
            detail="Knowledge graph"
          />
        </div>
      </section>

      {/* Resource usage with live meters */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Resource Usage</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ResourceMeter
            icon={Cpu}
            label="CPU Usage"
            value={status?.resources.cpu || 0}
            max={100}
            unit="%"
            color="purple"
          />
          <ResourceMeter
            icon={Zap}
            label="Memory Usage"
            value={status?.resources.memory || 0}
            max={100}
            unit="%"
            color="blue"
          />
          <GPUCard gpu={status?.resources.gpu} />
          <MetricCard
            icon={HardDrive}
            label="Claude Data"
            value={formatBytes(status?.resources.disk.claudeData || 0)}
            subtext={`${formatBytes(status?.resources.disk.used || 0)} / ${formatBytes(status?.resources.disk.total || 0)} total`}
            color="teal"
          />
        </div>
      </section>

      {/* Time-series metrics chart */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Performance History</h2>
        <MetricsChart />
      </section>

      {/* GPU Monitoring Panel */}
      {status?.resources.gpu?.available && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">GPU Monitor</h2>
          <GPUPanel gpu={status.resources.gpu} />
        </section>
      )}

      {/* Memory systems detail */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Memory Systems</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MemorySystemCard
            name="PostgreSQL"
            status={status?.memory.postgresql.online ? 'online' : 'offline'}
            description="Long-term learnings storage"
            port="5433"
          />
          <MemorySystemCard
            name="Memgraph"
            status={status?.memory.memgraph.online ? 'online' : 'offline'}
            description="CybersecKB knowledge graph"
            port="7687"
          />
          <MemorySystemCard
            name="Qdrant"
            status={status?.memory.qdrant.online ? 'online' : 'offline'}
            description="Mem0 vector memories"
            port="6333"
          />
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction
            icon={Server}
            label="MCP Servers"
            onClick={() => onNavigate?.('mcp')}
          />
          <QuickAction
            icon={Database}
            label="Memory Browser"
            onClick={() => onNavigate?.('memory')}
          />
          <QuickAction
            icon={Layers}
            label="Knowledge Graph"
            onClick={() => onNavigate?.('memory')}
          />
          <QuickAction
            icon={Clock}
            label="Sessions"
            onClick={() => onNavigate?.('sessions')}
          />
        </div>
      </section>
    </div>
  )
}

interface StatusCardProps {
  icon: typeof Activity
  title: string
  status: 'online' | 'offline' | 'warning'
  detail: string
}

function StatusCard({ icon: Icon, title, status, detail }: StatusCardProps) {
  return (
    <div className="card p-4 hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-surface-hover">
          <Icon className="w-5 h-5 text-text-secondary" />
        </div>
        <span
          className={cn(
            'status-badge',
            status === 'online'
              ? 'status-online'
              : status === 'warning'
                ? 'status-warning'
                : 'status-offline'
          )}
        >
          {status === 'online' ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          {status}
        </span>
      </div>
      <h3 className="mt-3 font-medium text-text-primary">{title}</h3>
      <p className="text-sm text-text-muted">{detail}</p>
    </div>
  )
}

interface ResourceMeterProps {
  icon: typeof Activity
  label: string
  value: number
  max: number
  unit: string
  color: 'purple' | 'blue' | 'teal' | 'green' | 'yellow' | 'red'
}

function ResourceMeter({ icon: Icon, label, value, max, unit, color }: ResourceMeterProps) {
  const percentage = Math.min((value / max) * 100, 100)
  const colorClasses = {
    purple: {
      bg: 'bg-accent-purple/10',
      text: 'text-accent-purple',
      bar: 'bg-accent-purple',
    },
    blue: {
      bg: 'bg-accent-blue/10',
      text: 'text-accent-blue',
      bar: 'bg-accent-blue',
    },
    teal: {
      bg: 'bg-accent-teal/10',
      text: 'text-accent-teal',
      bar: 'bg-accent-teal',
    },
    green: {
      bg: 'bg-accent-green/10',
      text: 'text-accent-green',
      bar: 'bg-accent-green',
    },
    yellow: {
      bg: 'bg-accent-yellow/10',
      text: 'text-accent-yellow',
      bar: 'bg-accent-yellow',
    },
    red: {
      bg: 'bg-accent-red/10',
      text: 'text-accent-red',
      bar: 'bg-accent-red',
    },
  }

  const colors = colorClasses[color]

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('inline-flex p-2 rounded-lg', colors.bg, colors.text)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-semibold text-text-primary">{value.toFixed(1)}</span>
        <span className="text-sm text-text-muted">{unit}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-hover overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

interface MetricCardProps {
  icon: typeof Activity
  label: string
  value: string
  subtext?: string
  color: 'purple' | 'blue' | 'teal' | 'green' | 'yellow' | 'red'
}

function MetricCard({ icon: Icon, label, value, subtext, color }: MetricCardProps) {
  const colorClasses = {
    purple: 'bg-accent-purple/10 text-accent-purple',
    blue: 'bg-accent-blue/10 text-accent-blue',
    teal: 'bg-accent-teal/10 text-accent-teal',
    green: 'bg-accent-green/10 text-accent-green',
    yellow: 'bg-accent-yellow/10 text-accent-yellow',
    red: 'bg-accent-red/10 text-accent-red',
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('inline-flex p-2 rounded-lg', colorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-text-primary">{value}</p>
      {subtext && <p className="text-xs text-text-muted mt-1">{subtext}</p>}
    </div>
  )
}

interface MemorySystemCardProps {
  name: string
  status: 'online' | 'offline'
  description: string
  port: string
}

function MemorySystemCard({ name, status, description, port }: MemorySystemCardProps) {
  return (
    <div className="card p-4 hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-text-primary">{name}</h3>
        <span
          className={cn(
            'px-2 py-0.5 text-xs rounded-full',
            status === 'online'
              ? 'bg-accent-green/10 text-accent-green'
              : 'bg-accent-red/10 text-accent-red'
          )}
        >
          {status}
        </span>
      </div>
      <p className="text-sm text-text-muted mb-2">{description}</p>
      <p className="text-xs text-text-muted font-mono">localhost:{port}</p>
    </div>
  )
}

interface QuickActionProps {
  icon: typeof Activity
  label: string
  onClick: () => void
}

function QuickAction({ icon: Icon, label, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="card p-4 flex flex-col items-center gap-2 hover:bg-surface-hover hover:border-border-hover transition-colors"
    >
      <Icon className="w-6 h-6 text-accent-purple" />
      <span className="text-sm font-medium text-text-primary">{label}</span>
    </button>
  )
}

interface GPUCardProps {
  gpu?: GPUUsage
}

function GPUCard({ gpu }: GPUCardProps) {
  // No GPU detected
  if (!gpu || !gpu.available) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="inline-flex p-2 rounded-lg bg-surface-hover text-text-muted">
            <Monitor className="w-5 h-5" />
          </div>
          <span className="text-sm text-text-muted">GPU</span>
        </div>
        <p className="text-lg text-text-muted">Not detected</p>
        <p className="text-xs text-text-muted mt-1">No NVIDIA GPU found</p>
      </div>
    )
  }

  // GPU detected but limited info (fallback mode)
  if (gpu.error || gpu.utilization === undefined) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="inline-flex p-2 rounded-lg bg-accent-yellow/10 text-accent-yellow">
            <Monitor className="w-5 h-5" />
          </div>
          <span className="text-sm text-text-muted">GPU</span>
        </div>
        <p className="text-lg font-semibold text-text-primary truncate" title={gpu.name}>
          {gpu.name || 'NVIDIA GPU'}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <AlertTriangle className="w-3 h-3 text-accent-yellow" />
          <p className="text-xs text-accent-yellow">
            {gpu.error || 'Limited info available'}
          </p>
        </div>
        {gpu.driverVersion && (
          <p className="text-xs text-text-muted mt-1">
            Driver: {gpu.driverVersion}
          </p>
        )}
      </div>
    )
  }

  // Full GPU info available
  const memUsagePercent = gpu.memoryUsed && gpu.memoryTotal
    ? (gpu.memoryUsed / gpu.memoryTotal) * 100
    : 0

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="inline-flex p-2 rounded-lg bg-accent-green/10 text-accent-green">
          <Monitor className="w-5 h-5" />
        </div>
        <span className="text-sm text-text-muted">GPU</span>
      </div>
      <p className="text-lg font-semibold text-text-primary truncate" title={gpu.name}>
        {gpu.name?.replace('NVIDIA ', '').replace('GeForce ', '') || 'GPU'}
      </p>
      <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {gpu.utilization}%
        </span>
        {gpu.temperature !== undefined && (
          <span className="flex items-center gap-1">
            <Thermometer className="w-3 h-3" />
            {gpu.temperature}°C
          </span>
        )}
      </div>
      <div className="w-full h-1.5 rounded-full bg-surface-hover overflow-hidden mt-2">
        <div
          className="h-full rounded-full bg-accent-green transition-all duration-500"
          style={{ width: `${memUsagePercent}%` }}
        />
      </div>
      <p className="text-xs text-text-muted mt-1">
        {formatBytes(gpu.memoryUsed || 0)} / {formatBytes(gpu.memoryTotal || 0)}
      </p>
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'never'

  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default Dashboard
