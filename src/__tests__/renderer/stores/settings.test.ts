import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '@/stores/settings'
import type { AppSettings } from '@/stores/settings'

// Mock tRPC client
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    settings: {
      get: {
        query: vi.fn(),
      },
      save: {
        mutate: vi.fn(),
      },
    },
  },
}))

describe('Settings Store', () => {
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

  beforeEach(() => {
    // Reset the store to initial state
    useSettingsStore.setState({
      settings: { ...defaultSettings },
      loading: false,
      saving: false,
      loaded: false,
    })
  })

  describe('initial state', () => {
    it('should have correct default theme settings', () => {
      const state = useSettingsStore.getState()
      expect(state.settings.theme).toBe('dark')
      expect(state.settings.accentColor).toBe('purple')
      expect(state.settings.sidebarCollapsed).toBe(false)
    })

    it('should have correct default terminal settings', () => {
      const state = useSettingsStore.getState()
      expect(state.settings.terminalFont).toBe('jetbrains')
      expect(state.settings.terminalFontSize).toBe(14)
      expect(state.settings.terminalScrollback).toBe(10000)
    })

    it('should have correct default memory settings', () => {
      const state = useSettingsStore.getState()
      expect(state.settings.postgresHost).toBe('localhost')
      expect(state.settings.postgresPort).toBe(5433)
      expect(state.settings.memgraphHost).toBe('localhost')
      expect(state.settings.memgraphPort).toBe(7687)
      expect(state.settings.qdrantHost).toBe('localhost')
      expect(state.settings.qdrantPort).toBe(6333)
      expect(state.settings.qdrantCollection).toBe('claude_memories')
    })

    it('should have correct default notification settings', () => {
      const state = useSettingsStore.getState()
      expect(state.settings.systemNotifications).toBe(true)
      expect(state.settings.soundEnabled).toBe(false)
    })

    it('should have correct default security settings', () => {
      const state = useSettingsStore.getState()
      expect(state.settings.autoLock).toBe(false)
      expect(state.settings.clearOnExit).toBe(true)
    })

    it('should have correct default loading states', () => {
      const state = useSettingsStore.getState()
      expect(state.loading).toBe(false)
      expect(state.saving).toBe(false)
      expect(state.loaded).toBe(false)
    })
  })

  describe('setSettings', () => {
    it('should update theme setting', () => {
      useSettingsStore.getState().setSettings({ theme: 'light' })
      expect(useSettingsStore.getState().settings.theme).toBe('light')
    })

    it('should update theme to auto', () => {
      useSettingsStore.getState().setSettings({ theme: 'auto' })
      expect(useSettingsStore.getState().settings.theme).toBe('auto')
    })

    it('should update accent color', () => {
      useSettingsStore.getState().setSettings({ accentColor: 'blue' })
      expect(useSettingsStore.getState().settings.accentColor).toBe('blue')
    })

    it('should update accent color to green', () => {
      useSettingsStore.getState().setSettings({ accentColor: 'green' })
      expect(useSettingsStore.getState().settings.accentColor).toBe('green')
    })

    it('should update accent color to teal', () => {
      useSettingsStore.getState().setSettings({ accentColor: 'teal' })
      expect(useSettingsStore.getState().settings.accentColor).toBe('teal')
    })

    it('should toggle sidebar collapsed', () => {
      useSettingsStore.getState().setSettings({ sidebarCollapsed: true })
      expect(useSettingsStore.getState().settings.sidebarCollapsed).toBe(true)
    })

    it('should update terminal font', () => {
      useSettingsStore.getState().setSettings({ terminalFont: 'fira' })
      expect(useSettingsStore.getState().settings.terminalFont).toBe('fira')
    })

    it('should update terminal font to cascadia', () => {
      useSettingsStore.getState().setSettings({ terminalFont: 'cascadia' })
      expect(useSettingsStore.getState().settings.terminalFont).toBe('cascadia')
    })

    it('should update terminal font size', () => {
      useSettingsStore.getState().setSettings({ terminalFontSize: 16 })
      expect(useSettingsStore.getState().settings.terminalFontSize).toBe(16)
    })

    it('should update terminal scrollback', () => {
      useSettingsStore.getState().setSettings({ terminalScrollback: 20000 })
      expect(useSettingsStore.getState().settings.terminalScrollback).toBe(20000)
    })

    it('should update postgres host', () => {
      useSettingsStore.getState().setSettings({ postgresHost: '192.168.1.100' })
      expect(useSettingsStore.getState().settings.postgresHost).toBe('192.168.1.100')
    })

    it('should update postgres port', () => {
      useSettingsStore.getState().setSettings({ postgresPort: 5432 })
      expect(useSettingsStore.getState().settings.postgresPort).toBe(5432)
    })

    it('should update memgraph host', () => {
      useSettingsStore.getState().setSettings({ memgraphHost: '192.168.1.101' })
      expect(useSettingsStore.getState().settings.memgraphHost).toBe('192.168.1.101')
    })

    it('should update memgraph port', () => {
      useSettingsStore.getState().setSettings({ memgraphPort: 7688 })
      expect(useSettingsStore.getState().settings.memgraphPort).toBe(7688)
    })

    it('should update qdrant host', () => {
      useSettingsStore.getState().setSettings({ qdrantHost: '192.168.1.102' })
      expect(useSettingsStore.getState().settings.qdrantHost).toBe('192.168.1.102')
    })

    it('should update qdrant port', () => {
      useSettingsStore.getState().setSettings({ qdrantPort: 6334 })
      expect(useSettingsStore.getState().settings.qdrantPort).toBe(6334)
    })

    it('should update qdrant collection', () => {
      useSettingsStore.getState().setSettings({ qdrantCollection: 'my_memories' })
      expect(useSettingsStore.getState().settings.qdrantCollection).toBe('my_memories')
    })

    it('should toggle system notifications', () => {
      useSettingsStore.getState().setSettings({ systemNotifications: false })
      expect(useSettingsStore.getState().settings.systemNotifications).toBe(false)
    })

    it('should toggle sound enabled', () => {
      useSettingsStore.getState().setSettings({ soundEnabled: true })
      expect(useSettingsStore.getState().settings.soundEnabled).toBe(true)
    })

    it('should toggle auto lock', () => {
      useSettingsStore.getState().setSettings({ autoLock: true })
      expect(useSettingsStore.getState().settings.autoLock).toBe(true)
    })

    it('should toggle clear on exit', () => {
      useSettingsStore.getState().setSettings({ clearOnExit: false })
      expect(useSettingsStore.getState().settings.clearOnExit).toBe(false)
    })

    it('should update multiple settings at once', () => {
      useSettingsStore.getState().setSettings({
        theme: 'light',
        accentColor: 'blue',
        terminalFontSize: 18,
        systemNotifications: false,
      })

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('light')
      expect(settings.accentColor).toBe('blue')
      expect(settings.terminalFontSize).toBe(18)
      expect(settings.systemNotifications).toBe(false)
    })

    it('should preserve other settings when updating', () => {
      useSettingsStore.getState().setSettings({ theme: 'light' })

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('light')
      expect(settings.terminalFont).toBe('jetbrains') // Unchanged
      expect(settings.postgresPort).toBe(5433) // Unchanged
    })
  })

  describe('loadSettings', () => {
    it('should set loading state while loading', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({}), 100))
      )

      const loadPromise = useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().loading).toBe(true)
      await loadPromise
    })

    it('should load settings from trpc', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockResolvedValue({
        theme: 'light',
        accentColor: 'blue',
        terminalFontSize: 16,
      })

      await useSettingsStore.getState().loadSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('light')
      expect(settings.accentColor).toBe('blue')
      expect(settings.terminalFontSize).toBe(16)
      expect(useSettingsStore.getState().loading).toBe(false)
      expect(useSettingsStore.getState().loaded).toBe(true)
    })

    it('should merge loaded settings with defaults', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockResolvedValue({
        theme: 'light',
      })

      await useSettingsStore.getState().loadSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('light') // Loaded
      expect(settings.accentColor).toBe('purple') // Default
      expect(settings.terminalFont).toBe('jetbrains') // Default
    })

    it('should keep defaults when loading returns empty', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockResolvedValue({})

      await useSettingsStore.getState().loadSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('dark')
      expect(settings.accentColor).toBe('purple')
      expect(useSettingsStore.getState().loaded).toBe(true)
    })

    it('should handle null response', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockResolvedValue(null)

      await useSettingsStore.getState().loadSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('dark')
      expect(useSettingsStore.getState().loaded).toBe(true)
    })

    it('should handle errors gracefully', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.get.query).mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useSettingsStore.getState().loadSettings()

      expect(useSettingsStore.getState().loading).toBe(false)
      expect(useSettingsStore.getState().loaded).toBe(true) // Still marked as loaded after error
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('saveSettings', () => {
    it('should set saving state while saving', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.save.mutate).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(true), 100))
      )

      const savePromise = useSettingsStore.getState().saveSettings()
      expect(useSettingsStore.getState().saving).toBe(true)
      await savePromise
    })

    it('should save settings via trpc', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.save.mutate).mockResolvedValue(true)

      useSettingsStore.getState().setSettings({ theme: 'light' })
      const result = await useSettingsStore.getState().saveSettings()

      expect(result).toBe(true)
      expect(trpc.settings.save.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'light' })
      )
      expect(useSettingsStore.getState().saving).toBe(false)
    })

    it('should save all current settings', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.save.mutate).mockResolvedValue(true)

      useSettingsStore.getState().setSettings({
        theme: 'light',
        accentColor: 'blue',
        terminalFontSize: 18,
      })

      await useSettingsStore.getState().saveSettings()

      expect(trpc.settings.save.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'light',
          accentColor: 'blue',
          terminalFontSize: 18,
          // Should also include defaults for other fields
          terminalFont: 'jetbrains',
          postgresPort: 5433,
        })
      )
    })

    it('should return false on save failure', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.settings.save.mutate).mockRejectedValue(new Error('Save failed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await useSettingsStore.getState().saveSettings()

      expect(result).toBe(false)
      expect(useSettingsStore.getState().saving).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('resetSettings', () => {
    it('should reset all settings to defaults', () => {
      // Modify settings first
      useSettingsStore.getState().setSettings({
        theme: 'light',
        accentColor: 'blue',
        terminalFontSize: 18,
        postgresPort: 5432,
        systemNotifications: false,
      })

      // Reset to defaults
      useSettingsStore.getState().resetSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.theme).toBe('dark')
      expect(settings.accentColor).toBe('purple')
      expect(settings.terminalFontSize).toBe(14)
      expect(settings.postgresPort).toBe(5433)
      expect(settings.systemNotifications).toBe(true)
    })

    it('should reset terminal settings', () => {
      useSettingsStore.getState().setSettings({
        terminalFont: 'fira',
        terminalFontSize: 20,
        terminalScrollback: 50000,
      })

      useSettingsStore.getState().resetSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.terminalFont).toBe('jetbrains')
      expect(settings.terminalFontSize).toBe(14)
      expect(settings.terminalScrollback).toBe(10000)
    })

    it('should reset memory settings', () => {
      useSettingsStore.getState().setSettings({
        postgresHost: 'remote-host',
        postgresPort: 5432,
        memgraphHost: 'remote-memgraph',
        memgraphPort: 7688,
        qdrantHost: 'remote-qdrant',
        qdrantPort: 6334,
        qdrantCollection: 'custom_collection',
      })

      useSettingsStore.getState().resetSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.postgresHost).toBe('localhost')
      expect(settings.postgresPort).toBe(5433)
      expect(settings.memgraphHost).toBe('localhost')
      expect(settings.memgraphPort).toBe(7687)
      expect(settings.qdrantHost).toBe('localhost')
      expect(settings.qdrantPort).toBe(6333)
      expect(settings.qdrantCollection).toBe('claude_memories')
    })

    it('should reset security settings', () => {
      useSettingsStore.getState().setSettings({
        autoLock: true,
        clearOnExit: false,
      })

      useSettingsStore.getState().resetSettings()

      const settings = useSettingsStore.getState().settings
      expect(settings.autoLock).toBe(false)
      expect(settings.clearOnExit).toBe(true)
    })
  })
})
