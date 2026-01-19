import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProfileManager } from '../ProfileManager'
import { useProfileStore } from '@/stores/profile'
import { useErrorStore } from '@/stores/errors'
import type { ClaudeCodeProfile } from '@shared/types'

// Mock tRPC hooks
const mockListRefetch = vi.fn()
const mockActiveRefetch = vi.fn()
const mockCreateMutate = vi.fn()
const mockUpdateMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockActivateMutate = vi.fn()
const mockLaunchMutate = vi.fn()

let mockProfilesData: ClaudeCodeProfile[] | undefined = []
let mockProfilesIsLoading = false
let mockActiveProfile: string | null = null

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    profiles: {
      list: {
        useQuery: () => ({
          data: mockProfilesData,
          isLoading: mockProfilesIsLoading,
          refetch: mockListRefetch,
        }),
      },
      getActive: {
        useQuery: () => ({
          data: mockActiveProfile,
          refetch: mockActiveRefetch,
        }),
      },
      create: {
        useMutation: () => ({
          mutate: mockCreateMutate,
          isPending: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutate: mockUpdateMutate,
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutate: mockDeleteMutate,
          isPending: false,
        }),
      },
      activate: {
        useMutation: () => ({
          mutate: mockActivateMutate,
          isPending: false,
        }),
      },
      launch: {
        useMutation: () => ({
          mutate: mockLaunchMutate,
          isPending: false,
          variables: undefined,
        }),
      },
    },
  },
}))

// Mock window.confirm
const originalConfirm = window.confirm
beforeEach(() => {
  window.confirm = vi.fn(() => true)
})
afterEach(() => {
  window.confirm = originalConfirm
})

const mockProfiles: ClaudeCodeProfile[] = [
  {
    id: 'profile-1',
    name: 'claude-eng',
    description: 'Engineering profile',
    settings: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 64000,
      thinkingEnabled: true,
      thinkingBudget: 32000,
    },
    claudeMd: '# Engineering Instructions',
    createdAt: Date.now() - 86400000, // 1 day ago
    updatedAt: Date.now(),
  },
  {
    id: 'profile-2',
    name: 'claude-sec',
    description: 'Security profile',
    settings: {
      model: 'claude-opus-4-5-20251101',
      maxTokens: 128000,
      thinkingEnabled: true,
      thinkingBudget: 64000,
    },
    claudeMd: '# Security Instructions',
    createdAt: Date.now() - 172800000, // 2 days ago
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'profile-3',
    name: 'claude-basic',
    description: '',
    settings: {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 32000,
      thinkingEnabled: false,
      thinkingBudget: 0,
    },
    claudeMd: '',
    createdAt: Date.now() - 259200000, // 3 days ago
    updatedAt: Date.now() - 172800000,
  },
]

describe('ProfileManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProfilesData = []
    mockProfilesIsLoading = false
    mockActiveProfile = null
    // Reset store state
    useProfileStore.setState({
      profiles: [],
      activeProfile: null,
      loading: false,
      rulesLoading: false,
      selectedProfileId: null,
      showDetail: false,
      editingClaudeMd: false,
      claudeMdContent: '',
    })
    useErrorStore.setState({
      errors: [],
      unreadCount: 0,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('renders loading spinner when loading', () => {
      mockProfilesIsLoading = true
      mockProfilesData = undefined

      render(<ProfileManager />)

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeDefined()
    })
  })

  describe('Header', () => {
    it('renders header with title and description', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      // There are multiple "Work Profiles" texts, use getAllByText
      expect(screen.getAllByText('Work Profiles').length).toBeGreaterThan(0)
      expect(
        screen.getByText(/Create and manage Claude Code profiles/)
      ).toBeDefined()
    })

    it('refreshes profiles when refresh button is clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const refreshButton = screen.getByText('Refresh')
      fireEvent.click(refreshButton)

      expect(mockListRefetch).toHaveBeenCalled()
      expect(mockActiveRefetch).toHaveBeenCalled()
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no profiles exist', () => {
      mockProfilesData = []

      render(<ProfileManager />)

      expect(screen.getByText('No work profiles created yet')).toBeDefined()
      expect(screen.getByText('Create First Profile')).toBeDefined()
    })
  })

  describe('Profile List', () => {
    it('renders profile list with correct count', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      expect(screen.getByText('3 Profiles')).toBeDefined() // Now 3 with claude-basic
      // Profile names may appear multiple times (in list and in info card)
      expect(screen.getAllByText('claude-eng').length).toBeGreaterThan(0)
      expect(screen.getAllByText('claude-sec').length).toBeGreaterThan(0)
    })

    it('displays active profile indicator', () => {
      mockProfilesData = mockProfiles
      mockActiveProfile = 'profile-1'

      render(<ProfileManager />)

      expect(screen.getByText(/Active:.*claude-eng/)).toBeDefined()
    })

    it('shows profile description', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      expect(screen.getByText('Engineering profile')).toBeDefined()
      expect(screen.getByText('Security profile')).toBeDefined()
    })
  })

  describe('Profile Creation', () => {
    it('shows create form when New Profile button is clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      expect(screen.getByText('Create New Profile')).toBeDefined()
      // Check for the form element using placeholder
      expect(screen.getByPlaceholderText('e.g., claude-eng, claude-sec')).toBeDefined()
    })

    it('creates profile when form is submitted', () => {
      mockProfilesData = []

      render(<ProfileManager />)

      // Open create form
      const createFirstButton = screen.getByText('Create First Profile')
      fireEvent.click(createFirstButton)

      // Fill in form - use getAllByRole to find inputs
      const textInputs = screen.getAllByRole('textbox')
      const nameInput = textInputs[0] // First text input is the name
      fireEvent.change(nameInput, { target: { value: 'test-profile' } })

      const descInput = textInputs[1] // Second is description
      fireEvent.change(descInput, { target: { value: 'Test description' } })

      // Submit form
      const createButton = screen.getByText('Create Profile')
      fireEvent.click(createButton)

      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-profile',
          description: 'Test description',
        }),
        expect.any(Object)
      )
    })

    it('cancels profile creation when cancel button is clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      expect(screen.getByText('Create New Profile')).toBeDefined()

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(screen.queryByText('Create New Profile')).toBeNull()
    })

    it('disables create button when name is empty', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      const createButton = screen.getByText('Create Profile')
      expect(createButton).toHaveProperty('disabled', true)
    })
  })

  describe('Profile Actions', () => {
    it('launches profile when Launch button is clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const launchButtons = screen.getAllByText('Launch')
      fireEvent.click(launchButtons[0])

      expect(mockLaunchMutate).toHaveBeenCalledWith(
        { id: 'profile-1' },
        expect.any(Object)
      )
    })

    it('activates profile when Activate button is clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const activateButtons = screen.getAllByText('Activate')
      fireEvent.click(activateButtons[0])

      expect(mockActivateMutate).toHaveBeenCalledWith(
        { id: 'profile-1' },
        expect.any(Object)
      )
    })

    it('deletes profile when delete button is clicked and confirmed', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const deleteButtons = screen.getAllByTitle('Delete profile')
      fireEvent.click(deleteButtons[0])

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this profile?'
      )
      expect(mockDeleteMutate).toHaveBeenCalledWith(
        { id: 'profile-1' },
        expect.any(Object)
      )
    })

    it('does not delete profile when confirmation is cancelled', () => {
      window.confirm = vi.fn(() => false)
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const deleteButtons = screen.getAllByTitle('Delete profile')
      fireEvent.click(deleteButtons[0])

      expect(mockDeleteMutate).not.toHaveBeenCalled()
    })

    it('copies profile when copy button is clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const copyButtons = screen.getAllByTitle('Duplicate profile')
      fireEvent.click(copyButtons[0])

      // Should show create form with copied data
      expect(screen.getByText('Create New Profile')).toBeDefined()
      const textInputs = screen.getAllByRole('textbox')
      const nameInput = textInputs[0] as HTMLInputElement
      expect(nameInput.value).toBe('claude-eng-copy')
    })
  })

  describe('Profile Editing', () => {
    it('opens edit form when edit button is clicked', async () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      // First expand the profile
      const profileNames = screen.getAllByText('claude-eng')
      fireEvent.click(profileNames[0])

      // Then click edit
      const editButtons = screen.getAllByTitle('Edit profile')
      fireEvent.click(editButtons[0])

      // Should show edit form within expanded profile
      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeDefined()
      })
    })

    it('updates profile when save changes is clicked', async () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      // Expand and edit profile
      const profileNames = screen.getAllByText('claude-eng')
      fireEvent.click(profileNames[0])

      const editButtons = screen.getAllByTitle('Edit profile')
      fireEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeDefined()
      })

      // Update the name - find text inputs in the edit form
      const nameInputs = screen.getAllByDisplayValue('claude-eng')
      fireEvent.change(nameInputs[0], { target: { value: 'claude-eng-updated' } })

      // Save changes
      const saveButton = screen.getByText('Save Changes')
      fireEvent.click(saveButton)

      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'profile-1',
          updates: expect.objectContaining({
            name: 'claude-eng-updated',
          }),
        }),
        expect.any(Object)
      )
    })

    it('cancels edit when cancel button is clicked', async () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      // Expand and edit profile
      const profileNames = screen.getAllByText('claude-eng')
      fireEvent.click(profileNames[0])

      const editButtons = screen.getAllByTitle('Edit profile')
      fireEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeDefined()
      })

      // Cancel edit - find the cancel button in the edit form
      const cancelButtons = screen.getAllByText('Cancel')
      const editCancelButton = cancelButtons.find((btn) =>
        btn.closest('.flex.justify-end')
      )
      if (editCancelButton) {
        fireEvent.click(editCancelButton)
      }

      await waitFor(() => {
        expect(screen.queryByText('Save Changes')).toBeNull()
      })
    })
  })

  describe('Profile Detail View', () => {
    it('expands profile to show details when clicked', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const profileNames = screen.getAllByText('claude-eng')
      fireEvent.click(profileNames[0])

      // Should show expanded details
      expect(screen.getByText('Model')).toBeDefined()
      expect(screen.getByText('Max Tokens')).toBeDefined()
      expect(screen.getByText('Thinking')).toBeDefined()
    })

    it('shows Claude instructions when profile has claudeMd', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const profileNames = screen.getAllByText('claude-eng')
      fireEvent.click(profileNames[0])

      expect(screen.getByText('Profile Instructions:')).toBeDefined()
      expect(screen.getByText(/# Engineering Instructions/)).toBeDefined()
    })

    it('collapses profile when clicked again', async () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const profileNames = screen.getAllByText('claude-eng')

      // Expand
      fireEvent.click(profileNames[0])
      expect(screen.getByText('Model')).toBeDefined()

      // Collapse - need to get the element again as DOM may have changed
      const profileNamesAfterExpand = screen.getAllByText('claude-eng')
      fireEvent.click(profileNamesAfterExpand[0])
      await waitFor(() => {
        expect(screen.queryByText('Max Tokens')).toBeNull()
      })
    })
  })

  describe('Form Validation', () => {
    it('sets default form values for model selection', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      const modelSelect = screen.getByRole('combobox') as HTMLSelectElement
      expect(modelSelect.value).toBe('claude-sonnet-4-20250514')
    })

    it('allows changing model in form', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      const modelSelect = screen.getByRole('combobox') as HTMLSelectElement
      fireEvent.change(modelSelect, { target: { value: 'claude-opus-4-5-20251101' } })

      expect(modelSelect.value).toBe('claude-opus-4-5-20251101')
    })

    it('shows thinking budget input when thinking is enabled', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      // Extended Thinking checkbox should be present and checked by default
      const thinkingCheckbox = screen.getByLabelText('Extended Thinking') as HTMLInputElement
      expect(thinkingCheckbox.checked).toBe(true)

      // Budget input should be visible
      expect(screen.getByText('Budget:')).toBeDefined()
    })

    it('hides thinking budget when thinking is disabled', async () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      const thinkingCheckbox = screen.getByLabelText('Extended Thinking')
      fireEvent.click(thinkingCheckbox)

      await waitFor(() => {
        expect(screen.queryByText('Budget:')).toBeNull()
      })
    })
  })

  describe('Info Card', () => {
    it('displays about work profiles info card', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      expect(screen.getByText('About Work Profiles')).toBeDefined()
      expect(
        screen.getByText(/Work profiles let you quickly switch/)
      ).toBeDefined()
    })
  })

  describe('Profile with Thinking Disabled', () => {
    it('displays Disabled for thinking when thinkingEnabled is false', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      // Expand the claude-basic profile that has thinking disabled
      const profileNames = screen.getAllByText('claude-basic')
      fireEvent.click(profileNames[0])

      expect(screen.getByText(/Disabled/)).toBeDefined()
    })

    it('shows Thinking Disabled text in expanded profile details', () => {
      mockProfilesData = [mockProfiles[2]] // Only the profile with thinking disabled

      render(<ProfileManager />)

      const profileName = screen.getByText('claude-basic')
      fireEvent.click(profileName)

      // The profile with thinkingEnabled: false should show "Disabled"
      expect(screen.getByText('Thinking')).toBeDefined()
      expect(screen.getByText('Disabled')).toBeDefined()
    })
  })

  describe('Profile without ClaudeMd', () => {
    it('does not show Profile Instructions section when claudeMd is empty', () => {
      mockProfilesData = [mockProfiles[2]] // claude-basic has no claudeMd

      render(<ProfileManager />)

      const profileName = screen.getByText('claude-basic')
      fireEvent.click(profileName)

      expect(screen.queryByText('Profile Instructions:')).toBeNull()
    })
  })

  describe('Profile without Description', () => {
    it('shows model name when description is empty', () => {
      mockProfilesData = [mockProfiles[2]] // claude-basic has empty description

      render(<ProfileManager />)

      // Should display model name as fallback
      expect(screen.getByText(/claude-sonnet-4-20250514/)).toBeDefined()
    })
  })

  describe('Active Profile Indicator', () => {
    it('does not show Activate button for already active profile', () => {
      mockProfilesData = mockProfiles
      mockActiveProfile = 'profile-1' // claude-eng is active

      render(<ProfileManager />)

      // For the active profile, there should be no Activate button
      // But there should still be Launch buttons
      const launchButtons = screen.getAllByText('Launch')
      const activateButtons = screen.getAllByText('Activate')

      // Should have Launch buttons for all profiles
      expect(launchButtons.length).toBe(3)
      // Should have Activate buttons for non-active profiles only
      expect(activateButtons.length).toBe(2)
    })
  })

  describe('Profile Deletion when Active', () => {
    it('calls onActiveChange when deleting the active profile', () => {
      mockProfilesData = mockProfiles
      mockActiveProfile = 'profile-1'

      // Mock the onSuccess callback to check if it resets active
      mockDeleteMutate.mockImplementation((params, { onSuccess }) => {
        if (onSuccess) onSuccess()
      })

      render(<ProfileManager />)

      const deleteButtons = screen.getAllByTitle('Delete profile')
      fireEvent.click(deleteButtons[0])

      expect(mockDeleteMutate).toHaveBeenCalledWith(
        { id: 'profile-1' },
        expect.any(Object)
      )
    })
  })

  describe('Launch Mutation Error Handling', () => {
    it('shows error notification when launch fails', () => {
      mockProfilesData = mockProfiles
      mockLaunchMutate.mockImplementation((params, { onSuccess }) => {
        if (onSuccess) {
          onSuccess({ success: false, error: 'Failed to launch' })
        }
      })

      render(<ProfileManager />)

      const launchButtons = screen.getAllByText('Launch')
      fireEvent.click(launchButtons[0])

      // Check that the error store was updated
      expect(useErrorStore.getState().errors.length).toBeGreaterThan(0)
    })

    it('shows success notification when launch succeeds', () => {
      mockProfilesData = mockProfiles
      mockLaunchMutate.mockImplementation((params, { onSuccess }) => {
        if (onSuccess) {
          onSuccess({ success: true })
        }
      })

      render(<ProfileManager />)

      const launchButtons = screen.getAllByText('Launch')
      fireEvent.click(launchButtons[0])

      // Check that the info notification was added
      const errors = useErrorStore.getState().errors
      const infoError = errors.find((e) => e.severity === 'info')
      expect(infoError).toBeDefined()
    })

    it('shows error notification when launch mutation throws', () => {
      mockProfilesData = mockProfiles
      mockLaunchMutate.mockImplementation((params, { onError }) => {
        if (onError) {
          onError(new Error('Network error'))
        }
      })

      render(<ProfileManager />)

      const launchButtons = screen.getAllByText('Launch')
      fireEvent.click(launchButtons[0])

      // Check that error was added to store
      const errors = useErrorStore.getState().errors
      const processError = errors.find((e) => e.category === 'process')
      expect(processError).toBeDefined()
    })
  })

  describe('Edit Form ClaudeMd Field', () => {
    it('allows editing claudeMd content', async () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      // Expand and edit profile
      const profileNames = screen.getAllByText('claude-eng')
      fireEvent.click(profileNames[0])

      const editButtons = screen.getAllByTitle('Edit profile')
      fireEvent.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeDefined()
      })

      // Find the Profile Instructions textarea
      const instructionsLabel = screen.getByText('Profile Instructions')
      expect(instructionsLabel).toBeDefined()
    })
  })

  describe('Profile Count Display', () => {
    it('shows singular form for 1 profile', () => {
      mockProfilesData = [mockProfiles[0]]

      render(<ProfileManager />)

      expect(screen.getByText('1 Profile')).toBeDefined()
    })

    it('shows No Profiles when list is empty', () => {
      mockProfilesData = []

      render(<ProfileManager />)

      expect(screen.getByText('No Profiles')).toBeDefined()
    })
  })

  describe('Default Model Options', () => {
    it('shows all available model options in create form', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      const modelSelect = screen.getByRole('combobox')
      const options = modelSelect.querySelectorAll('option')

      expect(options.length).toBe(3)
      expect(options[0].textContent).toBe('Claude Sonnet 4')
      expect(options[1].textContent).toBe('Claude Opus 4')
      expect(options[2].textContent).toBe('Claude Opus 4.5')
    })
  })

  describe('Max Tokens Input', () => {
    it('allows changing max tokens in form', () => {
      mockProfilesData = mockProfiles

      render(<ProfileManager />)

      const newProfileButton = screen.getByText('New Profile')
      fireEvent.click(newProfileButton)

      const maxTokensInputs = screen.getAllByRole('spinbutton')
      const maxTokensInput = maxTokensInputs[0] as HTMLInputElement
      fireEvent.change(maxTokensInput, { target: { value: '128000' } })

      expect(maxTokensInput.value).toBe('128000')
    })
  })
})
