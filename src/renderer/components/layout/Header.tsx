import {
  Menu,
  Bell,
  RefreshCw,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  AlertOctagon,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useErrorStore } from '@/stores/errors'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  onToggleSidebar: () => void
}

const SEVERITY_ICONS = {
  critical: AlertOctagon,
  error: AlertTriangle,
  warning: AlertCircle,
  info: Info,
}

const SEVERITY_COLORS = {
  critical: 'text-accent-red',
  error: 'text-accent-red',
  warning: 'text-accent-yellow',
  info: 'text-accent-blue',
}

export function Header({ title, onToggleSidebar }: HeaderProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)

  const { errors, unreadCount, dismissError, dismissAll, markAllRead, clearErrors } =
    useErrorStore()
  const activeErrors = errors.filter((e) => !e.dismissed)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Mark as read when opening dropdown
  const handleToggleNotifications = () => {
    if (!showNotifications && unreadCount > 0) {
      markAllRead()
    }
    setShowNotifications(!showNotifications)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    // Trigger global refresh
    window.dispatchEvent(new CustomEvent('app:refresh'))
    setTimeout(() => setRefreshing(false), 1000)
  }

  return (
    <header
      role="banner"
      className="h-14 flex items-center justify-between px-4 border-b border-border bg-surface"
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
      </div>

      <div className="flex items-center gap-2" role="toolbar" aria-label="Page actions">
        <button
          onClick={handleRefresh}
          aria-label={refreshing ? 'Refreshing...' : 'Refresh page'}
          aria-busy={refreshing}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          disabled={refreshing}
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            onClick={handleToggleNotifications}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            aria-expanded={showNotifications}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors relative"
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-medium bg-accent-red text-white rounded-full flex items-center justify-center"
                aria-hidden="true"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-medium text-text-primary">Notifications</h3>
                <div className="flex gap-2">
                  {activeErrors.length > 0 && (
                    <>
                      <button
                        onClick={dismissAll}
                        className="text-xs text-text-muted hover:text-text-primary"
                      >
                        Dismiss All
                      </button>
                      <button
                        onClick={clearErrors}
                        className="text-xs text-accent-red hover:text-accent-red/80"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {activeErrors.length === 0 ? (
                  <div className="px-4 py-8 text-center text-text-muted">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  activeErrors.map((error) => {
                    const Icon = SEVERITY_ICONS[error.severity]
                    return (
                      <div
                        key={error.id}
                        className="px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover"
                      >
                        <div className="flex items-start gap-3">
                          <Icon
                            className={cn(
                              'w-4 h-4 mt-0.5 flex-shrink-0',
                              SEVERITY_COLORS[error.severity]
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary line-clamp-2">
                              {error.message}
                            </p>
                            <p className="text-xs text-text-muted mt-1">
                              {new Date(error.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                          <button
                            onClick={() => dismissError(error.id)}
                            className="p-1 text-text-muted hover:text-text-primary"
                            aria-label="Dismiss"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-border mx-2" aria-hidden="true" />

        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full bg-accent-purple/20 flex items-center justify-center"
            role="img"
            aria-label="User avatar"
          >
            <span className="text-sm font-medium text-accent-purple" aria-hidden="true">
              A
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
