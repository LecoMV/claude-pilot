import { create } from 'zustand'
import type { Terminal } from '@xterm/xterm'

export interface TerminalTab {
  id: string
  sessionId: string | null
  title: string
  terminal: Terminal | null
  isConnected: boolean
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  fullscreen: boolean
  addTab: () => string
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<TerminalTab>) => void
  setFullscreen: (fullscreen: boolean) => void
  getActiveTab: () => TerminalTab | undefined
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  fullscreen: false,

  addTab: () => {
    const id = `tab-${Date.now()}`
    const tabNumber = get().tabs.length + 1

    const newTab: TerminalTab = {
      id,
      sessionId: null,
      title: `Terminal ${tabNumber}`,
      terminal: null,
      isConnected: false,
    }

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
    }))

    return id
  },

  removeTab: (id: string) => {
    const state = get()
    if (state.tabs.length <= 1) return

    const tab = state.tabs.find((t) => t.id === id)

    // Close the PTY session if connected
    if (tab?.sessionId) {
      window.electron.send('terminal:close', tab.sessionId)
    }

    // Dispose terminal instance
    tab?.terminal?.dispose()

    const newTabs = state.tabs.filter((t) => t.id !== id)
    const newActiveId =
      state.activeTabId === id ? newTabs[newTabs.length - 1]?.id || null : state.activeTabId

    set({
      tabs: newTabs,
      activeTabId: newActiveId,
    })
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id })
  },

  updateTab: (id: string, updates: Partial<TerminalTab>) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...updates } : tab)),
    }))
  },

  setFullscreen: (fullscreen: boolean) => {
    set({ fullscreen })
  },

  getActiveTab: () => {
    const state = get()
    return state.tabs.find((t) => t.id === state.activeTabId)
  },
}))
