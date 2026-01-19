/**
 * CommandPalette Component Tests
 *
 * Tests the command palette component including:
 * - Opening and closing behavior
 * - Search/filter functionality
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Command execution
 * - Category display and filtering
 * - Selected item highlighting
 * - Scrolling behavior
 * - useCommandPalette hook
 *
 * @module CommandPalette.test
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CommandPalette, useCommandPalette } from '../CommandPalette'
import { renderHook } from '@testing-library/react'

// ===========================================================================
// MOCK SETUP
// ===========================================================================

// Mock tRPC hooks
const mockSystemStatusFetch = vi.fn()
const mockMcpReloadMutate = vi.fn()
const mockTerminalCreateMutate = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      system: {
        status: {
          fetch: mockSystemStatusFetch,
        },
      },
    }),
    mcp: {
      reload: {
        useMutation: () => ({
          mutateAsync: mockMcpReloadMutate,
        }),
      },
    },
    terminal: {
      create: {
        useMutation: () => ({
          mutateAsync: mockTerminalCreateMutate,
        }),
      },
    },
  },
}))

// Mock lucide-react icons - use empty spans to avoid text conflicts
vi.mock('lucide-react', () => ({
  Search: () => <span data-testid="icon-search" />,
  LayoutDashboard: () => <span data-testid="icon-dashboard" />,
  FolderOpen: () => <span data-testid="icon-folder" />,
  Server: () => <span data-testid="icon-server" />,
  Database: () => <span data-testid="icon-database" />,
  User: () => <span data-testid="icon-user" />,
  Settings: () => <span data-testid="icon-settings" />,
  Terminal: () => <span data-testid="icon-terminal" />,
  Cpu: () => <span data-testid="icon-cpu" />,
  Logs: () => <span data-testid="icon-logs" />,
  Brain: () => <span data-testid="icon-brain" />,
  RefreshCw: () => <span data-testid="icon-refresh" />,
  Plug: () => <span data-testid="icon-plug" />,
  MessageSquare: () => <span data-testid="icon-message" />,
  Activity: () => <span data-testid="icon-activity" />,
  Zap: () => <span data-testid="icon-zap" />,
}))

// ===========================================================================
// TEST UTILITIES
// ===========================================================================

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onNavigate: vi.fn(),
}

const renderCommandPalette = (props = {}) => {
  return render(<CommandPalette {...defaultProps} {...props} />)
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSystemStatusFetch.mockResolvedValue({})
    mockMcpReloadMutate.mockResolvedValue(undefined)
    mockTerminalCreateMutate.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // RENDERING
  // =========================================================================

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      renderCommandPalette()

      expect(screen.getByPlaceholderText('Search commands...')).toBeDefined()
    })

    it('does not render when isOpen is false', () => {
      renderCommandPalette({ isOpen: false })

      expect(screen.queryByPlaceholderText('Search commands...')).toBeNull()
    })

    it('renders search input with icon', () => {
      renderCommandPalette()

      // There may be multiple search icons due to the "Search Memory" command, use getAllByTestId
      const searchIcons = screen.getAllByTestId('icon-search')
      expect(searchIcons.length).toBeGreaterThan(0)
      expect(screen.getByPlaceholderText('Search commands...')).toBeDefined()
    })

    it('renders ESC keyboard hint', () => {
      renderCommandPalette()

      const escHints = screen.getAllByText('ESC')
      expect(escHints.length).toBeGreaterThan(0)
    })

    it('renders navigation hints in footer', () => {
      renderCommandPalette()

      expect(screen.getByText('Navigate')).toBeDefined()
      expect(screen.getByText('Select')).toBeDefined()
      expect(screen.getByText('Close')).toBeDefined()
    })

    it('renders Claude Pilot branding', () => {
      renderCommandPalette()

      expect(screen.getByText('Claude Pilot')).toBeDefined()
    })

    it('renders backdrop overlay', () => {
      renderCommandPalette()

      const backdrop = document.querySelector('.bg-black\\/50')
      expect(backdrop).not.toBeNull()
    })
  })

  // =========================================================================
  // COMMAND LIST
  // =========================================================================

  describe('Command List', () => {
    it('renders navigation commands', () => {
      renderCommandPalette()

      expect(screen.getByText('Go to Dashboard')).toBeDefined()
      expect(screen.getByText('Go to Projects')).toBeDefined()
      expect(screen.getByText('Go to MCP Servers')).toBeDefined()
      expect(screen.getByText('Go to Memory Browser')).toBeDefined()
      expect(screen.getByText('Go to Terminal')).toBeDefined()
      expect(screen.getByText('Go to Settings')).toBeDefined()
    })

    it('renders action commands', () => {
      renderCommandPalette()

      expect(screen.getByText('Refresh System Status')).toBeDefined()
      expect(screen.getByText('Reload MCP Servers')).toBeDefined()
      expect(screen.getByText('New Terminal')).toBeDefined()
    })

    it('renders command descriptions', () => {
      renderCommandPalette()

      expect(screen.getByText('View system status and metrics')).toBeDefined()
      expect(screen.getByText('Browse Claude projects')).toBeDefined()
      expect(screen.getByText('Manage MCP server connections')).toBeDefined()
    })

    it('renders keyboard shortcuts', () => {
      renderCommandPalette()

      expect(screen.getByText('G D')).toBeDefined() // Go to Dashboard
      expect(screen.getByText('G P')).toBeDefined() // Go to Projects
      expect(screen.getByText('G M')).toBeDefined() // Go to MCP
    })

    it('highlights first command by default', () => {
      renderCommandPalette()

      const firstCommand = screen.getByText('Go to Dashboard').closest('button')
      expect(firstCommand?.className).toContain('bg-accent-purple')
    })
  })

  // =========================================================================
  // SEARCH / FILTER
  // =========================================================================

  describe('Search / Filter', () => {
    it('filters commands based on search query', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput, { target: { value: 'dashboard' } })

      expect(screen.getByText('Go to Dashboard')).toBeDefined()
      expect(screen.queryByText('Go to Terminal')).toBeNull()
    })

    it('filters by command description', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput, { target: { value: 'metrics' } })

      expect(screen.getByText('Go to Dashboard')).toBeDefined()
    })

    it('filters by category name', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput, { target: { value: 'navigation' } })

      expect(screen.getByText('Go to Dashboard')).toBeDefined()
      expect(screen.getByText('Go to Projects')).toBeDefined()
    })

    it('shows "No commands found" when no matches', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } })

      expect(screen.getByText('No commands found')).toBeDefined()
    })

    it('is case insensitive', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput, { target: { value: 'DASHBOARD' } })

      expect(screen.getByText('Go to Dashboard')).toBeDefined()
    })

    it('resets selection index when results change', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Navigate down
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' })
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' })

      // Change search - should reset to first item
      fireEvent.change(searchInput, { target: { value: 'memory' } })

      const firstResult = screen.getByText('Go to Memory Browser').closest('button')
      expect(firstResult?.className).toContain('bg-accent-purple')
    })

    it('clears query when reopened', () => {
      const { rerender } = renderCommandPalette({ isOpen: false })

      rerender(<CommandPalette {...defaultProps} isOpen={true} />)

      const searchInput = screen.getByPlaceholderText('Search commands...')
      expect((searchInput as HTMLInputElement).value).toBe('')
    })
  })

  // =========================================================================
  // KEYBOARD NAVIGATION
  // =========================================================================

  describe('Keyboard Navigation', () => {
    it('first item is selected by default and Enter executes it', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Without any navigation, first item should be selected
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      // First item is dashboard
      expect(defaultProps.onNavigate).toHaveBeenCalledWith('dashboard')
    })

    it('ArrowDown key is handled without error', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Should not throw error
      expect(() => {
        fireEvent.keyDown(searchInput, { key: 'ArrowDown' })
      }).not.toThrow()
    })

    it('ArrowUp key is handled without error', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Should not throw error
      expect(() => {
        fireEvent.keyDown(searchInput, { key: 'ArrowUp' })
      }).not.toThrow()
    })

    it('does not go below last item', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Filter to few results
      fireEvent.change(searchInput, { target: { value: 'dashboard' } })

      // Try to go down many times
      for (let i = 0; i < 10; i++) {
        fireEvent.keyDown(searchInput, { key: 'ArrowDown' })
      }

      // Should still have highlighted command
      const command = screen.getByText('Go to Dashboard').closest('button')
      expect(command?.className).toContain('bg-accent-purple')
    })

    it('does not go above first item', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Try to go up from first position
      fireEvent.keyDown(searchInput, { key: 'ArrowUp' })

      // First command should still be highlighted
      const firstCommand = screen.getByText('Go to Dashboard').closest('button')
      expect(firstCommand?.className).toContain('bg-accent-purple')
    })

    it('executes command on Enter', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.keyDown(searchInput, { key: 'Enter' })

      expect(defaultProps.onNavigate).toHaveBeenCalledWith('dashboard')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('closes on Escape', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.keyDown(searchInput, { key: 'Escape' })

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('ignores other keys', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      fireEvent.keyDown(searchInput, { key: 'Tab' })

      // Should not close or navigate
      expect(defaultProps.onClose).not.toHaveBeenCalled()
      expect(defaultProps.onNavigate).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // COMMAND EXECUTION
  // =========================================================================

  describe('Command Execution', () => {
    it('executes navigation command on click', () => {
      renderCommandPalette()

      fireEvent.click(screen.getByText('Go to Dashboard'))

      expect(defaultProps.onNavigate).toHaveBeenCalledWith('dashboard')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('executes MCP reload action', async () => {
      renderCommandPalette()

      fireEvent.click(screen.getByText('Reload MCP Servers'))

      await waitFor(() => {
        expect(mockMcpReloadMutate).toHaveBeenCalled()
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('executes system refresh action', async () => {
      renderCommandPalette()

      fireEvent.click(screen.getByText('Refresh System Status'))

      await waitFor(() => {
        expect(mockSystemStatusFetch).toHaveBeenCalled()
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('executes new terminal action and navigates', async () => {
      renderCommandPalette()

      fireEvent.click(screen.getByText('New Terminal'))

      await waitFor(() => {
        expect(mockTerminalCreateMutate).toHaveBeenCalled()
        expect(defaultProps.onNavigate).toHaveBeenCalledWith('terminal')
      })
    })

    it('navigates to different views correctly', () => {
      // Use keyboard navigation to test different views
      // since there may be duplicates with getByText due to cmd + description
      const { rerender: _rerender, unmount } = renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Filter to projects and execute
      fireEvent.change(searchInput, { target: { value: 'projects' } })
      fireEvent.keyDown(searchInput, { key: 'Enter' })
      expect(defaultProps.onNavigate).toHaveBeenCalledWith('projects')

      // Reset and test MCP
      vi.clearAllMocks()
      unmount()
      const { unmount: unmount2 } = renderCommandPalette()

      const searchInput2 = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput2, { target: { value: 'mcp servers' } })
      fireEvent.keyDown(searchInput2, { key: 'Enter' })
      expect(defaultProps.onNavigate).toHaveBeenCalledWith('mcp')

      // Reset and test Memory
      vi.clearAllMocks()
      unmount2()
      renderCommandPalette()

      const searchInput3 = screen.getByPlaceholderText('Search commands...')
      fireEvent.change(searchInput3, { target: { value: 'memory browser' } })
      fireEvent.keyDown(searchInput3, { key: 'Enter' })
      expect(defaultProps.onNavigate).toHaveBeenCalledWith('memory')
    })
  })

  // =========================================================================
  // BACKDROP / CLOSE BEHAVIOR
  // =========================================================================

  describe('Backdrop / Close Behavior', () => {
    it('closes when backdrop is clicked', () => {
      renderCommandPalette()

      const backdrop = document.querySelector('.bg-black\\/50')
      if (backdrop) {
        fireEvent.click(backdrop)
      }

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('focuses input when opened', async () => {
      const { rerender } = renderCommandPalette({ isOpen: false })

      vi.useFakeTimers()

      rerender(<CommandPalette {...defaultProps} isOpen={true} />)

      await act(async () => {
        vi.advanceTimersByTime(10)
      })

      vi.useRealTimers()

      const searchInput = screen.getByPlaceholderText('Search commands...')
      expect(document.activeElement).toBe(searchInput)
    })
  })

  // =========================================================================
  // CATEGORY COLORS
  // =========================================================================

  describe('Category Colors', () => {
    it('applies correct color for navigation category', () => {
      renderCommandPalette()

      // Dashboard is navigation category - the wrapper span should have blue color
      const dashboardIcon = screen.getByTestId('icon-dashboard')
      const iconWrapper = dashboardIcon.parentElement
      expect(iconWrapper?.className).toContain('text-accent-blue')
    })

    it('applies correct color for action category', () => {
      renderCommandPalette()

      // Refresh is action category - the wrapper span should have yellow color
      const refreshIcon = screen.getByTestId('icon-refresh')
      const iconWrapper = refreshIcon.parentElement
      expect(iconWrapper?.className).toContain('text-accent-yellow')
    })
  })

  // =========================================================================
  // SCROLL INTO VIEW
  // =========================================================================

  describe('Scroll Into View', () => {
    it('scrolls selected item into view', () => {
      renderCommandPalette()

      const searchInput = screen.getByPlaceholderText('Search commands...')

      // Mock scrollIntoView
      const mockScrollIntoView = vi.fn()
      Element.prototype.scrollIntoView = mockScrollIntoView

      // Navigate down to trigger scroll
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' })
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' })
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' })

      expect(mockScrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    })
  })
})

// ===========================================================================
// useCommandPalette HOOK TESTS
// ===========================================================================

describe('useCommandPalette hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with isOpen false', () => {
    const { result } = renderHook(() => useCommandPalette())

    expect(result.current.isOpen).toBe(false)
  })

  it('opens palette with open()', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      result.current.open()
    })

    expect(result.current.isOpen).toBe(true)
  })

  it('closes palette with close()', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      result.current.open()
    })

    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.close()
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('toggles palette with toggle()', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      result.current.toggle()
    })

    expect(result.current.isOpen).toBe(true)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('toggles on Ctrl+K', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })

    expect(result.current.isOpen).toBe(true)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('toggles on Meta+K (Mac)', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
    })

    expect(result.current.isOpen).toBe(true)
  })

  it('ignores K without modifier', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('cleans up event listener on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useCommandPalette())

    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))

    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })
})
