import { create } from 'zustand'
import { trpc } from '@/lib/trpc/client'

export interface AppSettings {
  // Appearance
  theme: 'dark' | 'light' | 'auto'
  accentColor: 'purple' | 'blue' | 'green' | 'teal'
  sidebarCollapsed: boolean

  // Terminal
  terminalFont: 'jetbrains' | 'fira' | 'cascadia'
  terminalFontSize: number
  terminalScrollback: number

  // Memory
  postgresHost: string
  postgresPort: number
  memgraphHost: string
  memgraphPort: number
  qdrantHost: string
  qdrantPort: number
  qdrantCollection: string

  // Notifications
  systemNotifications: boolean
  soundEnabled: boolean

  // Security
  autoLock: boolean
  clearOnExit: boolean
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  accentColor: 'purple',
  sidebarCollapsed: false,

  terminalFont: 'jetbrains',
  terminalFontSize: 14,
  terminalScrollback: 10000,

  postgresHost: 'localhost',
  postgresPort: 5433,
  memgraphHost: 'localhost',
  memgraphPort: 7687,
  qdrantHost: 'localhost',
  qdrantPort: 6333,
  qdrantCollection: 'claude_memories',

  systemNotifications: true,
  soundEnabled: false,

  autoLock: false,
  clearOnExit: true,
}

interface SettingsState {
  settings: AppSettings
  loading: boolean
  saving: boolean
  loaded: boolean

  setSettings: (settings: Partial<AppSettings>) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<boolean>
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  loading: false,
  saving: false,
  loaded: false,

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  loadSettings: async () => {
    set({ loading: true })
    try {
      const loaded = await trpc.settings.get.query()
      set({
        settings: { ...defaultSettings, ...loaded },
        loading: false,
        loaded: true,
      })
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ loading: false, loaded: true })
    }
  },

  saveSettings: async () => {
    const { settings } = get()
    set({ saving: true })
    try {
      const success = await trpc.settings.save.mutate(settings)
      set({ saving: false })
      return success
    } catch (error) {
      console.error('Failed to save settings:', error)
      set({ saving: false })
      return false
    }
  },

  resetSettings: () =>
    set({
      settings: { ...defaultSettings },
    }),
}))
