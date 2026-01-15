import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { SystemStatus, ResourceUsage } from '@shared/types'

export function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatus()

    // Refresh on global event
    const handleRefresh = () => loadStatus()
    window.addEventListener('app:refresh', handleRefresh)
    return () => window.removeEventListener('app:refresh', handleRefresh)
  }, [])

  const loadStatus = async () => {
    try {
      const result = await window.electron.invoke('system:status')
      setStatus(result)
    } catch (error) {
      console.error('Failed to load status:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Status overview */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            detail={`${status?.mcp.totalActive || 0} active`}
          />
          <StatusCard
            icon={Database}
            title="PostgreSQL"
            status={status?.memory.postgresql.online ? 'online' : 'offline'}
            detail="Memory store"
          />
          <StatusCard
            icon={Layers}
            title="Memgraph"
            status={status?.memory.memgraph.online ? 'online' : 'offline'}
            detail="Knowledge graph"
          />
        </div>
      </section>

      {/* Resource usage */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Resource Usage</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon={Cpu}
            label="CPU Usage"
            value={`${(status?.resources.cpu || 0).toFixed(1)}%`}
            color="purple"
          />
          <MetricCard
            icon={Activity}
            label="Memory Usage"
            value={`${(status?.resources.memory || 0).toFixed(1)}%`}
            color="blue"
          />
          <MetricCard
            icon={HardDrive}
            label="Claude Data"
            value={formatBytes(status?.resources.disk.claudeData || 0)}
            color="teal"
          />
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickAction
            icon={Server}
            label="Restart MCP"
            onClick={() => console.log('Restart MCP')}
          />
          <QuickAction
            icon={Database}
            label="Sync Memory"
            onClick={() => console.log('Sync Memory')}
          />
          <QuickAction
            icon={Layers}
            label="View Graph"
            onClick={() => console.log('View Graph')}
          />
          <QuickAction
            icon={Clock}
            label="Recent Sessions"
            onClick={() => console.log('Recent Sessions')}
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
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-surface-hover">
          <Icon className="w-5 h-5 text-text-secondary" />
        </div>
        <span
          className={`status-badge ${
            status === 'online'
              ? 'status-online'
              : status === 'warning'
                ? 'status-warning'
                : 'status-offline'
          }`}
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

interface MetricCardProps {
  icon: typeof Activity
  label: string
  value: string
  color: 'purple' | 'blue' | 'teal' | 'green' | 'yellow' | 'red'
}

function MetricCard({ icon: Icon, label, value, color }: MetricCardProps) {
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
      <div className={`inline-flex p-2 rounded-lg ${colorClasses[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="text-sm text-text-muted">{label}</p>
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
      className="card p-4 flex flex-col items-center gap-2 hover:bg-surface-hover transition-colors"
    >
      <Icon className="w-6 h-6 text-accent-purple" />
      <span className="text-sm font-medium text-text-primary">{label}</span>
    </button>
  )
}
