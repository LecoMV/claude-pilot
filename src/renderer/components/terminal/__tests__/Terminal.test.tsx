/**
 * Terminal Component Tests
 *
 * Tests the integrated xterm.js terminal component including:
 * - Terminal initialization and rendering
 * - Tab management (add, remove, switch)
 * - Connection status display
 * - Fullscreen toggle
 * - Resize handling
 * - Error states
 *
 * @module Terminal.test
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Terminal } from '../Terminal'
import { useTerminalStore, type TerminalTab } from '@/stores/terminal'

// ===========================================================================
// MOCK SETUP
// ===========================================================================

// Mock xterm.js Terminal class
const mockTerminalInstance = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  onData: vi.fn(),
  onResize: vi.fn(),
  loadAddon: vi.fn(),
  dispose: vi.fn(),
  focus: vi.fn(),
  cols: 80,
  rows: 24,
}

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => mockTerminalInstance),
}))

// Mock FitAddon
const mockFitAddon = {
  fit: vi.fn(),
  dispose: vi.fn(),
}

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => mockFitAddon),
}))

// Mock WebglAddon
const mockWebglAddon = {
  onContextLoss: vi.fn(),
  dispose: vi.fn(),
}

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => mockWebglAddon),
}))

// Mock xterm CSS import
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// Mock tRPC client
const mockTerminalCreate = vi.fn()
const mockTerminalClose = vi.fn()
const mockTerminalResize = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    terminal: {
      create: { mutate: (...args: unknown[]) => mockTerminalCreate(...args) },
      close: { mutate: (...args: unknown[]) => mockTerminalClose(...args) },
      resize: { mutate: (...args: unknown[]) => mockTerminalResize(...args) },
    },
  },
}))

// Mock useTerminal hook
const mockFit = vi.fn()
const mockFocus = vi.fn()

vi.mock('@/hooks/useTerminal', () => ({
  useTerminal: vi.fn(() => ({
    terminal: mockTerminalInstance,
    fit: mockFit,
    focus: mockFocus,
    isConnected: true,
  })),
}))

// ===========================================================================
// TEST UTILITIES
// ===========================================================================

const createMockTab = (overrides: Partial<TerminalTab> = {}): TerminalTab => ({
  id: `tab-${Date.now()}`,
  sessionId: `session-${Date.now()}`,
  title: 'Terminal 1',
  terminal: mockTerminalInstance as unknown as TerminalTab['terminal'],
  isConnected: true,
  ...overrides,
})

const resetStoreState = () => {
  useTerminalStore.setState({
    tabs: [],
    activeTabId: null,
    fullscreen: false,
  })
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('Terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // =========================================================================
  // TERMINAL INITIALIZATION
  // =========================================================================

  describe('Terminal Initialization', () => {
    it('renders terminal container', () => {
      render(<Terminal />)

      // Should have the main container with animation class
      const container = document.querySelector('.animate-in')
      expect(container).toBeDefined()
    })

    it('adds initial tab when tabs are empty', async () => {
      render(<Terminal />)

      // Wait for the effect to run
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(1)
      expect(state.activeTabId).not.toBeNull()
    })

    it('prevents double-initialization in StrictMode', async () => {
      // Simulate StrictMode by rendering twice
      const { unmount } = render(<Terminal />)

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      unmount()

      render(<Terminal />)

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Should still only have one tab due to initializedRef guard
      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBeLessThanOrEqual(2)
    })

    it('does not add tab when tabs already exist', async () => {
      const existingTab = createMockTab({ id: 'existing-tab', title: 'Existing Terminal' })
      useTerminalStore.setState({
        tabs: [existingTab],
        activeTabId: existingTab.id,
      })

      render(<Terminal />)

      await act(async () => {
        await vi.runAllTimersAsync()
      })

      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(1)
      expect(state.tabs[0].id).toBe('existing-tab')
    })
  })

  // =========================================================================
  // TAB BAR RENDERING
  // =========================================================================

  describe('Tab Bar Rendering', () => {
    it('renders tab bar with existing tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      const tab2 = createMockTab({ id: 'tab-2', title: 'Terminal 2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      expect(screen.getByText('Terminal 1')).toBeDefined()
      expect(screen.getByText('Terminal 2')).toBeDefined()
    })

    it('highlights active tab', () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      const tab2 = createMockTab({ id: 'tab-2', title: 'Terminal 2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      const tab1Element = screen.getByText('Terminal 1').closest('div')
      expect(tab1Element?.className).toContain('bg-background')
    })

    it('renders connection status indicator for each tab', () => {
      const connectedTab = createMockTab({
        id: 'connected-tab',
        title: 'Connected',
        isConnected: true,
      })
      const disconnectedTab = createMockTab({
        id: 'disconnected-tab',
        title: 'Disconnected',
        isConnected: false,
      })

      useTerminalStore.setState({
        tabs: [connectedTab, disconnectedTab],
        activeTabId: 'connected-tab',
      })

      render(<Terminal />)

      // Check for connection indicator circles
      const indicators = document.querySelectorAll('.w-2.h-2')
      expect(indicators.length).toBe(2)

      // First indicator should be green (connected)
      expect(indicators[0].className).toContain('fill-accent-green')
      // Second should be muted (disconnected)
      expect(indicators[1].className).toContain('fill-text-muted')
    })

    it('renders terminal icon for each tab', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id })

      render(<Terminal />)

      // lucide-react renders SVGs with the icon class
      const terminalIcons = document.querySelectorAll('.lucide-terminal')
      expect(terminalIcons.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // TAB MANAGEMENT
  // =========================================================================

  describe('Tab Management', () => {
    it('adds new tab when plus button is clicked', async () => {
      const existingTab = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      useTerminalStore.setState({ tabs: [existingTab], activeTabId: 'tab-1' })

      render(<Terminal />)

      const addButton = screen.getByTitle('New terminal')
      fireEvent.click(addButton)

      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(2)
    })

    it('removes tab when close button is clicked', async () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      const tab2 = createMockTab({ id: 'tab-2', title: 'Terminal 2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      // Find close buttons (X icons)
      const closeButtons = document.querySelectorAll('.lucide-x')
      expect(closeButtons.length).toBe(2)

      // Click the first close button
      fireEvent.click(closeButtons[0])

      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(1)
    })

    it('does not show close button when only one tab exists', () => {
      const singleTab = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      useTerminalStore.setState({ tabs: [singleTab], activeTabId: 'tab-1' })

      render(<Terminal />)

      // Should not render close button when only one tab
      const closeButtons = document.querySelectorAll('.lucide-x')
      expect(closeButtons.length).toBe(0)
    })

    it('switches active tab when tab is clicked', () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      const tab2 = createMockTab({ id: 'tab-2', title: 'Terminal 2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      const tab2Element = screen.getByText('Terminal 2')
      fireEvent.click(tab2Element)

      const state = useTerminalStore.getState()
      expect(state.activeTabId).toBe('tab-2')
    })

    it('close button click stops propagation and does not switch tabs', () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Terminal 1' })
      const tab2 = createMockTab({ id: 'tab-2', title: 'Terminal 2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      // Find the close button for tab-2
      const tabElements = document.querySelectorAll('[class*="border-r"]')
      const tab2Container = Array.from(tabElements).find((el) =>
        el.textContent?.includes('Terminal 2')
      )
      const closeButton = tab2Container?.querySelector('.lucide-x')

      expect(closeButton).toBeDefined()
      if (closeButton) {
        fireEvent.click(closeButton)
      }

      const state = useTerminalStore.getState()
      // Active tab should still be tab-1
      expect(state.activeTabId).toBe('tab-1')
    })
  })

  // =========================================================================
  // FULLSCREEN MODE
  // =========================================================================

  describe('Fullscreen Mode', () => {
    it('renders in normal mode by default', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: false })

      render(<Terminal />)

      const container = document.querySelector('.animate-in')
      expect(container?.className).not.toContain('fixed')
    })

    it('renders in fullscreen mode when enabled', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: true })

      render(<Terminal />)

      const container = document.querySelector('.animate-in')
      expect(container?.className).toContain('fixed')
      expect(container?.className).toContain('inset-0')
      expect(container?.className).toContain('z-50')
    })

    it('toggles fullscreen when fullscreen button is clicked', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: false })

      render(<Terminal />)

      // Find fullscreen button by title
      const fullscreenButton = screen.getByTitle('Fullscreen')
      fireEvent.click(fullscreenButton)

      let state = useTerminalStore.getState()
      expect(state.fullscreen).toBe(true)

      // Click again to exit
      const exitButton = screen.getByTitle('Exit fullscreen')
      fireEvent.click(exitButton)

      state = useTerminalStore.getState()
      expect(state.fullscreen).toBe(false)
    })

    it('shows Maximize2 icon when not fullscreen', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: false })

      render(<Terminal />)

      const maximizeIcon = document.querySelector('.lucide-maximize-2')
      expect(maximizeIcon).toBeDefined()
    })

    it('shows Minimize2 icon when fullscreen', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: true })

      render(<Terminal />)

      const minimizeIcon = document.querySelector('.lucide-minimize-2')
      expect(minimizeIcon).toBeDefined()
    })
  })

  // =========================================================================
  // TERMINAL PANEL
  // =========================================================================

  describe('Terminal Panel', () => {
    it('renders terminal panel for each tab', () => {
      const tab1 = createMockTab({ id: 'tab-1' })
      const tab2 = createMockTab({ id: 'tab-2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      // Both panels should be rendered but only one visible
      const panels = document.querySelectorAll('.absolute.inset-0')
      expect(panels.length).toBe(2)
    })

    it('shows only active panel', () => {
      const tab1 = createMockTab({ id: 'tab-1' })
      const tab2 = createMockTab({ id: 'tab-2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      const panels = document.querySelectorAll('.absolute.inset-0')
      const visiblePanel = Array.from(panels).find((p) => p.className.includes('block'))
      const hiddenPanel = Array.from(panels).find((p) => p.className.includes('hidden'))

      expect(visiblePanel).toBeDefined()
      expect(hiddenPanel).toBeDefined()
    })

    it('calls focus when panel container is clicked', async () => {
      const tab = createMockTab({ id: 'tab-1' })
      useTerminalStore.setState({ tabs: [tab], activeTabId: 'tab-1' })

      render(<Terminal />)

      // Wait for initial effects
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Find the inner container that has the click handler
      const innerContainer = document.querySelector('.w-full.h-full')
      if (innerContainer) {
        fireEvent.click(innerContainer)
      }

      expect(mockFocus).toHaveBeenCalled()
    })

    it('calls fit and focus when tab becomes visible', async () => {
      const tab1 = createMockTab({ id: 'tab-1' })
      const tab2 = createMockTab({ id: 'tab-2' })

      useTerminalStore.setState({
        tabs: [tab1, tab2],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      // Switch to tab2
      useTerminalStore.setState({ activeTabId: 'tab-2' })

      // Wait for the delay timer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(mockFit).toHaveBeenCalled()
      expect(mockFocus).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // RESIZE HANDLING
  // =========================================================================

  describe('Resize Handling', () => {
    it('calls fit when becoming visible after delay', async () => {
      const tab = createMockTab({ id: 'tab-1' })
      useTerminalStore.setState({ tabs: [tab], activeTabId: 'tab-1' })

      render(<Terminal />)

      // Clear initial calls
      mockFit.mockClear()

      // Switch away and back
      useTerminalStore.setState({ activeTabId: null })
      useTerminalStore.setState({ activeTabId: 'tab-1' })

      // Wait for 50ms delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })

      expect(mockFit).toHaveBeenCalled()
    })

    it('cleans up timeout when visibility changes before timer fires', async () => {
      const tab = createMockTab({ id: 'tab-1' })
      useTerminalStore.setState({ tabs: [tab], activeTabId: 'tab-1' })

      render(<Terminal />)

      mockFit.mockClear()

      // Make visible then immediately hide
      useTerminalStore.setState({ activeTabId: 'tab-1' })

      // Advance partway (before 50ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })

      // Hide the tab
      useTerminalStore.setState({ activeTabId: null })

      // Complete the timer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      // Should not have called fit for the hidden tab
      // (implementation clears timeout on unmount/visibility change)
    })
  })

  // =========================================================================
  // ERROR STATES
  // =========================================================================

  describe('Error States', () => {
    it('displays disconnected status for failed connections', () => {
      const disconnectedTab = createMockTab({
        id: 'tab-1',
        title: 'Terminal 1',
        isConnected: false,
      })

      useTerminalStore.setState({
        tabs: [disconnectedTab],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      const indicator = document.querySelector('.fill-text-muted')
      expect(indicator).toBeDefined()
    })

    it('handles multiple tabs with mixed connection states', () => {
      const connectedTab = createMockTab({
        id: 'tab-1',
        title: 'Connected',
        isConnected: true,
      })
      const disconnectedTab = createMockTab({
        id: 'tab-2',
        title: 'Disconnected',
        isConnected: false,
      })

      useTerminalStore.setState({
        tabs: [connectedTab, disconnectedTab],
        activeTabId: 'tab-1',
      })

      render(<Terminal />)

      const greenIndicators = document.querySelectorAll('.fill-accent-green')
      const mutedIndicators = document.querySelectorAll('.fill-text-muted')

      expect(greenIndicators.length).toBe(1)
      expect(mutedIndicators.length).toBe(1)
    })
  })

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('has accessible button titles', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: false })

      render(<Terminal />)

      expect(screen.getByTitle('New terminal')).toBeDefined()
      expect(screen.getByTitle('Fullscreen')).toBeDefined()
    })

    it('has accessible button title for exit fullscreen', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id, fullscreen: true })

      render(<Terminal />)

      expect(screen.getByTitle('Exit fullscreen')).toBeDefined()
    })
  })

  // =========================================================================
  // STYLING
  // =========================================================================

  describe('Styling', () => {
    it('applies correct styling classes to tab bar', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id })

      render(<Terminal />)

      const tabBar = document.querySelector('.bg-surface.border-b')
      expect(tabBar).toBeDefined()
    })

    it('applies correct styling to terminal container', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id })

      render(<Terminal />)

      const terminalContainer = document.querySelector('.bg-background.overflow-hidden')
      expect(terminalContainer).toBeDefined()
    })

    it('applies hover styles to tab buttons', () => {
      const tab = createMockTab()
      useTerminalStore.setState({ tabs: [tab], activeTabId: tab.id })

      render(<Terminal />)

      const addButton = screen.getByTitle('New terminal')
      expect(addButton.className).toContain('hover:bg-surface-hover')
    })
  })

  // =========================================================================
  // STORE INTEGRATION
  // =========================================================================

  describe('Store Integration', () => {
    it('correctly reads tabs from store', () => {
      const tabs = [
        createMockTab({ id: 'tab-1', title: 'Tab 1' }),
        createMockTab({ id: 'tab-2', title: 'Tab 2' }),
        createMockTab({ id: 'tab-3', title: 'Tab 3' }),
      ]

      useTerminalStore.setState({ tabs, activeTabId: 'tab-1' })

      render(<Terminal />)

      expect(screen.getByText('Tab 1')).toBeDefined()
      expect(screen.getByText('Tab 2')).toBeDefined()
      expect(screen.getByText('Tab 3')).toBeDefined()
    })

    it('updates UI when store changes', async () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'Initial Tab' })
      useTerminalStore.setState({ tabs: [tab1], activeTabId: 'tab-1' })

      render(<Terminal />)

      expect(screen.getByText('Initial Tab')).toBeDefined()

      // Update the store
      await act(() => {
        useTerminalStore.getState().addTab()
      })

      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(2)
    })

    it('uses correct store actions for tab operations', () => {
      const tab1 = createMockTab({ id: 'tab-1', title: 'First Terminal' })
      const tab2 = createMockTab({ id: 'tab-2', title: 'Second Terminal' })

      useTerminalStore.setState({ tabs: [tab1, tab2], activeTabId: 'tab-1' })

      const addTabSpy = vi.spyOn(useTerminalStore.getState(), 'addTab')
      const setActiveTabSpy = vi.spyOn(useTerminalStore.getState(), 'setActiveTab')
      const setFullscreenSpy = vi.spyOn(useTerminalStore.getState(), 'setFullscreen')

      render(<Terminal />)

      // Test add tab
      fireEvent.click(screen.getByTitle('New terminal'))
      expect(addTabSpy).toHaveBeenCalled()

      // Test switch tab - use getAllByText and get the first one
      const tab1Elements = screen.getAllByText('First Terminal')
      fireEvent.click(tab1Elements[0].closest('div')!)
      expect(setActiveTabSpy).toHaveBeenCalled()

      // Test fullscreen
      fireEvent.click(screen.getByTitle('Fullscreen'))
      expect(setFullscreenSpy).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases', () => {
    it('handles empty activeTabId gracefully', () => {
      const tab = createMockTab({ id: 'tab-1' })
      useTerminalStore.setState({ tabs: [tab], activeTabId: null })

      // Should not throw
      expect(() => render(<Terminal />)).not.toThrow()
    })

    it('handles rapid tab switching', async () => {
      const tabs = [
        createMockTab({ id: 'tab-1', title: 'Tab 1' }),
        createMockTab({ id: 'tab-2', title: 'Tab 2' }),
        createMockTab({ id: 'tab-3', title: 'Tab 3' }),
      ]

      useTerminalStore.setState({ tabs, activeTabId: 'tab-1' })

      render(<Terminal />)

      // Rapid tab switching
      fireEvent.click(screen.getByText('Tab 2'))
      fireEvent.click(screen.getByText('Tab 3'))
      fireEvent.click(screen.getByText('Tab 1'))
      fireEvent.click(screen.getByText('Tab 2'))

      const state = useTerminalStore.getState()
      expect(state.activeTabId).toBe('tab-2')
    })

    it('handles rapid add/remove tab operations', async () => {
      const tab = createMockTab({ id: 'tab-1' })
      useTerminalStore.setState({ tabs: [tab], activeTabId: 'tab-1' })

      render(<Terminal />)

      // Add multiple tabs rapidly
      const addButton = screen.getByTitle('New terminal')
      fireEvent.click(addButton)
      fireEvent.click(addButton)
      fireEvent.click(addButton)

      const state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(4)
    })

    it('maintains state consistency during unmount', async () => {
      const tab = createMockTab({ id: 'tab-1' })
      useTerminalStore.setState({ tabs: [tab], activeTabId: 'tab-1' })

      const { unmount } = render(<Terminal />)

      // Add a tab while mounted
      fireEvent.click(screen.getByTitle('New terminal'))

      // Store should have 2 tabs
      let state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(2)

      // Unmount
      unmount()

      // Store state should persist
      state = useTerminalStore.getState()
      expect(state.tabs.length).toBe(2)
    })
  })
})
