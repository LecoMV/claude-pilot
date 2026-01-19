import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSessionsStore, selectFilteredSessions } from '@/stores/sessions'
import type { ExternalSession, SessionMessage } from '../../../shared/types'

// Mock tRPC client
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    session: {
      discover: {
        query: vi.fn(),
      },
      getActive: {
        query: vi.fn(),
      },
      getMessages: {
        query: vi.fn(),
      },
      watch: {
        mutate: vi.fn(),
      },
    },
  },
}))

describe('Sessions Store', () => {
  const createMockSession = (overrides: Partial<ExternalSession> = {}): ExternalSession => ({
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    projectPath: '/home/user/project',
    projectName: 'test-project',
    filePath: '/home/user/.claude/sessions/test.jsonl',
    startTime: Date.now() - 3600000, // 1 hour ago
    lastActivity: Date.now(),
    isActive: false,
    model: 'claude-sonnet-4-5-20250929',
    stats: {
      messageCount: 10,
      userMessages: 5,
      assistantMessages: 5,
      toolCalls: 3,
      inputTokens: 1000,
      outputTokens: 500,
      cachedTokens: 200,
    },
    ...overrides,
  })

  const createMockMessage = (overrides: Partial<SessionMessage> = {}): SessionMessage => ({
    uuid: `msg-${Math.random().toString(36).substr(2, 9)}`,
    type: 'user',
    timestamp: Date.now(),
    content: 'Test message content',
    ...overrides,
  })

  beforeEach(() => {
    // Reset the store to initial state
    useSessionsStore.setState({
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
    })
  })

  describe('initial state', () => {
    it('should have correct default values', () => {
      const state = useSessionsStore.getState()
      expect(state.sessions).toEqual([])
      expect(state.activeSessions).toEqual([])
      expect(state.selectedSession).toBeNull()
      expect(state.selectedMessages).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.isWatching).toBe(false)
      expect(state.error).toBeNull()
      expect(state.searchQuery).toBe('')
      expect(state.filter).toBe('all')
      expect(state.sortBy).toBe('lastActivity')
    })
  })

  describe('fetchSessions', () => {
    it('should set isLoading while fetching', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.discover.query).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      )

      const fetchPromise = useSessionsStore.getState().fetchSessions()
      expect(useSessionsStore.getState().isLoading).toBe(true)
      expect(useSessionsStore.getState().error).toBeNull()
      await fetchPromise
    })

    it('should fetch sessions successfully', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      const mockSessions = [createMockSession({ id: 'session-1' }), createMockSession({ id: 'session-2' })]
      vi.mocked(trpc.session.discover.query).mockResolvedValue(mockSessions)

      await useSessionsStore.getState().fetchSessions()

      expect(useSessionsStore.getState().sessions).toEqual(mockSessions)
      expect(useSessionsStore.getState().isLoading).toBe(false)
    })

    it('should set error on fetch failure', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.discover.query).mockRejectedValue(new Error('Network error'))

      await useSessionsStore.getState().fetchSessions()

      expect(useSessionsStore.getState().error).toBe('Failed to fetch sessions')
      expect(useSessionsStore.getState().isLoading).toBe(false)
    })
  })

  describe('fetchActiveSessions', () => {
    it('should fetch active sessions successfully', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      const mockActiveSessions = [createMockSession({ id: 'active-1', isActive: true })]
      vi.mocked(trpc.session.getActive.query).mockResolvedValue(mockActiveSessions)

      await useSessionsStore.getState().fetchActiveSessions()

      expect(useSessionsStore.getState().activeSessions).toEqual(mockActiveSessions)
    })

    it('should handle errors silently', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.getActive.query).mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useSessionsStore.getState().fetchActiveSessions()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('selectSession', () => {
    it('should select a session and fetch its messages', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      const mockSession = createMockSession({ id: 'session-1' })
      const mockMessages = [createMockMessage({ uuid: 'msg-1' })]

      useSessionsStore.setState({ sessions: [mockSession] })
      vi.mocked(trpc.session.getMessages.query).mockResolvedValue(mockMessages)

      await useSessionsStore.getState().selectSession('session-1')

      expect(useSessionsStore.getState().selectedSession).toEqual(mockSession)
      expect(useSessionsStore.getState().selectedMessages).toEqual(mockMessages)
    })

    it('should clear selection when sessionId is null', async () => {
      const mockSession = createMockSession({ id: 'session-1' })
      useSessionsStore.setState({
        sessions: [mockSession],
        selectedSession: mockSession,
        selectedMessages: [createMockMessage()],
      })

      await useSessionsStore.getState().selectSession(null)

      expect(useSessionsStore.getState().selectedSession).toBeNull()
      expect(useSessionsStore.getState().selectedMessages).toEqual([])
    })

    it('should handle session not found', async () => {
      useSessionsStore.setState({ sessions: [] })

      await useSessionsStore.getState().selectSession('non-existent')

      expect(useSessionsStore.getState().selectedSession).toBeNull()
    })
  })

  describe('fetchSessionMessages', () => {
    it('should fetch messages for a session', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      const mockMessages = [
        createMockMessage({ uuid: 'msg-1', type: 'user', content: 'Hello' }),
        createMockMessage({ uuid: 'msg-2', type: 'assistant', content: 'Hi there!' }),
      ]
      vi.mocked(trpc.session.getMessages.query).mockResolvedValue(mockMessages)

      await useSessionsStore.getState().fetchSessionMessages('session-1')

      expect(useSessionsStore.getState().selectedMessages).toEqual(mockMessages)
      expect(trpc.session.getMessages.query).toHaveBeenCalledWith({ sessionId: 'session-1', limit: 100 })
    })

    it('should use custom limit when provided', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.getMessages.query).mockResolvedValue([])

      await useSessionsStore.getState().fetchSessionMessages('session-1', 50)

      expect(trpc.session.getMessages.query).toHaveBeenCalledWith({ sessionId: 'session-1', limit: 50 })
    })

    it('should handle errors silently', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.getMessages.query).mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useSessionsStore.getState().fetchSessionMessages('session-1')

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('toggleWatching', () => {
    it('should toggle watching from false to true', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.watch.mutate).mockResolvedValue(undefined)

      useSessionsStore.setState({ isWatching: false })
      await useSessionsStore.getState().toggleWatching()

      expect(useSessionsStore.getState().isWatching).toBe(true)
      expect(trpc.session.watch.mutate).toHaveBeenCalledWith({ enable: true })
    })

    it('should toggle watching from true to false', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.watch.mutate).mockResolvedValue(undefined)

      useSessionsStore.setState({ isWatching: true })
      await useSessionsStore.getState().toggleWatching()

      expect(useSessionsStore.getState().isWatching).toBe(false)
      expect(trpc.session.watch.mutate).toHaveBeenCalledWith({ enable: false })
    })

    it('should handle errors silently', async () => {
      const { trpc } = await import('@/lib/trpc/client')
      vi.mocked(trpc.session.watch.mutate).mockRejectedValue(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      useSessionsStore.setState({ isWatching: false })
      await useSessionsStore.getState().toggleWatching()

      // State should not change on error
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('setSearchQuery', () => {
    it('should set search query', () => {
      useSessionsStore.getState().setSearchQuery('test query')
      expect(useSessionsStore.getState().searchQuery).toBe('test query')
    })

    it('should handle empty query', () => {
      useSessionsStore.getState().setSearchQuery('test')
      useSessionsStore.getState().setSearchQuery('')
      expect(useSessionsStore.getState().searchQuery).toBe('')
    })
  })

  describe('setFilter', () => {
    it('should set filter to all', () => {
      useSessionsStore.getState().setFilter('all')
      expect(useSessionsStore.getState().filter).toBe('all')
    })

    it('should set filter to active', () => {
      useSessionsStore.getState().setFilter('active')
      expect(useSessionsStore.getState().filter).toBe('active')
    })

    it('should set filter to recent', () => {
      useSessionsStore.getState().setFilter('recent')
      expect(useSessionsStore.getState().filter).toBe('recent')
    })
  })

  describe('setSortBy', () => {
    it('should set sort by lastActivity', () => {
      useSessionsStore.getState().setSortBy('lastActivity')
      expect(useSessionsStore.getState().sortBy).toBe('lastActivity')
    })

    it('should set sort by startTime', () => {
      useSessionsStore.getState().setSortBy('startTime')
      expect(useSessionsStore.getState().sortBy).toBe('startTime')
    })

    it('should set sort by tokens', () => {
      useSessionsStore.getState().setSortBy('tokens')
      expect(useSessionsStore.getState().sortBy).toBe('tokens')
    })

    it('should set sort by messages', () => {
      useSessionsStore.getState().setSortBy('messages')
      expect(useSessionsStore.getState().sortBy).toBe('messages')
    })
  })

  describe('updateSession', () => {
    it('should update an existing session', () => {
      const existingSession = createMockSession({ id: 'session-1', projectName: 'old-name' })
      const updatedSession = { ...existingSession, projectName: 'new-name' }

      useSessionsStore.setState({ sessions: [existingSession] })
      useSessionsStore.getState().updateSession(updatedSession)

      expect(useSessionsStore.getState().sessions[0].projectName).toBe('new-name')
    })

    it('should add a new session if not found', () => {
      const existingSession = createMockSession({ id: 'session-1' })
      const newSession = createMockSession({ id: 'session-2' })

      useSessionsStore.setState({ sessions: [existingSession] })
      useSessionsStore.getState().updateSession(newSession)

      expect(useSessionsStore.getState().sessions).toHaveLength(2)
      expect(useSessionsStore.getState().sessions[0].id).toBe('session-2') // Added at beginning
    })

    it('should preserve other sessions when updating', () => {
      const session1 = createMockSession({ id: 'session-1' })
      const session2 = createMockSession({ id: 'session-2' })
      const updatedSession1 = { ...session1, projectName: 'updated' }

      useSessionsStore.setState({ sessions: [session1, session2] })
      useSessionsStore.getState().updateSession(updatedSession1)

      expect(useSessionsStore.getState().sessions).toHaveLength(2)
      expect(useSessionsStore.getState().sessions.find((s) => s.id === 'session-2')).toBeDefined()
    })
  })

  describe('selectFilteredSessions', () => {
    it('should filter out synthetic sessions', () => {
      const sessions = [
        createMockSession({ id: 'session-1', projectName: 'real-project' }),
        createMockSession({ id: 'session-2', projectName: '<synthetic>-test' }),
        createMockSession({ id: 'session-3', projectName: 'synthetic-internal' }),
      ]

      useSessionsStore.setState({ sessions })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('session-1')
    })

    it('should filter by search query on project name', () => {
      const sessions = [
        createMockSession({ id: 'session-1', projectName: 'my-awesome-project' }),
        createMockSession({ id: 'session-2', projectName: 'another-project' }),
      ]

      useSessionsStore.setState({ sessions, searchQuery: 'awesome' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('session-1')
    })

    it('should filter by search query on slug', () => {
      const sessions = [
        createMockSession({ id: 'session-1', projectName: 'project', slug: 'my-unique-slug' }),
        createMockSession({ id: 'session-2', projectName: 'project', slug: 'other-slug' }),
      ]

      useSessionsStore.setState({ sessions, searchQuery: 'unique' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('session-1')
    })

    it('should filter by search query on id', () => {
      const sessions = [
        createMockSession({ id: 'abc123', projectName: 'project' }),
        createMockSession({ id: 'def456', projectName: 'project' }),
      ]

      useSessionsStore.setState({ sessions, searchQuery: 'abc' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('abc123')
    })

    it('should filter by active status', () => {
      const sessions = [
        createMockSession({ id: 'session-1', isActive: true }),
        createMockSession({ id: 'session-2', isActive: false }),
        createMockSession({ id: 'session-3', isActive: true }),
      ]

      useSessionsStore.setState({ sessions, filter: 'active' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(2)
      expect(filtered.every((s) => s.isActive)).toBe(true)
    })

    it('should filter by recent (last 24 hours)', () => {
      const now = Date.now()
      const yesterday = now - 24 * 60 * 60 * 1000 - 1000 // Just over 24 hours ago

      const sessions = [
        createMockSession({ id: 'session-1', lastActivity: now }),
        createMockSession({ id: 'session-2', lastActivity: yesterday }),
        createMockSession({ id: 'session-3', lastActivity: now - 1000 }),
      ]

      useSessionsStore.setState({ sessions, filter: 'recent' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(2)
      expect(filtered.map((s) => s.id)).toContain('session-1')
      expect(filtered.map((s) => s.id)).toContain('session-3')
    })

    it('should sort by lastActivity descending', () => {
      const now = Date.now()
      const sessions = [
        createMockSession({ id: 'session-1', lastActivity: now - 1000 }),
        createMockSession({ id: 'session-2', lastActivity: now }),
        createMockSession({ id: 'session-3', lastActivity: now - 2000 }),
      ]

      useSessionsStore.setState({ sessions, sortBy: 'lastActivity' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered[0].id).toBe('session-2')
      expect(filtered[1].id).toBe('session-1')
      expect(filtered[2].id).toBe('session-3')
    })

    it('should sort by startTime descending', () => {
      const now = Date.now()
      const sessions = [
        createMockSession({ id: 'session-1', startTime: now - 2000 }),
        createMockSession({ id: 'session-2', startTime: now }),
        createMockSession({ id: 'session-3', startTime: now - 1000 }),
      ]

      useSessionsStore.setState({ sessions, sortBy: 'startTime' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered[0].id).toBe('session-2')
      expect(filtered[1].id).toBe('session-3')
      expect(filtered[2].id).toBe('session-1')
    })

    it('should sort by tokens descending', () => {
      const sessions = [
        createMockSession({
          id: 'session-1',
          stats: { messageCount: 10, userMessages: 5, assistantMessages: 5, toolCalls: 0, inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
        }),
        createMockSession({
          id: 'session-2',
          stats: { messageCount: 10, userMessages: 5, assistantMessages: 5, toolCalls: 0, inputTokens: 500, outputTokens: 200, cachedTokens: 0 },
        }),
        createMockSession({
          id: 'session-3',
          stats: { messageCount: 10, userMessages: 5, assistantMessages: 5, toolCalls: 0, inputTokens: 200, outputTokens: 100, cachedTokens: 0 },
        }),
      ]

      useSessionsStore.setState({ sessions, sortBy: 'tokens' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered[0].id).toBe('session-2') // 700 tokens
      expect(filtered[1].id).toBe('session-3') // 300 tokens
      expect(filtered[2].id).toBe('session-1') // 150 tokens
    })

    it('should sort by messages descending', () => {
      const sessions = [
        createMockSession({
          id: 'session-1',
          stats: { messageCount: 5, userMessages: 3, assistantMessages: 2, toolCalls: 0, inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
        }),
        createMockSession({
          id: 'session-2',
          stats: { messageCount: 20, userMessages: 10, assistantMessages: 10, toolCalls: 0, inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
        }),
        createMockSession({
          id: 'session-3',
          stats: { messageCount: 10, userMessages: 5, assistantMessages: 5, toolCalls: 0, inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
        }),
      ]

      useSessionsStore.setState({ sessions, sortBy: 'messages' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered[0].id).toBe('session-2') // 20 messages
      expect(filtered[1].id).toBe('session-3') // 10 messages
      expect(filtered[2].id).toBe('session-1') // 5 messages
    })

    it('should combine search and filter', () => {
      const sessions = [
        createMockSession({ id: 'session-1', projectName: 'test-project', isActive: true }),
        createMockSession({ id: 'session-2', projectName: 'test-project', isActive: false }),
        createMockSession({ id: 'session-3', projectName: 'other-project', isActive: true }),
      ]

      useSessionsStore.setState({ sessions, searchQuery: 'test', filter: 'active' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('session-1')
    })

    it('should handle empty sessions array', () => {
      useSessionsStore.setState({ sessions: [] })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toEqual([])
    })

    it('should be case insensitive for search', () => {
      const sessions = [createMockSession({ id: 'session-1', projectName: 'MyProject' })]

      useSessionsStore.setState({ sessions, searchQuery: 'myproject' })
      const filtered = selectFilteredSessions(useSessionsStore.getState())

      expect(filtered).toHaveLength(1)
    })
  })
})
