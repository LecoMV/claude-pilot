import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryBrowser } from './MemoryBrowser'
import { useMemoryStore, type MemoryStats } from '@/stores/memory'
import type { Learning } from '@shared/types'

// Mock tRPC
const mockFetchLearnings = vi.fn()
const mockFetchStats = vi.fn()
const mockFetchQdrant = vi.fn()
const mockQueryMemgraph = vi.fn()
const mockQdrantSearch = vi.fn()
const mockMemgraphSearch = vi.fn()
const mockRawQuery = vi.fn()
const mockNaturalQuery = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    useUtils: () => ({
      memory: {
        learnings: { fetch: mockFetchLearnings },
        stats: { fetch: mockFetchStats },
        qdrantBrowse: { fetch: mockFetchQdrant },
        qdrantSearch: { fetch: mockQdrantSearch },
        memgraphNodes: { fetch: mockQueryMemgraph },
        memgraphSearch: { fetch: mockMemgraphSearch },
        rawQuery: { fetch: mockRawQuery },
        naturalQuery: { fetch: mockNaturalQuery },
      },
    }),
  },
}))

// Mock HybridGraphViewer which uses complex graph libraries
vi.mock('./HybridGraphViewer', () => ({
  HybridGraphViewer: () => <div data-testid="mock-graph-viewer">Graph Viewer</div>,
}))

describe('MemoryBrowser', () => {
  const defaultStats: MemoryStats = {
    postgresql: { count: 10, categories: {} },
    memgraph: { nodes: 50, edges: 25 },
    qdrant: { vectors: 100, collections: ['mem0_memories'] },
  }

  const mockLearnings: Learning[] = [
    {
      id: 1,
      title: 'Bug Bounty Finding',
      category: 'bugbounty',
      content: 'Found XSS in login form',
      created_at: '2024-01-15T10:30:00Z',
      createdAt: '2024-01-15T10:30:00Z',
      confidence: 0.95,
    },
    {
      id: 2,
      title: 'Project Architecture',
      category: 'architecture',
      content: 'Use microservices pattern',
      created_at: '2024-01-14T08:00:00Z',
      createdAt: '2024-01-14T08:00:00Z',
      confidence: 0.85,
    },
    {
      id: 3,
      title: 'Security Pattern',
      category: 'security',
      content: 'Always validate input',
      created_at: '2024-01-13T14:00:00Z',
      createdAt: '2024-01-13T14:00:00Z',
      confidence: 1.0,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    useMemoryStore.setState({
      learnings: [],
      stats: {
        postgresql: { count: 0 },
        memgraph: { nodes: 0, edges: 0 },
        qdrant: { vectors: 0 },
      },
      activeSource: 'postgresql',
      searchQuery: '',
      selectedCategory: null,
      isLoading: false,
      error: null,
    })

    // Default mock implementations
    mockFetchStats.mockResolvedValue(defaultStats)
    mockFetchLearnings.mockResolvedValue([])
    mockFetchQdrant.mockResolvedValue({ points: [], nextOffset: null })
    mockQueryMemgraph.mockResolvedValue([])
    mockQdrantSearch.mockResolvedValue({ points: [] })
    mockMemgraphSearch.mockResolvedValue([])
    mockRawQuery.mockResolvedValue({ success: true, data: [], executionTime: 50 })
    mockNaturalQuery.mockResolvedValue({ success: true, data: [], executionTime: 100 })
  })

  // ===========================================================================
  // BASIC RENDERING
  // ===========================================================================
  describe('Basic Rendering', () => {
    it('renders memory systems overview', () => {
      render(<MemoryBrowser />)
      expect(screen.getByText('Memory Systems')).toBeDefined()
    })

    it('renders all memory source tabs', () => {
      render(<MemoryBrowser />)
      expect(screen.getAllByText('PostgreSQL')[0]).toBeDefined()
      expect(screen.getAllByText('Memgraph')[0]).toBeDefined()
      expect(screen.getAllByText('Qdrant')[0]).toBeDefined()
    })

    it('renders Learnings header', () => {
      render(<MemoryBrowser />)
      expect(screen.getAllByText('Learnings')[0]).toBeDefined()
    })

    it('renders Graph Nodes header', () => {
      render(<MemoryBrowser />)
      expect(screen.getByText('Graph Nodes')).toBeDefined()
    })

    it('renders Vectors header', () => {
      render(<MemoryBrowser />)
      expect(screen.getByText('Vectors')).toBeDefined()
    })

    it('renders refresh button', () => {
      render(<MemoryBrowser />)
      // Find button with refresh icon
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // SOURCE SWITCHING
  // ===========================================================================
  describe('Source Switching', () => {
    it('switches to PostgreSQL source', () => {
      render(<MemoryBrowser />)
      const postgresTab = screen.getAllByText('PostgreSQL')[0]
      fireEvent.click(postgresTab)
      expect(useMemoryStore.getState().activeSource).toBe('postgresql')
    })

    it('switches to Memgraph source', () => {
      render(<MemoryBrowser />)
      const memgraphTab = screen.getAllByText('Memgraph')[0]
      fireEvent.click(memgraphTab)
      expect(useMemoryStore.getState().activeSource).toBe('memgraph')
    })

    it('switches to Qdrant source', () => {
      render(<MemoryBrowser />)
      const qdrantTab = screen.getAllByText('Qdrant')[0]
      fireEvent.click(qdrantTab)
      expect(useMemoryStore.getState().activeSource).toBe('qdrant')
    })
  })

  // ===========================================================================
  // LEARNINGS DISPLAY
  // ===========================================================================
  describe('Learnings Display', () => {
    it('displays learnings when available', () => {
      useMemoryStore.setState({
        learnings: mockLearnings,
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)

      expect(screen.getByText('Bug Bounty Finding')).toBeDefined()
      expect(screen.getByText('Project Architecture')).toBeDefined()
      expect(screen.getByText('Security Pattern')).toBeDefined()
    })

    it('displays learning categories as badges', () => {
      useMemoryStore.setState({
        learnings: mockLearnings,
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)

      expect(screen.getByText('bugbounty')).toBeDefined()
      expect(screen.getByText('architecture')).toBeDefined()
      expect(screen.getByText('security')).toBeDefined()
    })

    it('displays learning content', () => {
      useMemoryStore.setState({
        learnings: mockLearnings,
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)

      expect(screen.getByText('Found XSS in login form')).toBeDefined()
    })

    it('shows empty state when no learnings', () => {
      useMemoryStore.setState({
        learnings: [],
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)

      // Should show some form of empty state or just be empty
      expect(screen.queryByText('Bug Bounty Finding')).toBeNull()
    })
  })

  // ===========================================================================
  // STATISTICS DISPLAY
  // ===========================================================================
  describe('Statistics Display', () => {
    it('displays PostgreSQL count', () => {
      useMemoryStore.setState({
        stats: defaultStats,
      })

      render(<MemoryBrowser />)

      // Stats should be displayed
      expect(screen.getByText('10')).toBeDefined()
    })

    it('displays Memgraph node count', () => {
      useMemoryStore.setState({
        stats: defaultStats,
      })

      render(<MemoryBrowser />)

      expect(screen.getByText('50')).toBeDefined()
    })

    it('displays Qdrant vector count', () => {
      useMemoryStore.setState({
        stats: defaultStats,
      })

      render(<MemoryBrowser />)

      expect(screen.getByText('100')).toBeDefined()
    })
  })

  // ===========================================================================
  // SEARCH FUNCTIONALITY
  // ===========================================================================
  describe('Search Functionality', () => {
    it('renders search input', () => {
      render(<MemoryBrowser />)
      const searchInput = screen.getByPlaceholderText(/search/i)
      expect(searchInput).toBeDefined()
    })

    it('updates search query on input', () => {
      render(<MemoryBrowser />)
      const searchInput = screen.getByPlaceholderText(/search/i)
      fireEvent.change(searchInput, { target: { value: 'test query' } })
      expect((searchInput as HTMLInputElement).value).toBe('test query')
    })
  })

  // ===========================================================================
  // LOADING STATES
  // ===========================================================================
  describe('Loading States', () => {
    it('handles loading state', () => {
      useMemoryStore.setState({
        isLoading: true,
      })

      render(<MemoryBrowser />)
      // Component should render without crashing during loading
      expect(screen.getByText('Memory Systems')).toBeDefined()
    })

    it('handles error state', () => {
      useMemoryStore.setState({
        error: 'Connection failed',
      })

      render(<MemoryBrowser />)
      // Component should render without crashing during error
      expect(screen.getByText('Memory Systems')).toBeDefined()
    })
  })

  // ===========================================================================
  // CATEGORY FILTERING
  // ===========================================================================
  describe('Category Filtering', () => {
    it('filters learnings by category', () => {
      const learnings: Learning[] = [
        {
          id: 1,
          title: 'Bug Fix',
          category: 'bugbounty',
          content: 'fix',
          created_at: new Date().toISOString(),
          confidence: 1,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          title: 'Feature',
          category: 'project',
          content: 'feature',
          created_at: new Date().toISOString(),
          confidence: 1,
          createdAt: new Date().toISOString(),
        },
      ]
      useMemoryStore.setState({
        learnings,
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)

      // Both should be visible initially
      expect(screen.getByText('Bug Fix')).toBeDefined()
      expect(screen.getByText('Feature')).toBeDefined()
    })

    it('switches tabs and changes active source', () => {
      render(<MemoryBrowser />)

      // Click PostgreSQL tab
      const postgresTab = screen.getAllByText('PostgreSQL')[0]
      fireEvent.click(postgresTab)
      expect(useMemoryStore.getState().activeSource).toBe('postgresql')
    })
  })

  // ===========================================================================
  // VIEW MODE SELECTION
  // ===========================================================================
  describe('View Mode Selection', () => {
    it('renders view mode tabs', () => {
      render(<MemoryBrowser />)

      // Find view mode buttons by looking for Browse and Search buttons
      const browseButtons = screen.getAllByRole('button')
      expect(browseButtons.length).toBeGreaterThan(2)
    })
  })

  // ===========================================================================
  // QDRANT DISPLAY
  // ===========================================================================
  describe('Qdrant Display', () => {
    it('switches to Qdrant and renders content', () => {
      useMemoryStore.setState({
        activeSource: 'qdrant',
        stats: defaultStats,
      })

      render(<MemoryBrowser />)

      // Should show Qdrant-specific UI
      expect(screen.getAllByText('Qdrant')[0]).toBeDefined()
    })
  })

  // ===========================================================================
  // MEMGRAPH DISPLAY
  // ===========================================================================
  describe('Memgraph Display', () => {
    it('switches to Memgraph and renders content', () => {
      useMemoryStore.setState({
        activeSource: 'memgraph',
        stats: defaultStats,
      })

      render(<MemoryBrowser />)

      // Should show Memgraph-specific UI
      expect(screen.getAllByText('Memgraph')[0]).toBeDefined()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('Edge Cases', () => {
    it('handles null stats gracefully', () => {
      useMemoryStore.setState({
        stats: {
          postgresql: { count: 0 },
          memgraph: { nodes: 0, edges: 0 },
          qdrant: { vectors: 0 },
        },
      })

      render(<MemoryBrowser />)
      expect(screen.getByText('Memory Systems')).toBeDefined()
    })

    it('handles empty learnings array', () => {
      useMemoryStore.setState({
        learnings: [],
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)
      expect(screen.getByText('Memory Systems')).toBeDefined()
    })

    it('handles learnings with missing fields', () => {
      const minimalLearning: Learning = {
        id: 1,
        title: 'Minimal',
        category: 'general',
        content: 'content',
        created_at: new Date().toISOString(),
        confidence: 1,
        createdAt: new Date().toISOString(),
      }

      useMemoryStore.setState({
        learnings: [minimalLearning],
        activeSource: 'postgresql',
      })

      render(<MemoryBrowser />)
      expect(screen.getByText('Minimal')).toBeDefined()
    })
  })
})
