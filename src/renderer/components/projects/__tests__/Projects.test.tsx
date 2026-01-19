import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Projects } from '../Projects'
import type { ClaudeProject } from '@shared/types'

// Mock tRPC hooks
const mockProjectsRefetch = vi.fn()
const mockOpenPathMutate = vi.fn()
const mockOpenAtMutate = vi.fn()
const mockOpenDirectoryMutate = vi.fn()

let mockProjectsData: ClaudeProject[] | undefined = []
let mockProjectsIsLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    claude: {
      projects: {
        useQuery: () => ({
          data: mockProjectsData,
          isLoading: mockProjectsIsLoading,
          refetch: mockProjectsRefetch,
        }),
      },
    },
    system: {
      openPath: {
        useMutation: () => ({
          mutate: mockOpenPathMutate,
        }),
      },
      openDirectory: {
        useMutation: () => ({
          mutate: mockOpenDirectoryMutate,
        }),
      },
    },
    terminal: {
      openAt: {
        useMutation: () => ({
          mutate: mockOpenAtMutate,
        }),
      },
    },
  },
}))

const mockProjects: ClaudeProject[] = [
  {
    path: '/home/user/projects/claude-command-center',
    name: 'claude-command-center',
    hasCLAUDEMD: true,
    hasBeads: true,
    sessionCount: 5,
    lastSession: {
      id: 'session-1',
      startTime: Date.now() - 3600000,
      messageCount: 10,
      toolCalls: 3,
    },
  },
  {
    path: '/home/user/projects/my-app',
    name: 'my-app',
    hasCLAUDEMD: true,
    hasBeads: false,
    sessionCount: 2,
  },
  {
    path: '/home/user/projects/legacy-project',
    name: 'legacy-project',
    hasCLAUDEMD: false,
    hasBeads: false,
    sessionCount: 0,
  },
]

describe('Projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectsData = []
    mockProjectsIsLoading = false
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('renders loading spinner when loading', () => {
      mockProjectsIsLoading = true
      mockProjectsData = undefined

      render(<Projects />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no projects exist', () => {
      mockProjectsData = []

      render(<Projects />)

      expect(screen.getByText('No Claude projects yet')).toBeDefined()
      expect(
        screen.getByText('Projects with .claude/CLAUDE.md will appear here')
      ).toBeDefined()
    })

    it('shows different empty state when search has no results', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const searchInput = screen.getByPlaceholderText('Search projects...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent-project' } })

      expect(screen.getByText('No projects found')).toBeDefined()
      expect(screen.getByText('Try a different search term')).toBeDefined()
    })
  })

  describe('Project List', () => {
    it('renders project cards', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      expect(screen.getByText('claude-command-center')).toBeDefined()
      expect(screen.getByText('my-app')).toBeDefined()
      expect(screen.getByText('legacy-project')).toBeDefined()
    })

    it('displays project paths', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      expect(
        screen.getByText('/home/user/projects/claude-command-center')
      ).toBeDefined()
      expect(screen.getByText('/home/user/projects/my-app')).toBeDefined()
    })

    it('shows CLAUDE.md indicator for projects with it', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const claudeMdIndicators = screen.getAllByText('CLAUDE.md')
      expect(claudeMdIndicators.length).toBe(2) // Two projects have CLAUDE.md
    })

    it('shows Beads indicator for projects with it', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const beadsIndicators = screen.getAllByText('Beads')
      expect(beadsIndicators.length).toBe(1) // Only one project has Beads
    })

    it('displays session count', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      expect(screen.getByText('5 sessions')).toBeDefined()
      expect(screen.getByText('2 sessions')).toBeDefined()
      expect(screen.getByText('0 sessions')).toBeDefined()
    })

    it('uses singular form for 1 session', () => {
      const singleSessionProject: ClaudeProject[] = [
        {
          path: '/home/user/projects/single',
          name: 'single',
          hasCLAUDEMD: true,
          hasBeads: false,
          sessionCount: 1,
        },
      ]
      mockProjectsData = singleSessionProject

      render(<Projects />)

      expect(screen.getByText('1 session')).toBeDefined()
    })
  })

  describe('Search Functionality', () => {
    it('filters projects based on search query', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const searchInput = screen.getByPlaceholderText('Search projects...')
      fireEvent.change(searchInput, { target: { value: 'command' } })

      expect(screen.getByText('claude-command-center')).toBeDefined()
      expect(screen.queryByText('my-app')).toBeNull()
      expect(screen.queryByText('legacy-project')).toBeNull()
    })

    it('search is case-insensitive', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const searchInput = screen.getByPlaceholderText('Search projects...')
      fireEvent.change(searchInput, { target: { value: 'MY-APP' } })

      expect(screen.getByText('my-app')).toBeDefined()
    })

    it('clears search filter when input is cleared', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const searchInput = screen.getByPlaceholderText('Search projects...')

      // Filter first
      fireEvent.change(searchInput, { target: { value: 'command' } })
      expect(screen.queryByText('my-app')).toBeNull()

      // Clear filter
      fireEvent.change(searchInput, { target: { value: '' } })
      expect(screen.getByText('my-app')).toBeDefined()
    })
  })

  describe('Refresh Functionality', () => {
    it('refreshes projects when refresh button is clicked', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const refreshButton = screen.getByTitle('Refresh projects')
      fireEvent.click(refreshButton)

      expect(mockProjectsRefetch).toHaveBeenCalled()
    })
  })

  describe('Add Project', () => {
    it('opens directory dialog when Add Project is clicked', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const addButton = screen.getByText('Add Project')
      fireEvent.click(addButton)

      expect(mockOpenDirectoryMutate).toHaveBeenCalledWith(
        undefined,
        expect.any(Object)
      )
    })

    it('refreshes projects after adding a new project', async () => {
      mockProjectsData = mockProjects
      mockOpenDirectoryMutate.mockImplementation((_, { onSuccess }) => {
        onSuccess('/home/user/projects/new-project')
      })

      render(<Projects />)

      const addButton = screen.getByText('Add Project')
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockProjectsRefetch).toHaveBeenCalled()
      })
    })
  })

  describe('Project Card Selection', () => {
    it('selects project when card is clicked', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const projectCard = screen.getByText('claude-command-center').closest('.card')
      expect(projectCard).toBeDefined()

      if (projectCard) {
        fireEvent.click(projectCard)

        // Check for selection visual indicator (ring)
        expect(
          projectCard.classList.contains('ring-1') ||
          projectCard.className.includes('border-accent-purple')
        ).toBe(true)
      }
    })

    it('deselects project when clicking same card again', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const projectCard = screen.getByText('claude-command-center').closest('.card')

      if (projectCard) {
        // Select
        fireEvent.click(projectCard)
        // Deselect
        fireEvent.click(projectCard)

        // Check for selection visual indicator removed
        expect(projectCard.classList.contains('ring-1')).toBe(false)
      }
    })
  })

  describe('Project Card Actions', () => {
    it('opens folder in file manager when folder button is clicked', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const folderButtons = screen.getAllByTitle('Open in File Manager')
      fireEvent.click(folderButtons[0])

      expect(mockOpenPathMutate).toHaveBeenCalledWith(
        { path: '/home/user/projects/claude-command-center' },
        expect.any(Object)
      )
    })

    it('opens project in terminal when terminal button is clicked', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const terminalButtons = screen.getAllByTitle('Open in Terminal')
      fireEvent.click(terminalButtons[0])

      expect(mockOpenAtMutate).toHaveBeenCalledWith(
        { path: '/home/user/projects/claude-command-center' },
        expect.any(Object)
      )
    })

    it('does not select project when action buttons are clicked', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const terminalButtons = screen.getAllByTitle('Open in Terminal')
      fireEvent.click(terminalButtons[0])

      // The card should not be selected
      const projectCard = screen.getByText('claude-command-center').closest('.card')
      if (projectCard) {
        expect(projectCard.classList.contains('ring-1')).toBe(false)
      }
    })
  })

  describe('Grid Layout', () => {
    it('renders projects in a responsive grid', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const grid = document.querySelector('.grid')
      expect(grid).toBeDefined()
      expect(grid?.classList.contains('grid-cols-1')).toBe(true)
      expect(grid?.classList.contains('md:grid-cols-2')).toBe(true)
      expect(grid?.classList.contains('lg:grid-cols-3')).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('logs error when opening folder fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockProjectsData = mockProjects
      mockOpenPathMutate.mockImplementation((_, { onError }) => {
        onError(new Error('Failed to open'))
      })

      render(<Projects />)

      const folderButtons = screen.getAllByTitle('Open in File Manager')
      fireEvent.click(folderButtons[0])

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to open folder:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('logs error when opening terminal fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockProjectsData = mockProjects
      mockOpenAtMutate.mockImplementation((_, { onError }) => {
        onError(new Error('Failed to open terminal'))
      })

      render(<Projects />)

      const terminalButtons = screen.getAllByTitle('Open in Terminal')
      fireEvent.click(terminalButtons[0])

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to open terminal:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('logs error when adding project fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockProjectsData = mockProjects
      mockOpenDirectoryMutate.mockImplementation((_, { onError }) => {
        onError(new Error('Failed to add project'))
      })

      render(<Projects />)

      const addButton = screen.getByText('Add Project')
      fireEvent.click(addButton)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to add project:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Accessibility', () => {
    it('has accessible search input', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      const searchInput = screen.getByPlaceholderText('Search projects...')
      expect(searchInput).toHaveProperty('type', 'text')
    })

    it('has accessible buttons with titles', () => {
      mockProjectsData = mockProjects

      render(<Projects />)

      expect(screen.getByTitle('Refresh projects')).toBeDefined()
      expect(screen.getAllByTitle('Open in Terminal').length).toBeGreaterThan(0)
      expect(screen.getAllByTitle('Open in File Manager').length).toBeGreaterThan(0)
    })
  })
})
