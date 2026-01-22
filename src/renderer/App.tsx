import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ErrorToast } from './components/common/ErrorNotifications'
import { ToastProvider, useToast, setGlobalToast } from './components/common/Toast'
import { CommandPalette, useCommandPalette } from './components/common/CommandPalette'
import { ShortcutsHelp, useShortcutsHelp } from './components/common/ShortcutsHelp'
import { initializeErrorListener } from './stores/errors'
import { useMediaQuery } from './hooks/useResponsive'
// All views lazy-loaded for code splitting and faster startup
import {
  LazyDashboard,
  LazyProjects,
  LazySessionManager,
  LazyMCPManager,
  LazyProfileManager,
  LazyContextDashboard,
  LazyServicesManager,
  LazySettings,
  LazyLogsViewer,
  LazyOllamaManager,
  LazyAgentCanvas,
  LazyMemoryBrowser,
  LazyTerminal,
  LazyChatInterface,
  LazyGlobalSettings,
} from './components/common/LazyComponents'

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

// Initialize global toast reference for use outside React components
function GlobalToastInitializer() {
  const toast = useToast()
  useEffect(() => {
    setGlobalToast(toast)
  }, [toast])
  return null
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userToggledSidebar, setUserToggledSidebar] = useState(false)
  const commandPalette = useCommandPalette()
  const shortcutsHelp = useShortcutsHelp()
  const isNarrowWindow = useMediaQuery('(max-width: 900px)')

  // Memoized navigation handler for command palette
  const handleNavigate = useCallback(
    (view: string) => {
      setCurrentView(view as View)
      commandPalette.close()
    },
    [commandPalette]
  )

  // Initialize error listener on mount
  useEffect(() => {
    const unsubscribe = initializeErrorListener()
    return () => unsubscribe()
  }, [])

  // Auto-collapse sidebar on narrow windows (unless user manually toggled)
  useEffect(() => {
    if (!userToggledSidebar) {
      setSidebarCollapsed(isNarrowWindow)
    }
  }, [isNarrowWindow, userToggledSidebar])

  // Handle manual sidebar toggle
  const handleToggleSidebar = useCallback(() => {
    setUserToggledSidebar(true)
    setSidebarCollapsed((prev) => !prev)
    // Reset user override after resize
    const resetTimeout = setTimeout(() => setUserToggledSidebar(false), 2000)
    return () => clearTimeout(resetTimeout)
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <LazyDashboard onNavigate={(view) => setCurrentView(view as View)} />
      case 'projects':
        return <LazyProjects />
      case 'sessions':
        return <LazySessionManager />
      case 'mcp':
        return <LazyMCPManager />
      case 'memory':
        return <LazyMemoryBrowser />
      case 'profiles':
        return <LazyProfileManager />
      case 'context':
        return <LazyContextDashboard onNavigate={(view) => setCurrentView(view as View)} />
      case 'services':
        return <LazyServicesManager />
      case 'logs':
        return <LazyLogsViewer />
      case 'ollama':
        return <LazyOllamaManager />
      case 'agents':
        return <LazyAgentCanvas />
      case 'chat':
        return <LazyChatInterface />
      case 'terminal':
        return <LazyTerminal />
      case 'globalSettings':
        return <LazyGlobalSettings />
      case 'preferences':
        return <LazySettings />
      default:
        return <LazyDashboard />
    }
  }

  return (
    <ErrorBoundary>
      <ToastProvider position="bottom-right">
        <GlobalToastInitializer />
        <div className="flex h-screen overflow-hidden">
          {/* Skip link for keyboard navigation - hidden until focused */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent-purple focus:text-white focus:rounded-lg focus:outline-none"
          >
            Skip to main content
          </a>

          {/* Sidebar navigation */}
          <Sidebar
            currentView={currentView}
            onViewChange={setCurrentView}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
          />

          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header title={getViewTitle(currentView)} onToggleSidebar={handleToggleSidebar} />

            <main
              id="main-content"
              role="main"
              aria-label={`${getViewTitle(currentView)} content`}
              className="flex-1 overflow-auto p-6 bg-background"
            >
              <ErrorBoundary key={currentView}>{renderView()}</ErrorBoundary>
            </main>
          </div>

          {/* Error notifications - live region for screen readers */}
          <div role="status" aria-live="polite" aria-atomic="true">
            <ErrorToast />
          </div>

          {/* Command Palette (Ctrl+K) */}
          <CommandPalette
            isOpen={commandPalette.isOpen}
            onClose={commandPalette.close}
            onNavigate={handleNavigate}
          />

          {/* Keyboard Shortcuts Help (?) */}
          <ShortcutsHelp isOpen={shortcutsHelp.isOpen} onClose={shortcutsHelp.close} />
        </div>
      </ToastProvider>
    </ErrorBoundary>
  )
}

function getViewTitle(view: View): string {
  const titles: Record<View, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    sessions: 'External Sessions',
    mcp: 'MCP Servers',
    memory: 'Memory Browser',
    profiles: 'Work Profiles',
    context: 'Context Management',
    services: 'System Services',
    logs: 'System Logs',
    ollama: 'Ollama Models',
    agents: 'Agent Orchestration',
    chat: 'Claude Chat',
    terminal: 'Terminal',
    globalSettings: 'Global Settings',
    preferences: 'Preferences',
  }
  return titles[view]
}
