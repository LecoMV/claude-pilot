import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { Projects } from './components/projects/Projects'
import { SessionManager } from './components/sessions/SessionManager'
import { MCPManager } from './components/mcp/MCPManager'
import { MemoryBrowser } from './components/memory/MemoryBrowser'
import { ProfileManager } from './components/profiles/ProfileManager'
import { ContextDashboard } from './components/context/ContextDashboard'
import { ServicesManager } from './components/services/ServicesManager'
import { Terminal } from './components/terminal/Terminal'
import { Settings } from './components/settings/Settings'
import { GlobalSettings } from './components/settings/GlobalSettings'
import { LogsViewer } from './components/logs/LogsViewer'
import { OllamaManager } from './components/ollama/OllamaManager'
import { AgentCanvas } from './components/agents/AgentCanvas'
import { ChatInterface } from './components/chat/ChatInterface'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { ErrorToast } from './components/common/ErrorNotifications'
import { CommandPalette, useCommandPalette } from './components/common/CommandPalette'
import { initializeErrorListener } from './stores/errors'

type View = 'dashboard' | 'projects' | 'sessions' | 'mcp' | 'memory' | 'profiles' | 'context' | 'services' | 'logs' | 'ollama' | 'agents' | 'chat' | 'terminal' | 'globalSettings' | 'preferences'

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const commandPalette = useCommandPalette()

  // Memoized navigation handler for command palette
  const handleNavigate = useCallback((view: string) => {
    setCurrentView(view as View)
    commandPalette.close()
  }, [commandPalette])

  // Initialize error listener on mount
  useEffect(() => {
    const unsubscribe = initializeErrorListener()
    return () => unsubscribe()
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={(view) => setCurrentView(view as View)} />
      case 'projects':
        return <Projects />
      case 'sessions':
        return <SessionManager />
      case 'mcp':
        return <MCPManager />
      case 'memory':
        return <MemoryBrowser />
      case 'profiles':
        return <ProfileManager />
      case 'context':
        return <ContextDashboard />
      case 'services':
        return <ServicesManager />
      case 'logs':
        return <LogsViewer />
      case 'ollama':
        return <OllamaManager />
      case 'agents':
        return <AgentCanvas />
      case 'chat':
        return <ChatInterface />
      case 'terminal':
        return <Terminal />
      case 'globalSettings':
        return <GlobalSettings />
      case 'preferences':
        return <Settings />
      default:
        return <Dashboard />
    }
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            title={getViewTitle(currentView)}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />

          <main className="flex-1 overflow-auto p-6 bg-background">
            <ErrorBoundary key={currentView}>
              {renderView()}
            </ErrorBoundary>
          </main>
        </div>

        {/* Error notifications */}
        <ErrorToast />

        {/* Command Palette (Ctrl+K) */}
        <CommandPalette
          isOpen={commandPalette.isOpen}
          onClose={commandPalette.close}
          onNavigate={handleNavigate}
        />
      </div>
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
