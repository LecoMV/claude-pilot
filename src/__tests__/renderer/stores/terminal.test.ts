import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useTerminalStore } from '@/stores/terminal'

describe('Terminal Store', () => {
  let dateNowCounter = 1000000000000

  beforeEach(() => {
    // Mock Date.now to return incrementing values for unique IDs
    vi.spyOn(Date, 'now').mockImplementation(() => dateNowCounter++)

    // Reset the store data only (not actions)
    useTerminalStore.setState({
      tabs: [],
      activeTabId: null,
      fullscreen: false,
    })

    // Reset other mocks
    vi.mocked(window.electron.send).mockClear()
    vi.mocked(window.electron.on).mockClear()
    vi.mocked(window.electron.invoke).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('addTab', () => {
    it('should add a new tab', () => {
      const id = useTerminalStore.getState().addTab()

      const state = useTerminalStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe(id)
      expect(state.tabs[0].title).toBe('Terminal 1')
      expect(state.tabs[0].sessionId).toBeNull()
      expect(state.tabs[0].terminal).toBeNull()
      expect(state.tabs[0].isConnected).toBe(false)
    })

    it('should set new tab as active', () => {
      const id = useTerminalStore.getState().addTab()
      expect(useTerminalStore.getState().activeTabId).toBe(id)
    })

    it('should increment tab numbers', () => {
      // Add tabs
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      expect(tabs).toHaveLength(3)
      expect(tabs[0].title).toBe('Terminal 1')
      expect(tabs[1].title).toBe('Terminal 2')
      expect(tabs[2].title).toBe('Terminal 3')
    })

    it('should return the new tab id', () => {
      const id = useTerminalStore.getState().addTab()
      expect(id).toMatch(/^tab-\d+$/)
    })
  })

  describe('removeTab', () => {
    it('should not remove when only one tab exists', () => {
      useTerminalStore.getState().addTab()

      useTerminalStore.getState().removeTab(useTerminalStore.getState().tabs[0].id)

      expect(useTerminalStore.getState().tabs).toHaveLength(1)
    })

    it('should remove tab when multiple exist', () => {
      useTerminalStore.getState().addTab()
      const secondId = useTerminalStore.getState().addTab()

      useTerminalStore.getState().removeTab(secondId)

      expect(useTerminalStore.getState().tabs).toHaveLength(1)
    })

    it('should update active tab when removing active tab', () => {
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const firstId = tabs[0].id
      const secondId = tabs[1].id

      // Second is active, remove it
      expect(useTerminalStore.getState().activeTabId).toBe(secondId)
      useTerminalStore.getState().removeTab(secondId)

      expect(useTerminalStore.getState().activeTabId).toBe(firstId)
    })

    it('should keep active tab when removing non-active tab', () => {
      // Add two tabs
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const firstId = tabs[0].id
      const secondId = tabs[1].id

      // Second tab is active after adding
      expect(useTerminalStore.getState().activeTabId).toBe(secondId)

      // Remove first tab (non-active)
      useTerminalStore.getState().removeTab(firstId)

      // Second tab should still be active
      expect(useTerminalStore.getState().activeTabId).toBe(secondId)
    })

    it('should send terminal:close when session exists', () => {
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const secondId = tabs[1].id

      // Set sessionId for second tab
      useTerminalStore.getState().updateTab(secondId, { sessionId: 'session-123' })

      useTerminalStore.getState().removeTab(secondId)

      expect(window.electron.send).toHaveBeenCalledWith('terminal:close', 'session-123')
    })

    it('should dispose terminal instance when removing', () => {
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const secondId = tabs[1].id

      const mockTerminal = { dispose: vi.fn() }
      useTerminalStore.getState().updateTab(secondId, { terminal: mockTerminal as unknown as null })

      useTerminalStore.getState().removeTab(secondId)

      expect(mockTerminal.dispose).toHaveBeenCalled()
    })
  })

  describe('setActiveTab', () => {
    it('should set active tab id', () => {
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const firstId = tabs[0].id

      useTerminalStore.getState().setActiveTab(firstId)

      expect(useTerminalStore.getState().activeTabId).toBe(firstId)
    })
  })

  describe('updateTab', () => {
    it('should update tab title', () => {
      useTerminalStore.getState().addTab()
      const id = useTerminalStore.getState().tabs[0].id

      useTerminalStore.getState().updateTab(id, { title: 'SSH: server1' })

      expect(useTerminalStore.getState().tabs[0].title).toBe('SSH: server1')
    })

    it('should update tab sessionId', () => {
      useTerminalStore.getState().addTab()
      const id = useTerminalStore.getState().tabs[0].id

      useTerminalStore.getState().updateTab(id, { sessionId: 'session-456' })

      expect(useTerminalStore.getState().tabs[0].sessionId).toBe('session-456')
    })

    it('should update tab isConnected', () => {
      useTerminalStore.getState().addTab()
      const id = useTerminalStore.getState().tabs[0].id

      useTerminalStore.getState().updateTab(id, { isConnected: true })

      expect(useTerminalStore.getState().tabs[0].isConnected).toBe(true)
    })

    it('should only update specified tab', () => {
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const firstId = tabs[0].id
      const secondId = tabs[1].id

      useTerminalStore.getState().updateTab(secondId, { title: 'Updated' })

      const updatedTabs = useTerminalStore.getState().tabs
      expect(updatedTabs.find((t) => t.id === firstId)?.title).toBe('Terminal 1')
      expect(updatedTabs.find((t) => t.id === secondId)?.title).toBe('Updated')
    })
  })

  describe('setFullscreen', () => {
    it('should set fullscreen to true', () => {
      useTerminalStore.getState().setFullscreen(true)
      expect(useTerminalStore.getState().fullscreen).toBe(true)
    })

    it('should set fullscreen to false', () => {
      useTerminalStore.getState().setFullscreen(true)
      useTerminalStore.getState().setFullscreen(false)
      expect(useTerminalStore.getState().fullscreen).toBe(false)
    })
  })

  describe('getActiveTab', () => {
    it('should return undefined when no tabs exist', () => {
      expect(useTerminalStore.getState().getActiveTab()).toBeUndefined()
    })

    it('should return the active tab', () => {
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const id = tabs[0].id

      const activeTab = useTerminalStore.getState().getActiveTab()
      expect(activeTab?.id).toBe(id)
    })

    it('should return correct tab when multiple exist', () => {
      useTerminalStore.getState().addTab()
      useTerminalStore.getState().addTab()

      const tabs = useTerminalStore.getState().tabs
      const firstId = tabs[0].id

      useTerminalStore.getState().setActiveTab(firstId)

      const activeTab = useTerminalStore.getState().getActiveTab()
      expect(activeTab?.id).toBe(firstId)
      expect(activeTab?.title).toBe('Terminal 1')
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useTerminalStore.getState()
      expect(state.tabs).toEqual([])
      expect(state.activeTabId).toBeNull()
      expect(state.fullscreen).toBe(false)
    })
  })
})
