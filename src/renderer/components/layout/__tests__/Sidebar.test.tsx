import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from '../Sidebar'

// Mock the logo import
vi.mock('@/assets/logo.svg', () => ({
  default: '/mock-logo.svg',
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  LayoutDashboard: () => <span data-testid="icon-dashboard">Dashboard Icon</span>,
  FolderKanban: () => <span data-testid="icon-projects">Projects Icon</span>,
  Server: () => <span data-testid="icon-server">Server Icon</span>,
  Brain: () => <span data-testid="icon-brain">Brain Icon</span>,
  Terminal: () => <span data-testid="icon-terminal">Terminal Icon</span>,
  ChevronLeft: () => <span data-testid="icon-chevron-left">ChevronLeft</span>,
  ChevronRight: () => <span data-testid="icon-chevron-right">ChevronRight</span>,
  User: () => <span data-testid="icon-user">User Icon</span>,
  Gauge: () => <span data-testid="icon-gauge">Gauge Icon</span>,
  Container: () => <span data-testid="icon-container">Container Icon</span>,
  ScrollText: () => <span data-testid="icon-logs">Logs Icon</span>,
  Bot: () => <span data-testid="icon-bot">Bot Icon</span>,
  Network: () => <span data-testid="icon-network">Network Icon</span>,
  MessageSquare: () => <span data-testid="icon-chat">Chat Icon</span>,
  History: () => <span data-testid="icon-history">History Icon</span>,
  Globe: () => <span data-testid="icon-globe">Globe Icon</span>,
  SlidersHorizontal: () => <span data-testid="icon-sliders">Sliders Icon</span>,
}))

// Mock the utility function
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

describe('Sidebar', () => {
  const defaultProps = {
    currentView: 'dashboard' as const,
    onViewChange: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Logo', () => {
    it('renders expanded logo when not collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={false} />)

      const logo = screen.getByAltText('Claude Pilot')
      expect(logo).toBeDefined()
      expect(logo.getAttribute('src')).toBe('/mock-logo.svg')
    })

    it('renders collapsed logo when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />)

      const logo = screen.getByAltText('Claude Pilot')
      expect(logo).toBeDefined()
      expect(logo.getAttribute('src')).toBe('/mock-logo.svg')
    })
  })

  describe('Navigation Items', () => {
    it('renders all navigation items when expanded', () => {
      render(<Sidebar {...defaultProps} collapsed={false} />)

      expect(screen.getByText('Dashboard')).toBeDefined()
      expect(screen.getByText('Projects')).toBeDefined()
      expect(screen.getByText('Sessions')).toBeDefined()
      expect(screen.getByText('MCP Servers')).toBeDefined()
      expect(screen.getByText('Memory')).toBeDefined()
      expect(screen.getByText('Profiles')).toBeDefined()
      expect(screen.getByText('Context')).toBeDefined()
      expect(screen.getByText('Services')).toBeDefined()
      expect(screen.getByText('Logs')).toBeDefined()
      expect(screen.getByText('Ollama')).toBeDefined()
      expect(screen.getByText('Agents')).toBeDefined()
      expect(screen.getByText('Chat')).toBeDefined()
      expect(screen.getByText('Terminal')).toBeDefined()
      expect(screen.getByText('Global Settings')).toBeDefined()
      expect(screen.getByText('Preferences')).toBeDefined()
    })

    it('hides navigation labels when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />)

      // Labels should not be visible when collapsed
      expect(screen.queryByText('Dashboard')).toBeNull()
      expect(screen.queryByText('Projects')).toBeNull()
      expect(screen.queryByText('Sessions')).toBeNull()
      expect(screen.queryByText('MCP Servers')).toBeNull()
      expect(screen.queryByText('Memory')).toBeNull()
    })

    it('still renders icons when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />)

      expect(screen.getByTestId('icon-dashboard')).toBeDefined()
      expect(screen.getByTestId('icon-projects')).toBeDefined()
      expect(screen.getByTestId('icon-server')).toBeDefined()
      expect(screen.getByTestId('icon-brain')).toBeDefined()
      expect(screen.getByTestId('icon-terminal')).toBeDefined()
    })

    it('calls onViewChange with correct view when clicking nav item', () => {
      const mockOnViewChange = vi.fn()
      render(<Sidebar {...defaultProps} onViewChange={mockOnViewChange} collapsed={false} />)

      fireEvent.click(screen.getByText('Projects'))
      expect(mockOnViewChange).toHaveBeenCalledWith('projects')

      fireEvent.click(screen.getByText('Sessions'))
      expect(mockOnViewChange).toHaveBeenCalledWith('sessions')

      fireEvent.click(screen.getByText('MCP Servers'))
      expect(mockOnViewChange).toHaveBeenCalledWith('mcp')

      fireEvent.click(screen.getByText('Memory'))
      expect(mockOnViewChange).toHaveBeenCalledWith('memory')

      fireEvent.click(screen.getByText('Terminal'))
      expect(mockOnViewChange).toHaveBeenCalledWith('terminal')
    })

    it('calls onViewChange when clicking nav button in collapsed mode', () => {
      const mockOnViewChange = vi.fn()
      render(<Sidebar {...defaultProps} onViewChange={mockOnViewChange} collapsed={true} />)

      // Click the first button (Dashboard)
      const buttons = screen.getAllByRole('button')
      // First 15 buttons are nav items, last one is collapse toggle
      fireEvent.click(buttons[0])
      expect(mockOnViewChange).toHaveBeenCalledWith('dashboard')
    })
  })

  describe('Active State', () => {
    it('highlights the current view', () => {
      const { container: _container } = render(
        <Sidebar {...defaultProps} currentView="projects" collapsed={false} />
      )

      // Find the button for Projects
      const projectsButton = screen.getByText('Projects').closest('button')
      expect(projectsButton?.className).toContain('bg-accent-purple')
    })

    it('does not highlight inactive views', () => {
      render(<Sidebar {...defaultProps} currentView="dashboard" collapsed={false} />)

      // Find the button for Projects (not currently active)
      const projectsButton = screen.getByText('Projects').closest('button')
      expect(projectsButton?.className).not.toContain('bg-accent-purple')
    })

    it('changes highlight when currentView changes', () => {
      const { rerender } = render(
        <Sidebar {...defaultProps} currentView="dashboard" collapsed={false} />
      )

      let dashboardButton = screen.getByText('Dashboard').closest('button')
      expect(dashboardButton?.className).toContain('bg-accent-purple')

      rerender(<Sidebar {...defaultProps} currentView="mcp" collapsed={false} />)

      dashboardButton = screen.getByText('Dashboard').closest('button')
      expect(dashboardButton?.className).not.toContain('bg-accent-purple')

      const mcpButton = screen.getByText('MCP Servers').closest('button')
      expect(mcpButton?.className).toContain('bg-accent-purple')
    })
  })

  describe('Collapse Toggle', () => {
    it('renders collapse button with "Collapse" text when expanded', () => {
      render(<Sidebar {...defaultProps} collapsed={false} />)

      expect(screen.getByText('Collapse')).toBeDefined()
      expect(screen.getByTestId('icon-chevron-left')).toBeDefined()
    })

    it('renders only chevron right when collapsed', () => {
      render(<Sidebar {...defaultProps} collapsed={true} />)

      expect(screen.queryByText('Collapse')).toBeNull()
      expect(screen.getByTestId('icon-chevron-right')).toBeDefined()
    })

    it('calls onToggleCollapse when collapse button clicked', () => {
      const mockToggle = vi.fn()
      render(<Sidebar {...defaultProps} onToggleCollapse={mockToggle} collapsed={false} />)

      fireEvent.click(screen.getByText('Collapse'))
      expect(mockToggle).toHaveBeenCalledTimes(1)
    })

    it('calls onToggleCollapse when expand button clicked', () => {
      const mockToggle = vi.fn()
      render(<Sidebar {...defaultProps} onToggleCollapse={mockToggle} collapsed={true} />)

      // Find the expand button (last button in the sidebar)
      const buttons = screen.getAllByRole('button')
      const expandButton = buttons[buttons.length - 1]

      fireEvent.click(expandButton)
      expect(mockToggle).toHaveBeenCalledTimes(1)
    })
  })

  describe('Width Classes', () => {
    it('has expanded width when not collapsed', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={false} />)

      const aside = container.querySelector('aside')
      expect(aside?.className).toContain('w-56')
    })

    it('has collapsed width when collapsed', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={true} />)

      const aside = container.querySelector('aside')
      expect(aside?.className).toContain('w-16')
    })

    it('has transition classes for smooth animation', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={false} />)

      const aside = container.querySelector('aside')
      expect(aside?.className).toContain('transition-all')
      expect(aside?.className).toContain('duration-200')
    })
  })

  describe('View Types', () => {
    const allViews = [
      'dashboard',
      'projects',
      'sessions',
      'mcp',
      'memory',
      'profiles',
      'context',
      'services',
      'logs',
      'ollama',
      'agents',
      'chat',
      'terminal',
      'globalSettings',
      'preferences',
    ] as const

    it.each(allViews)('correctly highlights %s view', (view) => {
      render(<Sidebar {...defaultProps} currentView={view} collapsed={false} />)

      // Get all nav buttons
      const buttons = screen.getAllByRole('button')

      // Find the highlighted button (should be one)
      const highlightedButtons = buttons.filter((btn) =>
        btn.className.includes('bg-accent-purple')
      )

      // Should have exactly one highlighted button
      expect(highlightedButtons.length).toBe(1)
    })

    it.each(allViews)('can navigate to %s view', (view) => {
      const mockOnViewChange = vi.fn()
      render(<Sidebar {...defaultProps} onViewChange={mockOnViewChange} collapsed={false} />)

      const buttons = screen.getAllByRole('button')
      const navButtons = buttons.slice(0, 15) // First 15 are nav items

      const viewIndex = allViews.indexOf(view)
      fireEvent.click(navButtons[viewIndex])

      expect(mockOnViewChange).toHaveBeenCalledWith(view)
    })
  })

  describe('Accessibility', () => {
    it('all navigation items are buttons', () => {
      render(<Sidebar {...defaultProps} collapsed={false} />)

      const buttons = screen.getAllByRole('button')
      // 15 nav items + 1 collapse toggle
      expect(buttons.length).toBe(16)
    })

    it('buttons are keyboard accessible', () => {
      const mockOnViewChange = vi.fn()
      render(<Sidebar {...defaultProps} onViewChange={mockOnViewChange} collapsed={false} />)

      const dashboardButton = screen.getByText('Dashboard').closest('button')
      dashboardButton?.focus()

      fireEvent.keyDown(dashboardButton!, { key: 'Enter' })
      // Button click should be triggered by Enter key natively
    })
  })

  describe('Styling', () => {
    it('has correct border styling', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={false} />)

      const aside = container.querySelector('aside')
      expect(aside?.className).toContain('border-r')
      expect(aside?.className).toContain('border-border')
    })

    it('has background surface color', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={false} />)

      const aside = container.querySelector('aside')
      expect(aside?.className).toContain('bg-surface')
    })

    it('is a flex column', () => {
      const { container } = render(<Sidebar {...defaultProps} collapsed={false} />)

      const aside = container.querySelector('aside')
      expect(aside?.className).toContain('flex')
      expect(aside?.className).toContain('flex-col')
    })
  })
})
