import { describe, it, expect, beforeEach } from 'vitest'
import { useProfileStore } from '@/stores/profile'

describe('Profile Store', () => {
  const mockProfile = {
    id: 'profile-1',
    name: 'Default Profile',
    description: 'Default Claude profile',
    isActive: true,
    settings: {
      model: 'claude-opus-4-5-20251101',
      maxTokens: 8192,
      thinkingEnabled: true,
      thinkingBudget: 10000,
    },
    claudeMdPath: '/home/user/.claude/CLAUDE.md',
    rulesEnabled: ['sparc-methodology', 'code-style'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  const mockRule = {
    name: 'sparc-methodology',
    path: '/home/user/.claude/rules/sparc-methodology.md',
    enabled: true,
    content: '# SPARC Methodology',
  }

  beforeEach(() => {
    // Reset the store
    useProfileStore.setState({
      profiles: [],
      activeProfile: null,
      rules: [],
      globalSettings: null,
      loading: true,
      rulesLoading: false,
      selectedProfileId: null,
      showDetail: false,
      editingClaudeMd: false,
      claudeMdContent: '',
    })
  })

  describe('setProfiles', () => {
    it('should set profiles array', () => {
      useProfileStore.getState().setProfiles([mockProfile])
      expect(useProfileStore.getState().profiles).toEqual([mockProfile])
    })

    it('should handle multiple profiles', () => {
      const profiles = [
        mockProfile,
        { ...mockProfile, id: 'profile-2', name: 'Second Profile', isActive: false },
      ]
      useProfileStore.getState().setProfiles(profiles)
      expect(useProfileStore.getState().profiles).toHaveLength(2)
    })
  })

  describe('setActiveProfile', () => {
    it('should set active profile', () => {
      useProfileStore.getState().setActiveProfile(mockProfile)
      expect(useProfileStore.getState().activeProfile).toEqual(mockProfile)
    })

    it('should clear active profile when set to null', () => {
      useProfileStore.getState().setActiveProfile(mockProfile)
      useProfileStore.getState().setActiveProfile(null)
      expect(useProfileStore.getState().activeProfile).toBeNull()
    })
  })

  describe('setRules', () => {
    it('should set rules array', () => {
      useProfileStore.getState().setRules([mockRule])
      expect(useProfileStore.getState().rules).toEqual([mockRule])
    })

    it('should handle multiple rules', () => {
      const rules = [mockRule, { ...mockRule, name: 'code-style', enabled: false }]
      useProfileStore.getState().setRules(rules)
      expect(useProfileStore.getState().rules).toHaveLength(2)
    })
  })

  describe('setGlobalSettings', () => {
    it('should set global settings', () => {
      const settings = {
        model: 'claude-opus-4-5-20251101',
        maxTokens: 16384,
        thinkingEnabled: true,
        thinkingBudget: 20000,
        claudeMdContent: '# My Claude Configuration',
      }
      useProfileStore.getState().setGlobalSettings(settings)
      expect(useProfileStore.getState().globalSettings).toEqual(settings)
    })
  })

  describe('setLoading', () => {
    it('should set loading state', () => {
      useProfileStore.getState().setLoading(false)
      expect(useProfileStore.getState().loading).toBe(false)
    })
  })

  describe('setRulesLoading', () => {
    it('should set rules loading state', () => {
      useProfileStore.getState().setRulesLoading(true)
      expect(useProfileStore.getState().rulesLoading).toBe(true)
    })
  })

  describe('setSelectedProfileId', () => {
    it('should set selected profile id', () => {
      useProfileStore.getState().setSelectedProfileId('profile-1')
      expect(useProfileStore.getState().selectedProfileId).toBe('profile-1')
    })

    it('should clear selected profile id when set to null', () => {
      useProfileStore.getState().setSelectedProfileId('profile-1')
      useProfileStore.getState().setSelectedProfileId(null)
      expect(useProfileStore.getState().selectedProfileId).toBeNull()
    })
  })

  describe('setShowDetail', () => {
    it('should set show detail state', () => {
      useProfileStore.getState().setShowDetail(true)
      expect(useProfileStore.getState().showDetail).toBe(true)
    })
  })

  describe('setEditingClaudeMd', () => {
    it('should set editing claude md state', () => {
      useProfileStore.getState().setEditingClaudeMd(true)
      expect(useProfileStore.getState().editingClaudeMd).toBe(true)
    })
  })

  describe('setClaudeMdContent', () => {
    it('should set claude md content', () => {
      const content = '# My Claude Configuration\n\nThis is my configuration.'
      useProfileStore.getState().setClaudeMdContent(content)
      expect(useProfileStore.getState().claudeMdContent).toBe(content)
    })

    it('should handle empty content', () => {
      useProfileStore.getState().setClaudeMdContent('')
      expect(useProfileStore.getState().claudeMdContent).toBe('')
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useProfileStore.getState()
      expect(state.profiles).toEqual([])
      expect(state.activeProfile).toBeNull()
      expect(state.rules).toEqual([])
      expect(state.globalSettings).toBeNull()
      expect(state.loading).toBe(true)
      expect(state.rulesLoading).toBe(false)
      expect(state.selectedProfileId).toBeNull()
      expect(state.showDetail).toBe(false)
      expect(state.editingClaudeMd).toBe(false)
      expect(state.claudeMdContent).toBe('')
    })
  })
})
