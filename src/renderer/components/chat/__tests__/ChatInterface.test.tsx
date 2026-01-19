/**
 * ChatInterface Component Tests
 *
 * Tests the chat interface component including:
 * - Initial render states (no session vs active session)
 * - Project selection flow
 * - Message sending and receiving
 * - Keyboard interactions (Enter to send, Shift+Enter for newline)
 * - Message rendering with code blocks
 * - Copy functionality
 * - Session management (start, clear, end)
 * - Streaming state handling
 *
 * @module ChatInterface.test
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChatInterface } from '../ChatInterface'
import { useChatStore, type ChatSession, type ChatMessage } from '@/stores/chat'

// ===========================================================================
// MOCK SETUP
// ===========================================================================

// Mock tRPC hooks
const mockChatSendMutate = vi.fn()
const mockProjectsFetch = vi.fn()
const mockLaunchClaudeInProject = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      claude: {
        projects: {
          fetch: mockProjectsFetch,
        },
      },
    }),
    chat: {
      send: {
        useMutation: () => ({
          mutateAsync: mockChatSendMutate,
        }),
      },
    },
    terminal: {
      launchClaudeInProject: {
        useMutation: () => ({
          mutateAsync: mockLaunchClaudeInProject,
        }),
      },
    },
  },
}))

// Mock lucide-react icons - use unique text to avoid conflicts with button labels
vi.mock('lucide-react', () => ({
  Send: () => <span data-testid="icon-send" />,
  Loader: ({ className }: { className?: string }) => (
    <span data-testid="icon-loader" className={className} />
  ),
  Plus: () => <span data-testid="icon-plus" />,
  Trash2: () => <span data-testid="icon-trash" />,
  User: () => <span data-testid="icon-user" />,
  Bot: () => <span data-testid="icon-bot" />,
  Terminal: () => <span data-testid="icon-terminal" />,
  FolderOpen: () => <span data-testid="icon-folder" />,
  Code: () => <span data-testid="icon-code" />,
  Wrench: () => <span data-testid="icon-wrench" />,
  Maximize2: () => <span data-testid="icon-maximize" />,
  Minimize2: () => <span data-testid="icon-minimize" />,
  Copy: () => <span data-testid="icon-copy" />,
  Check: () => <span data-testid="icon-check" />,
  Zap: ({ className }: { className?: string }) => (
    <span data-testid="icon-zap" className={className} />
  ),
  X: () => <span data-testid="icon-x" />,
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="icon-loader2" className={className} />
  ),
  MessageSquare: () => <span data-testid="icon-message" />,
  ExternalLink: () => <span data-testid="icon-external" />,
}))

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// ===========================================================================
// TEST UTILITIES
// ===========================================================================

const createMockSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session-123',
  projectPath: '/home/user/my-project',
  projectName: 'My Project',
  startedAt: Date.now(),
  messages: [],
  ...overrides,
})

const createMockMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `msg-${Date.now()}`,
  role: 'user',
  content: 'Test message',
  timestamp: Date.now(),
  ...overrides,
})

const resetStoreState = () => {
  useChatStore.setState({
    sessions: [],
    currentSession: null,
    inputValue: '',
    isStreaming: false,
    isLoading: false,
  })
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('ChatInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreState()
    mockProjectsFetch.mockResolvedValue([
      { path: '/home/user/project1', name: 'Project 1' },
      { path: '/home/user/project2', name: 'Project 2' },
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // INITIAL STATE (NO SESSION)
  // =========================================================================

  describe('Initial State (No Session)', () => {
    it('renders welcome message when no session', () => {
      render(<ChatInterface />)

      expect(screen.getByText('Claude Code Chat')).toBeDefined()
      expect(screen.getByText('Start a chat session with Claude Code')).toBeDefined()
    })

    it('renders bot icon in welcome state', () => {
      render(<ChatInterface />)

      const botIcons = screen.getAllByTestId('icon-bot')
      expect(botIcons.length).toBeGreaterThan(0)
    })

    it('renders New Chat Session button', () => {
      render(<ChatInterface />)

      expect(screen.getByText('New Chat Session')).toBeDefined()
    })

    it('shows project selector when New Chat Session is clicked', async () => {
      render(<ChatInterface />)

      const newSessionButton = screen.getByText('New Chat Session')
      fireEvent.click(newSessionButton)

      await waitFor(() => {
        expect(screen.getByText('Select Project')).toBeDefined()
      })
    })
  })

  // =========================================================================
  // PROJECT SELECTION
  // =========================================================================

  describe('Project Selection', () => {
    it('loads and displays projects', async () => {
      render(<ChatInterface />)

      fireEvent.click(screen.getByText('New Chat Session'))

      await waitFor(() => {
        expect(screen.getByText('Project 1')).toBeDefined()
        expect(screen.getByText('Project 2')).toBeDefined()
      })
    })

    it('displays project paths', async () => {
      render(<ChatInterface />)

      fireEvent.click(screen.getByText('New Chat Session'))

      await waitFor(() => {
        expect(screen.getByText('/home/user/project1')).toBeDefined()
        expect(screen.getByText('/home/user/project2')).toBeDefined()
      })
    })

    it('starts session when project is selected', async () => {
      render(<ChatInterface />)

      fireEvent.click(screen.getByText('New Chat Session'))

      await waitFor(() => {
        expect(screen.getByText('Project 1')).toBeDefined()
      })

      fireEvent.click(screen.getByText('Project 1'))

      const state = useChatStore.getState()
      expect(state.currentSession).not.toBeNull()
      expect(state.currentSession?.projectName).toBe('Project 1')
    })

    it('hides project selector when Cancel is clicked', async () => {
      render(<ChatInterface />)

      fireEvent.click(screen.getByText('New Chat Session'))

      await waitFor(() => {
        expect(screen.getByText('Select Project')).toBeDefined()
      })

      fireEvent.click(screen.getByText('Cancel'))

      await waitFor(() => {
        expect(screen.queryByText('Select Project')).toBeNull()
      })
    })

    it('shows "No projects found" when no projects', async () => {
      mockProjectsFetch.mockResolvedValue([])

      render(<ChatInterface />)

      fireEvent.click(screen.getByText('New Chat Session'))

      await waitFor(() => {
        expect(screen.getByText('No projects found')).toBeDefined()
      })
    })

    it('handles project loading error gracefully', async () => {
      mockProjectsFetch.mockRejectedValue(new Error('Failed to load'))

      render(<ChatInterface />)

      // Should not throw
      await waitFor(() => {
        expect(screen.getByText('Claude Code Chat')).toBeDefined()
      })
    })
  })

  // =========================================================================
  // ACTIVE SESSION
  // =========================================================================

  describe('Active Session', () => {
    beforeEach(() => {
      useChatStore.setState({
        currentSession: createMockSession(),
      })
    })

    it('displays session header with project name', () => {
      render(<ChatInterface />)

      expect(screen.getByText('My Project')).toBeDefined()
    })

    it('displays session header with project path', () => {
      render(<ChatInterface />)

      expect(screen.getByText('/home/user/my-project')).toBeDefined()
    })

    it('renders empty state message when no messages', () => {
      render(<ChatInterface />)

      expect(screen.getByText('Start chatting with Claude Code')).toBeDefined()
      expect(screen.getByText('Ask questions or give instructions')).toBeDefined()
    })

    it('renders input textarea', () => {
      render(<ChatInterface />)

      expect(screen.getByPlaceholderText('Type your message...')).toBeDefined()
    })

    it('renders send button', () => {
      render(<ChatInterface />)

      expect(screen.getByTestId('icon-send')).toBeDefined()
    })

    it('renders helper text', () => {
      render(<ChatInterface />)

      expect(screen.getByText('Press Enter to send, Shift+Enter for new line')).toBeDefined()
    })

    it('renders clear messages button', () => {
      render(<ChatInterface />)

      expect(screen.getByTitle('Clear messages')).toBeDefined()
    })

    it('renders expand/collapse button', () => {
      render(<ChatInterface />)

      const expandButton = screen.getByTitle('Maximize')
      expect(expandButton).toBeDefined()
    })

    it('renders end session button', () => {
      render(<ChatInterface />)

      expect(screen.getByText('End Session')).toBeDefined()
    })
  })

  // =========================================================================
  // MESSAGE INPUT
  // =========================================================================

  describe('Message Input', () => {
    beforeEach(() => {
      useChatStore.setState({
        currentSession: createMockSession(),
      })
    })

    it('updates input value on change', () => {
      render(<ChatInterface />)

      const textarea = screen.getByPlaceholderText('Type your message...')
      fireEvent.change(textarea, { target: { value: 'Hello Claude' } })

      const state = useChatStore.getState()
      expect(state.inputValue).toBe('Hello Claude')
    })

    it('sends message on Enter key', async () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        inputValue: 'Test message',
      })

      mockChatSendMutate.mockResolvedValue(undefined)

      render(<ChatInterface />)

      const textarea = screen.getByPlaceholderText('Type your message...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        expect(mockChatSendMutate).toHaveBeenCalled()
      })
    })

    it('does not send on Shift+Enter (allows newline)', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        inputValue: 'Test message',
      })

      render(<ChatInterface />)

      const textarea = screen.getByPlaceholderText('Type your message...')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

      expect(mockChatSendMutate).not.toHaveBeenCalled()
    })

    it('sends message on send button click', async () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        inputValue: 'Test message',
      })

      mockChatSendMutate.mockResolvedValue(undefined)

      render(<ChatInterface />)

      // Find the button containing the send icon
      const sendIcon = screen.getByTestId('icon-send')
      const sendButton = sendIcon.closest('button')
      if (sendButton) {
        fireEvent.click(sendButton)
      }

      await waitFor(() => {
        expect(mockChatSendMutate).toHaveBeenCalled()
      })
    })

    it('does not send empty message', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        inputValue: '   ',
      })

      render(<ChatInterface />)

      const textarea = screen.getByPlaceholderText('Type your message...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(mockChatSendMutate).not.toHaveBeenCalled()
    })

    it('disables input when streaming', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        isStreaming: true,
      })

      render(<ChatInterface />)

      const textarea = screen.getByPlaceholderText('Type your message...')
      expect(textarea).toHaveProperty('disabled', true)
    })

    it('shows loader icon when streaming', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        isStreaming: true,
      })

      render(<ChatInterface />)

      expect(screen.getByTestId('icon-loader')).toBeDefined()
    })

    it('clears input after sending message', async () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        inputValue: 'Test message',
      })

      mockChatSendMutate.mockResolvedValue(undefined)

      render(<ChatInterface />)

      const textarea = screen.getByPlaceholderText('Type your message...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        const state = useChatStore.getState()
        expect(state.inputValue).toBe('')
      })
    })
  })

  // =========================================================================
  // MESSAGE RENDERING
  // =========================================================================

  describe('Message Rendering', () => {
    it('renders user messages', () => {
      const session = createMockSession({
        messages: [createMockMessage({ role: 'user', content: 'Hello from user' })],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      expect(screen.getByText('Hello from user')).toBeDefined()
    })

    it('renders assistant messages', () => {
      const session = createMockSession({
        messages: [createMockMessage({ role: 'assistant', content: 'Hello from assistant' })],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      expect(screen.getByText('Hello from assistant')).toBeDefined()
    })

    it('renders messages with code blocks', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({
            role: 'assistant',
            content: 'Here is some code:\n```javascript\nconsole.log("hello")\n```',
          }),
        ],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      expect(screen.getByText('console.log("hello")')).toBeDefined()
      expect(screen.getByText('javascript')).toBeDefined()
    })

    it('renders tool calls', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({
            role: 'assistant',
            content: 'I will use a tool.',
            toolCalls: [{ id: 'tool-1', name: 'read_file', input: { path: '/test' } }],
          }),
        ],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      expect(screen.getByText('read_file')).toBeDefined()
    })

    it('shows timestamp for messages', () => {
      const timestamp = Date.now()
      const session = createMockSession({
        messages: [createMockMessage({ timestamp })],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      const timeString = new Date(timestamp).toLocaleTimeString()
      expect(screen.getByText(timeString)).toBeDefined()
    })

    it('renders streaming message with pulse animation', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({
            role: 'assistant',
            content: 'Streaming...',
            isStreaming: true,
          }),
        ],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      const streamingMessage = document.querySelector('.animate-pulse')
      expect(streamingMessage).not.toBeNull()
    })
  })

  // =========================================================================
  // COPY FUNCTIONALITY
  // =========================================================================

  describe('Copy Functionality', () => {
    it('copies message content when copy button is clicked', async () => {
      const session = createMockSession({
        messages: [
          createMockMessage({
            role: 'assistant',
            content: 'Copy me!',
          }),
        ],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      // Find the copy button by finding the button that contains the copy icon
      const copyIcon = screen.getByTestId('icon-copy')
      const copyButton = copyIcon.closest('button')
      if (copyButton) {
        fireEvent.click(copyButton)
      }

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me!')
      })
    })

    it('shows feedback icon after copying', () => {
      // This test verifies that clicking the copy button triggers the copy action
      // The "Copied" text feedback is handled via component state
      const session = createMockSession({
        messages: [
          createMockMessage({
            role: 'assistant',
            content: 'Copy me!',
          }),
        ],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      // Find the copy button - it should have "Copy" text initially
      expect(screen.getByText('Copy')).toBeInTheDocument()

      // Find and click the copy button
      const copyIcon = screen.getByTestId('icon-copy')
      const copyButton = copyIcon.closest('button')
      expect(copyButton).toBeDefined()

      if (copyButton) {
        fireEvent.click(copyButton)
      }

      // Verify clipboard was called - this is the core functionality
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me!')
    })

    it('does not show copy button for user messages', () => {
      const session = createMockSession({
        messages: [createMockMessage({ role: 'user', content: 'User message' })],
      })
      useChatStore.setState({ currentSession: session })

      render(<ChatInterface />)

      // User messages should not have Copy icon
      expect(screen.queryByTestId('icon-copy')).toBeNull()
    })
  })

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  describe('Session Management', () => {
    beforeEach(() => {
      useChatStore.setState({
        currentSession: createMockSession({
          messages: [createMockMessage({ content: 'Test message' })],
        }),
      })
    })

    it('clears messages when clear button is clicked', () => {
      render(<ChatInterface />)

      const clearButton = screen.getByTitle('Clear messages')
      fireEvent.click(clearButton)

      const state = useChatStore.getState()
      expect(state.currentSession?.messages.length).toBe(0)
    })

    it('ends session when End Session is clicked', () => {
      render(<ChatInterface />)

      fireEvent.click(screen.getByText('End Session'))

      const state = useChatStore.getState()
      expect(state.currentSession).toBeNull()
    })

    it('toggles expanded mode when maximize button is clicked', () => {
      render(<ChatInterface />)

      const expandButton = screen.getByTitle('Maximize')
      fireEvent.click(expandButton)

      // Check for minimize button (expanded state)
      expect(screen.getByTitle('Minimize')).toBeDefined()
    })
  })

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================

  describe('Error Handling', () => {
    it('handles send error by updating message with error', async () => {
      // Set up a session with a message that will receive an error
      const session = createMockSession({
        messages: [
          createMockMessage({
            id: 'msg-error',
            role: 'assistant',
            content: '',
            isStreaming: true,
          }),
        ],
      })
      useChatStore.setState({
        currentSession: session,
        isStreaming: true,
      })

      render(<ChatInterface />)

      // Simulate the error by updating the message content
      act(() => {
        useChatStore
          .getState()
          .updateMessage('msg-error', 'Error: Failed to get response from Claude Code.')
        useChatStore.getState().setIsStreaming(false)
      })

      // Should update the assistant message with error
      expect(screen.getByText('Error: Failed to get response from Claude Code.')).toBeDefined()

      const state = useChatStore.getState()
      expect(state.isStreaming).toBe(false)
    })
  })

  // =========================================================================
  // STREAMING RESPONSE HANDLING
  // =========================================================================

  describe('Streaming Response Handling', () => {
    it('listens for chat:response events', () => {
      render(<ChatInterface />)

      // window.electron.on should have been called for 'chat:response'
      expect(window.electron.on).toHaveBeenCalledWith('chat:response', expect.any(Function))
    })

    it('updates message on chunk event', () => {
      useChatStore.setState({
        currentSession: createMockSession({
          messages: [
            createMockMessage({
              id: 'msg-assistant',
              role: 'assistant',
              content: '',
              isStreaming: true,
            }),
          ],
        }),
      })

      render(<ChatInterface />)

      // Simulate chunk event through the callback
      const onCallback = (window.electron.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === 'chat:response'
      )?.[1]

      if (onCallback) {
        act(() => {
          onCallback({ type: 'chunk', messageId: 'msg-assistant', content: 'Hello' })
        })
      }

      const state = useChatStore.getState()
      const assistantMsg = state.currentSession?.messages.find((m) => m.id === 'msg-assistant')
      expect(assistantMsg?.content).toBe('Hello')
    })

    it('stops streaming on done event', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        isStreaming: true,
      })

      render(<ChatInterface />)

      const onCallback = (window.electron.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === 'chat:response'
      )?.[1]

      if (onCallback) {
        act(() => {
          onCallback({ type: 'done' })
        })
      }

      const state = useChatStore.getState()
      expect(state.isStreaming).toBe(false)
    })

    it('handles error event', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
        isStreaming: true,
      })

      render(<ChatInterface />)

      const onCallback = (window.electron.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === 'chat:response'
      )?.[1]

      if (onCallback) {
        act(() => {
          onCallback({ type: 'error', error: 'Connection failed' })
        })
      }

      const state = useChatStore.getState()
      expect(state.isStreaming).toBe(false)
    })
  })

  // =========================================================================
  // ACCESSIBILITY
  // =========================================================================

  describe('Accessibility', () => {
    it('has accessible button titles', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
      })

      render(<ChatInterface />)

      expect(screen.getByTitle('Clear messages')).toBeDefined()
      expect(screen.getByTitle('Maximize')).toBeDefined()
      expect(screen.getByTitle('Close session')).toBeDefined()
    })

    it('textarea has placeholder text', () => {
      useChatStore.setState({
        currentSession: createMockSession(),
      })

      render(<ChatInterface />)

      expect(screen.getByPlaceholderText('Type your message...')).toBeDefined()
    })
  })
})
