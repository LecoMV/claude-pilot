import { Menu, Bell, RefreshCw } from 'lucide-react'
import { useState } from 'react'

interface HeaderProps {
  title: string
  onToggleSidebar: () => void
}

export function Header({ title, onToggleSidebar }: HeaderProps) {
  const [refreshing, setRefreshing] = useState(false)

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

        <button
          aria-label="Notifications (1 unread)"
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors relative"
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent-red rounded-full"
            aria-hidden="true"
          />
        </button>

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
