/**
 * TranscriptViewer Tests
 *
 * Tests for session transcript viewing, search, filtering, and export functionality.
 *
 * @module TranscriptViewer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TranscriptViewer, TranscriptViewerPage } from '../TranscriptViewer'
import type { ExternalSession, SessionMessage } from '@shared/types'

// Mock tRPC
const mockFetchMessages = vi.fn()
const mockFetchSessions = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      sessions: {
        getMessages: {
          fetch: mockFetchMessages,
        },
        discover: {
          fetch: mockFetchSessions,
        },
      },
    }),
  },
}))

// Mock clipboard
const mockClipboardWriteText = vi.fn()
Object.assign(navigator, {
  clipboard: {
    writeText: mockClipboardWriteText,
  },
})

// Mock URL APIs for export
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()
Object.assign(global.URL, {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
})

// Mock document.createElement for download link - store original first
const originalCreateElement = document.createElement.bind(document)
const mockClick = vi.fn()
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'a') {
    return {
      href: '',
      download: '',
      click: mockClick,
    } as unknown as HTMLElement
  }
  return originalCreateElement(tagName)
})

// Test data factories
const createMockSession = (overrides?: Partial<ExternalSession>): ExternalSession => ({
  id: 'session-123',
  projectName: 'test-project',
  projectPath: '/path/to/project',
  transcriptPath: '/path/to/transcript.jsonl',
  startTime: Date.now() - 3600000,
  lastActivity: Date.now() - 1800000,
  stats: {
    messageCount: 10,
    tokenCount: 5000,
    duration: 3600000,
  },
  status: 'completed',
  ...overrides,
})

const createMockMessage = (overrides?: Partial<SessionMessage>): SessionMessage => ({
  uuid: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'user',
  timestamp: Date.now(),
  content: 'Test message content',
  ...overrides,
})

describe('TranscriptViewer', () => {
  let mockSession: ExternalSession
  let mockMessages: SessionMessage[]

  beforeEach(() => {
    vi.clearAllMocks()
    mockSession = createMockSession()
    mockMessages = [
      createMockMessage({
        uuid: 'msg-1',
        type: 'user',
        content: 'Hello, can you help me?',
        timestamp: Date.now() - 300000,
      }),
      createMockMessage({
        uuid: 'msg-2',
        type: 'assistant',
        content: 'Of course! How can I assist you today?',
        timestamp: Date.now() - 290000,
        usage: { input_tokens: 10, output_tokens: 15, cache_read_input_tokens: 5 },
      }),
      createMockMessage({
        uuid: 'msg-3',
        type: 'tool-result',
        toolName: 'Read',
        toolInput: { file_path: '/test/file.txt' },
        toolOutput: 'File contents here\nLine 2\nLine 3',
        timestamp: Date.now() - 280000,
        usage: { input_tokens: 5, output_tokens: 50, cache_read_input_tokens: 0 },
      }),
    ]
    mockFetchMessages.mockResolvedValue(mockMessages)
    mockClipboardWriteText.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===========================================================================
  // LOADING STATE
  // ===========================================================================
  describe('loading state', () => {
    it('renders loading spinner initially', () => {
      // Keep promise pending
      mockFetchMessages.mockReturnValue(new Promise(() => {}))

      render(<TranscriptViewer session={mockSession} />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeTruthy()
    })

    it('removes loading spinner after messages load', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin')
        expect(spinner).toBeFalsy()
      })
    })
  })

  // ===========================================================================
  // HEADER
  // ===========================================================================
  describe('header', () => {
    it('displays session project name', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('test-project')).toBeInTheDocument()
      })
    })

    it('displays Session Transcript title', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Session Transcript')).toBeInTheDocument()
      })
    })

    it('displays message count', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
      })
    })

    it('displays token statistics', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText(/Input: 15 tokens/)).toBeInTheDocument()
        expect(screen.getByText(/Output: 65 tokens/)).toBeInTheDocument()
        expect(screen.getByText(/Cached: 5 tokens/)).toBeInTheDocument()
      })
    })

    it('hides cached tokens when count is zero', async () => {
      mockMessages = [
        createMockMessage({
          uuid: 'msg-1',
          type: 'assistant',
          content: 'Response',
          usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0 },
        }),
      ]
      mockFetchMessages.mockResolvedValue(mockMessages)

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.queryByText(/Cached:/)).not.toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // MESSAGE DISPLAY
  // ===========================================================================
  describe('message display', () => {
    it('renders user messages with correct styling', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('User')).toBeInTheDocument()
        expect(screen.getByText('Hello, can you help me?')).toBeInTheDocument()
      })
    })

    it('renders assistant messages with correct styling', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Assistant')).toBeInTheDocument()
        expect(screen.getByText('Of course! How can I assist you today?')).toBeInTheDocument()
      })
    })

    it('renders tool result messages with tool name', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Tool Result')).toBeInTheDocument()
        expect(screen.getByText('Read')).toBeInTheDocument()
      })
    })

    it('displays timestamps for each message', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        // Check that timestamps are present (format varies by locale)
        const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/)
        expect(timeElements.length).toBeGreaterThanOrEqual(3)
      })
    })

    it('displays token count for messages with usage', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        // Assistant message: 10 + 15 = 25 tokens
        expect(screen.getByText('25 tokens')).toBeInTheDocument()
        // Tool result: 5 + 50 = 55 tokens
        expect(screen.getByText('55 tokens')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // TOOL INPUT EXPANSION
  // ===========================================================================
  describe('tool input expansion', () => {
    it('shows Input button for tool results with input', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Input')).toBeInTheDocument()
      })
    })

    it('toggles tool input visibility when clicked', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Input')).toBeInTheDocument()
      })

      // Input should not be visible initially
      expect(screen.queryByText('file_path')).not.toBeInTheDocument()

      // Click to expand
      fireEvent.click(screen.getByText('Input'))

      // Input should now be visible
      await waitFor(() => {
        expect(screen.getByText(/file_path/)).toBeInTheDocument()
      })

      // Click to collapse
      fireEvent.click(screen.getByText('Input'))

      await waitFor(() => {
        expect(screen.queryByText(/file_path/)).not.toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // MESSAGE TRUNCATION
  // ===========================================================================
  describe('message truncation', () => {
    it('truncates long messages and shows expand button', async () => {
      const longContent = 'A'.repeat(2500)
      mockMessages = [
        createMockMessage({
          uuid: 'msg-long',
          type: 'assistant',
          content: longContent,
        }),
      ]
      mockFetchMessages.mockResolvedValue(mockMessages)

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText(/Show full message/)).toBeInTheDocument()
      })
    })

    it('expands message when expand button is clicked', async () => {
      const longContent = 'A'.repeat(2500)
      mockMessages = [
        createMockMessage({
          uuid: 'msg-long',
          type: 'assistant',
          content: longContent,
        }),
      ]
      mockFetchMessages.mockResolvedValue(mockMessages)

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText(/Show full message/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Show full message/))

      await waitFor(() => {
        expect(screen.getByText(/Show less/)).toBeInTheDocument()
      })
    })

    it('truncates long tool output and shows expand button', async () => {
      const longOutput = 'B'.repeat(2000)
      mockMessages = [
        createMockMessage({
          uuid: 'msg-tool-long',
          type: 'tool-result',
          toolName: 'Read',
          toolOutput: longOutput,
        }),
      ]
      mockFetchMessages.mockResolvedValue(mockMessages)

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText(/Show full output/)).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // SEARCH
  // ===========================================================================
  describe('search', () => {
    it('renders search input', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search messages...')).toBeInTheDocument()
      })
    })

    it('filters messages by content', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search messages...')
      fireEvent.change(searchInput, { target: { value: 'assist' } })

      await waitFor(() => {
        expect(screen.getByText('1 messages')).toBeInTheDocument()
      })
    })

    it('filters messages by tool name', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search messages...')
      fireEvent.change(searchInput, { target: { value: 'Read' } })

      await waitFor(() => {
        expect(screen.getByText('1 messages')).toBeInTheDocument()
      })
    })

    it('shows no results message when search has no matches', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search messages...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent-query-xyz' } })

      await waitFor(() => {
        expect(screen.getByText('No messages match your search')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // TOOL FILTER
  // ===========================================================================
  describe('tool filter', () => {
    it('renders Tools toggle button', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Tools')).toBeInTheDocument()
      })
    })

    it('hides tool results when toggle is clicked', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
      })

      // Initially tool results are shown
      expect(screen.getByText('Tool Result')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Tools'))

      await waitFor(() => {
        expect(screen.getByText('2 messages')).toBeInTheDocument()
        expect(screen.queryByText('Tool Result')).not.toBeInTheDocument()
      })
    })

    it('shows tool results when toggle is clicked again', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
      })

      // Toggle off
      fireEvent.click(screen.getByText('Tools'))

      await waitFor(() => {
        expect(screen.getByText('2 messages')).toBeInTheDocument()
      })

      // Toggle on
      fireEvent.click(screen.getByText('Tools'))

      await waitFor(() => {
        expect(screen.getByText('3 messages')).toBeInTheDocument()
        expect(screen.getByText('Tool Result')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // COPY TO CLIPBOARD
  // ===========================================================================
  describe('copy to clipboard', () => {
    it('copies message content when copy button is clicked', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Hello, can you help me?')).toBeInTheDocument()
      })

      // Find copy buttons (there should be one per message)
      const copyButtons = screen.getAllByRole('button').filter((btn) => {
        const svg = btn.querySelector('svg')
        return svg && btn.querySelector('svg')?.classList?.contains('w-3')
      })

      // Click the first copy button
      fireEvent.click(copyButtons[0])

      expect(mockClipboardWriteText).toHaveBeenCalledWith('Hello, can you help me?')
    })

    it('shows check icon after copying', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Hello, can you help me?')).toBeInTheDocument()
      })

      // Get the message container and find its copy button
      const messageContainers = document.querySelectorAll('[class*="rounded-lg border"]')
      const firstMessage = messageContainers[0]
      const copyButton = firstMessage?.querySelector('button:last-of-type')

      if (copyButton) {
        fireEvent.click(copyButton)

        // Check icon should appear (has text-accent-green class)
        await waitFor(() => {
          const checkIcon = firstMessage.querySelector('.text-accent-green')
          expect(checkIcon).toBeTruthy()
        })
      }
    })
  })

  // ===========================================================================
  // EXPORT
  // ===========================================================================
  describe('export', () => {
    it('renders export button', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Export')).toBeInTheDocument()
      })
    })

    it('creates markdown file when export is clicked', async () => {
      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Export')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Export'))

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('displays error message when loading fails', async () => {
      mockFetchMessages.mockRejectedValue(new Error('Failed to load'))

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // EMPTY STATE
  // ===========================================================================
  describe('empty state', () => {
    it('displays empty state when no messages', async () => {
      mockFetchMessages.mockResolvedValue([])

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('No messages in this session')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // UNKNOWN MESSAGE TYPES
  // ===========================================================================
  describe('unknown message types', () => {
    it('skips rendering unknown message types', async () => {
      mockMessages = [
        createMockMessage({
          uuid: 'msg-1',
          type: 'user',
          content: 'Known message',
        }),
        createMockMessage({
          uuid: 'msg-unknown',
          type: 'unknown-type' as SessionMessage['type'],
          content: 'Unknown message',
        }),
      ]
      mockFetchMessages.mockResolvedValue(mockMessages)

      render(<TranscriptViewer session={mockSession} />)

      await waitFor(() => {
        expect(screen.getByText('Known message')).toBeInTheDocument()
        expect(screen.queryByText('Unknown message')).not.toBeInTheDocument()
      })
    })
  })
})

// ===========================================================================
// TRANSCRIPT VIEWER PAGE TESTS
// ===========================================================================
describe('TranscriptViewerPage', () => {
  let mockSessions: ExternalSession[]

  beforeEach(() => {
    vi.clearAllMocks()
    mockSessions = [
      createMockSession({ id: 'session-1', projectName: 'Project Alpha' }),
      createMockSession({ id: 'session-2', projectName: 'Project Beta' }),
      createMockSession({ id: 'session-3', projectName: 'Project Gamma' }),
    ]
    mockFetchSessions.mockResolvedValue(mockSessions)
    mockFetchMessages.mockResolvedValue([])
  })

  // ===========================================================================
  // LOADING STATE
  // ===========================================================================
  describe('loading state', () => {
    it('renders loading spinner initially', () => {
      mockFetchSessions.mockReturnValue(new Promise(() => {}))

      render(<TranscriptViewerPage />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeTruthy()
    })
  })

  // ===========================================================================
  // SESSION LIST
  // ===========================================================================
  describe('session list', () => {
    it('displays Session Transcripts title', async () => {
      render(<TranscriptViewerPage />)

      await waitFor(() => {
        expect(screen.getByText('Session Transcripts')).toBeInTheDocument()
      })
    })

    it('renders session buttons for each session', async () => {
      render(<TranscriptViewerPage />)

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument()
        expect(screen.getByText('Project Beta')).toBeInTheDocument()
        expect(screen.getByText('Project Gamma')).toBeInTheDocument()
      })
    })

    it('displays message count for each session', async () => {
      render(<TranscriptViewerPage />)

      await waitFor(() => {
        const messageCountElements = screen.getAllByText(/10 messages/)
        expect(messageCountElements.length).toBe(3)
      })
    })
  })

  // ===========================================================================
  // SESSION SELECTION
  // ===========================================================================
  describe('session selection', () => {
    it('shows transcript viewer when session is clicked', async () => {
      render(<TranscriptViewerPage />)

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Project Alpha'))

      await waitFor(() => {
        expect(screen.getByText('Session Transcript')).toBeInTheDocument()
        expect(screen.getByText('← Back to sessions')).toBeInTheDocument()
      })
    })

    it('returns to session list when back button is clicked', async () => {
      render(<TranscriptViewerPage />)

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Project Alpha'))

      await waitFor(() => {
        expect(screen.getByText('← Back to sessions')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('← Back to sessions'))

      await waitFor(() => {
        expect(screen.getByText('Session Transcripts')).toBeInTheDocument()
        expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('handles error gracefully when loading sessions fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockFetchSessions.mockRejectedValue(new Error('Failed to load sessions'))

      render(<TranscriptViewerPage />)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load sessions:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })
})
