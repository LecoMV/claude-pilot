import { create } from 'zustand'

export interface ClaudeProfile {
  id: string
  name: string
  description?: string
  isActive: boolean
  settings: {
    model?: string
    maxTokens?: number
    thinkingEnabled?: boolean
    thinkingBudget?: number
  }
  claudeMdPath?: string
  rulesEnabled: string[]
  createdAt: string
  updatedAt: string
}

export interface ClaudeRule {
  name: string
  path: string
  enabled: boolean
  content?: string
}

export interface ProfileSettings {
  model?: string
  maxTokens?: number
  thinkingEnabled?: boolean
  thinkingBudget?: number
  claudeMdContent?: string
}

interface ProfileState {
  profiles: ClaudeProfile[]
  activeProfile: ClaudeProfile | null
  rules: ClaudeRule[]
  globalSettings: ProfileSettings | null
  loading: boolean
  rulesLoading: boolean
  selectedProfileId: string | null
  showDetail: boolean
  editingClaudeMd: boolean
  claudeMdContent: string

  setProfiles: (profiles: ClaudeProfile[]) => void
  setActiveProfile: (profile: ClaudeProfile | null) => void
  setRules: (rules: ClaudeRule[]) => void
  setGlobalSettings: (settings: ProfileSettings) => void
  setLoading: (loading: boolean) => void
  setRulesLoading: (loading: boolean) => void
  setSelectedProfileId: (id: string | null) => void
  setShowDetail: (show: boolean) => void
  setEditingClaudeMd: (editing: boolean) => void
  setClaudeMdContent: (content: string) => void
}

export const useProfileStore = create<ProfileState>((set) => ({
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

  setProfiles: (profiles) => set({ profiles }),
  setActiveProfile: (profile) => set({ activeProfile: profile }),
  setRules: (rules) => set({ rules }),
  setGlobalSettings: (settings) => set({ globalSettings: settings }),
  setLoading: (loading) => set({ loading }),
  setRulesLoading: (loading) => set({ rulesLoading: loading }),
  setSelectedProfileId: (id) => set({ selectedProfileId: id }),
  setShowDetail: (show) => set({ showDetail: show }),
  setEditingClaudeMd: (editing) => set({ editingClaudeMd: editing }),
  setClaudeMdContent: (content) => set({ claudeMdContent: content }),
}))
