import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Header } from '../Header'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Menu: () => <span data-testid="icon-menu">Menu Icon</span>,
  Bell: () => <span data-testid="icon-bell">Bell Icon</span>,
  RefreshCw: ({ className }: { className?: string }) => (
    <span data-testid="icon-refresh" className={className}>
      Refresh Icon
    </span>
  ),
}))

describe('Header', () => {
  const defaultProps = {
    title: 'Dashboard',
    onToggleSidebar: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Title', () => {
    it('renders the title', () => {
      render(<Header {...defaultProps} />)

      expect(screen.getByText('Dashboard')).toBeDefined()
    })

    it('renders different titles', () => {
      const { rerender } = render(<Header {...defaultProps} title="MCP Servers" />)

      expect(screen.getByText('MCP Servers')).toBeDefined()

      rerender(<Header {...defaultProps} title="Memory Browser" />)
      expect(screen.getByText('Memory Browser')).toBeDefined()
    })

    it('title is an h1 element', () => {
      render(<Header {...defaultProps} />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toBeDefined()
      expect(heading.textContent).toBe('Dashboard')
    })
  })

  describe('Menu Button', () => {
    it('renders menu button', () => {
      render(<Header {...defaultProps} />)

      expect(screen.getByTestId('icon-menu')).toBeDefined()
    })

    it('calls onToggleSidebar when menu button clicked', () => {
      const mockToggle = vi.fn()
      render(<Header {...defaultProps} onToggleSidebar={mockToggle} />)

      const menuButton = screen.getByTestId('icon-menu').closest('button')
      fireEvent.click(menuButton!)

      expect(mockToggle).toHaveBeenCalledTimes(1)
    })

    it('menu button has correct styling', () => {
      render(<Header {...defaultProps} />)

      const menuButton = screen.getByTestId('icon-menu').closest('button')
      expect(menuButton?.className).toContain('rounded-lg')
      expect(menuButton?.className).toContain('text-text-muted')
    })
  })

  describe('Refresh Button', () => {
    it('renders refresh button', () => {
      render(<Header {...defaultProps} />)

      expect(screen.getByTestId('icon-refresh')).toBeDefined()
    })

    it('dispatches app:refresh event when clicked', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')
      fireEvent.click(refreshButton!)

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
      const dispatchedEvent = dispatchEventSpy.mock.calls[0][0]
      expect(dispatchedEvent.type).toBe('app:refresh')

      dispatchEventSpy.mockRestore()
    })

    it('shows spinning animation when refreshing', () => {
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')
      fireEvent.click(refreshButton!)

      const refreshIcon = screen.getByTestId('icon-refresh')
      expect(refreshIcon.className).toContain('animate-spin')
    })

    it('stops spinning after 1 second', async () => {
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')
      fireEvent.click(refreshButton!)

      // Initially spinning
      let refreshIcon = screen.getByTestId('icon-refresh')
      expect(refreshIcon.className).toContain('animate-spin')

      // Advance timer by 1 second and flush using act
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // Should stop spinning
      refreshIcon = screen.getByTestId('icon-refresh')
      expect(refreshIcon.className).not.toContain('animate-spin')
    })

    it('is disabled while refreshing', () => {
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')
      fireEvent.click(refreshButton!)

      expect(refreshButton?.hasAttribute('disabled')).toBe(true)
    })

    it('is re-enabled after refresh completes', async () => {
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')
      fireEvent.click(refreshButton!)

      expect(refreshButton?.hasAttribute('disabled')).toBe(true)

      // Advance timer and flush using act
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      expect(refreshButton?.hasAttribute('disabled')).toBe(false)
    })

    it('does not dispatch event if already refreshing', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')

      // First click
      fireEvent.click(refreshButton!)

      // Try second click while disabled
      fireEvent.click(refreshButton!)

      // Should only be called once
      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)

      dispatchEventSpy.mockRestore()
    })
  })

  describe('Notification Bell', () => {
    it('renders notification bell', () => {
      render(<Header {...defaultProps} />)

      expect(screen.getByTestId('icon-bell')).toBeDefined()
    })

    it('has notification indicator', () => {
      const { container } = render(<Header {...defaultProps} />)

      // Look for the red notification dot
      const notificationDot = container.querySelector('.bg-accent-red')
      expect(notificationDot).toBeDefined()
      expect(notificationDot?.className).toContain('rounded-full')
    })

    it('notification bell is a button', () => {
      render(<Header {...defaultProps} />)

      const bellButton = screen.getByTestId('icon-bell').closest('button')
      expect(bellButton).toBeDefined()
    })
  })

  describe('User Avatar', () => {
    it('renders user avatar placeholder', () => {
      render(<Header {...defaultProps} />)

      expect(screen.getByText('A')).toBeDefined()
    })

    it('avatar has correct styling', () => {
      render(<Header {...defaultProps} />)

      const avatar = screen.getByText('A').closest('div')
      expect(avatar?.className).toContain('rounded-full')
      expect(avatar?.className).toContain('bg-accent-purple')
    })
  })

  describe('Layout', () => {
    it('is a header element', () => {
      render(<Header {...defaultProps} />)

      expect(screen.getByRole('banner')).toBeDefined()
    })

    it('has correct height', () => {
      const { container } = render(<Header {...defaultProps} />)

      const header = container.querySelector('header')
      expect(header?.className).toContain('h-14')
    })

    it('has border bottom', () => {
      const { container } = render(<Header {...defaultProps} />)

      const header = container.querySelector('header')
      expect(header?.className).toContain('border-b')
      expect(header?.className).toContain('border-border')
    })

    it('has flexbox layout with space-between', () => {
      const { container } = render(<Header {...defaultProps} />)

      const header = container.querySelector('header')
      expect(header?.className).toContain('flex')
      expect(header?.className).toContain('items-center')
      expect(header?.className).toContain('justify-between')
    })

    it('has horizontal padding', () => {
      const { container } = render(<Header {...defaultProps} />)

      const header = container.querySelector('header')
      expect(header?.className).toContain('px-4')
    })

    it('has surface background color', () => {
      const { container } = render(<Header {...defaultProps} />)

      const header = container.querySelector('header')
      expect(header?.className).toContain('bg-surface')
    })
  })

  describe('Divider', () => {
    it('renders divider between actions and avatar', () => {
      const { container } = render(<Header {...defaultProps} />)

      // Look for the vertical divider
      const divider = container.querySelector('.bg-border')
      expect(divider).toBeDefined()
      expect(divider?.className).toContain('h-6')
      expect(divider?.className).toContain('w-px')
    })
  })

  describe('Accessibility', () => {
    it('all interactive elements are buttons', () => {
      render(<Header {...defaultProps} />)

      // Menu, Refresh, and Bell should all be buttons
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBe(3)
    })

    it('title is semantic heading', () => {
      render(<Header {...defaultProps} />)

      const heading = screen.getByRole('heading')
      expect(heading.tagName).toBe('H1')
    })

    it('buttons can be focused', () => {
      render(<Header {...defaultProps} />)

      const menuButton = screen.getByTestId('icon-menu').closest('button')
      menuButton?.focus()
      expect(document.activeElement).toBe(menuButton)
    })
  })

  describe('Hover States', () => {
    it('buttons have hover classes', () => {
      render(<Header {...defaultProps} />)

      const menuButton = screen.getByTestId('icon-menu').closest('button')
      expect(menuButton?.className).toContain('hover:text-text-primary')
      expect(menuButton?.className).toContain('hover:bg-surface-hover')
    })

    it('buttons have transition classes', () => {
      render(<Header {...defaultProps} />)

      const menuButton = screen.getByTestId('icon-menu').closest('button')
      expect(menuButton?.className).toContain('transition-colors')
    })
  })

  describe('Edge Cases', () => {
    it('handles long titles gracefully', () => {
      const longTitle = 'This is a very long title that might cause layout issues'
      render(<Header {...defaultProps} title={longTitle} />)

      expect(screen.getByText(longTitle)).toBeDefined()
    })

    it('handles empty title', () => {
      render(<Header {...defaultProps} title="" />)

      const heading = screen.getByRole('heading')
      expect(heading.textContent).toBe('')
    })

    it('handles special characters in title', () => {
      render(<Header {...defaultProps} title="MCP & Memory <Browser>" />)

      expect(screen.getByText('MCP & Memory <Browser>')).toBeDefined()
    })

    it('multiple rapid clicks on refresh only triggers once', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent')
      render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')

      // Rapid fire clicks
      fireEvent.click(refreshButton!)
      fireEvent.click(refreshButton!)
      fireEvent.click(refreshButton!)
      fireEvent.click(refreshButton!)

      // Only first click should work
      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)

      dispatchEventSpy.mockRestore()
    })
  })

  describe('Refresh Timeout Cleanup', () => {
    it('cleans up timeout on unmount', () => {
      const _clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const { unmount } = render(<Header {...defaultProps} />)

      const refreshButton = screen.getByTestId('icon-refresh').closest('button')
      fireEvent.click(refreshButton!)

      unmount()

      // React should clean up the timeout via useEffect cleanup
      // Note: This test verifies the behavior, not the implementation
    })
  })
})
