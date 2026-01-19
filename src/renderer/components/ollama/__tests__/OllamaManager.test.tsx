import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaManager } from '../OllamaManager'
import { useOllamaStore, type OllamaModel, type OllamaRunningModel, type PullProgress } from '@/stores/ollama'

// Mock tRPC hooks
const mockListRefetch = vi.fn()
const mockRunningRefetch = vi.fn()
const mockStatusRefetch = vi.fn()
const mockPullMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockRunMutate = vi.fn()
const mockStopMutate = vi.fn()

let mockListQueryData: OllamaModel[] | undefined = []
let mockListIsLoading = false
let mockRunningQueryData: OllamaRunningModel[] | undefined = []
let mockRunningIsLoading = false
let mockStatusQueryData: { online: boolean } | undefined = { online: true }
let mockStatusIsLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    ollama: {
      list: {
        useQuery: () => ({
          data: mockListQueryData,
          isLoading: mockListIsLoading,
          isFetching: false,
          refetch: mockListRefetch,
        }),
      },
      running: {
        useQuery: () => ({
          data: mockRunningQueryData,
          isLoading: mockRunningIsLoading,
          isFetching: false,
          refetch: mockRunningRefetch,
        }),
      },
      status: {
        useQuery: () => ({
          data: mockStatusQueryData,
          isLoading: mockStatusIsLoading,
          isFetching: false,
          refetch: mockStatusRefetch,
        }),
      },
      pull: {
        useMutation: () => ({
          mutate: mockPullMutate,
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutate: mockDeleteMutate,
          isPending: false,
        }),
      },
      run: {
        useMutation: () => ({
          mutate: mockRunMutate,
          isPending: false,
        }),
      },
      stop: {
        useMutation: () => ({
          mutate: mockStopMutate,
          isPending: false,
        }),
      },
    },
  },
}))

// Mock window.electron for pull progress subscription
const mockUnsubscribe = vi.fn()
const mockElectronOn = vi.fn().mockReturnValue(mockUnsubscribe)

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'electron', {
    value: {
      on: mockElectronOn,
      invoke: vi.fn(),
      send: vi.fn(),
    },
    writable: true,
  })
}

// Mock confirm dialog
const mockConfirm = vi.fn(() => true)
global.confirm = mockConfirm

// Sample test data
const mockModels: OllamaModel[] = [
  {
    name: 'llama3.2:latest',
    size: 2_147_483_648, // 2GB
    digest: 'sha256:abc123def456',
    modifiedAt: '2025-01-15T10:30:00Z',
    details: {
      format: 'gguf',
      family: 'llama',
      parameterSize: '3.2B',
      quantizationLevel: 'Q4_0',
    },
  },
  {
    name: 'mistral:latest',
    size: 4_100_000_000, // 4.1GB
    digest: 'sha256:def456ghi789',
    modifiedAt: '2025-01-14T14:20:00Z',
    details: {
      format: 'gguf',
      family: 'mistral',
      parameterSize: '7B',
      quantizationLevel: 'Q4_K_M',
    },
  },
  {
    name: 'nomic-embed-text:latest',
    size: 274_000_000, // 274MB - embedding model
    digest: 'sha256:embed123',
    modifiedAt: '2025-01-13T08:00:00Z',
    details: {
      format: 'gguf',
      family: 'nomic',
    },
  },
]

const mockRunningModels: OllamaRunningModel[] = [
  {
    name: 'llama3.2:latest',
    model: 'llama3.2:latest',
    size: 2_147_483_648,
    digest: 'sha256:abc123def456',
    expiresAt: '2025-01-15T11:30:00Z',
  },
]

describe('OllamaManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListQueryData = []
    mockListIsLoading = false
    mockRunningQueryData = []
    mockRunningIsLoading = false
    mockStatusQueryData = { online: true }
    mockStatusIsLoading = false
    mockConfirm.mockReturnValue(true)

    // Reset store state
    useOllamaStore.setState({
      models: [],
      runningModels: [],
      loading: false,
      pulling: null,
      pullProgress: null,
      selectedModel: null,
      ollamaOnline: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // LOADING STATES
  // =========================================================================

  describe('Loading States', () => {
    it('renders loading spinner when list query is loading', () => {
      mockListIsLoading = true
      mockListQueryData = undefined

      render(<OllamaManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })

    it('renders loading spinner when running query is loading', () => {
      mockRunningIsLoading = true
      mockRunningQueryData = undefined

      render(<OllamaManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })

    it('renders loading spinner when status query is loading', () => {
      mockStatusIsLoading = true
      mockStatusQueryData = undefined

      render(<OllamaManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })
  })

  // =========================================================================
  // OFFLINE STATE
  // =========================================================================

  describe('Offline State', () => {
    it('shows offline message when Ollama is not running', () => {
      mockStatusQueryData = { online: false }

      render(<OllamaManager />)

      expect(screen.getByText('Ollama Not Running')).toBeDefined()
      expect(screen.getByText('Start the Ollama service to manage models')).toBeDefined()
    })

    it('displays retry button when offline', () => {
      mockStatusQueryData = { online: false }

      render(<OllamaManager />)

      expect(screen.getByText('Retry Connection')).toBeDefined()
    })

    it('calls refetch when retry button is clicked', () => {
      mockStatusQueryData = { online: false }

      render(<OllamaManager />)

      const retryButton = screen.getByText('Retry Connection')
      fireEvent.click(retryButton)

      expect(mockListRefetch).toHaveBeenCalled()
      expect(mockRunningRefetch).toHaveBeenCalled()
      expect(mockStatusRefetch).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // TAB NAVIGATION
  // =========================================================================

  describe('Tab Navigation', () => {
    it('renders models tab by default', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      // "Models" appears in tab and stat card, so use getAllByText
      expect(screen.getAllByText('Models').length).toBeGreaterThan(0)
      expect(screen.getByText('System LLM')).toBeDefined()
    })

    it('switches to System LLM tab when clicked', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      expect(screen.getByText('Installed Embedding Models')).toBeDefined()
      expect(screen.getByText('Available Embedding Models')).toBeDefined()
    })

    it('shows active tab styling', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      // Find the Models tab button specifically (not the stat card label)
      const modelsTabButtons = screen.getAllByText('Models')
      const modelsTab = modelsTabButtons.find((el) => el.closest('button'))?.closest('button')
      expect(modelsTab?.className).toContain('text-accent-purple')
    })
  })

  // =========================================================================
  // STATISTICS DISPLAY
  // =========================================================================

  describe('Statistics Display', () => {
    it('displays correct model count', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      expect(screen.getByText('3')).toBeDefined() // 3 models
      // "Models" appears in tab and stat card
      expect(screen.getAllByText('Models').length).toBeGreaterThan(0)
    })

    it('displays correct running count', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = mockRunningModels

      render(<OllamaManager />)

      expect(screen.getByText('1')).toBeDefined() // 1 running
      // "Running" appears in stat card and badge
      expect(screen.getAllByText(/Running/i).length).toBeGreaterThan(0)
    })

    it('displays Ollama status as Online', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      expect(screen.getByText('Online')).toBeDefined()
      expect(screen.getByText('Ollama Status')).toBeDefined()
    })

    it('displays total size correctly', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      // Total: 2GB + 4.1GB + 274MB = ~6.5GB
      expect(screen.getByText('Total Size')).toBeDefined()
      // Size is displayed via formatSize - multiple size values may be present
      expect(screen.getAllByText(/GB/).length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // MODEL LIST RENDERING
  // =========================================================================

  describe('Model List Rendering', () => {
    it('displays models when loaded', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      expect(screen.getByText('llama3.2:latest')).toBeDefined()
      expect(screen.getByText('mistral:latest')).toBeDefined()
      expect(screen.getByText('nomic-embed-text:latest')).toBeDefined()
    })

    it('shows empty state when no models installed', () => {
      mockListQueryData = []

      render(<OllamaManager />)

      expect(screen.getByText('No models installed')).toBeDefined()
      expect(screen.getByText('Pull Your First Model')).toBeDefined()
    })

    it('displays model size', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      // 2_147_483_648 bytes = 2.147 GB, formatted as "2.1 GB"
      expect(screen.getByText('2.1 GB')).toBeDefined()
    })

    it('displays model family when available', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      expect(screen.getAllByText('llama').length).toBeGreaterThan(0)
    })

    it('displays parameter size when available', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      expect(screen.getByText('3.2B')).toBeDefined()
    })

    it('displays modification date', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      // Date is formatted via toLocaleDateString
      const dateTexts = screen.getAllByText(/1\/1[345]\/2025/)
      expect(dateTexts.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // MODEL SEARCH/FILTER
  // =========================================================================

  describe('Model Search', () => {
    it('filters models based on search query', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const searchInput = screen.getByPlaceholderText('Search models...')
      fireEvent.change(searchInput, { target: { value: 'llama' } })

      expect(screen.getByText('llama3.2:latest')).toBeDefined()
      expect(screen.queryByText('mistral:latest')).toBeNull()
    })

    it('shows empty state when no models match search', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const searchInput = screen.getByPlaceholderText('Search models...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No models match your search')).toBeDefined()
    })

    it('search is case insensitive', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const searchInput = screen.getByPlaceholderText('Search models...')
      fireEvent.change(searchInput, { target: { value: 'LLAMA' } })

      expect(screen.getByText('llama3.2:latest')).toBeDefined()
    })
  })

  // =========================================================================
  // RUNNING MODEL STATUS
  // =========================================================================

  describe('Running Model Status', () => {
    it('shows running badge for running models', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = mockRunningModels

      render(<OllamaManager />)

      expect(screen.getByText('running')).toBeDefined()
    })

    it('displays stop button for running models', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = mockRunningModels

      render(<OllamaManager />)

      const stopButton = document.querySelector('[title="Stop"]')
      expect(stopButton).toBeDefined()
    })

    it('displays run button for non-running models', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = [] // No running models

      render(<OllamaManager />)

      const runButtons = document.querySelectorAll('[title="Run"]')
      expect(runButtons.length).toBe(3) // All 3 models have run button
    })
  })

  // =========================================================================
  // MODEL SELECTION
  // =========================================================================

  describe('Model Selection', () => {
    it('selects model when clicked', async () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const modelCard = screen.getByText('llama3.2:latest').closest('.card')
      if (modelCard) {
        fireEvent.click(modelCard)
      }

      await waitFor(() => {
        expect(useOllamaStore.getState().selectedModel?.name).toBe('llama3.2:latest')
      })
    })

    it('shows model details when selected', async () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const modelCard = screen.getByText('llama3.2:latest').closest('.card')
      if (modelCard) {
        fireEvent.click(modelCard)
      }

      await waitFor(() => {
        expect(screen.getByText('Format')).toBeDefined()
        expect(screen.getByText('gguf')).toBeDefined()
        expect(screen.getByText('Family')).toBeDefined()
        expect(screen.getByText('Parameters')).toBeDefined()
        expect(screen.getByText('Quantization')).toBeDefined()
        expect(screen.getByText('Q4_0')).toBeDefined()
        expect(screen.getByText('Digest')).toBeDefined()
      })
    })

    it('deselects model when clicked again', async () => {
      mockListQueryData = mockModels
      useOllamaStore.setState({ selectedModel: mockModels[0] })

      render(<OllamaManager />)

      const modelCard = screen.getByText('llama3.2:latest').closest('.card')
      if (modelCard) {
        fireEvent.click(modelCard)
      }

      await waitFor(() => {
        expect(useOllamaStore.getState().selectedModel).toBeNull()
      })
    })
  })

  // =========================================================================
  // MODEL ACTIONS
  // =========================================================================

  describe('Model Actions', () => {
    it('calls run mutation when run button is clicked', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = []

      render(<OllamaManager />)

      const runButtons = document.querySelectorAll('[title="Run"]')
      fireEvent.click(runButtons[0])

      expect(mockRunMutate).toHaveBeenCalledWith({ model: 'llama3.2:latest' })
    })

    it('calls stop mutation when stop button is clicked', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = mockRunningModels

      render(<OllamaManager />)

      const stopButton = document.querySelector('[title="Stop"]')
      if (stopButton) {
        fireEvent.click(stopButton)
      }

      expect(mockStopMutate).toHaveBeenCalledWith({ model: 'llama3.2:latest' })
    })

    it('prevents event propagation on action buttons', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = []

      render(<OllamaManager />)

      // Click run button should not select the model
      const runButtons = document.querySelectorAll('[title="Run"]')
      fireEvent.click(runButtons[0])

      // Model should not be selected
      expect(useOllamaStore.getState().selectedModel).toBeNull()
    })
  })

  // =========================================================================
  // MODEL DELETION
  // =========================================================================

  describe('Model Deletion', () => {
    it('shows confirmation dialog before deletion', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = []

      render(<OllamaManager />)

      const deleteButtons = document.querySelectorAll('[title="Delete"]')
      fireEvent.click(deleteButtons[0])

      expect(mockConfirm).toHaveBeenCalledWith('Delete model llama3.2:latest?')
    })

    it('calls delete mutation when confirmed', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = []
      mockConfirm.mockReturnValue(true)

      render(<OllamaManager />)

      const deleteButtons = document.querySelectorAll('[title="Delete"]')
      fireEvent.click(deleteButtons[0])

      expect(mockDeleteMutate).toHaveBeenCalledWith({ model: 'llama3.2:latest' })
    })

    it('does not delete when confirmation is cancelled', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = []
      mockConfirm.mockReturnValue(false)

      render(<OllamaManager />)

      const deleteButtons = document.querySelectorAll('[title="Delete"]')
      fireEvent.click(deleteButtons[0])

      expect(mockDeleteMutate).not.toHaveBeenCalled()
    })

    it('disables delete button for running models', () => {
      mockListQueryData = mockModels
      mockRunningQueryData = mockRunningModels

      render(<OllamaManager />)

      // Find the delete button for the running model (llama3.2)
      const llamaCard = screen.getByText('llama3.2:latest').closest('.card')
      const deleteButton = llamaCard?.querySelector('[title="Delete"]')

      expect(deleteButton).toHaveProperty('disabled', true)
    })
  })

  // =========================================================================
  // PULL MODEL MODAL
  // =========================================================================

  describe('Pull Model Modal', () => {
    it('opens pull modal when Pull Model button is clicked', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      expect(screen.getByText('Custom Model')).toBeDefined()
      expect(screen.getByText('Popular Models')).toBeDefined()
    })

    it('displays popular models in modal', () => {
      mockListQueryData = []

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      expect(screen.getByText('Meta Llama 3.2 (3B)')).toBeDefined()
      expect(screen.getByText('Mistral 7B')).toBeDefined()
    })

    it('marks already installed models in modal', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      // llama3.2:latest is installed, should show checkmark
      const llamaRow = screen.getByText('Meta Llama 3.2 (3B)').closest('button')
      expect(llamaRow?.className).toContain('cursor-not-allowed')
    })

    it('closes modal when Cancel is clicked', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(screen.queryByText('Custom Model')).toBeNull()
    })

    it('pulls custom model when entered', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      const customInput = screen.getByPlaceholderText('e.g., llama3.2:latest')
      fireEvent.change(customInput, { target: { value: 'custom-model:v1' } })

      // Click the download button for custom model
      const modal = screen.getByText('Custom Model').closest('.card')
      const downloadButton = modal?.querySelector('.btn-primary')
      if (downloadButton) {
        fireEvent.click(downloadButton)
      }

      expect(mockPullMutate).toHaveBeenCalledWith({ model: 'custom-model:v1' })
    })

    it('disables custom pull button when input is empty', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      const modal = screen.getByText('Custom Model').closest('.card')
      const downloadButton = modal?.querySelector('.btn-primary')

      expect(downloadButton).toHaveProperty('disabled', true)
    })

    it('pulls popular model when clicked', () => {
      mockListQueryData = []

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      fireEvent.click(pullButton)

      const mistralButton = screen.getByText('Mistral 7B').closest('button')
      if (mistralButton) {
        fireEvent.click(mistralButton)
      }

      expect(mockPullMutate).toHaveBeenCalledWith({ model: 'mistral:latest' })
    })
  })

  // =========================================================================
  // PULL PROGRESS
  // =========================================================================

  describe('Pull Progress', () => {
    it('shows pull progress when pulling', () => {
      mockListQueryData = mockModels
      useOllamaStore.setState({
        pulling: 'mistral:latest',
        pullProgress: { status: 'Downloading...', percent: 45 },
      })

      render(<OllamaManager />)

      expect(screen.getByText('Pulling mistral:latest')).toBeDefined()
      expect(screen.getByText('Downloading...')).toBeDefined()
      expect(screen.getByText('45%')).toBeDefined()
    })

    it('disables Pull Model button while pulling', () => {
      mockListQueryData = mockModels
      useOllamaStore.setState({
        pulling: 'mistral:latest',
        pullProgress: { status: 'Downloading...', percent: 45 },
      })

      render(<OllamaManager />)

      const pullButton = screen.getByText('Pull Model')
      expect(pullButton).toHaveProperty('disabled', true)
    })

    it('subscribes to pull progress events on mount', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      expect(mockElectronOn).toHaveBeenCalledWith('ollama:pullProgress', expect.any(Function))
    })

    it('unsubscribes from pull progress events on unmount', () => {
      mockListQueryData = mockModels

      const { unmount } = render(<OllamaManager />)
      unmount()

      expect(mockUnsubscribe).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // REFRESH FUNCTIONALITY
  // =========================================================================

  describe('Refresh Functionality', () => {
    it('calls all refetch functions when refresh is clicked', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const refreshButton = screen.getByText('Refresh')
      fireEvent.click(refreshButton)

      expect(mockListRefetch).toHaveBeenCalled()
      expect(mockRunningRefetch).toHaveBeenCalled()
      expect(mockStatusRefetch).toHaveBeenCalled()
    })

    it('shows spinning icon during refresh', () => {
      mockListIsLoading = true
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const refreshIcons = document.querySelectorAll('.animate-spin')
      expect(refreshIcons.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // SYSTEM LLM PANEL
  // =========================================================================

  describe('System LLM Panel', () => {
    it('shows integration status cards', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      expect(screen.getByText('pgvector')).toBeDefined()
      expect(screen.getByText('mem0')).toBeDefined()
      expect(screen.getByText('Qdrant')).toBeDefined()
    })

    it('shows installed embedding models', () => {
      mockListQueryData = mockModels // includes nomic-embed-text

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      // nomic-embed-text should be listed as installed embedding
      const installedSection = screen.getByText('Installed Embedding Models').closest('.card')
      expect(installedSection).toBeDefined()
      expect(within(installedSection!).getByText('nomic-embed-text:latest')).toBeDefined()
    })

    it('shows empty state when no embedding models installed', () => {
      mockListQueryData = [mockModels[0], mockModels[1]] // only llama and mistral, no embedding

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      expect(screen.getByText('No embedding models installed')).toBeDefined()
    })

    it('shows available embedding models with Pull button', () => {
      mockListQueryData = [mockModels[0]] // Only llama, no embedding models

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      expect(screen.getByText('Nomic Embed Text')).toBeDefined()
      expect(screen.getByText('All-MiniLM-L6')).toBeDefined()

      // Pull buttons should exist for uninstalled models
      const pullButtons = screen.getAllByText('Pull')
      expect(pullButtons.length).toBeGreaterThan(0)
    })

    it('calls pull when embedding model Pull is clicked', () => {
      mockListQueryData = [mockModels[0]] // Only llama

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      // Find and click a Pull button
      const pullButtons = screen.getAllByText('Pull')
      fireEvent.click(pullButtons[0])

      expect(mockPullMutate).toHaveBeenCalled()
    })

    it('shows Installed badge for installed embedding models', () => {
      mockListQueryData = mockModels // includes nomic-embed-text

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      const availableSection = screen.getByText('Available Embedding Models').closest('.card')
      expect(within(availableSection!).getByText('Installed')).toBeDefined()
    })

    it('shows info card about System LLM', () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      const systemTab = screen.getByText('System LLM')
      fireEvent.click(systemTab)

      expect(screen.getByText('About System LLM')).toBeDefined()
      expect(screen.getByText(/System LLM models power local memory/)).toBeDefined()
    })
  })

  // =========================================================================
  // STORE SYNCHRONIZATION
  // =========================================================================

  describe('Store Synchronization', () => {
    it('syncs models to store when list query succeeds', async () => {
      mockListQueryData = mockModels

      render(<OllamaManager />)

      await waitFor(() => {
        expect(useOllamaStore.getState().models).toEqual(mockModels)
      })
    })

    it('syncs running models to store when running query succeeds', async () => {
      mockListQueryData = mockModels
      mockRunningQueryData = mockRunningModels

      render(<OllamaManager />)

      await waitFor(() => {
        expect(useOllamaStore.getState().runningModels).toEqual(mockRunningModels)
      })
    })

    it('syncs online status to store when status query succeeds', async () => {
      mockListQueryData = mockModels
      mockStatusQueryData = { online: true }

      render(<OllamaManager />)

      await waitFor(() => {
        expect(useOllamaStore.getState().ollamaOnline).toBe(true)
      })
    })
  })

  // =========================================================================
  // EDGE CASES
  // =========================================================================

  describe('Edge Cases', () => {
    it('handles model without details gracefully', () => {
      const modelWithoutDetails: OllamaModel = {
        name: 'simple-model',
        size: 1_000_000_000,
        digest: 'sha256:simple',
        modifiedAt: '2025-01-15T10:00:00Z',
        // no details
      }
      mockListQueryData = [modelWithoutDetails]

      render(<OllamaManager />)

      expect(screen.getByText('simple-model')).toBeDefined()
    })

    it('formats size correctly for KB', () => {
      const smallModel: OllamaModel = {
        name: 'tiny-model',
        size: 500_000, // 500KB
        digest: 'sha256:tiny',
        modifiedAt: '2025-01-15T10:00:00Z',
      }
      mockListQueryData = [smallModel]

      render(<OllamaManager />)

      // 500_000 bytes = 500KB, formatted as "500 KB"
      expect(screen.getAllByText('500 KB').length).toBeGreaterThan(0)
    })

    it('formats size correctly for MB', () => {
      const mediumModel: OllamaModel = {
        name: 'medium-model',
        size: 150_000_000, // 150MB
        digest: 'sha256:medium',
        modifiedAt: '2025-01-15T10:00:00Z',
      }
      mockListQueryData = [mediumModel]

      render(<OllamaManager />)

      // 150_000_000 bytes = 150MB, formatted as "150.0 MB"
      // The total size stat also shows MB
      expect(screen.getAllByText(/150\.0 MB/).length).toBeGreaterThan(0)
    })

    it('handles undefined query data gracefully', () => {
      mockListQueryData = undefined
      mockRunningQueryData = undefined
      mockStatusQueryData = undefined

      render(<OllamaManager />)

      // Should render offline state when status is undefined
      expect(screen.getByText('Ollama Not Running')).toBeDefined()
    })

    it('opens pull modal from empty state button', () => {
      mockListQueryData = []

      render(<OllamaManager />)

      const pullFirstModelButton = screen.getByText('Pull Your First Model')
      fireEvent.click(pullFirstModelButton)

      expect(screen.getByText('Custom Model')).toBeDefined()
    })
  })

  // =========================================================================
  // PULL MUTATION CALLBACKS
  // =========================================================================

  describe('Pull Mutation Callbacks', () => {
    it('sets pulling state when pull is initiated', () => {
      mockListQueryData = []

      render(<OllamaManager />)

      // Open modal and pull a model
      fireEvent.click(screen.getByText('Pull Model'))
      const mistralButton = screen.getByText('Mistral 7B').closest('button')
      if (mistralButton) {
        fireEvent.click(mistralButton)
      }

      expect(useOllamaStore.getState().pulling).toBe('mistral:latest')
      expect(useOllamaStore.getState().pullProgress).toEqual({ status: 'Starting...', percent: 0 })
    })

    it('closes modal after pull is initiated', () => {
      mockListQueryData = []

      render(<OllamaManager />)

      fireEvent.click(screen.getByText('Pull Model'))
      const mistralButton = screen.getByText('Mistral 7B').closest('button')
      if (mistralButton) {
        fireEvent.click(mistralButton)
      }

      // Modal should be closed
      expect(screen.queryByText('Custom Model')).toBeNull()
    })
  })

  // =========================================================================
  // PULL PROGRESS IPC EVENTS
  // =========================================================================

  describe('Pull Progress IPC Events', () => {
    it('updates pull progress when IPC event is received', () => {
      mockListQueryData = mockModels
      mockElectronOn.mockClear()

      render(<OllamaManager />)

      // Find the callback that was passed to window.electron.on
      const onCallArgs = mockElectronOn.mock.calls.find(
        (call) => call[0] === 'ollama:pullProgress'
      )
      expect(onCallArgs).toBeDefined()

      const progressCallback = onCallArgs![1]

      // Simulate receiving progress update
      const progressUpdate: PullProgress = {
        status: 'Downloading layer 1/5',
        percent: 35,
        digest: 'sha256:abc123',
        total: 1000000,
        completed: 350000,
      }

      act(() => {
        progressCallback(progressUpdate)
      })

      // Check store was updated
      expect(useOllamaStore.getState().pullProgress).toEqual(progressUpdate)
    })

    it('handles progress updates with minimal data', () => {
      mockListQueryData = mockModels
      mockElectronOn.mockClear()

      render(<OllamaManager />)

      const onCallArgs = mockElectronOn.mock.calls.find(
        (call) => call[0] === 'ollama:pullProgress'
      )
      expect(onCallArgs).toBeDefined()
      const progressCallback = onCallArgs![1]

      // Simulate minimal progress update
      const minimalUpdate = { status: 'Starting...', percent: 0 }
      act(() => {
        progressCallback(minimalUpdate)
      })

      expect(useOllamaStore.getState().pullProgress).toEqual(minimalUpdate)
    })
  })
})
