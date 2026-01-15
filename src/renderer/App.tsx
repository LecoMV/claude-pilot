import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { Dashboard } from './components/dashboard/Dashboard'
import { Projects } from './components/projects/Projects'
import { MCPManager } from './components/mcp/MCPManager'
import { MemoryBrowser } from './components/memory/MemoryBrowser'
import { ProfileManager } from './components/profiles/ProfileManager'
import { ContextDashboard } from './components/context/ContextDashboard'
import { Terminal } from './components/terminal/Terminal'
import { Settings } from './components/settings/Settings'

type View = 'dashboard' | 'projects' | 'mcp' | 'memory' | 'profiles' | 'context' | 'terminal' | 'settings'

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />
      case 'projects':
        return <Projects />
      case 'mcp':
        return <MCPManager />
      case 'memory':
        return <MemoryBrowser />
      case 'profiles':
        return <ProfileManager />
      case 'context':
        return <ContextDashboard />
      case 'terminal':
        return <Terminal />
      case 'settings':
        return <Settings />
      default:
        return <Dashboard />
    }
  }

  return (
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
          {renderView()}
        </main>
      </div>
    </div>
  )
}

function getViewTitle(view: View): string {
  const titles: Record<View, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    mcp: 'MCP Servers',
    memory: 'Memory Browser',
    profiles: 'Profiles & Settings',
    context: 'Context Management',
    terminal: 'Terminal',
    settings: 'Settings',
  }
  return titles[view]
}
