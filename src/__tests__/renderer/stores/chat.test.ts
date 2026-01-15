import { describe, it, expect, beforeEach } from 'vitest'
import { useChatStore } from '@/stores/chat'

describe('Chat Store', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages()
    useChatStore.getState().setCurrentSession(null)
  })

  describe('setCurrentSession', () => {
    it('should set current session', () => {
      const session = {
        id: 'session-1',
        projectPath: '/home/user/project',
        projectName: 'test-project',
        startedAt: Date.now(),
        messages: [],
      }

      useChatStore.getState().setCurrentSession(session)

      const state = useChatStore.getState()
      expect(state.currentSession).toEqual(session)
    })

    it('should clear session when set to null', () => {
      useChatStore.getState().setCurrentSession({
        id: 'session-1',
        projectPath: '/home/user/project',
        projectName: 'test-project',
        startedAt: Date.now(),
        messages: [],
      })

      useChatStore.getState().setCurrentSession(null)

      expect(useChatStore.getState().currentSession).toBeNull()
    })
  })

  describe('addMessage', () => {
    it('should add message to current session', () => {
      // First set up a session
      useChatStore.getState().setCurrentSession({
        id: 'session-1',
        projectPath: '/home/user/project',
        projectName: 'test-project',
        startedAt: Date.now(),
        messages: [],
      })

      useChatStore.getState().addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      })

      const session = useChatStore.getState().currentSession
      expect(session?.messages).toHaveLength(1)
      expect(session?.messages[0].content).toBe('Hello')
    })

    it('should not add message without session', () => {
      useChatStore.getState().addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      })

      expect(useChatStore.getState().currentSession).toBeNull()
    })
  })

  describe('updateMessage', () => {
    it('should update existing message content', () => {
      useChatStore.getState().setCurrentSession({
        id: 'session-1',
        projectPath: '/home/user/project',
        projectName: 'test-project',
        startedAt: Date.now(),
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hello',
            timestamp: Date.now(),
            isStreaming: true,
          },
        ],
      })

      useChatStore.getState().updateMessage('msg-1', 'Hello World')

      const session = useChatStore.getState().currentSession
      expect(session?.messages[0].content).toBe('Hello World')
      expect(session?.messages[0].isStreaming).toBe(false)
    })
  })

  describe('clearMessages', () => {
    it('should clear all messages from session', () => {
      useChatStore.getState().setCurrentSession({
        id: 'session-1',
        projectPath: '/home/user/project',
        projectName: 'test-project',
        startedAt: Date.now(),
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: Date.now(),
          },
        ],
      })

      useChatStore.getState().clearMessages()

      const session = useChatStore.getState().currentSession
      expect(session?.messages).toHaveLength(0)
    })
  })

  describe('inputValue', () => {
    it('should set input value', () => {
      useChatStore.getState().setInputValue('Test input')

      expect(useChatStore.getState().inputValue).toBe('Test input')
    })
  })

  describe('streaming state', () => {
    it('should track streaming state', () => {
      expect(useChatStore.getState().isStreaming).toBe(false)

      useChatStore.getState().setIsStreaming(true)

      expect(useChatStore.getState().isStreaming).toBe(true)
    })
  })

  describe('loading state', () => {
    it('should track loading state', () => {
      expect(useChatStore.getState().isLoading).toBe(false)

      useChatStore.getState().setIsLoading(true)

      expect(useChatStore.getState().isLoading).toBe(true)
    })
  })
})
