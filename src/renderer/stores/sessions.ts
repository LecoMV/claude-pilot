import { create } from 'zustand'
import { trpc } from '@/lib/trpc/client'
import type { ExternalSession, SessionMessage } from '../../shared/types'

interface SessionsState {
  // Session data
  sessions: ExternalSession[]
  activeSessions: ExternalSession[]
  selectedSession: ExternalSession | null
  selectedMessages: SessionMessage[]

  // UI state
  isLoading: boolean
  isWatching: boolean
  error: string | null
  searchQuery: string
  filter: 'all' | 'active' | 'recent'
  sortBy: 'lastActivity' | 'startTime' | 'tokens' | 'messages'

  // Actions
  fetchSessions: () => Promise<void>
  fetchActiveSessions: () => Promise<void>
  selectSession: (sessionId: string | null) => Promise<void>
  fetchSessionMessages: (sessionId: string, limit?: number) => Promise<void>
  toggleWatching: () => Promise<void>
  setSearchQuery: (query: string) => void
  setFilter: (filter: 'all' | 'active' | 'recent') => void
  setSortBy: (sortBy: 'lastActivity' | 'startTime' | 'tokens' | 'messages') => void
  updateSession: (session: ExternalSession) => void
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  activeSessions: [],
  selectedSession: null,
  selectedMessages: [],
  isLoading: false,
  isWatching: false,
  error: null,
  searchQuery: '',
  filter: 'all',
  sortBy: 'lastActivity',

  fetchSessions: async () => {
    set({ isLoading: true, error: null })
    try {
      const sessions = await trpc.session.discover.query()
      set({ sessions, isLoading: false })
    } catch {
      set({ error: 'Failed to fetch sessions', isLoading: false })
    }
  },

  fetchActiveSessions: async () => {
    try {
      const activeSessions = await trpc.session.getActive.query()
      set({ activeSessions })
    } catch (error) {
      console.error('Failed to fetch active sessions:', error)
    }
  },

  selectSession: async (sessionId: string | null) => {
    if (!sessionId) {
      set({ selectedSession: null, selectedMessages: [] })
      return
    }

    const { sessions } = get()
    const session = sessions.find((s) => s.id === sessionId) || null
    set({ selectedSession: session, selectedMessages: [] })

    if (session) {
      // Fetch messages for the selected session
      await get().fetchSessionMessages(sessionId)
    }
  },

  fetchSessionMessages: async (sessionId: string, limit = 100) => {
    try {
      const messages = await trpc.session.getMessages.query({ sessionId, limit })
      set({ selectedMessages: messages })
    } catch (error) {
      console.error('Failed to fetch session messages:', error)
    }
  },

  toggleWatching: async () => {
    const { isWatching } = get()
    try {
      await trpc.session.watch.mutate({ enable: !isWatching })
      set({ isWatching: !isWatching })
    } catch (error) {
      console.error('Failed to toggle session watching:', error)
    }
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilter: (filter) => set({ filter }),
  setSortBy: (sortBy) => set({ sortBy }),

  updateSession: (session) => {
    const { sessions } = get()
    const index = sessions.findIndex((s) => s.id === session.id)
    if (index >= 0) {
      const newSessions = [...sessions]
      newSessions[index] = session
      set({ sessions: newSessions })
    } else {
      set({ sessions: [session, ...sessions] })
    }

    // Note: Active sessions are managed by fetchActiveSessions() which uses
    // backend process detection. Don't override with client-side heuristics.
  },
}))

// Helper selectors
export const selectFilteredSessions = (state: SessionsState) => {
  let filtered = state.sessions

  // Filter out synthetic/internal sessions
  filtered = filtered.filter(
    (s) => !s.projectName.includes('<synthetic>') && !s.projectName.includes('synthetic')
  )

  // Apply search filter
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase()
    filtered = filtered.filter(
      (s) =>
        s.projectName.toLowerCase().includes(query) ||
        s.slug?.toLowerCase().includes(query) ||
        s.id.toLowerCase().includes(query)
    )
  }

  // Apply status filter
  if (state.filter === 'active') {
    filtered = filtered.filter((s) => s.isActive)
  } else if (state.filter === 'recent') {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    filtered = filtered.filter((s) => s.lastActivity > oneDayAgo)
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (state.sortBy) {
      case 'startTime':
        return b.startTime - a.startTime
      case 'tokens':
        return (
          b.stats.inputTokens + b.stats.outputTokens - (a.stats.inputTokens + a.stats.outputTokens)
        )
      case 'messages':
        return b.stats.messageCount - a.stats.messageCount
      case 'lastActivity':
      default:
        return b.lastActivity - a.lastActivity
    }
  })

  return filtered
}
