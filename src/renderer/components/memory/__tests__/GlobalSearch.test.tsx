import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GlobalSearch } from '../GlobalSearch'

// Mock tRPC
const mockUnifiedSearchFetch = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      memory: {
        unifiedSearch: { fetch: mockUnifiedSearchFetch },
      },
    }),
  },
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Search: ({ className }: { className?: string }) => (
    <span data-testid="search-icon" className={className}>Search</span>
  ),
  Database: ({ className }: { className?: string }) => (
    <span data-testid="database-icon" className={className}>Database</span>
  ),
  Layers: ({ className }: { className?: string }) => (
    <span data-testid="layers-icon" className={className}>Layers</span>
  ),
  Brain: ({ className }: { className?: string }) => (
    <span data-testid="brain-icon" className={className}>Brain</span>
  ),
  Clock: ({ className }: { className?: string }) => (
    <span data-testid="clock-icon" className={className}>Clock</span>
  ),
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="loader-icon" className={className}>Loader2</span>
  ),
  Copy: ({ className }: { className?: string }) => (
    <span data-testid="copy-icon" className={className}>Copy</span>
  ),
  Check: ({ className }: { className?: string }) => (
    <span data-testid="check-icon" className={className}>Check</span>
  ),
  Filter: ({ className }: { className?: string }) => (
    <span data-testid="filter-icon" className={className}>Filter</span>
  ),
  X: ({ className }: { className?: string }) => (
    <span data-testid="x-icon" className={className}>X</span>
  ),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock clipboard
const clipboardMock = {
  writeText: vi.fn().mockResolvedValue(undefined),
}
Object.defineProperty(navigator, 'clipboard', { value: clipboardMock })

const mockSearchResponse = {
  results: [
    {
      id: 'result-1',
      source: 'postgresql' as const,
      title: 'Learning about React hooks',
      content: 'React hooks are a way to use state in functional components...',
      score: 0.95,
      metadata: { category: 'frontend', date: '2024-01-15' },
    },
    {
      id: 'result-2',
      source: 'memgraph' as const,
      title: 'SQL Injection Technique',
      content: 'SQL injection is a code injection technique...',
      score: 0.88,
      metadata: { type: 'Technique' },
    },
    {
      id: 'result-3',
      source: 'qdrant' as const,
      title: 'Memory about project setup',
      content: 'Setup instructions for the new project...',
      score: 0.75,
      metadata: {},
    },
  ],
  stats: {
    postgresql: 10,
    memgraph: 5,
    qdrant: 8,
    totalTime: 150,
  },
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    mockUnifiedSearchFetch.mockResolvedValue(mockSearchResponse)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial Rendering', () => {
    it('renders search header with title and description', () => {
      render(<GlobalSearch />)

      expect(screen.getByText('Global Memory Search')).toBeDefined()
      expect(
        screen.getByText(
          'Search across all memory systems: learnings, knowledge graph, and vector memories'
        )
      ).toBeDefined()
    })

    it('renders search input field', () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText(
        'Search memories, learnings, and knowledge...'
      )
      expect(input).toBeDefined()
    })

    it('renders search button', () => {
      render(<GlobalSearch />)

      const searchButtons = screen.getAllByText('Search')
      // Find the button element (not the icon)
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')
      expect(searchButton).toBeDefined()
    })

    it('renders source filter buttons', () => {
      render(<GlobalSearch />)

      expect(screen.getByText('PostgreSQL')).toBeDefined()
      expect(screen.getByText('Memgraph')).toBeDefined()
      expect(screen.getByText('Qdrant')).toBeDefined()
    })

    it('has all sources selected by default', () => {
      render(<GlobalSearch />)

      const postgresButton = screen.getByText('PostgreSQL')
      const memgraphButton = screen.getByText('Memgraph')
      const qdrantButton = screen.getByText('Qdrant')

      // Check buttons have active styling (bgColor class)
      expect(postgresButton.closest('button')?.className).toContain('bg-accent-blue')
      expect(memgraphButton.closest('button')?.className).toContain('bg-accent-purple')
      expect(qdrantButton.closest('button')?.className).toContain('bg-accent-green')
    })
  })

  describe('Search Execution', () => {
    it('executes search when Search button is clicked', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'react hooks' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(mockUnifiedSearchFetch).toHaveBeenCalledWith({
          query: 'react hooks',
          limit: 50,
        })
      })
    })

    it('executes search when Enter key is pressed', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'sql injection' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockUnifiedSearchFetch).toHaveBeenCalledWith({
          query: 'sql injection',
          limit: 50,
        })
      })
    })

    it('does not execute search with empty query', async () => {
      render(<GlobalSearch />)

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      expect(mockUnifiedSearchFetch).not.toHaveBeenCalled()
    })

    it('disables search button when query is empty', () => {
      render(<GlobalSearch />)

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      expect(searchButton).toHaveProperty('disabled', true)
    })

    it('enables search button when query has content', () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      expect(searchButton).toHaveProperty('disabled', false)
    })
  })

  describe('Loading State', () => {
    it('shows loading indicator while searching', async () => {
      mockUnifiedSearchFetch.mockImplementation(() => new Promise(() => {}))

      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByTestId('loader-icon')).toBeDefined()
      })
    })

    it('disables search button while loading', async () => {
      mockUnifiedSearchFetch.mockImplementation(() => new Promise(() => {}))

      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(searchButton).toHaveProperty('disabled', true)
      })
    })
  })

  describe('Search Results', () => {
    it('displays search results', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'react' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
        expect(screen.getByText('SQL Injection Technique')).toBeDefined()
        expect(screen.getByText('Memory about project setup')).toBeDefined()
      })
    })

    it('displays search statistics', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText(/Found 3 results in 150ms/)).toBeDefined()
      })
    })

    it('displays source counts in stats', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        // There will be multiple PostgreSQL texts (filter button + stats)
        const postgresStats = screen.getAllByText(/PostgreSQL.*10|10/i)
        expect(postgresStats.length).toBeGreaterThan(0)
      })
    })

    it('displays result scores as percentages', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'react' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Score: 95%')).toBeDefined()
        expect(screen.getByText('Score: 88%')).toBeDefined()
        expect(screen.getByText('Score: 75%')).toBeDefined()
      })
    })

    it('displays result metadata when available', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'react' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('category: frontend')).toBeDefined()
      })
    })
  })

  describe('Source Filtering', () => {
    it('toggles source filter when clicked', async () => {
      render(<GlobalSearch />)

      const postgresButton = screen.getByText('PostgreSQL').closest('button')!
      fireEvent.click(postgresButton)

      // Button should now be inactive (no accent color)
      expect(postgresButton.className).not.toContain('bg-accent-blue')
    })

    it('keeps at least one source selected', async () => {
      render(<GlobalSearch />)

      // Deselect two sources
      const memgraphButton = screen.getByText('Memgraph').closest('button')!
      const qdrantButton = screen.getByText('Qdrant').closest('button')!

      fireEvent.click(memgraphButton)
      fireEvent.click(qdrantButton)

      // Try to deselect the last one
      const postgresButton = screen.getByText('PostgreSQL').closest('button')!
      fireEvent.click(postgresButton)

      // Should still have postgresql selected (cannot deselect last source)
      expect(postgresButton.className).toContain('bg-accent-blue')
    })

    it('filters results based on selected sources', async () => {
      render(<GlobalSearch />)

      // Deselect memgraph and qdrant
      const memgraphButton = screen.getByText('Memgraph').closest('button')!
      const qdrantButton = screen.getByText('Qdrant').closest('button')!
      fireEvent.click(memgraphButton)
      fireEvent.click(qdrantButton)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        // Only PostgreSQL result should be shown
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
        // Memgraph and Qdrant results should be filtered out
        expect(screen.queryByText('SQL Injection Technique')).toBeNull()
        expect(screen.queryByText('Memory about project setup')).toBeNull()
      })
    })
  })

  describe('Error Handling', () => {
    it('displays error message when search fails', async () => {
      mockUnifiedSearchFetch.mockRejectedValue(new Error('Search service unavailable'))

      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Search service unavailable')).toBeDefined()
      })
    })

    it('clears results on error', async () => {
      // First successful search
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      let searchButtons = screen.getAllByText('Search')
      let searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
      })

      // Now search fails
      mockUnifiedSearchFetch.mockRejectedValue(new Error('Network error'))

      fireEvent.change(input, { target: { value: 'another test' } })

      searchButtons = screen.getAllByText('Search')
      searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.queryByText('Learning about React hooks')).toBeNull()
      })
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no results found', async () => {
      mockUnifiedSearchFetch.mockResolvedValue({
        results: [],
        stats: { postgresql: 0, memgraph: 0, qdrant: 0, totalTime: 50 },
      })

      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'nonexistent' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        // Component uses &ldquo; and &rdquo; for smart quotes
        expect(screen.getByText(/No results found for/)).toBeDefined()
        expect(screen.getByText('Try different keywords or sources')).toBeDefined()
      })
    })
  })

  describe('Recent Searches', () => {
    it('loads recent searches from localStorage', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['previous search 1', 'previous search 2']))

      render(<GlobalSearch />)

      expect(screen.getByText('Recent searches')).toBeDefined()
      expect(screen.getByText('previous search 1')).toBeDefined()
      expect(screen.getByText('previous search 2')).toBeDefined()
    })

    it('saves search to recent searches', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'new search' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'claude-pilot-recent-searches',
          expect.stringContaining('new search')
        )
      })
    })

    it('executes recent search when clicked', async () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['previous search']))

      render(<GlobalSearch />)

      const recentSearchButton = screen.getByText('previous search')
      fireEvent.click(recentSearchButton)

      await waitFor(() => {
        expect(mockUnifiedSearchFetch).toHaveBeenCalledWith({
          query: 'previous search',
          limit: 50,
        })
      })
    })

    it('hides recent searches when results are displayed', async () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(['previous search']))

      render(<GlobalSearch />)

      expect(screen.getByText('Recent searches')).toBeDefined()

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
      })

      expect(screen.queryByText('Recent searches')).toBeNull()
    })
  })

  describe('Clear Search', () => {
    it('shows clear button when query has content', () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      expect(screen.getByTestId('x-icon')).toBeDefined()
    })

    it('clears search when clear button is clicked', async () => {
      render(<GlobalSearch />)

      // Perform search first
      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
      })

      // Click clear
      const clearButton = screen.getByTestId('x-icon').closest('button')!
      fireEvent.click(clearButton)

      // Query and results should be cleared
      expect((input as HTMLInputElement).value).toBe('')
      expect(screen.queryByText('Learning about React hooks')).toBeNull()
    })
  })

  describe('Copy to Clipboard', () => {
    it('copies content to clipboard when copy button is clicked', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
      })

      const copyButtons = screen.getAllByTestId('copy-icon')
      fireEvent.click(copyButtons[0].closest('button')!)

      expect(clipboardMock.writeText).toHaveBeenCalledWith(
        'React hooks are a way to use state in functional components...'
      )
    })

    it('shows check icon after copying', async () => {
      render(<GlobalSearch />)

      const input = screen.getByPlaceholderText('Search memories, learnings, and knowledge...')
      fireEvent.change(input, { target: { value: 'test' } })

      const searchButtons = screen.getAllByText('Search')
      const searchButton = searchButtons.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Learning about React hooks')).toBeDefined()
      })

      const copyButtons = screen.getAllByTestId('copy-icon')
      fireEvent.click(copyButtons[0].closest('button')!)

      await waitFor(() => {
        expect(screen.getByTestId('check-icon')).toBeDefined()
      })
    })
  })
})
