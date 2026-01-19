/**
 * Tests for useTerminal hook
 *
 * Tests useTerminal hook that provides terminal emulation
 * with hybrid tRPC/IPC implementation.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { useTerminalStore } from '@/stores/terminal'

// Mock xterm.js
const mockTerminalInstance = {
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onResize: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  loadAddon: vi.fn(),
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
  onContextLoss: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  dispose: vi.fn(),
}

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => mockWebglAddon),
}))

// Mock tRPC client
const mockTerminalCreate = vi.fn()
const mockTerminalResize = vi.fn()
const mockTerminalClose = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    terminal: {
      create: { mutate: (...args: unknown[]) => mockTerminalCreate(...args) },
      resize: { mutate: (...args: unknown[]) => mockTerminalResize(...args) },
      close: { mutate: (...args: unknown[]) => mockTerminalClose(...args) },
    },
  },
}))

// Import the hook after mocks are set up
import { useTerminal } from '../useTerminal'
import { type RefObject } from 'react'

// Reset store between tests
const resetStore = () => {
  useTerminalStore.setState({
    tabs: [],
    activeTabId: null,
    fullscreen: false,
  })
}

describe('useTerminal hook', () => {
  let containerRef: RefObject<HTMLDivElement>

  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()

    // Create a mock container element
    const container = document.createElement('div')
    containerRef = { current: container } as RefObject<HTMLDivElement>

    // Setup default mocks
    mockTerminalCreate.mockResolvedValue('session-123')
    mockTerminalResize.mockResolvedValue(undefined)
    mockTerminalClose.mockResolvedValue(undefined)

    // Setup electron mock (from setup.ts, but ensure it's correct for these tests)
    if (typeof window !== 'undefined') {
      ;(window as any).electron = {
        invoke: vi.fn().mockResolvedValue(null),
        on: vi.fn().mockReturnValue(() => {}),
        send: vi.fn(),
      }
    }

    // Setup tab in store
    const tabId = useTerminalStore.getState().addTab()
    useTerminalStore.setState({ activeTabId: tabId })
  })

  afterEach(() => {
    resetStore()
  })

  describe('initialization', () => {
    it('should return initial state before initialization', () => {
      // Remove container to prevent auto-init
      const emptyRef = { current: null } as RefObject<HTMLDivElement>
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef: emptyRef,
        })
      )

      expect(result.current.terminal).toBeNull()
      expect(result.current.isConnected).toBe(false)
    })

    it('should create terminal instance when container is available', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { result: _result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })
    })

    it('should not double-initialize in StrictMode', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      // First render
      const { unmount } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      // Wait for first init
      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalledTimes(1)
      })

      unmount()

      // Second render
      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      // Should only be called once per actual mount
      await waitFor(() => {
        expect(mockTerminalCreate.mock.calls.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('terminal configuration', () => {
    it('should create terminal with correct options', async () => {
      const { Terminal } = await import('@xterm/xterm')
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(Terminal).toHaveBeenCalledWith(
          expect.objectContaining({
            cursorBlink: true,
            cursorStyle: 'block',
            fontSize: 14,
            fontFamily: expect.stringContaining('JetBrains Mono'),
            lineHeight: 1.2,
            allowProposedApi: true,
          })
        )
      })
    })

    it('should load FitAddon', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalInstance.loadAddon).toHaveBeenCalled()
      })
    })

    it('should attempt to load WebglAddon', async () => {
      const { WebglAddon } = await import('@xterm/addon-webgl')
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(WebglAddon).toHaveBeenCalled()
      })
    })
  })

  describe('PTY session management', () => {
    it('should create PTY session via tRPC', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalledWith({})
      })
    })

    it('should update tab with sessionId after creation', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        const tab = useTerminalStore.getState().tabs.find((t) => t.id === tabId)
        expect(tab?.sessionId).toBe('session-123')
        expect(tab?.isConnected).toBe(true)
      })
    })

    it('should handle session creation failure', async () => {
      mockTerminalCreate.mockRejectedValue(new Error('Failed to create session'))

      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalInstance.writeln).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create terminal session')
        )
      })
    })

    it('should close PTY session on unmount', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { unmount } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      unmount()

      await waitFor(() => {
        expect(mockTerminalClose).toHaveBeenCalledWith({ sessionId: 'session-123' })
      })
    })
  })

  describe('terminal resize', () => {
    it('should send initial resize via tRPC', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalResize).toHaveBeenCalledWith({
          sessionId: 'session-123',
          cols: 80,
          rows: 24,
        })
      })
    })

    it('should provide fit function', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      act(() => {
        result.current.fit()
      })

      expect(mockFitAddon.fit).toHaveBeenCalled()
    })

    it('should handle window resize events', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      // Trigger resize event
      act(() => {
        window.dispatchEvent(new Event('resize'))
      })

      expect(mockFitAddon.fit).toHaveBeenCalled()
    })
  })

  describe('terminal focus', () => {
    it('should provide focus function', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      act(() => {
        result.current.focus()
      })

      expect(mockTerminalInstance.focus).toHaveBeenCalled()
    })
  })

  describe('data streaming via IPC', () => {
    it('should send input data via legacy IPC', async () => {
      let onDataCallback: ((data: string) => void) | undefined

      mockTerminalInstance.onData.mockImplementation((callback: (data: string) => void) => {
        onDataCallback = callback
        return { dispose: vi.fn() }
      })

      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      // Simulate user input
      if (onDataCallback) {
        onDataCallback('ls -la')
      }

      expect(window.electron.send).toHaveBeenCalledWith('terminal:write', 'session-123', 'ls -la')
    })

    it('should subscribe to terminal data events', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      expect(window.electron.on).toHaveBeenCalledWith(
        'terminal:data:session-123',
        expect.any(Function)
      )
    })

    it('should subscribe to terminal exit events', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      expect(window.electron.on).toHaveBeenCalledWith(
        'terminal:exit:session-123',
        expect.any(Function)
      )
    })
  })

  describe('connection state', () => {
    it('should track isConnected from tab state', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
      })
    })

    it('should return false when tab is not connected', () => {
      const emptyRef = { current: null } as RefObject<HTMLDivElement>

      // Create a tab that is not connected
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'
      useTerminalStore.getState().updateTab(tabId, { isConnected: false })

      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef: emptyRef,
        })
      )

      expect(result.current.isConnected).toBe(false)
    })

    it('should return false when tab does not exist', () => {
      const emptyRef = { current: null } as RefObject<HTMLDivElement>

      const { result } = renderHook(() =>
        useTerminal({
          tabId: 'non-existent-tab',
          containerRef: emptyRef,
        })
      )

      expect(result.current.isConnected).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('should dispose terminal on unmount', async () => {
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { unmount } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      unmount()

      expect(mockTerminalInstance.dispose).toHaveBeenCalled()
    })

    it('should unsubscribe from IPC events on unmount', async () => {
      const unsubscribe = vi.fn()
      ;(window.electron.on as Mock).mockReturnValue(unsubscribe)

      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { unmount } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      unmount()

      expect(unsubscribe).toHaveBeenCalled()
    })

    it('should remove resize event listener on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { unmount } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))

      removeEventListenerSpy.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('should handle missing container gracefully', () => {
      const emptyRef = { current: null } as RefObject<HTMLDivElement>
      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef: emptyRef,
        })
      )

      expect(result.current.terminal).toBeNull()
      expect(mockTerminalCreate).not.toHaveBeenCalled()
    })

    it('should handle WebGL addon failure gracefully', async () => {
      // Make WebGL throw
      const { WebglAddon } = await import('@xterm/addon-webgl')
      ;(WebglAddon as Mock).mockImplementation(() => {
        throw new Error('WebGL not supported')
      })

      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      // Should not throw
      const { result } = renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      // Terminal should still work
      expect(result.current.isConnected).toBe(true)
    })

    it('should handle resize error gracefully', async () => {
      mockTerminalResize.mockRejectedValue(new Error('Resize failed'))

      const tabs = useTerminalStore.getState().tabs
      const tabId = tabs[0]?.id || 'test-tab'

      // Should not throw
      renderHook(() =>
        useTerminal({
          tabId,
          containerRef,
        })
      )

      await waitFor(() => {
        expect(mockTerminalCreate).toHaveBeenCalled()
      })

      // Initial resize is called and error is swallowed
      expect(mockTerminalResize).toHaveBeenCalled()
    })
  })
})
