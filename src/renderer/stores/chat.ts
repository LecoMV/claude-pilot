import { create } from 'zustand'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
}

export interface ChatSession {
  id: string
  projectPath: string
  projectName: string
  startedAt: number
  messages: ChatMessage[]
}

interface ChatState {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  inputValue: string
  isStreaming: boolean
  isLoading: boolean

  setSessions: (sessions: ChatSession[]) => void
  setCurrentSession: (session: ChatSession | null) => void
  setInputValue: (value: string) => void
  setIsStreaming: (streaming: boolean) => void
  setIsLoading: (loading: boolean) => void
  addMessage: (message: ChatMessage) => void
  updateMessage: (id: string, content: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  inputValue: '',
  isStreaming: false,
  isLoading: false,

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (currentSession) => set({ currentSession }),
  setInputValue: (inputValue) => set({ inputValue }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setIsLoading: (isLoading) => set({ isLoading }),

  addMessage: (message) => {
    const { currentSession } = get()
    if (!currentSession) return

    set({
      currentSession: {
        ...currentSession,
        messages: [...currentSession.messages, message],
      },
    })
  },

  updateMessage: (id, content) => {
    const { currentSession } = get()
    if (!currentSession) return

    set({
      currentSession: {
        ...currentSession,
        messages: currentSession.messages.map((m) =>
          m.id === id ? { ...m, content, isStreaming: false } : m
        ),
      },
    })
  },

  clearMessages: () => {
    const { currentSession } = get()
    if (!currentSession) return

    set({
      currentSession: {
        ...currentSession,
        messages: [],
      },
    })
  },
}))
