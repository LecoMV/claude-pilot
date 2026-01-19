/**
 * TaskAssignmentModal Component Tests
 *
 * Tests for the task assignment modal that allows users to assign tasks to agents.
 *
 * @module TaskAssignmentModal.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskAssignmentModal } from '../TaskAssignmentModal'
import type { Agent } from '@/stores/agents'

// Mock agent data
const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Research Agent',
    type: 'researcher',
    status: 'active',
    health: 1.0,
    taskCount: 2,
  },
  {
    id: 'agent-2',
    name: 'Coder Agent',
    type: 'coder',
    status: 'idle',
    health: 0.9,
    taskCount: 0,
  },
  {
    id: 'agent-3',
    name: 'Terminated Agent',
    type: 'tester',
    status: 'terminated',
    health: 0,
    taskCount: 0,
  },
]

describe('TaskAssignmentModal', () => {
  const mockOnDescriptionChange = vi.fn()
  const mockOnTargetChange = vi.fn()
  const mockOnSubmit = vi.fn()
  const mockOnClose = vi.fn()

  const defaultProps = {
    taskDescription: '',
    targetAgentId: 'auto' as const,
    agents: mockAgents,
    onDescriptionChange: mockOnDescriptionChange,
    onTargetChange: mockOnTargetChange,
    onSubmit: mockOnSubmit,
    onClose: mockOnClose,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // RENDERING
  // ===========================================================================
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.getByText('Assign Task')).toBeInTheDocument()
    })

    it('renders task description textarea', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(
        screen.getByPlaceholderText('Describe the task for the agent(s)...')
      ).toBeInTheDocument()
    })

    it('renders target agent select', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('renders auto-route option in select', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.getByText('Auto-route (best fit)')).toBeInTheDocument()
    })

    it('renders non-terminated agents in select', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.getByText('Research Agent (researcher)')).toBeInTheDocument()
      expect(screen.getByText('Coder Agent (coder)')).toBeInTheDocument()
    })

    it('does not render terminated agents in select', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.queryByText('Terminated Agent')).not.toBeInTheDocument()
    })

    it('renders cancel button', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('renders submit button', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      expect(screen.getByText('Submit Task')).toBeInTheDocument()
    })

    it('renders close button', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      const closeButtons = document.querySelectorAll('button')
      expect(closeButtons.length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // TASK DESCRIPTION
  // ===========================================================================
  describe('task description', () => {
    it('displays current task description', () => {
      render(<TaskAssignmentModal {...defaultProps} taskDescription="Test task" />)
      expect(screen.getByDisplayValue('Test task')).toBeInTheDocument()
    })

    it('calls onDescriptionChange when textarea changes', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      const textarea = screen.getByPlaceholderText('Describe the task for the agent(s)...')
      fireEvent.change(textarea, { target: { value: 'New task description' } })
      expect(mockOnDescriptionChange).toHaveBeenCalledWith('New task description')
    })
  })

  // ===========================================================================
  // TARGET AGENT SELECTION
  // ===========================================================================
  describe('target agent selection', () => {
    it('displays auto-route message when auto is selected', () => {
      render(<TaskAssignmentModal {...defaultProps} targetAgentId="auto" />)
      expect(
        screen.getByText('The system will automatically route to the most suitable agent')
      ).toBeInTheDocument()
    })

    it('displays direct assignment message when agent is selected', () => {
      render(<TaskAssignmentModal {...defaultProps} targetAgentId="agent-1" />)
      expect(
        screen.getByText('Task will be assigned directly to the selected agent')
      ).toBeInTheDocument()
    })

    it('calls onTargetChange when selection changes', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'agent-1' } })
      expect(mockOnTargetChange).toHaveBeenCalledWith('agent-1')
    })

    it('renders agent with id when name is missing', () => {
      const agentsWithoutName: Agent[] = [
        {
          id: 'agent-no-name',
          name: '',
          type: 'coder',
          status: 'active',
          health: 1.0,
          taskCount: 0,
        },
      ]
      render(<TaskAssignmentModal {...defaultProps} agents={agentsWithoutName} />)
      expect(screen.getByText('agent-no-name (coder)')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SUBMIT BUTTON
  // ===========================================================================
  describe('submit button', () => {
    it('is disabled when task description is empty', () => {
      render(<TaskAssignmentModal {...defaultProps} taskDescription="" />)
      const submitButton = screen.getByText('Submit Task')
      expect(submitButton).toBeDisabled()
    })

    it('is disabled when task description is whitespace only', () => {
      render(<TaskAssignmentModal {...defaultProps} taskDescription="   " />)
      const submitButton = screen.getByText('Submit Task')
      expect(submitButton).toBeDisabled()
    })

    it('is enabled when task description has content', () => {
      render(<TaskAssignmentModal {...defaultProps} taskDescription="Valid task" />)
      const submitButton = screen.getByText('Submit Task')
      expect(submitButton).not.toBeDisabled()
    })

    it('calls onSubmit when clicked with valid description', () => {
      render(<TaskAssignmentModal {...defaultProps} taskDescription="Valid task" />)
      const submitButton = screen.getByText('Submit Task')
      fireEvent.click(submitButton)
      expect(mockOnSubmit).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // CLOSE/CANCEL
  // ===========================================================================
  describe('close and cancel', () => {
    it('calls onClose when close button clicked', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      // Find the X button (first button with just an icon)
      const closeButton = screen.getByRole('button', { name: '' })
      fireEvent.click(closeButton)
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when cancel button clicked', () => {
      render(<TaskAssignmentModal {...defaultProps} />)
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('renders correctly with empty agents array', () => {
      render(<TaskAssignmentModal {...defaultProps} agents={[]} />)
      expect(screen.getByText('Auto-route (best fit)')).toBeInTheDocument()
      // Should only have auto option
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
    })

    it('renders correctly with all terminated agents', () => {
      const terminatedAgents: Agent[] = [
        {
          id: 'a1',
          name: 'Terminated',
          type: 'coder',
          status: 'terminated',
          health: 0,
          taskCount: 0,
        },
      ]
      render(<TaskAssignmentModal {...defaultProps} agents={terminatedAgents} />)
      // Should only have auto option since all agents are terminated
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
    })
  })
})
