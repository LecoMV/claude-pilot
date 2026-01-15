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
    <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-surface">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          disabled={refreshing}
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        <button className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent-red rounded-full" />
        </button>

        <div className="w-px h-6 bg-border mx-2" />

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent-purple/20 flex items-center justify-center">
            <span className="text-sm font-medium text-accent-purple">A</span>
          </div>
        </div>
      </div>
    </header>
  )
}
