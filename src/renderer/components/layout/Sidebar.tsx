import {
  LayoutDashboard,
  FolderKanban,
  Server,
  Brain,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  Gauge,
  Container,
  ScrollText,
  Bot,
  Network,
  MessageSquare,
  History,
  Globe,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import logoSvg from '@/assets/logo.svg'

type View = 'dashboard' | 'projects' | 'sessions' | 'mcp' | 'memory' | 'profiles' | 'context' | 'services' | 'logs' | 'ollama' | 'agents' | 'chat' | 'terminal' | 'globalSettings' | 'preferences'

interface SidebarProps {
  currentView: View
  onViewChange: (view: View) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const navItems: { id: View; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'projects', icon: FolderKanban, label: 'Projects' },
  { id: 'sessions', icon: History, label: 'Sessions' },
  { id: 'mcp', icon: Server, label: 'MCP Servers' },
  { id: 'memory', icon: Brain, label: 'Memory' },
  { id: 'profiles', icon: User, label: 'Profiles' },
  { id: 'context', icon: Gauge, label: 'Context' },
  { id: 'services', icon: Container, label: 'Services' },
  { id: 'logs', icon: ScrollText, label: 'Logs' },
  { id: 'ollama', icon: Bot, label: 'Ollama' },
  { id: 'agents', icon: Network, label: 'Agents' },
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
  { id: 'globalSettings', icon: Globe, label: 'Global Settings' },
  { id: 'preferences', icon: SlidersHorizontal, label: 'Preferences' },
]

export function Sidebar({
  currentView,
  onViewChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col bg-surface border-r border-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="h-20 flex items-center justify-center border-b border-border px-4">
        {collapsed ? (
          <img src={logoSvg} alt="Claude Pilot" className="h-10 w-auto" />
        ) : (
          <img src={logoSvg} alt="Claude Pilot" className="h-12 w-auto max-w-full" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150',
              currentView === id
                ? 'bg-accent-purple/10 text-accent-purple'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">{label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
