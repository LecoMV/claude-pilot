import { useState } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  Server,
  Brain,
  Terminal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import logoSvg from '@/assets/logo.svg'

type View =
  | 'dashboard'
  | 'projects'
  | 'sessions'
  | 'mcp'
  | 'memory'
  | 'profiles'
  | 'context'
  | 'services'
  | 'logs'
  | 'ollama'
  | 'agents'
  | 'chat'
  | 'terminal'
  | 'globalSettings'
  | 'preferences'

interface NavItem {
  id: View
  icon: LucideIcon
  label: string
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

interface SidebarProps {
  currentView: View
  onViewChange: (view: View) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const navGroups: NavGroup[] = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'projects', icon: FolderKanban, label: 'Projects' },
    ],
  },
  {
    id: 'sessions',
    label: 'Sessions & Memory',
    items: [
      { id: 'sessions', icon: History, label: 'Sessions' },
      { id: 'memory', icon: Brain, label: 'Memory' },
      { id: 'context', icon: Gauge, label: 'Context' },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    items: [
      { id: 'mcp', icon: Server, label: 'MCP Servers' },
      { id: 'services', icon: Container, label: 'Services' },
      { id: 'ollama', icon: Bot, label: 'Ollama' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { id: 'logs', icon: ScrollText, label: 'Logs' },
      { id: 'agents', icon: Network, label: 'Agents' },
      { id: 'chat', icon: MessageSquare, label: 'Chat' },
      { id: 'terminal', icon: Terminal, label: 'Terminal' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { id: 'profiles', icon: User, label: 'Profiles' },
      { id: 'globalSettings', icon: Globe, label: 'Global Settings' },
      { id: 'preferences', icon: SlidersHorizontal, label: 'Preferences' },
    ],
  },
]

// Get all views in a group for checking if current view is in group
function isViewInGroup(group: NavGroup, currentView: View): boolean {
  return group.items.some((item) => item.id === currentView)
}

export function Sidebar({ currentView, onViewChange, collapsed, onToggleCollapse }: SidebarProps) {
  // Track which groups are expanded (default: all expanded)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(navGroups.map((g) => g.id))
  )

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }

  return (
    <aside
      role="complementary"
      aria-label="Application sidebar"
      className={cn(
        'flex flex-col bg-surface border-r border-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="py-6 flex items-center justify-center border-b border-border px-3">
        {collapsed ? (
          <img src={logoSvg} alt="Claude Pilot" className="w-10 h-auto" decoding="async" />
        ) : (
          <img src={logoSvg} alt="Claude Pilot" className="w-full h-auto px-1" decoding="async" />
        )}
      </div>

      {/* Navigation */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="flex-1 p-2 space-y-1 overflow-y-auto"
      >
        {navGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.id)
          const hasActiveItem = isViewInGroup(group, currentView)

          return (
            <div key={group.id} className="mb-1">
              {/* Group header - only show when expanded */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`nav-group-${group.id}`}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors',
                    hasActiveItem
                      ? 'text-accent-purple'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      !isExpanded && '-rotate-90'
                    )}
                    aria-hidden="true"
                  />
                </button>
              )}

              {/* Group items */}
              <div
                id={`nav-group-${group.id}`}
                className={cn(
                  'space-y-0.5 overflow-hidden transition-all duration-200',
                  !collapsed && !isExpanded && 'h-0 opacity-0'
                )}
              >
                {group.items.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => onViewChange(id)}
                    aria-current={currentView === id ? 'page' : undefined}
                    aria-label={collapsed ? label : undefined}
                    title={collapsed ? label : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150',
                      currentView === id
                        ? 'bg-accent-purple/10 text-accent-purple'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="text-sm font-medium">{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border">
        <button
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
