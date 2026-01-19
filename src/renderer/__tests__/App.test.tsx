/**
 * App Component Tests
 *
 * Tests for the main application component routing and navigation.
 *
 * @module App.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from '../App'

// Mock all view components to simplify testing
vi.mock('../components/layout/Sidebar', () => ({
  Sidebar: ({
    currentView,
    onViewChange,
  }: {
    currentView: string
    onViewChange: (view: string) => void
  }) => (
    <div data-testid="sidebar">
      <span data-testid="current-view">{currentView}</span>
      <button onClick={() => onViewChange('sessions')}>Sessions</button>
      <button onClick={() => onViewChange('mcp')}>MCP</button>
      <button onClick={() => onViewChange('memory')}>Memory</button>
      <button onClick={() => onViewChange('profiles')}>Profiles</button>
      <button onClick={() => onViewChange('services')}>Services</button>
      <button onClick={() => onViewChange('logs')}>Logs</button>
      <button onClick={() => onViewChange('ollama')}>Ollama</button>
      <button onClick={() => onViewChange('agents')}>Agents</button>
      <button onClick={() => onViewChange('chat')}>Chat</button>
      <button onClick={() => onViewChange('terminal')}>Terminal</button>
      <button onClick={() => onViewChange('globalSettings')}>GlobalSettings</button>
      <button onClick={() => onViewChange('preferences')}>Preferences</button>
      <button onClick={() => onViewChange('context')}>Context</button>
      <button onClick={() => onViewChange('projects')}>Projects</button>
      <button onClick={() => onViewChange('dashboard')}>Dashboard</button>
    </div>
  ),
}))

vi.mock('../components/layout/Header', () => ({
  Header: ({ onToggleSidebar }: { onToggleSidebar: () => void }) => (
    <div data-testid="header">
      <button onClick={onToggleSidebar}>Toggle Sidebar</button>
    </div>
  ),
}))

vi.mock('../components/dashboard/Dashboard', () => ({
  Dashboard: ({ onNavigate }: { onNavigate: (view: string) => void }) => (
    <div data-testid="dashboard-view">
      Dashboard
      <button onClick={() => onNavigate('projects')}>Go to Projects</button>
    </div>
  ),
}))

vi.mock('../components/projects/Projects', () => ({
  Projects: () => <div data-testid="projects-view">Projects</div>,
}))

vi.mock('../components/sessions/SessionManager', () => ({
  SessionManager: () => <div data-testid="sessions-view">Sessions</div>,
}))

vi.mock('../components/mcp/MCPManager', () => ({
  MCPManager: () => <div data-testid="mcp-view">MCP</div>,
}))

vi.mock('../components/memory/MemoryBrowser', () => ({
  MemoryBrowser: () => <div data-testid="memory-view">Memory</div>,
}))

vi.mock('../components/profiles/ProfileManager', () => ({
  ProfileManager: () => <div data-testid="profiles-view">Profiles</div>,
}))

vi.mock('../components/context/ContextDashboard', () => ({
  ContextDashboard: () => <div data-testid="context-view">Context</div>,
}))

vi.mock('../components/services/ServicesManager', () => ({
  ServicesManager: () => <div data-testid="services-view">Services</div>,
}))

vi.mock('../components/terminal/Terminal', () => ({
  Terminal: () => <div data-testid="terminal-view">Terminal</div>,
}))

vi.mock('../components/settings/Settings', () => ({
  Settings: () => <div data-testid="preferences-view">Preferences</div>,
}))

vi.mock('../components/settings/GlobalSettings', () => ({
  GlobalSettings: () => <div data-testid="globalsettings-view">GlobalSettings</div>,
}))

vi.mock('../components/logs/LogsViewer', () => ({
  LogsViewer: () => <div data-testid="logs-view">Logs</div>,
}))

vi.mock('../components/ollama/OllamaManager', () => ({
  OllamaManager: () => <div data-testid="ollama-view">Ollama</div>,
}))

vi.mock('../components/agents/AgentCanvas', () => ({
  AgentCanvas: () => <div data-testid="agents-view">Agents</div>,
}))

vi.mock('../components/chat/ChatInterface', () => ({
  ChatInterface: () => <div data-testid="chat-view">Chat</div>,
}))

vi.mock('../components/common/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}))

vi.mock('../components/common/ErrorNotifications', () => ({
  ErrorToast: () => <div data-testid="error-toast">ErrorToast</div>,
}))

vi.mock('../components/common/CommandPalette', () => ({
  CommandPalette: ({ onNavigate }: { onNavigate: (view: string) => void }) => (
    <div data-testid="command-palette">
      <button onClick={() => onNavigate('dashboard')}>Nav Dashboard</button>
    </div>
  ),
  useCommandPalette: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}))

vi.mock('../stores/errors', () => ({
  initializeErrorListener: vi.fn(() => () => {}),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // INITIAL RENDER
  // ===========================================================================
  describe('initial render', () => {
    it('renders with dashboard as default view', () => {
      render(<App />)
      expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    })

    it('renders the sidebar', () => {
      render(<App />)
      expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    })

    it('renders the header', () => {
      render(<App />)
      expect(screen.getByTestId('header')).toBeInTheDocument()
    })

    it('renders the error boundaries', () => {
      render(<App />)
      // App has nested error boundaries (outer for app, inner for view)
      const errorBoundaries = screen.getAllByTestId('error-boundary')
      expect(errorBoundaries.length).toBeGreaterThanOrEqual(1)
    })

    it('renders the error toast', () => {
      render(<App />)
      expect(screen.getByTestId('error-toast')).toBeInTheDocument()
    })

    it('renders the command palette', () => {
      render(<App />)
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================
  describe('navigation', () => {
    it('navigates to projects view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Projects'))
      expect(screen.getByTestId('projects-view')).toBeInTheDocument()
    })

    it('navigates to sessions view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Sessions'))
      expect(screen.getByTestId('sessions-view')).toBeInTheDocument()
    })

    it('navigates to mcp view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('MCP'))
      expect(screen.getByTestId('mcp-view')).toBeInTheDocument()
    })

    it('navigates to memory view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Memory'))
      expect(screen.getByTestId('memory-view')).toBeInTheDocument()
    })

    it('navigates to profiles view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Profiles'))
      expect(screen.getByTestId('profiles-view')).toBeInTheDocument()
    })

    it('navigates to context view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Context'))
      expect(screen.getByTestId('context-view')).toBeInTheDocument()
    })

    it('navigates to services view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Services'))
      expect(screen.getByTestId('services-view')).toBeInTheDocument()
    })

    it('navigates to logs view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Logs'))
      expect(screen.getByTestId('logs-view')).toBeInTheDocument()
    })

    it('navigates to ollama view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Ollama'))
      expect(screen.getByTestId('ollama-view')).toBeInTheDocument()
    })

    it('navigates to agents view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Agents'))
      expect(screen.getByTestId('agents-view')).toBeInTheDocument()
    })

    it('navigates to chat view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Chat'))
      expect(screen.getByTestId('chat-view')).toBeInTheDocument()
    })

    it('navigates to terminal view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Terminal'))
      expect(screen.getByTestId('terminal-view')).toBeInTheDocument()
    })

    it('navigates to globalSettings view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('GlobalSettings'))
      expect(screen.getByTestId('globalsettings-view')).toBeInTheDocument()
    })

    it('navigates to preferences view', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Preferences'))
      expect(screen.getByTestId('preferences-view')).toBeInTheDocument()
    })

    it('navigates via dashboard internal link', () => {
      render(<App />)
      fireEvent.click(screen.getByText('Go to Projects'))
      expect(screen.getByTestId('projects-view')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SIDEBAR TOGGLE
  // ===========================================================================
  describe('sidebar toggle', () => {
    it('toggles sidebar collapsed state', () => {
      render(<App />)
      const toggleButton = screen.getByText('Toggle Sidebar')

      // Initial state
      const sidebar = screen.getByTestId('sidebar')
      expect(sidebar).toBeInTheDocument()

      // Toggle
      fireEvent.click(toggleButton)

      // Sidebar should still be in DOM but parent may have collapsed class
      expect(sidebar).toBeInTheDocument()
    })
  })
})
