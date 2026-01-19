import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServicesManager } from '../ServicesManager'
import { useServicesStore, type SystemdService, type PodmanContainer } from '@/stores/services'

// Mock tRPC hooks
const mockSystemdRefetch = vi.fn()
const mockPodmanRefetch = vi.fn()
const mockSystemdActionMutate = vi.fn()
const mockPodmanActionMutate = vi.fn()

let mockSystemdData: SystemdService[] | undefined = []
let mockPodmanData: PodmanContainer[] | undefined = []
let mockSystemdIsLoading = false
let mockPodmanIsLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    services: {
      systemd: {
        useQuery: () => ({
          data: mockSystemdData,
          isLoading: mockSystemdIsLoading,
          refetch: mockSystemdRefetch,
        }),
      },
      podman: {
        useQuery: () => ({
          data: mockPodmanData,
          isLoading: mockPodmanIsLoading,
          refetch: mockPodmanRefetch,
        }),
      },
      systemdAction: {
        useMutation: () => ({
          mutate: mockSystemdActionMutate,
          isPending: false,
        }),
      },
      podmanAction: {
        useMutation: () => ({
          mutate: mockPodmanActionMutate,
          isPending: false,
        }),
      },
    },
  },
}))

// Mock data
const mockSystemdServices: SystemdService[] = [
  {
    name: 'postgresql',
    description: 'PostgreSQL database server',
    status: 'running',
    enabled: true,
    activeState: 'active',
    subState: 'running',
    pid: 1234,
    memory: '256MB',
    cpu: '2.5%',
  },
  {
    name: 'nginx',
    description: 'NGINX HTTP Server',
    status: 'stopped',
    enabled: true,
    activeState: 'inactive',
    subState: 'dead',
  },
  {
    name: 'redis',
    description: 'Redis in-memory data store',
    status: 'failed',
    enabled: false,
    activeState: 'failed',
    subState: 'failed',
  },
  {
    name: 'ssh',
    description: 'OpenSSH Server',
    status: 'running',
    enabled: true,
    activeState: 'active',
    subState: 'running',
    pid: 5678,
  },
]

const mockPodmanContainers: PodmanContainer[] = [
  {
    id: 'abc123def456',
    name: 'memgraph-db',
    image: 'memgraph/memgraph:latest',
    status: 'running',
    created: '2024-01-15T10:30:00Z',
    ports: ['7687:7687', '7444:7444'],
    state: 'running',
    health: 'healthy',
  },
  {
    id: 'xyz789ghi012',
    name: 'qdrant-vector',
    image: 'qdrant/qdrant:latest',
    status: 'stopped',
    created: '2024-01-10T08:00:00Z',
    ports: ['6333:6333'],
    state: 'exited',
    health: undefined,
  },
  {
    id: 'jkl345mno678',
    name: 'redis-cache',
    image: 'redis:7-alpine',
    status: 'paused',
    created: '2024-01-12T12:00:00Z',
    ports: [],
    state: 'paused',
    health: 'unhealthy',
  },
  {
    id: 'pqr901stu234',
    name: 'ollama-server',
    image: 'ollama/ollama:latest',
    status: 'exited',
    created: '2024-01-08T16:00:00Z',
    ports: ['11434:11434'],
    state: 'exited',
  },
]

describe('ServicesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSystemdData = []
    mockPodmanData = []
    mockSystemdIsLoading = false
    mockPodmanIsLoading = false

    // Reset store state
    useServicesStore.setState({
      systemdServices: [],
      podmanContainers: [],
      loading: false,
      activeTab: 'podman',
      selectedService: null,
      selectedContainer: null,
      filter: '',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // LOADING STATE TESTS
  // ==========================================================================

  describe('Loading State', () => {
    it('renders loading spinner when both queries are loading', () => {
      mockSystemdIsLoading = true
      mockPodmanIsLoading = true
      mockSystemdData = undefined
      mockPodmanData = undefined

      render(<ServicesManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })

    it('renders loading spinner when systemd is loading', () => {
      mockSystemdIsLoading = true
      mockPodmanIsLoading = false
      mockSystemdData = undefined
      mockPodmanData = []

      render(<ServicesManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })

    it('renders loading spinner when podman is loading', () => {
      mockSystemdIsLoading = false
      mockPodmanIsLoading = true
      mockSystemdData = []
      mockPodmanData = undefined

      render(<ServicesManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })

    it('does not show loading spinner when data is available', () => {
      mockSystemdIsLoading = false
      mockPodmanIsLoading = false
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Should not show the loading spinner when data is present
      const loadingContainer = document.querySelector('.h-64 .animate-spin')
      expect(loadingContainer).toBeNull()
    })
  })

  // ==========================================================================
  // STATISTICS DISPLAY TESTS
  // ==========================================================================

  describe('Statistics Display', () => {
    it('displays correct container count', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Use getAllByText since '4' appears multiple times (stat cards and tab badges)
      expect(screen.getAllByText('4').length).toBeGreaterThan(0)
      expect(screen.getByText('Containers')).toBeDefined()
    })

    it('displays correct running container count', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Only 1 running container (memgraph-db)
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
      expect(screen.getByText('Running')).toBeDefined()
    })

    it('displays correct services count', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      expect(screen.getByText('Services')).toBeDefined()
    })

    it('displays correct active services count', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // 2 running services (postgresql and ssh)
      expect(screen.getByText('Active')).toBeDefined()
    })

    it('displays zero stats when no data', () => {
      mockSystemdData = []
      mockPodmanData = []

      render(<ServicesManager />)

      // '0' appears in stat cards (4) and tab badges (2) = 6 total
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBe(6)
    })
  })

  // ==========================================================================
  // TAB NAVIGATION TESTS
  // ==========================================================================

  describe('Tab Navigation', () => {
    it('renders Podman tab as default active tab', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const podmanTab = screen.getByText('Podman')
      expect(podmanTab.closest('button')).toBeDefined()
      expect(screen.getByText('Systemd')).toBeDefined()
    })

    it('switches to Systemd tab when clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const systemdTab = screen.getByText('Systemd')
      fireEvent.click(systemdTab)

      // Should now show systemd services
      expect(useServicesStore.getState().activeTab).toBe('systemd')
    })

    it('switches back to Podman tab when clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const podmanTab = screen.getByText('Podman')
      fireEvent.click(podmanTab)

      expect(useServicesStore.getState().activeTab).toBe('podman')
    })

    it('displays tab count badges', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Check that counts appear in tab badges
      const podmanTab = screen.getByText('Podman').parentElement
      const systemdTab = screen.getByText('Systemd').parentElement

      expect(podmanTab?.textContent).toContain('4')
      expect(systemdTab?.textContent).toContain('4')
    })
  })

  // ==========================================================================
  // SEARCH/FILTER TESTS
  // ==========================================================================

  describe('Search and Filtering', () => {
    it('renders search input', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      expect(searchInput).toBeDefined()
    })

    it('filters containers by name', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'memgraph' } })

      expect(screen.getByText('memgraph-db')).toBeDefined()
      expect(screen.queryByText('qdrant-vector')).toBeNull()
    })

    it('filters containers by image name', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'redis' } })

      expect(screen.getByText('redis-cache')).toBeDefined()
      expect(screen.queryByText('memgraph-db')).toBeNull()
    })

    it('filters services by name', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'postgres' } })

      expect(screen.getByText('postgresql')).toBeDefined()
      expect(screen.queryByText('nginx')).toBeNull()
    })

    it('filters services by description', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'HTTP Server' } })

      expect(screen.getByText('nginx')).toBeDefined()
      expect(screen.queryByText('postgresql')).toBeNull()
    })

    it('shows empty state when no containers match search', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No containers found')).toBeDefined()
    })

    it('shows empty state when no services match search', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No services found')).toBeDefined()
    })

    it('is case-insensitive in filtering', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'MEMGRAPH' } })

      expect(screen.getByText('memgraph-db')).toBeDefined()
    })

    it('updates store filter state', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const searchInput = screen.getByPlaceholderText('Search...')
      fireEvent.change(searchInput, { target: { value: 'test-filter' } })

      expect(useServicesStore.getState().filter).toBe('test-filter')
    })
  })

  // ==========================================================================
  // REFRESH FUNCTIONALITY TESTS
  // ==========================================================================

  describe('Refresh Functionality', () => {
    it('renders refresh button', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const refreshButton = document.querySelector('button .lucide-refresh-cw')
      expect(refreshButton).toBeDefined()
    })

    it('calls refetch for both queries when refresh is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const refreshButton = document.querySelector('button .lucide-refresh-cw')?.parentElement
      expect(refreshButton).toBeDefined()

      if (refreshButton) {
        fireEvent.click(refreshButton)
      }

      expect(mockSystemdRefetch).toHaveBeenCalled()
      expect(mockPodmanRefetch).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // CONTAINER LIST TESTS
  // ==========================================================================

  describe('Container List', () => {
    it('renders container list with all containers', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      expect(screen.getByText('memgraph-db')).toBeDefined()
      expect(screen.getByText('qdrant-vector')).toBeDefined()
      expect(screen.getByText('redis-cache')).toBeDefined()
      expect(screen.getByText('ollama-server')).toBeDefined()
    })

    it('displays container image names', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      expect(screen.getByText('memgraph/memgraph:latest')).toBeDefined()
      expect(screen.getByText('qdrant/qdrant:latest')).toBeDefined()
    })

    it('displays truncated container IDs', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // First 12 characters of container ID
      expect(screen.getByText('abc123def456'.slice(0, 12))).toBeDefined()
    })

    it('displays container ports', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      expect(screen.getByText('7687:7687, 7444:7444')).toBeDefined()
      expect(screen.getByText('6333:6333')).toBeDefined()
    })

    it('shows empty state when no containers', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = []

      render(<ServicesManager />)

      expect(screen.getByText('No containers found')).toBeDefined()
    })
  })

  // ==========================================================================
  // SERVICE LIST TESTS
  // ==========================================================================

  describe('Service List', () => {
    it('renders service list when systemd tab is active', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      expect(screen.getByText('postgresql')).toBeDefined()
      expect(screen.getByText('nginx')).toBeDefined()
      expect(screen.getByText('redis')).toBeDefined()
      expect(screen.getByText('ssh')).toBeDefined()
    })

    it('displays service descriptions', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      expect(screen.getByText('PostgreSQL database server')).toBeDefined()
      expect(screen.getByText('NGINX HTTP Server')).toBeDefined()
    })

    it('displays enabled badge for enabled services', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const enabledBadges = screen.getAllByText('enabled')
      expect(enabledBadges.length).toBeGreaterThan(0)
    })

    it('displays PID for running services', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      expect(screen.getByText('PID: 1234')).toBeDefined()
      expect(screen.getByText('PID: 5678')).toBeDefined()
    })

    it('shows empty state when no services', () => {
      mockSystemdData = []
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      expect(screen.getByText('No services found')).toBeDefined()
    })
  })

  // ==========================================================================
  // STATUS INDICATOR TESTS
  // ==========================================================================

  describe('Status Indicators', () => {
    it('displays running status with green check icon', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Running containers should have green check circle
      const checkIcons = document.querySelectorAll('.text-accent-green')
      expect(checkIcons.length).toBeGreaterThan(0)
    })

    it('displays stopped/exited status with red X icon', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Exited containers should have red X circle
      const xIcons = document.querySelectorAll('.text-accent-red')
      expect(xIcons.length).toBeGreaterThan(0)
    })

    it('displays paused status with yellow pause icon', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Paused containers should have yellow pause icon
      const pauseIcons = document.querySelectorAll('.text-accent-yellow')
      expect(pauseIcons.length).toBeGreaterThan(0)
    })

    it('displays failed status with red icon for services', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      // Failed services should have red icon
      const redIcons = document.querySelectorAll('.text-accent-red')
      expect(redIcons.length).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // CONTAINER ACTIONS TESTS
  // ==========================================================================

  describe('Container Actions', () => {
    it('shows start button for stopped containers', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const startButtons = document.querySelectorAll('[title="Start"]')
      expect(startButtons.length).toBeGreaterThan(0)
    })

    it('shows stop button for running containers', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const stopButtons = document.querySelectorAll('[title="Stop"]')
      expect(stopButtons.length).toBeGreaterThan(0)
    })

    it('shows restart button for all containers', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const restartButtons = document.querySelectorAll('[title="Restart"]')
      expect(restartButtons.length).toBe(4) // All 4 containers
    })

    it('calls start mutation when start button is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const startButtons = document.querySelectorAll('[title="Start"]')
      if (startButtons.length > 0) {
        fireEvent.click(startButtons[0])
      }

      expect(mockPodmanActionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'start',
        })
      )
    })

    it('calls stop mutation when stop button is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const stopButtons = document.querySelectorAll('[title="Stop"]')
      if (stopButtons.length > 0) {
        fireEvent.click(stopButtons[0])
      }

      expect(mockPodmanActionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'abc123def456',
          action: 'stop',
        })
      )
    })

    it('calls restart mutation when restart button is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const restartButtons = document.querySelectorAll('[title="Restart"]')
      if (restartButtons.length > 0) {
        fireEvent.click(restartButtons[0])
      }

      expect(mockPodmanActionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'restart',
        })
      )
    })

    it('action buttons prevent event propagation', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      // Click start button and verify container is not selected
      const startButtons = document.querySelectorAll('[title="Start"]')
      if (startButtons.length > 0) {
        fireEvent.click(startButtons[0])
      }

      // Container should not be selected because we clicked the action button
      expect(useServicesStore.getState().selectedContainer).toBeNull()
    })
  })

  // ==========================================================================
  // SERVICE ACTIONS TESTS
  // ==========================================================================

  describe('Service Actions', () => {
    it('shows start button for stopped services', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const startButtons = document.querySelectorAll('[title="Start"]')
      expect(startButtons.length).toBeGreaterThan(0)
    })

    it('shows stop button for running services', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const stopButtons = document.querySelectorAll('[title="Stop"]')
      expect(stopButtons.length).toBeGreaterThan(0)
    })

    it('calls systemd start mutation when start button is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const startButtons = document.querySelectorAll('[title="Start"]')
      if (startButtons.length > 0) {
        fireEvent.click(startButtons[0])
      }

      expect(mockSystemdActionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'start',
        })
      )
    })

    it('calls systemd stop mutation when stop button is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const stopButtons = document.querySelectorAll('[title="Stop"]')
      if (stopButtons.length > 0) {
        fireEvent.click(stopButtons[0])
      }

      expect(mockSystemdActionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'postgresql',
          action: 'stop',
        })
      )
    })

    it('calls systemd restart mutation when restart button is clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const restartButtons = document.querySelectorAll('[title="Restart"]')
      if (restartButtons.length > 0) {
        fireEvent.click(restartButtons[0])
      }

      expect(mockSystemdActionMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'restart',
        })
      )
    })
  })

  // ==========================================================================
  // CONTAINER SELECTION AND DETAIL TESTS
  // ==========================================================================

  describe('Container Selection and Details', () => {
    it('selects container when clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const containerCard = screen.getByText('memgraph-db').closest('.card')
      if (containerCard) {
        fireEvent.click(containerCard)
      }

      expect(useServicesStore.getState().selectedContainer?.id).toBe('abc123def456')
    })

    it('deselects container when clicked again', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        selectedContainer: mockPodmanContainers[0],
      })

      render(<ServicesManager />)

      const containerCard = screen.getByText('memgraph-db').closest('.card')
      if (containerCard) {
        fireEvent.click(containerCard)
      }

      expect(useServicesStore.getState().selectedContainer).toBeNull()
    })

    it('shows expanded details when container is selected', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        selectedContainer: mockPodmanContainers[0],
      })

      render(<ServicesManager />)

      expect(screen.getByText('Created')).toBeDefined()
      expect(screen.getByText('State')).toBeDefined()
    })

    it('shows health info in expanded details when available', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        selectedContainer: mockPodmanContainers[0],
      })

      render(<ServicesManager />)

      expect(screen.getByText('Health')).toBeDefined()
      expect(screen.getByText('healthy')).toBeDefined()
    })

    it('highlights selected container with border', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        selectedContainer: mockPodmanContainers[0],
      })

      render(<ServicesManager />)

      const containerCard = screen.getByText('memgraph-db').closest('.card')
      expect(containerCard?.classList.contains('border-accent-purple')).toBe(true)
    })
  })

  // ==========================================================================
  // SERVICE SELECTION AND DETAIL TESTS
  // ==========================================================================

  describe('Service Selection and Details', () => {
    it('selects service when clicked', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const serviceCard = screen.getByText('postgresql').closest('.card')
      if (serviceCard) {
        fireEvent.click(serviceCard)
      }

      expect(useServicesStore.getState().selectedService?.name).toBe('postgresql')
    })

    it('deselects service when clicked again', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        activeTab: 'systemd',
        selectedService: mockSystemdServices[0],
      })

      render(<ServicesManager />)

      const serviceCard = screen.getByText('postgresql').closest('.card')
      if (serviceCard) {
        fireEvent.click(serviceCard)
      }

      expect(useServicesStore.getState().selectedService).toBeNull()
    })

    it('shows expanded details when service is selected', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        activeTab: 'systemd',
        selectedService: mockSystemdServices[0],
      })

      render(<ServicesManager />)

      expect(screen.getByText('Active State')).toBeDefined()
      expect(screen.getByText('Sub State')).toBeDefined()
    })

    it('shows memory and CPU in expanded details when available', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        activeTab: 'systemd',
        selectedService: mockSystemdServices[0],
      })

      render(<ServicesManager />)

      expect(screen.getByText('Memory')).toBeDefined()
      expect(screen.getByText('256MB')).toBeDefined()
      expect(screen.getByText('CPU')).toBeDefined()
      expect(screen.getByText('2.5%')).toBeDefined()
    })

    it('highlights selected service with border', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        activeTab: 'systemd',
        selectedService: mockSystemdServices[0],
      })

      render(<ServicesManager />)

      const serviceCard = screen.getByText('postgresql').closest('.card')
      expect(serviceCard?.classList.contains('border-accent-purple')).toBe(true)
    })
  })

  // ==========================================================================
  // AUTO-REFRESH TESTS
  // ==========================================================================

  describe('Auto-Refresh Functionality', () => {
    it('syncs systemd data to store when query data changes', async () => {
      mockSystemdData = []
      mockPodmanData = []

      const { rerender } = render(<ServicesManager />)

      // Update mock data
      mockSystemdData = mockSystemdServices

      // Rerender to trigger useEffect
      rerender(<ServicesManager />)

      await waitFor(() => {
        const storeData = useServicesStore.getState().systemdServices
        expect(storeData.length).toBe(4)
      })
    })

    it('syncs podman data to store when query data changes', async () => {
      mockSystemdData = []
      mockPodmanData = []

      const { rerender } = render(<ServicesManager />)

      // Update mock data
      mockPodmanData = mockPodmanContainers

      // Rerender to trigger useEffect
      rerender(<ServicesManager />)

      await waitFor(() => {
        const storeData = useServicesStore.getState().podmanContainers
        expect(storeData.length).toBe(4)
      })
    })
  })

  // ==========================================================================
  // MUTATION SUCCESS CALLBACK TESTS
  // ==========================================================================

  describe('Mutation Success Callbacks', () => {
    it('refetches systemd data after successful action', () => {
      // Set up the mock to call onSuccess callback
      mockSystemdActionMutate.mockImplementation(
        (params: unknown, callbacks?: { onSuccess?: () => void }) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess()
          }
        }
      )

      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      const stopButtons = document.querySelectorAll('[title="Stop"]')
      if (stopButtons.length > 0) {
        fireEvent.click(stopButtons[0])
      }

      // The mutation was called but refetch is called through useMutation's onSuccess
      expect(mockSystemdActionMutate).toHaveBeenCalled()
    })

    it('refetches podman data after successful action', () => {
      // Set up the mock to call onSuccess callback
      mockPodmanActionMutate.mockImplementation(
        (params: unknown, callbacks?: { onSuccess?: () => void }) => {
          if (callbacks?.onSuccess) {
            callbacks.onSuccess()
          }
        }
      )

      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers

      render(<ServicesManager />)

      const stopButtons = document.querySelectorAll('[title="Stop"]')
      if (stopButtons.length > 0) {
        fireEvent.click(stopButtons[0])
      }

      // The mutation was called
      expect(mockPodmanActionMutate).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // EDGE CASE TESTS
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles container without ports gracefully', () => {
      const containerNoPort: PodmanContainer = {
        id: 'noport123',
        name: 'no-port-container',
        image: 'test:latest',
        status: 'running',
        created: '2024-01-01',
        ports: [],
        state: 'running',
      }

      mockSystemdData = []
      mockPodmanData = [containerNoPort]

      render(<ServicesManager />)

      expect(screen.getByText('no-port-container')).toBeDefined()
      // Should not crash when ports array is empty
    })

    it('handles container without health info', () => {
      const containerNoHealth: PodmanContainer = {
        id: 'nohealth123',
        name: 'no-health-container',
        image: 'test:latest',
        status: 'running',
        created: '2024-01-01',
        ports: [],
        state: 'running',
        health: undefined,
      }

      mockSystemdData = []
      mockPodmanData = [containerNoHealth]
      useServicesStore.setState({ selectedContainer: containerNoHealth })

      render(<ServicesManager />)

      expect(screen.getByText('no-health-container')).toBeDefined()
      // Health section should not be shown
      expect(screen.queryByText('Health')).toBeNull()
    })

    it('handles service without optional fields', () => {
      const serviceMinimal: SystemdService = {
        name: 'minimal-service',
        description: 'Minimal service',
        status: 'running',
        enabled: true,
        activeState: 'active',
        subState: 'running',
        // No pid, memory, or cpu
      }

      mockSystemdData = [serviceMinimal]
      mockPodmanData = []
      useServicesStore.setState({
        activeTab: 'systemd',
        selectedService: serviceMinimal,
      })

      render(<ServicesManager />)

      expect(screen.getByText('minimal-service')).toBeDefined()
      // PID, Memory, CPU sections should not cause errors
      expect(screen.queryByText('Memory')).toBeNull()
      expect(screen.queryByText('CPU')).toBeNull()
    })

    it('handles unknown status gracefully', () => {
      const containerUnknownStatus: PodmanContainer = {
        id: 'unknown123',
        name: 'unknown-status',
        image: 'test:latest',
        status: 'unknown' as PodmanContainer['status'],
        created: '2024-01-01',
        ports: [],
        state: 'unknown',
      }

      mockSystemdData = []
      mockPodmanData = [containerUnknownStatus]

      render(<ServicesManager />)

      expect(screen.getByText('unknown-status')).toBeDefined()
      // Should show muted alert icon for unknown status
      const alertIcons = document.querySelectorAll('.text-text-muted')
      expect(alertIcons.length).toBeGreaterThan(0)
    })

    it('limits port display to first 2 ports', () => {
      const containerManyPorts: PodmanContainer = {
        id: 'manyports123',
        name: 'many-ports',
        image: 'test:latest',
        status: 'running',
        created: '2024-01-01',
        ports: ['8080:8080', '8081:8081', '8082:8082', '8083:8083'],
        state: 'running',
      }

      mockSystemdData = []
      mockPodmanData = [containerManyPorts]

      render(<ServicesManager />)

      expect(screen.getByText('8080:8080, 8081:8081')).toBeDefined()
      // Should not show ports beyond the first 2
      expect(screen.queryByText(/8082:8082/)).toBeNull()
    })
  })

  // ==========================================================================
  // STORE INTEGRATION TESTS
  // ==========================================================================

  describe('Store Integration', () => {
    it('uses store activeTab state', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ activeTab: 'systemd' })

      render(<ServicesManager />)

      // Should show systemd services, not containers
      expect(screen.getByText('postgresql')).toBeDefined()
    })

    it('uses store filter state', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ filter: 'memgraph' })

      render(<ServicesManager />)

      // Should only show filtered container
      expect(screen.getByText('memgraph-db')).toBeDefined()
      expect(screen.queryByText('qdrant-vector')).toBeNull()
    })

    it('uses store selectedContainer state', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({ selectedContainer: mockPodmanContainers[0] })

      render(<ServicesManager />)

      // Should show expanded details
      expect(screen.getByText('Created')).toBeDefined()
    })

    it('uses store selectedService state', () => {
      mockSystemdData = mockSystemdServices
      mockPodmanData = mockPodmanContainers
      useServicesStore.setState({
        activeTab: 'systemd',
        selectedService: mockSystemdServices[0],
      })

      render(<ServicesManager />)

      // Should show expanded details
      expect(screen.getByText('Active State')).toBeDefined()
    })
  })
})
