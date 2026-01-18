import { useEffect } from 'react'
import {
  Server,
  Box,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Activity,
  Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { useServicesStore, type SystemdService, type PodmanContainer } from '@/stores/services'

export function ServicesManager() {
  const {
    activeTab,
    selectedService,
    selectedContainer,
    filter,
    setSystemdServices,
    setPodmanContainers,
    setActiveTab,
    setSelectedService,
    setSelectedContainer,
    setFilter,
  } = useServicesStore()

  // tRPC queries for data fetching
  const systemdQuery = trpc.services.systemd.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10s
  })
  const podmanQuery = trpc.services.podman.useQuery(undefined, {
    refetchInterval: 10000,
  })

  // tRPC mutations for actions
  const systemdActionMutation = trpc.services.systemdAction.useMutation({
    onSuccess: () => {
      systemdQuery.refetch()
    },
  })
  const podmanActionMutation = trpc.services.podmanAction.useMutation({
    onSuccess: () => {
      podmanQuery.refetch()
    },
  })

  // Sync data to store for components that need it
  useEffect(() => {
    if (systemdQuery.data) setSystemdServices(systemdQuery.data)
  }, [systemdQuery.data, setSystemdServices])

  useEffect(() => {
    if (podmanQuery.data) setPodmanContainers(podmanQuery.data)
  }, [podmanQuery.data, setPodmanContainers])

  const systemdServices = systemdQuery.data ?? []
  const podmanContainers = podmanQuery.data ?? []
  const loading = systemdQuery.isLoading || podmanQuery.isLoading

  const handleServiceAction = (name: string, action: 'start' | 'stop' | 'restart') => {
    systemdActionMutation.mutate({ name, action })
  }

  const handleContainerAction = (id: string, action: 'start' | 'stop' | 'restart') => {
    podmanActionMutation.mutate({ id, action })
  }

  const handleRefresh = () => {
    systemdQuery.refetch()
    podmanQuery.refetch()
  }

  const filteredServices = systemdServices.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.description.toLowerCase().includes(filter.toLowerCase())
  )

  const filteredContainers = podmanContainers.filter(
    (c) =>
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.image.toLowerCase().includes(filter.toLowerCase())
  )

  const runningContainers = podmanContainers.filter((c) => c.status === 'running').length
  const runningServices = systemdServices.filter((s) => s.status === 'running').length

  if (loading && systemdServices.length === 0 && podmanContainers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Box}
          value={podmanContainers.length}
          label="Containers"
          color="text-accent-blue"
        />
        <StatCard icon={Play} value={runningContainers} label="Running" color="text-accent-green" />
        <StatCard
          icon={Server}
          value={systemdServices.length}
          label="Services"
          color="text-accent-purple"
        />
        <StatCard
          icon={Activity}
          value={runningServices}
          label="Active"
          color="text-accent-green"
        />
      </div>

      {/* Tab navigation and search */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <TabButton
            active={activeTab === 'podman'}
            onClick={() => setActiveTab('podman')}
            icon={Box}
            label="Podman"
            count={podmanContainers.length}
          />
          <TabButton
            active={activeTab === 'systemd'}
            onClick={() => setActiveTab('systemd')}
            icon={Server}
            label="Systemd"
            count={systemdServices.length}
          />
        </div>
        <div className="flex-1" />
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <button onClick={handleRefresh} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Content */}
      {activeTab === 'podman' ? (
        <ContainersList
          containers={filteredContainers}
          selected={selectedContainer}
          onSelect={setSelectedContainer}
          onAction={handleContainerAction}
        />
      ) : (
        <ServicesList
          services={filteredServices}
          selected={selectedService}
          onSelect={setSelectedService}
          onAction={handleServiceAction}
        />
      )}
    </div>
  )
}

interface StatCardProps {
  icon: typeof Server
  value: number
  label: string
  color: string
}

function StatCard({ icon: Icon, value, label, color }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <Icon className={cn('w-5 h-5', color)} />
        <div>
          <p className="text-2xl font-semibold text-text-primary">{value}</p>
          <p className="text-sm text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: typeof Server
  label: string
  count: number
}

function TabButton({ active, onClick, icon: Icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
        active
          ? 'bg-accent-purple/10 text-accent-purple'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span className="ml-1 px-1.5 py-0.5 bg-surface-hover rounded text-xs">{count}</span>
    </button>
  )
}

interface ContainersListProps {
  containers: PodmanContainer[]
  selected: PodmanContainer | null
  onSelect: (container: PodmanContainer | null) => void
  onAction: (id: string, action: 'start' | 'stop' | 'restart') => void
}

function ContainersList({ containers, selected, onSelect, onAction }: ContainersListProps) {
  if (containers.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Box className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <p className="text-text-muted">No containers found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {containers.map((container) => (
        <div
          key={container.id}
          className={cn(
            'card p-4 cursor-pointer transition-all hover:border-border-hover',
            selected?.id === container.id && 'border-accent-purple'
          )}
          onClick={() => onSelect(selected?.id === container.id ? null : container)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusIcon status={container.status} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{container.name}</span>
                  <span className="text-xs text-text-muted font-mono">
                    {container.id.slice(0, 12)}
                  </span>
                </div>
                <p className="text-xs text-text-muted">{container.image}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {container.ports.length > 0 && (
                <span className="text-xs text-text-muted flex items-center gap-1">
                  <Network className="w-3 h-3" />
                  {container.ports.slice(0, 2).join(', ')}
                </span>
              )}
              <ActionButtons
                status={container.status}
                onStart={() => onAction(container.id, 'start')}
                onStop={() => onAction(container.id, 'stop')}
                onRestart={() => onAction(container.id, 'restart')}
              />
            </div>
          </div>
          {selected?.id === container.id && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-text-muted">Created</p>
                <p className="text-text-primary">{container.created}</p>
              </div>
              <div>
                <p className="text-text-muted">State</p>
                <p className="text-text-primary">{container.state}</p>
              </div>
              {container.health && (
                <div>
                  <p className="text-text-muted">Health</p>
                  <p className="text-text-primary">{container.health}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface ServicesListProps {
  services: SystemdService[]
  selected: SystemdService | null
  onSelect: (service: SystemdService | null) => void
  onAction: (name: string, action: 'start' | 'stop' | 'restart') => void
}

function ServicesList({ services, selected, onSelect, onAction }: ServicesListProps) {
  if (services.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Server className="w-12 h-12 mx-auto text-text-muted mb-4" />
        <p className="text-text-muted">No services found</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {services.map((service) => (
        <div
          key={service.name}
          className={cn(
            'card p-4 cursor-pointer transition-all hover:border-border-hover',
            selected?.name === service.name && 'border-accent-purple'
          )}
          onClick={() => onSelect(selected?.name === service.name ? null : service)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusIcon status={service.status} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{service.name}</span>
                  {service.enabled && (
                    <span className="text-xs px-1.5 py-0.5 bg-accent-green/20 text-accent-green rounded">
                      enabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted line-clamp-1">{service.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {service.pid && <span className="text-xs text-text-muted">PID: {service.pid}</span>}
              <ActionButtons
                status={service.status}
                onStart={() => onAction(service.name, 'start')}
                onStop={() => onAction(service.name, 'stop')}
                onRestart={() => onAction(service.name, 'restart')}
              />
            </div>
          </div>
          {selected?.name === service.name && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-text-muted">Active State</p>
                <p className="text-text-primary">{service.activeState}</p>
              </div>
              <div>
                <p className="text-text-muted">Sub State</p>
                <p className="text-text-primary">{service.subState}</p>
              </div>
              {service.memory && (
                <div>
                  <p className="text-text-muted">Memory</p>
                  <p className="text-text-primary">{service.memory}</p>
                </div>
              )}
              {service.cpu && (
                <div>
                  <p className="text-text-muted">CPU</p>
                  <p className="text-text-primary">{service.cpu}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <CheckCircle className="w-5 h-5 text-accent-green" />
    case 'failed':
    case 'exited':
      return <XCircle className="w-5 h-5 text-accent-red" />
    case 'paused':
      return <Pause className="w-5 h-5 text-accent-yellow" />
    default:
      return <AlertCircle className="w-5 h-5 text-text-muted" />
  }
}

interface ActionButtonsProps {
  status: string
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}

function ActionButtons({ status, onStart, onStop, onRestart }: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-1">
      {status !== 'running' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStart()
          }}
          className="p-1.5 rounded text-accent-green hover:bg-accent-green/10"
          title="Start"
        >
          <Play className="w-4 h-4" />
        </button>
      )}
      {status === 'running' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStop()
          }}
          className="p-1.5 rounded text-accent-red hover:bg-accent-red/10"
          title="Stop"
        >
          <Square className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRestart()
        }}
        className="p-1.5 rounded text-accent-blue hover:bg-accent-blue/10"
        title="Restart"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  )
}
