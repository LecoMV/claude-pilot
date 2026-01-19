import { type ReactNode } from 'react'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  HelpCircle,
  Circle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Status types with semantic meaning
export type ServiceStatus =
  | 'online'
  | 'offline'
  | 'degraded'
  | 'starting'
  | 'stopping'
  | 'unknown'
  | 'idle'
  | 'busy'
  | 'error'
  | 'warning'

interface StatusConfig {
  color: string
  bgColor: string
  borderColor: string
  icon: LucideIcon
  pulse?: boolean
  label: string
}

const statusConfigs: Record<ServiceStatus, StatusConfig> = {
  online: {
    color: 'text-accent-green',
    bgColor: 'bg-accent-green/10',
    borderColor: 'border-accent-green/30',
    icon: CheckCircle,
    label: 'Online',
  },
  offline: {
    color: 'text-accent-red',
    bgColor: 'bg-accent-red/10',
    borderColor: 'border-accent-red/30',
    icon: XCircle,
    label: 'Offline',
  },
  degraded: {
    color: 'text-accent-yellow',
    bgColor: 'bg-accent-yellow/10',
    borderColor: 'border-accent-yellow/30',
    icon: AlertCircle,
    label: 'Degraded',
  },
  starting: {
    color: 'text-accent-blue',
    bgColor: 'bg-accent-blue/10',
    borderColor: 'border-accent-blue/30',
    icon: Loader2,
    pulse: true,
    label: 'Starting',
  },
  stopping: {
    color: 'text-accent-yellow',
    bgColor: 'bg-accent-yellow/10',
    borderColor: 'border-accent-yellow/30',
    icon: Loader2,
    pulse: true,
    label: 'Stopping',
  },
  unknown: {
    color: 'text-text-muted',
    bgColor: 'bg-surface',
    borderColor: 'border-border',
    icon: HelpCircle,
    label: 'Unknown',
  },
  idle: {
    color: 'text-text-muted',
    bgColor: 'bg-surface',
    borderColor: 'border-border',
    icon: Circle,
    label: 'Idle',
  },
  busy: {
    color: 'text-accent-blue',
    bgColor: 'bg-accent-blue/10',
    borderColor: 'border-accent-blue/30',
    icon: Loader2,
    pulse: true,
    label: 'Busy',
  },
  error: {
    color: 'text-accent-red',
    bgColor: 'bg-accent-red/10',
    borderColor: 'border-accent-red/30',
    icon: XCircle,
    label: 'Error',
  },
  warning: {
    color: 'text-accent-yellow',
    bgColor: 'bg-accent-yellow/10',
    borderColor: 'border-accent-yellow/30',
    icon: AlertCircle,
    label: 'Warning',
  },
}

interface StatusIndicatorProps {
  /** The status to display */
  status: ServiceStatus
  /** Display variant */
  variant?: 'dot' | 'badge' | 'pill' | 'icon'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Custom label (overrides default) */
  label?: string
  /** Show label text */
  showLabel?: boolean
  /** Additional class names */
  className?: string
}

/**
 * Consistent status indicator component.
 * Supports multiple variants and sizes.
 *
 * @example
 * <StatusIndicator status="online" />
 * <StatusIndicator status="starting" variant="badge" />
 * <StatusIndicator status="degraded" variant="pill" showLabel />
 */
export function StatusIndicator({
  status,
  variant = 'dot',
  size = 'md',
  label,
  showLabel = false,
  className,
}: StatusIndicatorProps) {
  const config = statusConfigs[status]
  const Icon = config.icon

  const sizeClasses = {
    sm: { dot: 'w-2 h-2', icon: 'w-3 h-3', text: 'text-xs', padding: 'px-1.5 py-0.5' },
    md: { dot: 'w-2.5 h-2.5', icon: 'w-4 h-4', text: 'text-sm', padding: 'px-2 py-1' },
    lg: { dot: 'w-3 h-3', icon: 'w-5 h-5', text: 'text-base', padding: 'px-3 py-1.5' },
  }

  const displayLabel = label ?? config.label

  if (variant === 'dot') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span
          className={cn(
            'rounded-full',
            sizeClasses[size].dot,
            config.bgColor,
            config.pulse && 'animate-pulse'
          )}
          style={{ backgroundColor: `var(--${config.color.replace('text-', '')})` }}
        />
        {showLabel && (
          <span className={cn(sizeClasses[size].text, 'text-text-muted')}>{displayLabel}</span>
        )}
      </div>
    )
  }

  if (variant === 'icon') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Icon
          className={cn(sizeClasses[size].icon, config.color, config.pulse && 'animate-spin')}
        />
        {showLabel && (
          <span className={cn(sizeClasses[size].text, config.color)}>{displayLabel}</span>
        )}
      </div>
    )
  }

  if (variant === 'badge') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border',
          sizeClasses[size].padding,
          sizeClasses[size].text,
          config.bgColor,
          config.borderColor,
          config.color,
          className
        )}
      >
        <Icon className={cn(sizeClasses[size].icon, config.pulse && 'animate-spin')} />
        {displayLabel}
      </span>
    )
  }

  // pill variant
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full',
        sizeClasses[size].padding,
        sizeClasses[size].text,
        config.bgColor,
        config.color,
        className
      )}
    >
      <span
        className={cn('rounded-full', sizeClasses[size].dot, config.pulse && 'animate-pulse')}
        style={{ backgroundColor: 'currentColor' }}
      />
      {displayLabel}
    </span>
  )
}

// Batch selection support
interface SelectableItemProps {
  id: string
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  children: ReactNode
  className?: string
}

/**
 * Wrapper for items that can be batch-selected.
 * Supports shift-click for range selection.
 */
export function SelectableItem({
  id,
  selected,
  onSelect,
  children,
  className,
}: SelectableItemProps) {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent propagation if clicking checkbox directly
    if ((e.target as HTMLElement).tagName === 'INPUT') return

    // Toggle selection
    onSelect(id, !selected)
  }

  return (
    <div
      className={cn(
        'relative transition-colors',
        selected && 'bg-accent-blue/5 ring-1 ring-accent-blue/30',
        className
      )}
      onClick={handleClick}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(id, e.target.checked)}
        className="absolute top-3 left-3 w-4 h-4 rounded border-border focus:ring-accent-blue"
        aria-label={`Select item ${id}`}
      />
      <div className="pl-10">{children}</div>
    </div>
  )
}

interface BatchActionsProps {
  /** IDs of selected items */
  selectedIds: string[]
  /** Total number of items */
  totalCount: number
  /** Available batch actions */
  actions: {
    label: string
    icon: LucideIcon
    onClick: (ids: string[]) => void
    variant?: 'default' | 'danger'
    /** If true, action requires confirmation (caller handles UI) */
    requiresConfirmation?: boolean
  }[]
  /** Callback when selection is cleared */
  onClear: () => void
  /** Callback to select all */
  onSelectAll: () => void
  /** Optional confirmation handler (shows custom dialog) */
  onConfirm?: (action: string, ids: string[], proceed: () => void) => void
  /** Additional class names */
  className?: string
}

/**
 * Batch actions toolbar for multi-select operations.
 * Shows when items are selected, hides when none.
 */
export function BatchActions({
  selectedIds,
  totalCount,
  actions,
  onClear,
  onSelectAll,
  onConfirm,
  className,
}: BatchActionsProps) {
  if (selectedIds.length === 0) return null

  const handleAction = (action: BatchActionsProps['actions'][0]) => {
    if (action.requiresConfirmation && onConfirm) {
      onConfirm(action.label, selectedIds, () => action.onClick(selectedIds))
    } else {
      action.onClick(selectedIds)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-3 bg-surface border border-border rounded-lg animate-in slide-in-from-bottom-2',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-text-primary">
        <span className="font-medium">{selectedIds.length}</span>
        <span className="text-text-muted">of {totalCount} selected</span>
      </div>

      <div className="h-4 w-px bg-border" />

      <div className="flex items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              className={cn(
                'btn btn-sm',
                action.variant === 'danger' ? 'btn-danger' : 'btn-secondary'
              )}
            >
              <Icon className="w-4 h-4 mr-1" />
              {action.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button onClick={onSelectAll} className="text-sm text-accent-blue hover:underline">
          Select All
        </button>
        <button onClick={onClear} className="text-sm text-text-muted hover:text-text-primary">
          Clear
        </button>
      </div>
    </div>
  )
}
