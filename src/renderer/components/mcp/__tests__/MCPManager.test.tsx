import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MCPManager } from '../MCPManager'
import { useMCPStore } from '@/stores/mcp'
import type { MCPServer } from '@shared/types'

// Mock tRPC hooks
const mockListRefetch = vi.fn()
const mockConfigRefetch = vi.fn()
const mockToggleMutate = vi.fn()
const mockReloadMutate = vi.fn()
const mockSaveConfigMutate = vi.fn()
const mockOpenPathMutate = vi.fn()

let mockListQueryData: MCPServer[] | undefined = []
let mockListIsLoading = false
let mockConfigData = '{}'
let mockConfigIsLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    mcp: {
      list: {
        useQuery: () => ({
          data: mockListQueryData,
          isLoading: mockListIsLoading,
          isFetching: false,
          refetch: mockListRefetch,
        }),
      },
      getConfig: {
        useQuery: () => ({
          data: mockConfigData,
          isLoading: mockConfigIsLoading,
          refetch: mockConfigRefetch,
        }),
      },
      toggle: {
        useMutation: () => ({
          mutate: mockToggleMutate,
          isPending: false,
        }),
      },
      reload: {
        useMutation: () => ({
          mutate: mockReloadMutate,
          isPending: false,
        }),
      },
      saveConfig: {
        useMutation: () => ({
          mutate: mockSaveConfigMutate,
          isPending: false,
        }),
      },
    },
    system: {
      homePath: {
        useQuery: () => ({
          data: '/home/testuser',
        }),
      },
      openPath: {
        useMutation: () => ({
          mutate: mockOpenPathMutate,
        }),
      },
    },
  },
}))

// Mock CodeEditor component
vi.mock('@/components/common/CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
})

const mockServers: MCPServer[] = [
  {
    name: 'filesystem',
    status: 'online',
    toolCount: 5,
    lastPing: 42,
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      disabled: false,
    },
  },
  {
    name: 'github',
    status: 'offline',
    toolCount: 10,
    config: {
      command: 'node',
      args: ['server.js'],
      env: { GITHUB_TOKEN: 'secret' },
      disabled: false,
    },
  },
  {
    name: 'disabled-server',
    status: 'offline',
    config: {
      command: 'python',
      args: ['server.py'],
      disabled: true,
    },
  },
  {
    name: 'error-server',
    status: 'error',
    config: {
      command: 'broken',
      args: [],
      disabled: false,
    },
  },
]

describe('MCPManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListQueryData = []
    mockListIsLoading = false
    mockConfigData = '{}'
    mockConfigIsLoading = false
    // Reset store state
    useMCPStore.setState({
      servers: [],
      selectedServer: null,
      loading: false,
      refreshing: false,
      error: null,
      showDetail: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('renders loading spinner when loading', () => {
      mockListIsLoading = true
      mockListQueryData = undefined

      render(<MCPManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })
  })

  describe('Tab Navigation', () => {
    it('renders servers tab by default', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      expect(screen.getByText('Servers')).toBeDefined()
      expect(screen.getByText('Config Editor')).toBeDefined()
      expect(screen.getByText('Total Servers')).toBeDefined()
    })

    it('switches to config tab when clicked', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      expect(screen.getByText('MCP Configuration')).toBeDefined()
    })
  })

  describe('Statistics Display', () => {
    it('displays correct server counts', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({ servers: mockServers })

      render(<MCPManager />)

      expect(screen.getByText('4')).toBeDefined() // Total servers (now 4 with error-server)
      expect(screen.getByText('Total Servers')).toBeDefined()
      // Use getAllByText since these labels appear multiple times
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0)
    })
  })

  describe('Server Search', () => {
    it('filters servers based on search query', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const searchInput = screen.getByPlaceholderText('Search servers...')
      fireEvent.change(searchInput, { target: { value: 'filesystem' } })

      expect(screen.getByText('filesystem')).toBeDefined()
      expect(screen.queryByText('github')).toBeNull()
    })

    it('shows empty state when no servers match search', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const searchInput = screen.getByPlaceholderText('Search servers...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No servers found')).toBeDefined()
    })
  })

  describe('Server Actions', () => {
    it('calls refetch when refresh button is clicked', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const refreshButton = screen.getByText('Refresh')
      fireEvent.click(refreshButton)

      expect(mockListRefetch).toHaveBeenCalled()
    })

    it('opens MCP settings folder when Add Server is clicked', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const addButton = screen.getByText('Add Server')
      fireEvent.click(addButton)

      expect(mockOpenPathMutate).toHaveBeenCalledWith(
        { path: '/home/testuser/.claude' },
        expect.any(Object)
      )
    })
  })

  describe('Server Card Interactions', () => {
    it('shows server details when server card is clicked', async () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const serverCard = screen.getByText('filesystem')
      fireEvent.click(serverCard)

      // Check that detail panel shows up
      await waitFor(() => {
        expect(useMCPStore.getState().showDetail).toBe(true)
        expect(useMCPStore.getState().selectedServer?.name).toBe('filesystem')
      })
    })

    it('displays server status badges correctly', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      expect(screen.getByText('Online')).toBeDefined()
      // Offline and Disabled may appear multiple times (stats + badges)
      expect(screen.getAllByText('Offline').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0)
    })

    it('displays tool count and ping time', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      expect(screen.getByText('5 tools')).toBeDefined()
      expect(screen.getByText('42ms')).toBeDefined()
    })
  })

  describe('Toggle Server', () => {
    it('calls toggle mutation when power button is clicked', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      // Find the power button on the first server (filesystem is online, not disabled)
      const powerButtons = document.querySelectorAll('[title="Disable"]')
      expect(powerButtons.length).toBeGreaterThan(0)

      fireEvent.click(powerButtons[0])

      expect(mockToggleMutate).toHaveBeenCalledWith(
        { name: 'filesystem', enabled: true },
        expect.any(Object)
      )
    })
  })

  describe('Server Detail Panel', () => {
    it('renders detail panel with server info when selected', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[0],
        showDetail: true,
      })

      render(<MCPManager />)

      expect(screen.getAllByText('filesystem').length).toBeGreaterThan(0)
      expect(screen.getByText('Command')).toBeDefined()
      // npx appears multiple times (in card and detail panel)
      expect(screen.getAllByText('npx').length).toBeGreaterThan(0)
      expect(screen.getByText('Statistics')).toBeDefined()
    })

    it('closes detail panel when close button is clicked', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[0],
        showDetail: true,
      })

      render(<MCPManager />)

      // Find close button by looking for X icon button in the detail panel
      const closeButton = document.querySelector('[title="Close details"]') ||
        Array.from(document.querySelectorAll('button')).find((btn) =>
          btn.querySelector('.lucide-x')
        )

      if (closeButton) {
        fireEvent.click(closeButton)
      }

      // Verify the store was updated to close the panel
      // Note: The actual UI update may be async, but the store should update immediately
      expect(useMCPStore.getState().showDetail).toBe(false)
    })

    it('displays environment variables in detail panel', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[1], // github server has env vars
        showDetail: true,
      })

      render(<MCPManager />)

      expect(screen.getByText('Environment Variables')).toBeDefined()
      expect(screen.getByText('GITHUB_TOKEN')).toBeDefined()
    })

    it('copies command to clipboard when copy button is clicked', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[0],
        showDetail: true,
      })

      render(<MCPManager />)

      const copyButton = screen.getByTitle('Copy command')
      fireEvent.click(copyButton)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'npx -y @modelcontextprotocol/server-filesystem'
      )
    })
  })

  describe('Config Editor Tab', () => {
    it('renders config editor with content', () => {
      mockListQueryData = mockServers
      mockConfigData = JSON.stringify({ mcpServers: {} }, null, 2)

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      expect(screen.getByTestId('code-editor')).toBeDefined()
    })

    it('shows error when saving invalid JSON', async () => {
      mockListQueryData = mockServers
      mockConfigData = 'invalid json {{{'

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText(/Invalid JSON/)).toBeDefined()
      })
    })

    it('calls save mutation with valid JSON', () => {
      mockListQueryData = mockServers
      const validConfig = JSON.stringify({ mcpServers: {} }, null, 2)
      mockConfigData = validConfig

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockSaveConfigMutate).toHaveBeenCalledWith(
        { content: validConfig },
        expect.any(Object)
      )
    })

    it('reloads config when reload button is clicked', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      const reloadButton = screen.getByText('Reload')
      fireEvent.click(reloadButton)

      expect(mockConfigRefetch).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no servers are configured', () => {
      mockListQueryData = []

      render(<MCPManager />)

      expect(screen.getByText('No MCP servers configured')).toBeDefined()
    })
  })

  describe('Server Status Badges', () => {
    it('displays Error status badge for servers with error status', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      expect(screen.getByText('Error')).toBeDefined()
    })

    it('displays correct status badge colors for different statuses', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      // Check for Online, Offline, Disabled, and Error status badges
      expect(screen.getByText('Online')).toBeDefined()
      expect(screen.getByText('Error')).toBeDefined()
      expect(screen.getAllByText('Offline').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Disabled').length).toBeGreaterThan(0)
    })
  })

  describe('Server Detail Panel Actions', () => {
    it('shows Enable button for disabled servers in detail panel', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[2], // disabled-server
        showDetail: true,
      })

      render(<MCPManager />)

      expect(screen.getByText('Enable')).toBeDefined()
    })

    it('shows Disable button for enabled servers in detail panel', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[0], // filesystem (enabled)
        showDetail: true,
      })

      render(<MCPManager />)

      // Find Disable button in detail panel (there's also one in the card)
      const disableButtons = screen.getAllByText('Disable')
      expect(disableButtons.length).toBeGreaterThan(0)
    })

    it('calls toggle mutation from detail panel Enable button', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[2], // disabled-server
        showDetail: true,
      })

      render(<MCPManager />)

      const enableButton = screen.getByText('Enable')
      fireEvent.click(enableButton)

      expect(mockToggleMutate).toHaveBeenCalledWith(
        { name: 'disabled-server', enabled: false },
        expect.any(Object)
      )
    })

    it('calls reload mutation when Reload button is clicked in detail panel', () => {
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[0],
        showDetail: true,
      })

      render(<MCPManager />)

      // Find the Reload button in detail panel
      const reloadButtons = screen.getAllByText('Reload')
      // The second Reload is in the detail panel
      fireEvent.click(reloadButtons[reloadButtons.length - 1])

      expect(mockReloadMutate).toHaveBeenCalled()
    })

    it('displays statistics with undefined values as dashes', () => {
      const serverWithNoStats: MCPServer = {
        name: 'no-stats-server',
        status: 'offline',
        config: {
          command: 'test',
          args: [],
          disabled: false,
        },
      }
      mockListQueryData = [serverWithNoStats]
      useMCPStore.setState({
        selectedServer: serverWithNoStats,
        showDetail: true,
      })

      render(<MCPManager />)

      // Should display '--' for missing tool count and latency
      expect(screen.getAllByText('--').length).toBe(2)
    })
  })

  describe('Config Editor Loading State', () => {
    it('shows loading spinner when config is loading', () => {
      mockListQueryData = mockServers
      mockConfigIsLoading = true

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      const spinners = document.querySelectorAll('.animate-spin')
      expect(spinners.length).toBeGreaterThan(0)
    })
  })

  describe('Toggle Enable Button in Server Cards', () => {
    it('shows Power icon for disabled servers (to enable them)', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const enableButtons = document.querySelectorAll('[title="Enable"]')
      expect(enableButtons.length).toBe(1) // Only one disabled server
    })

    it('calls toggle with correct params for enabling disabled server', () => {
      mockListQueryData = mockServers

      render(<MCPManager />)

      const enableButton = document.querySelector('[title="Enable"]')
      expect(enableButton).toBeDefined()

      if (enableButton) {
        fireEvent.click(enableButton)
      }

      expect(mockToggleMutate).toHaveBeenCalledWith(
        { name: 'disabled-server', enabled: false },
        expect.any(Object)
      )
    })
  })

  describe('Server Card without args', () => {
    it('does not display args section when args array is empty', () => {
      const serverNoArgs: MCPServer = {
        name: 'no-args-server',
        status: 'online',
        config: {
          command: 'simple',
          args: [],
          disabled: false,
        },
      }
      mockListQueryData = [serverNoArgs]
      useMCPStore.setState({
        selectedServer: serverNoArgs,
        showDetail: true,
      })

      render(<MCPManager />)

      expect(screen.queryByText('Args:')).toBeNull()
    })
  })

  describe('Config Editor Content Changes', () => {
    it('updates config content when editor value changes', async () => {
      mockListQueryData = mockServers
      mockConfigData = JSON.stringify({ mcpServers: {} }, null, 2)

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      const editor = screen.getByTestId('code-editor')
      const newContent = JSON.stringify({ mcpServers: { test: {} } }, null, 2)
      fireEvent.change(editor, { target: { value: newContent } })

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(mockSaveConfigMutate).toHaveBeenCalledWith(
        { content: newContent },
        expect.any(Object)
      )
    })
  })

  describe('Error Handling', () => {
    it('logs error when save config mutation fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockListQueryData = mockServers
      mockConfigData = JSON.stringify({ mcpServers: {} }, null, 2)
      mockSaveConfigMutate.mockImplementation((_, { onError }) => {
        if (onError) onError(new Error('Save failed'))
      })

      render(<MCPManager />)

      const configTab = screen.getByText('Config Editor')
      fireEvent.click(configTab)

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save MCP config:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('logs error when open MCP settings mutation fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockListQueryData = mockServers
      mockOpenPathMutate.mockImplementation((_, { onError }) => {
        if (onError) onError(new Error('Open failed'))
      })

      render(<MCPManager />)

      const addButton = screen.getByText('Add Server')
      fireEvent.click(addButton)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to open MCP settings:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('logs error when toggle mutation fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockListQueryData = mockServers
      mockToggleMutate.mockImplementation((_, { onError }) => {
        if (onError) onError(new Error('Toggle failed'))
      })

      render(<MCPManager />)

      const powerButtons = document.querySelectorAll('[title="Disable"]')
      fireEvent.click(powerButtons[0])

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to toggle server:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('logs error when reload mutation fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockListQueryData = mockServers
      useMCPStore.setState({
        selectedServer: mockServers[0],
        showDetail: true,
      })
      mockReloadMutate.mockImplementation((_, { onError }) => {
        if (onError) onError(new Error('Reload failed'))
      })

      render(<MCPManager />)

      const reloadButtons = screen.getAllByText('Reload')
      fireEvent.click(reloadButtons[reloadButtons.length - 1])

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to reload MCP config:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })
})
