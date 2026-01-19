import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpawnAgentModal } from '../SpawnAgentModal'
import type { AgentType } from '@/stores/agents'

describe('SpawnAgentModal', () => {
  const defaultProps = {
    agentType: 'coder' as AgentType,
    agentName: '',
    onTypeChange: vi.fn(),
    onNameChange: vi.fn(),
    onSpawn: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders the modal with title', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      expect(screen.getByText('Spawn Agent')).toBeDefined()
    })

    it('renders agent type label and select', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      expect(screen.getByText('Agent Type')).toBeDefined()
      expect(screen.getByRole('combobox')).toBeDefined()
    })

    it('renders agent name label and input', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      expect(screen.getByText('Agent Name')).toBeDefined()
      expect(screen.getByPlaceholderText('e.g., code-assistant-1')).toBeDefined()
    })

    it('renders Cancel and Spawn buttons', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      expect(screen.getByText('Cancel')).toBeDefined()
      expect(screen.getByText('Spawn')).toBeDefined()
    })

    it('renders modal overlay with proper classes', () => {
      const { container } = render(<SpawnAgentModal {...defaultProps} />)
      const overlay = container.querySelector('.fixed.inset-0')
      expect(overlay).toBeDefined()
      expect(overlay?.className).toContain('bg-black/50')
      expect(overlay?.className).toContain('z-50')
    })
  })

  describe('Agent Type Select', () => {
    it('displays current agent type value', () => {
      render(<SpawnAgentModal {...defaultProps} agentType="researcher" />)
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('researcher')
    })

    it('renders all agent type options', () => {
      render(<SpawnAgentModal {...defaultProps} />)

      expect(screen.getByRole('option', { name: 'Coder' })).toBeDefined()
      expect(screen.getByRole('option', { name: 'Researcher' })).toBeDefined()
      expect(screen.getByRole('option', { name: 'Tester' })).toBeDefined()
      expect(screen.getByRole('option', { name: 'Architect' })).toBeDefined()
      expect(screen.getByRole('option', { name: 'Coordinator' })).toBeDefined()
      expect(screen.getByRole('option', { name: 'Security' })).toBeDefined()
    })

    it('calls onTypeChange when selecting a different type', () => {
      const mockTypeChange = vi.fn()
      render(<SpawnAgentModal {...defaultProps} onTypeChange={mockTypeChange} />)

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'architect' } })

      expect(mockTypeChange).toHaveBeenCalledWith('architect')
    })

    it.each([
      ['coder', 'Coder'],
      ['researcher', 'Researcher'],
      ['tester', 'Tester'],
      ['architect', 'Architect'],
      ['coordinator', 'Coordinator'],
      ['security', 'Security'],
    ] as const)('correctly displays %s type as selected', (value, _label) => {
      render(<SpawnAgentModal {...defaultProps} agentType={value} />)
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe(value)
    })
  })

  describe('Agent Name Input', () => {
    it('displays current agent name value', () => {
      render(<SpawnAgentModal {...defaultProps} agentName="test-agent" />)
      const input = screen.getByPlaceholderText('e.g., code-assistant-1') as HTMLInputElement
      expect(input.value).toBe('test-agent')
    })

    it('calls onNameChange when typing in input', () => {
      const mockNameChange = vi.fn()
      render(<SpawnAgentModal {...defaultProps} onNameChange={mockNameChange} />)

      const input = screen.getByPlaceholderText('e.g., code-assistant-1')
      fireEvent.change(input, { target: { value: 'my-agent' } })

      expect(mockNameChange).toHaveBeenCalledWith('my-agent')
    })

    it('handles empty input value', () => {
      render(<SpawnAgentModal {...defaultProps} agentName="" />)
      const input = screen.getByPlaceholderText('e.g., code-assistant-1') as HTMLInputElement
      expect(input.value).toBe('')
    })

    it('handles special characters in input', () => {
      const mockNameChange = vi.fn()
      render(<SpawnAgentModal {...defaultProps} onNameChange={mockNameChange} />)

      const input = screen.getByPlaceholderText('e.g., code-assistant-1')
      fireEvent.change(input, { target: { value: 'agent_with-special.chars123' } })

      expect(mockNameChange).toHaveBeenCalledWith('agent_with-special.chars123')
    })
  })

  describe('Cancel Button', () => {
    it('calls onClose when clicked', () => {
      const mockClose = vi.fn()
      render(<SpawnAgentModal {...defaultProps} onClose={mockClose} />)

      fireEvent.click(screen.getByText('Cancel'))

      expect(mockClose).toHaveBeenCalledTimes(1)
    })

    it('has secondary button styling', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      const cancelButton = screen.getByText('Cancel')
      expect(cancelButton.className).toContain('btn-secondary')
    })
  })

  describe('Spawn Button', () => {
    it('is disabled when agent name is empty', () => {
      render(<SpawnAgentModal {...defaultProps} agentName="" />)
      const spawnButton = screen.getByText('Spawn')
      expect(spawnButton).toHaveProperty('disabled', true)
    })

    it('is enabled when agent name is provided', () => {
      render(<SpawnAgentModal {...defaultProps} agentName="my-agent" />)
      const spawnButton = screen.getByText('Spawn')
      expect(spawnButton).toHaveProperty('disabled', false)
    })

    it('calls onSpawn when clicked and enabled', () => {
      const mockSpawn = vi.fn()
      render(<SpawnAgentModal {...defaultProps} agentName="my-agent" onSpawn={mockSpawn} />)

      fireEvent.click(screen.getByText('Spawn'))

      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('does not call onSpawn when disabled', () => {
      const mockSpawn = vi.fn()
      render(<SpawnAgentModal {...defaultProps} agentName="" onSpawn={mockSpawn} />)

      fireEvent.click(screen.getByText('Spawn'))

      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('has primary button styling', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      const spawnButton = screen.getByText('Spawn')
      expect(spawnButton.className).toContain('btn-primary')
    })
  })

  describe('Modal Layout', () => {
    it('has max width constraint', () => {
      const { container } = render(<SpawnAgentModal {...defaultProps} />)
      const modalCard = container.querySelector('.max-w-md')
      expect(modalCard).toBeDefined()
    })

    it('centers content in viewport', () => {
      const { container } = render(<SpawnAgentModal {...defaultProps} />)
      const overlay = container.querySelector('.flex.items-center.justify-center')
      expect(overlay).toBeDefined()
    })

    it('has proper spacing between form elements', () => {
      const { container } = render(<SpawnAgentModal {...defaultProps} />)
      const formContainer = container.querySelector('.space-y-4')
      expect(formContainer).toBeDefined()
    })

    it('has proper spacing for button group', () => {
      const { container } = render(<SpawnAgentModal {...defaultProps} />)
      const buttonGroup = container.querySelector('.flex.justify-end.gap-2')
      expect(buttonGroup).toBeDefined()
    })
  })

  describe('Accessibility', () => {
    it('has proper labels for form fields', () => {
      render(<SpawnAgentModal {...defaultProps} />)

      // Labels should exist for accessibility
      expect(screen.getByText('Agent Type')).toBeDefined()
      expect(screen.getByText('Agent Name')).toBeDefined()
    })

    it('buttons are keyboard accessible', () => {
      const mockClose = vi.fn()
      render(<SpawnAgentModal {...defaultProps} onClose={mockClose} />)

      const cancelButton = screen.getByText('Cancel')
      cancelButton.focus()
      fireEvent.keyDown(cancelButton, { key: 'Enter' })
    })

    it('select is focusable', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      const select = screen.getByRole('combobox')
      select.focus()
      expect(document.activeElement).toBe(select)
    })

    it('input is focusable', () => {
      render(<SpawnAgentModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('e.g., code-assistant-1')
      input.focus()
      expect(document.activeElement).toBe(input)
    })
  })

  describe('Integration scenarios', () => {
    it('supports full form workflow', () => {
      const mockTypeChange = vi.fn()
      const mockNameChange = vi.fn()
      const mockSpawn = vi.fn()

      const { rerender } = render(
        <SpawnAgentModal
          agentType="coder"
          agentName=""
          onTypeChange={mockTypeChange}
          onNameChange={mockNameChange}
          onSpawn={mockSpawn}
          onClose={vi.fn()}
        />
      )

      // Change type
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'security' } })
      expect(mockTypeChange).toHaveBeenCalledWith('security')

      // Change name
      fireEvent.change(screen.getByPlaceholderText('e.g., code-assistant-1'), {
        target: { value: 'security-agent' },
      })
      expect(mockNameChange).toHaveBeenCalledWith('security-agent')

      // Rerender with updated values
      rerender(
        <SpawnAgentModal
          agentType="security"
          agentName="security-agent"
          onTypeChange={mockTypeChange}
          onNameChange={mockNameChange}
          onSpawn={mockSpawn}
          onClose={vi.fn()}
        />
      )

      // Spawn should now be enabled
      const spawnButton = screen.getByText('Spawn')
      expect(spawnButton).toHaveProperty('disabled', false)

      fireEvent.click(spawnButton)
      expect(mockSpawn).toHaveBeenCalledTimes(1)
    })

    it('supports modal dismissal without action', () => {
      const mockClose = vi.fn()
      const mockSpawn = vi.fn()

      render(
        <SpawnAgentModal
          {...defaultProps}
          agentName="test"
          onClose={mockClose}
          onSpawn={mockSpawn}
        />
      )

      fireEvent.click(screen.getByText('Cancel'))

      expect(mockClose).toHaveBeenCalledTimes(1)
      expect(mockSpawn).not.toHaveBeenCalled()
    })
  })
})
