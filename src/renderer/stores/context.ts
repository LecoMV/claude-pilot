import { create } from 'zustand'

export interface SessionSummary {
  id: string
  projectPath: string
  projectName: string
  startTime: number
  endTime?: number
  messageCount: number
  tokenCount: number
  toolCalls: number
  model?: string
}

export interface TokenUsage {
  current: number
  max: number
  percentage: number
  lastCompaction?: number
}

export interface CompactionSettings {
  autoCompact: boolean
  threshold: number
}

interface ContextState {
  sessions: SessionSummary[]
  tokenUsage: TokenUsage | null
  compactionSettings: CompactionSettings | null
  loading: boolean
  sessionsLoading: boolean
  selectedSession: SessionSummary | null

  setSessions: (sessions: SessionSummary[]) => void
  setTokenUsage: (usage: TokenUsage) => void
  setCompactionSettings: (settings: CompactionSettings) => void
  setLoading: (loading: boolean) => void
  setSessionsLoading: (loading: boolean) => void
  setSelectedSession: (session: SessionSummary | null) => void
}

export const useContextStore = create<ContextState>((set) => ({
  sessions: [],
  tokenUsage: null,
  compactionSettings: null,
  loading: true,
  sessionsLoading: false,
  selectedSession: null,

  setSessions: (sessions) => set({ sessions }),
  setTokenUsage: (usage) => set({ tokenUsage: usage }),
  setCompactionSettings: (settings) => set({ compactionSettings: settings }),
  setLoading: (loading) => set({ loading }),
  setSessionsLoading: (loading) => set({ sessionsLoading: loading }),
  setSelectedSession: (session) => set({ selectedSession: session }),
}))
