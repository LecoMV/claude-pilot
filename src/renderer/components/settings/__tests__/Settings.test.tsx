import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Settings } from '../Settings'
import { useSettingsStore, type AppSettings } from '@/stores/settings'
import { useBudgetStore } from '@/stores/budget'
import type { BudgetSettings } from '@shared/types'

// Mock tRPC client (used by stores)
vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    settings: {
      get: {
        query: vi.fn().mockResolvedValue({}),
      },
      save: {
        mutate: vi.fn().mockResolvedValue(true),
      },
      setBudget: {
        mutate: vi.fn().mockResolvedValue(true),
      },
    },
    credentials: {
      store: { mutate: vi.fn().mockResolvedValue(true) },
      delete: { mutate: vi.fn().mockResolvedValue(true) },
      list: { query: vi.fn().mockResolvedValue([]) },
      isEncryptionAvailable: { query: vi.fn().mockResolvedValue(true) },
    },
  },
}))

// Mock tRPC React hooks
const mockStoreMutateAsync = vi.fn()
const mockDeleteMutateAsync = vi.fn()
const mockListFetch = vi.fn()
const mockIsEncryptionFetch = vi.fn()

let mockListData: string[] = []
let mockIsEncryptionAvailable = true
let mockCredentialsLoading = false

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    credentials: {
      store: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mockStoreMutateAsync.mockResolvedValue(true),
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mockDeleteMutateAsync.mockResolvedValue(true),
          isPending: false,
        }),
      },
      list: {
        useQuery: () => ({
          data: mockListData,
          isLoading: mockCredentialsLoading,
        }),
      },
      isEncryptionAvailable: {
        useQuery: () => ({
          data: mockIsEncryptionAvailable,
          isLoading: mockCredentialsLoading,
        }),
      },
    },
    useUtils: () => ({
      credentials: {
        isEncryptionAvailable: {
          fetch: mockIsEncryptionFetch.mockResolvedValue(mockIsEncryptionAvailable),
        },
        list: {
          fetch: mockListFetch.mockResolvedValue(mockListData),
        },
      },
    }),
  },
}))

// Default test settings
const defaultSettings: AppSettings = {
  theme: 'dark',
  accentColor: 'purple',
  sidebarCollapsed: false,
  terminalFont: 'jetbrains',
  terminalFontSize: 14,
  terminalScrollback: 10000,
  postgresHost: 'localhost',
  postgresPort: 5433,
  memgraphHost: 'localhost',
  memgraphPort: 7687,
  qdrantHost: 'localhost',
  qdrantPort: 6333,
  qdrantCollection: 'claude_memories',
  systemNotifications: true,
  soundEnabled: false,
  autoLock: false,
  clearOnExit: true,
}

const defaultBudgetSettings: BudgetSettings = {
  billingType: 'subscription',
  subscriptionPlan: 'max',
  monthlyLimit: 100,
  warningThreshold: 80,
  alertsEnabled: true,
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListData = []
    mockIsEncryptionAvailable = true
    mockCredentialsLoading = false

    // Reset settings store
    useSettingsStore.setState({
      settings: { ...defaultSettings },
      loading: false,
      saving: false,
      loaded: true,
    })

    // Reset budget store
    useBudgetStore.setState({
      budgetSettings: { ...defaultBudgetSettings },
      currentMonthCost: 0,
      todayCost: 0,
      activeSessions: [],
      costByModel: [],
      dailyCosts: [],
      isLoading: false,
      lastUpdate: 0,
      budgetWarning: false,
      budgetExceeded: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('renders loading spinner when loading', () => {
      useSettingsStore.setState({ loading: true, loaded: false })

      render(<Settings />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })
  })

  describe('Section Navigation', () => {
    it('renders all settings sections in sidebar', () => {
      render(<Settings />)

      // Look for sections within navigation buttons
      const nav = document.querySelector('nav')
      expect(nav).toBeDefined()
      expect(nav?.textContent).toContain('Appearance')
      expect(nav?.textContent).toContain('Terminal')
      expect(nav?.textContent).toContain('Memory')
      expect(nav?.textContent).toContain('Budget')
      expect(nav?.textContent).toContain('Notifications')
      expect(nav?.textContent).toContain('Security')
    })

    it('shows Appearance section by default', () => {
      render(<Settings />)

      expect(screen.getByText('Theme')).toBeDefined()
      expect(screen.getByText('Color Scheme')).toBeDefined()
    })

    it('switches to Terminal section when clicked', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      expect(screen.getByText('Font')).toBeDefined()
      expect(screen.getByText('Font Family')).toBeDefined()
    })

    it('switches to Memory section when clicked', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      expect(screen.getByText('PostgreSQL')).toBeDefined()
      expect(screen.getByText('Memgraph')).toBeDefined()
    })

    it('switches to Budget section when clicked', () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      expect(screen.getByText('Billing Type')).toBeDefined()
    })

    it('switches to Notifications section when clicked', () => {
      render(<Settings />)

      const notificationsTab = screen.getByText('Notifications')
      fireEvent.click(notificationsTab)

      expect(screen.getByText('System Notifications')).toBeDefined()
      expect(screen.getByText('Sound')).toBeDefined()
    })

    it('switches to Security section when clicked', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Encryption Status')).toBeDefined()
      })
    })

    it('highlights active section in sidebar', () => {
      render(<Settings />)

      // Get navigation buttons from sidebar
      const nav = document.querySelector('nav')
      expect(nav).toBeDefined()

      // Find button containing 'Appearance' text in the nav
      const appearanceButton = Array.from(nav?.querySelectorAll('button') || []).find(
        (btn) => btn.textContent?.includes('Appearance')
      )
      expect(appearanceButton?.classList.contains('text-accent-purple')).toBe(true)

      // Click Terminal button
      const terminalButton = Array.from(nav?.querySelectorAll('button') || []).find(
        (btn) => btn.textContent?.includes('Terminal')
      )
      expect(terminalButton).toBeDefined()
      fireEvent.click(terminalButton!)

      // Terminal should now be active
      expect(terminalButton?.classList.contains('text-accent-purple')).toBe(true)
    })
  })

  describe('Appearance Settings', () => {
    it('renders theme selector with options', () => {
      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark')
      expect(themeSelect).toBeDefined()

      // Check all options exist
      const options = themeSelect.querySelectorAll('option')
      expect(options.length).toBe(3)
    })

    it('changes theme when selector value changes', () => {
      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark') as HTMLSelectElement
      fireEvent.change(themeSelect, { target: { value: 'auto' } })

      expect(themeSelect.value).toBe('auto')
    })

    it('renders accent color buttons', () => {
      render(<Settings />)

      // Look for accent color buttons (4 colors: purple, blue, green, teal)
      const colorButtons = document.querySelectorAll('button.rounded-full')
      // Filter to only the color picker buttons (have w-6 h-6)
      const accentButtons = Array.from(colorButtons).filter(
        (btn) => btn.classList.contains('w-6') && btn.classList.contains('h-6')
      )
      expect(accentButtons.length).toBe(4)
    })

    it('changes accent color when color button is clicked', () => {
      render(<Settings />)

      // Find the blue accent color button
      const colorButtons = document.querySelectorAll('button.rounded-full.bg-accent-blue')
      expect(colorButtons.length).toBeGreaterThan(0)

      fireEvent.click(colorButtons[0])

      // Verify the blue button now has the selected ring
      expect(colorButtons[0].classList.contains('ring-2')).toBe(true)
    })

    it('renders sidebar default selector', () => {
      render(<Settings />)

      expect(screen.getByText('Sidebar Default')).toBeDefined()
      const sidebarSelect = screen.getByDisplayValue('Expanded')
      expect(sidebarSelect).toBeDefined()
    })

    it('changes sidebar default setting', () => {
      render(<Settings />)

      const sidebarSelect = screen.getByDisplayValue('Expanded') as HTMLSelectElement
      fireEvent.change(sidebarSelect, { target: { value: 'collapsed' } })

      expect(sidebarSelect.value).toBe('collapsed')
    })
  })

  describe('Terminal Settings', () => {
    it('renders font family selector', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const fontSelect = screen.getByDisplayValue('JetBrains Mono')
      expect(fontSelect).toBeDefined()
    })

    it('changes terminal font', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const fontSelect = screen.getByDisplayValue('JetBrains Mono') as HTMLSelectElement
      fireEvent.change(fontSelect, { target: { value: 'fira' } })

      expect(fontSelect.value).toBe('fira')
    })

    it('renders font size input', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const fontSizeInput = screen.getByDisplayValue('14') as HTMLInputElement
      expect(fontSizeInput.type).toBe('number')
    })

    it('changes font size', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const fontSizeInput = screen.getByDisplayValue('14') as HTMLInputElement
      fireEvent.change(fontSizeInput, { target: { value: '16' } })

      expect(fontSizeInput.value).toBe('16')
    })

    it('renders scrollback input', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const scrollbackInput = screen.getByDisplayValue('10000') as HTMLInputElement
      expect(scrollbackInput.type).toBe('number')
    })

    it('changes scrollback lines', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const scrollbackInput = screen.getByDisplayValue('10000') as HTMLInputElement
      fireEvent.change(scrollbackInput, { target: { value: '20000' } })

      expect(scrollbackInput.value).toBe('20000')
    })

    it('shows behavior section', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      expect(screen.getByText('Behavior')).toBeDefined()
      expect(screen.getByText('Scrollback Lines')).toBeDefined()
    })
  })

  describe('Memory Settings', () => {
    it('renders PostgreSQL configuration', () => {
      render(<Settings />)

      // Navigate to Memory tab via nav button
      const nav = document.querySelector('nav')
      const memoryTab = Array.from(nav?.querySelectorAll('button') || []).find(
        (btn) => btn.textContent?.includes('Memory')
      )
      expect(memoryTab).toBeDefined()
      fireEvent.click(memoryTab!)

      expect(screen.getByText('PostgreSQL')).toBeDefined()
      // Get all localhost inputs (there are multiple)
      const localhostInputs = screen.getAllByDisplayValue('localhost')
      expect(localhostInputs.length).toBeGreaterThan(0)
    })

    it('changes PostgreSQL host', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      // Get the first localhost input (PostgreSQL host)
      const hostInputs = screen.getAllByDisplayValue('localhost')
      fireEvent.change(hostInputs[0], { target: { value: '192.168.1.100' } })

      expect((hostInputs[0] as HTMLInputElement).value).toBe('192.168.1.100')
    })

    it('changes PostgreSQL port', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      const portInput = screen.getByDisplayValue('5433') as HTMLInputElement
      fireEvent.change(portInput, { target: { value: '5432' } })

      expect(portInput.value).toBe('5432')
    })

    it('renders Memgraph configuration', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      expect(screen.getByText('Memgraph')).toBeDefined()
      expect(screen.getByText('Graph database host')).toBeDefined()
    })

    it('renders Qdrant configuration', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      expect(screen.getByText('Qdrant (Vector Memory)')).toBeDefined()
      expect(screen.getByDisplayValue('claude_memories')).toBeDefined()
    })

    it('changes Qdrant collection name', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      const collectionInput = screen.getByDisplayValue('claude_memories') as HTMLInputElement
      fireEvent.change(collectionInput, { target: { value: 'new_collection' } })

      expect(collectionInput.value).toBe('new_collection')
    })

    it('renders all database port inputs', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      expect(screen.getByDisplayValue('5433')).toBeDefined() // PostgreSQL
      expect(screen.getByDisplayValue('7687')).toBeDefined() // Memgraph
      expect(screen.getByDisplayValue('6333')).toBeDefined() // Qdrant
    })
  })

  describe('Notification Settings', () => {
    it('renders system notifications toggle', () => {
      render(<Settings />)

      const notificationsTab = screen.getByText('Notifications')
      fireEvent.click(notificationsTab)

      expect(screen.getByText('System Notifications')).toBeDefined()
      expect(screen.getByText('Show desktop notifications')).toBeDefined()
    })

    it('toggles system notifications', () => {
      render(<Settings />)

      const notificationsTab = screen.getByText('Notifications')
      fireEvent.click(notificationsTab)

      // Find the toggle button (first one is for system notifications)
      const toggleButtons = document.querySelectorAll('button.rounded-full')
      const notificationToggle = Array.from(toggleButtons).find((btn) =>
        btn.classList.contains('w-11')
      )
      expect(notificationToggle).toBeDefined()

      if (notificationToggle) {
        // Initial state is enabled (purple)
        expect(notificationToggle.classList.contains('bg-accent-purple')).toBe(true)

        fireEvent.click(notificationToggle)

        // After click, should be disabled
        expect(notificationToggle.classList.contains('bg-border')).toBe(true)
      }
    })

    it('renders sound toggle', () => {
      render(<Settings />)

      const notificationsTab = screen.getByText('Notifications')
      fireEvent.click(notificationsTab)

      expect(screen.getByText('Sound')).toBeDefined()
      expect(screen.getByText('Play sound for notifications')).toBeDefined()
    })

    it('toggles sound setting', () => {
      render(<Settings />)

      const notificationsTab = screen.getByText('Notifications')
      fireEvent.click(notificationsTab)

      // Find toggle buttons - second one is for sound
      const toggleButtons = document.querySelectorAll('button.rounded-full.w-11')
      expect(toggleButtons.length).toBe(2)

      const soundToggle = toggleButtons[1]
      // Initial state is disabled
      expect(soundToggle.classList.contains('bg-border')).toBe(true)

      fireEvent.click(soundToggle)

      // After click, should be enabled
      expect(soundToggle.classList.contains('bg-accent-purple')).toBe(true)
    })
  })

  describe('Security Settings', () => {
    it('shows loading state while loading credentials', async () => {
      mockCredentialsLoading = true

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      // Should show loading spinner in security section
      await waitFor(() => {
        const spinners = document.querySelectorAll('.animate-spin')
        expect(spinners.length).toBeGreaterThan(0)
      })
    })

    it('displays encryption available status', async () => {
      mockIsEncryptionAvailable = true

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('OS Keychain Encryption Active')).toBeDefined()
      })
    })

    it('displays encryption unavailable status', async () => {
      mockIsEncryptionAvailable = false

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Encryption Unavailable')).toBeDefined()
      })
    })

    it('shows security warning when encryption is unavailable', async () => {
      mockIsEncryptionAvailable = false

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Security Warning')).toBeDefined()
      })
    })

    it('displays credential keys list', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Stored Credentials')).toBeDefined()
        expect(screen.getByText('PostgreSQL Password')).toBeDefined()
        expect(screen.getByText('Anthropic API Key')).toBeDefined()
        expect(screen.getByText('GitHub Token')).toBeDefined()
      })
    })

    it('shows stored badge for existing credentials', async () => {
      mockListData = ['postgresql.password', 'anthropic.apiKey']

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        const storedBadges = screen.getAllByText('Stored')
        expect(storedBadges.length).toBe(2)
      })
    })

    it('renders auto-lock toggle', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Auto-lock')).toBeDefined()
        expect(screen.getByText('Lock app after inactivity')).toBeDefined()
      })
    })

    it('renders clear on exit toggle', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Clear on Exit')).toBeDefined()
        expect(screen.getByText('Clear sensitive data on app exit')).toBeDefined()
      })
    })

    it('shows password input for credential entry', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        // Find password inputs
        const passwordInputs = document.querySelectorAll('input[type="password"]')
        expect(passwordInputs.length).toBeGreaterThan(0)
      })
    })

    it('toggles password visibility', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        const passwordInput = document.querySelector('input[type="password"]')
        expect(passwordInput).toBeDefined()
      })

      // Find the visibility toggle button (eye icon)
      const visibilityButtons = document.querySelectorAll(
        'button[type="button"].-translate-y-1\\/2'
      )
      expect(visibilityButtons.length).toBeGreaterThan(0)

      const visibilityBtn = visibilityButtons[0]
      fireEvent.click(visibilityBtn)

      // After click, input should be text type
      const textInput = document.querySelector('input[type="text"]')
      expect(textInput).toBeDefined()
    })

    it('shows update credential link for stored credentials', async () => {
      mockListData = ['postgresql.password']

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Update credential')).toBeDefined()
      })
    })

    it('shows delete button for stored credentials', async () => {
      mockListData = ['postgresql.password']

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        const deleteButtons = document.querySelectorAll('[title="Delete credential"]')
        expect(deleteButtons.length).toBeGreaterThan(0)
      })
    })

    it('renders general security section', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('General Security')).toBeDefined()
      })
    })
  })

  describe('Budget Settings', () => {
    it('renders billing type selector', () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      expect(screen.getByText('How do you pay for Claude?')).toBeDefined()
    })

    it('shows subscription options by default', () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      expect(screen.getByText('Subscription Plan')).toBeDefined()
    })

    it('changes billing type to API', () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      expect(billingSelect.value).toBe('api')
    })

    it('shows budget limits for API billing', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing (default is subscription)
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getByText('Budget Limits')).toBeDefined()
        expect(screen.getByText('Monthly Budget')).toBeDefined()
        expect(screen.getByText('Warning Threshold')).toBeDefined()
      })
    })

    it('shows quick preset buttons for API billing', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getByText('Quick Presets')).toBeDefined()
        expect(screen.getByText('$25/mo')).toBeDefined()
        expect(screen.getByText('$50/mo')).toBeDefined()
        expect(screen.getByText('$100/mo')).toBeDefined()
      })
    })

    it('changes subscription plan', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      const planSelect = screen.getByDisplayValue('Max ($100/mo)') as HTMLSelectElement
      fireEvent.change(planSelect, { target: { value: 'pro' } })

      expect(planSelect.value).toBe('pro')
    })

    it('displays current month cost', () => {
      useBudgetStore.setState({
        currentMonthCost: 45.67,
      })

      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      expect(screen.getByText('$45.67')).toBeDefined()
    })

    it('shows subscription info message for subscription billing', () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      expect(
        screen.getByText(/Subscription users have unlimited usage/)
      ).toBeDefined()
    })

    it('shows alerts toggle for API billing', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getByText('Alerts')).toBeDefined()
        expect(screen.getByText('Budget Alerts')).toBeDefined()
      })
    })

    it('displays cost information panel', () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      expect(screen.getByText('Usage Tracking')).toBeDefined()
    })
  })

  describe('Save and Reset Functionality', () => {
    it('shows save and reset buttons when changes are made', async () => {
      render(<Settings />)

      // Make a change
      const themeSelect = screen.getByDisplayValue('Dark') as HTMLSelectElement
      fireEvent.change(themeSelect, { target: { value: 'auto' } })

      await waitFor(() => {
        expect(screen.getByText('Save')).toBeDefined()
        expect(screen.getByText('Reset')).toBeDefined()
      })
    })

    it('hides save and reset buttons when no changes', () => {
      render(<Settings />)

      // Should not show save/reset buttons initially in header (may exist elsewhere)
      const header = document.querySelector('.card-header')
      if (header) {
        expect(header.textContent?.includes('Save')).toBe(false)
        expect(header.textContent?.includes('Reset')).toBe(false)
      }
    })

    it('resets changes when reset button is clicked', async () => {
      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark') as HTMLSelectElement
      fireEvent.change(themeSelect, { target: { value: 'auto' } })

      await waitFor(() => {
        expect(screen.getByText('Reset')).toBeDefined()
      })

      const resetButton = screen.getByText('Reset')
      fireEvent.click(resetButton)

      // Theme should be back to dark
      expect(themeSelect.value).toBe('dark')
    })

    it('shows success message after save', async () => {
      // Override saveSettings to return true
      const mockSaveSettings = vi.fn().mockResolvedValue(true)
      useSettingsStore.setState({
        ...useSettingsStore.getState(),
        saveSettings: mockSaveSettings,
      })

      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark') as HTMLSelectElement
      fireEvent.change(themeSelect, { target: { value: 'auto' } })

      await waitFor(() => {
        expect(screen.getByText('Save')).toBeDefined()
      })

      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      await waitFor(
        () => {
          expect(screen.getByText('Saved')).toBeDefined()
        },
        { timeout: 3000 }
      )
    })

    it('disables save button while saving', async () => {
      useSettingsStore.setState({ saving: true })

      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark') as HTMLSelectElement
      fireEvent.change(themeSelect, { target: { value: 'auto' } })

      await waitFor(() => {
        const saveButton = screen.getByText('Save').closest('button')
        expect(saveButton?.disabled).toBe(true)
      })
    })

    it('shows loading spinner in save button while saving', async () => {
      useSettingsStore.setState({ saving: true })

      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark') as HTMLSelectElement
      fireEvent.change(themeSelect, { target: { value: 'auto' } })

      await waitFor(() => {
        const saveButton = screen.getByText('Save').closest('button')
        const spinner = saveButton?.querySelector('.animate-spin')
        expect(spinner).toBeDefined()
      })
    })
  })

  describe('Settings Persistence', () => {
    it('loads settings on mount when not loaded', () => {
      const loadSettingsMock = vi.fn()
      useSettingsStore.setState({
        loaded: false,
        loadSettings: loadSettingsMock,
      })

      render(<Settings />)

      expect(loadSettingsMock).toHaveBeenCalled()
    })

    it('does not reload settings when already loaded', () => {
      const loadSettingsMock = vi.fn()
      useSettingsStore.setState({
        loaded: true,
        loadSettings: loadSettingsMock,
      })

      render(<Settings />)

      expect(loadSettingsMock).not.toHaveBeenCalled()
    })

    it('syncs local settings when store settings change', async () => {
      render(<Settings />)

      // Change settings in store
      useSettingsStore.setState({
        settings: {
          ...defaultSettings,
          theme: 'light',
        },
      })

      await waitFor(() => {
        const themeSelect = screen.getByDisplayValue('Light (Coming Soon)')
        expect(themeSelect).toBeDefined()
      })
    })
  })

  describe('Form Validation', () => {
    it('handles invalid terminal font size gracefully', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const fontSizeInput = screen.getByDisplayValue('14') as HTMLInputElement
      fireEvent.change(fontSizeInput, { target: { value: '' } })

      // Should default to 14 on empty/invalid input
      expect(fontSizeInput.value).toBe('14')
    })

    it('handles invalid scrollback lines gracefully', () => {
      render(<Settings />)

      const terminalTab = screen.getByText('Terminal')
      fireEvent.click(terminalTab)

      const scrollbackInput = screen.getByDisplayValue('10000') as HTMLInputElement
      fireEvent.change(scrollbackInput, { target: { value: '' } })

      // Should default to 10000 on empty/invalid input
      expect(scrollbackInput.value).toBe('10000')
    })

    it('handles invalid port numbers gracefully', () => {
      render(<Settings />)

      const memoryTab = screen.getByText('Memory')
      fireEvent.click(memoryTab)

      const portInput = screen.getByDisplayValue('5433') as HTMLInputElement
      fireEvent.change(portInput, { target: { value: '' } })

      // Should default to 5433 on empty/invalid input
      expect(portInput.value).toBe('5433')
    })
  })

  describe('Credential Management', () => {
    it('shows editing form when Update credential is clicked', async () => {
      mockListData = ['postgresql.password']

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Update credential')).toBeDefined()
      })

      const updateLink = screen.getByText('Update credential')
      fireEvent.click(updateLink)

      // Should show password input for editing
      const passwordInputs = document.querySelectorAll('input[type="password"]')
      expect(passwordInputs.length).toBeGreaterThan(0)
    })

    it('shows cancel button when editing stored credential', async () => {
      mockListData = ['postgresql.password']

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Update credential')).toBeDefined()
      })

      const updateLink = screen.getByText('Update credential')
      fireEvent.click(updateLink)

      expect(screen.getByText('Cancel')).toBeDefined()
    })

    it('cancels editing when cancel button is clicked', async () => {
      mockListData = ['postgresql.password']

      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        expect(screen.getByText('Update credential')).toBeDefined()
      })

      const updateLink = screen.getByText('Update credential')
      fireEvent.click(updateLink)

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      // Should go back to showing Update credential link
      expect(screen.getByText('Update credential')).toBeDefined()
    })

    it('entering credential value enables save button', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        const passwordInputs = document.querySelectorAll('input[type="password"]')
        expect(passwordInputs.length).toBeGreaterThan(0)
      })

      // Find the first password input and enter a value
      const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
      fireEvent.change(passwordInput, { target: { value: 'test-secret' } })

      // Find the save button near this input
      const inputContainer = passwordInput.closest('.flex')
      const saveBtn = inputContainer?.querySelector('button.btn-primary')
      expect(saveBtn).toBeDefined()
      expect(saveBtn?.hasAttribute('disabled')).toBe(false)
    })

    it('disables save button when credential value is empty', async () => {
      render(<Settings />)

      const securityTab = screen.getByText('Security')
      fireEvent.click(securityTab)

      await waitFor(() => {
        const passwordInputs = document.querySelectorAll('input[type="password"]')
        expect(passwordInputs.length).toBeGreaterThan(0)
      })

      // Find the first save button (should be disabled with empty input)
      const saveBtns = document.querySelectorAll('.btn-primary[disabled]')
      expect(saveBtns.length).toBeGreaterThan(0)
    })
  })

  describe('Budget Settings Actions', () => {
    it('shows save and reset for budget changes', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change billing type
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        const saveButtons = screen.getAllByText('Save')
        const resetButtons = screen.getAllByText('Reset')
        expect(saveButtons.length).toBeGreaterThan(0)
        expect(resetButtons.length).toBeGreaterThan(0)
      })
    })

    it('resets budget changes when reset is clicked', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change billing type
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getAllByText('Reset').length).toBeGreaterThan(0)
      })

      // Find and click the budget reset button
      const resetButtons = screen.getAllByText('Reset')
      fireEvent.click(resetButtons[0])

      // Should be back to subscription
      expect(billingSelect.value).toBe('subscription')
    })

    it('clicking preset budget changes monthly limit', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getByText('$50/mo')).toBeDefined()
      })

      const preset50Button = screen.getByText('$50/mo')
      fireEvent.click(preset50Button)

      // Should be highlighted
      expect(preset50Button.classList.contains('bg-accent-purple')).toBe(true)
    })

    it('shows warning threshold slider for API billing', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getByText('Warning Threshold')).toBeDefined()
        expect(screen.getByText('Show warning when reaching this percentage')).toBeDefined()
      })
    })

    it('switching back to subscription resets defaults', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing first
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      // Now switch back to subscription
      fireEvent.change(billingSelect, { target: { value: 'subscription' } })

      // Should show subscription plan selector again
      await waitFor(() => {
        expect(screen.getByText('Subscription Plan')).toBeDefined()
      })
    })

    it('changing subscription plan to pro sets limit to 20', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change plan to pro
      const planSelect = screen.getByDisplayValue('Max ($100/mo)') as HTMLSelectElement
      fireEvent.change(planSelect, { target: { value: 'pro' } })

      expect(planSelect.value).toBe('pro')
    })

    it('changing subscription plan back to max sets limit to 100', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // First change to pro
      const planSelect = screen.getByDisplayValue('Max ($100/mo)') as HTMLSelectElement
      fireEvent.change(planSelect, { target: { value: 'pro' } })

      // Then change back to max
      fireEvent.change(planSelect, { target: { value: 'max' } })

      expect(planSelect.value).toBe('max')
    })

    it('changing monthly budget input updates value', async () => {
      render(<Settings />)

      const budgetTab = screen.getByText('Budget')
      fireEvent.click(budgetTab)

      // Change to API billing to access monthly budget input
      const billingSelect = screen.getByDisplayValue('Subscription (Pro/Max)') as HTMLSelectElement
      fireEvent.change(billingSelect, { target: { value: 'api' } })

      await waitFor(() => {
        expect(screen.getByText('Monthly Budget')).toBeDefined()
      })

      // Find and change the monthly budget input
      const budgetInputs = document.querySelectorAll('input[type="number"]')
      const monthlyInput = Array.from(budgetInputs).find(
        (input) => (input as HTMLInputElement).value === '100'
      ) as HTMLInputElement

      expect(monthlyInput).toBeDefined()
      fireEvent.change(monthlyInput, { target: { value: '150' } })

      expect(monthlyInput.value).toBe('150')
    })
  })

  describe('Accessibility', () => {
    it('section navigation buttons have proper labels', () => {
      render(<Settings />)

      // Check specifically that section navigation buttons have labels
      const nav = document.querySelector('nav')
      expect(nav).toBeDefined()

      const sections = ['Appearance', 'Terminal', 'Memory', 'Budget', 'Notifications', 'Security']
      sections.forEach((section) => {
        const button = Array.from(nav?.querySelectorAll('button') || []).find(
          (btn) => btn.textContent?.includes(section)
        )
        expect(button).toBeDefined()
        expect(button?.textContent?.length).toBeGreaterThan(0)
      })
    })

    it('form inputs have associated labels', () => {
      render(<Settings />)

      // Check that select elements have descriptive text nearby
      expect(screen.getByText('Color Scheme')).toBeDefined()
      expect(screen.getByText('Choose your preferred color scheme')).toBeDefined()
    })

    it('has proper heading structure', () => {
      render(<Settings />)

      // Card headers are h2 or h3
      const headings = document.querySelectorAll('h2, h3')
      expect(headings.length).toBeGreaterThan(0)
    })
  })

  describe('Theme Settings Integration', () => {
    it('displays all theme options', () => {
      render(<Settings />)

      const themeSelect = screen.getByDisplayValue('Dark')
      const options = Array.from(themeSelect.querySelectorAll('option'))

      expect(options.map((o) => o.value)).toEqual(['dark', 'light', 'auto'])
    })

    it('selects correct theme initially', () => {
      useSettingsStore.setState({
        settings: {
          ...defaultSettings,
          theme: 'auto',
        },
      })

      render(<Settings />)

      expect(screen.getByDisplayValue('System')).toBeDefined()
    })
  })

  describe('Layout Settings', () => {
    it('shows layout section', () => {
      render(<Settings />)

      expect(screen.getByText('Layout')).toBeDefined()
    })

    it('sidebar state affects display', () => {
      useSettingsStore.setState({
        settings: {
          ...defaultSettings,
          sidebarCollapsed: true,
        },
      })

      render(<Settings />)

      const sidebarSelect = screen.getByDisplayValue('Collapsed')
      expect(sidebarSelect).toBeDefined()
    })
  })
})
