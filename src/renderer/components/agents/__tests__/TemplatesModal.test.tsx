/**
 * TemplatesModal Component Tests
 *
 * Tests for the agent templates modal that allows users to select pre-configured agent teams.
 *
 * @module TemplatesModal.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplatesModal } from '../TemplatesModal'
import { agentTemplates } from '../constants'

describe('TemplatesModal', () => {
  const mockOnSelectTemplate = vi.fn()
  const mockOnClose = vi.fn()

  const defaultProps = {
    onSelectTemplate: mockOnSelectTemplate,
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
      render(<TemplatesModal {...defaultProps} />)
      expect(screen.getByText('Agent Templates')).toBeInTheDocument()
    })

    it('renders description text', () => {
      render(<TemplatesModal {...defaultProps} />)
      expect(screen.getByText(/Quick-start with pre-configured agent teams/)).toBeInTheDocument()
    })

    it('renders close button in header', () => {
      render(<TemplatesModal {...defaultProps} />)
      const closeButtons = document.querySelectorAll('button')
      expect(closeButtons.length).toBeGreaterThan(0)
    })

    it('renders close button at bottom', () => {
      render(<TemplatesModal {...defaultProps} />)
      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    it('renders all agent templates', () => {
      render(<TemplatesModal {...defaultProps} />)
      agentTemplates.forEach((template) => {
        expect(screen.getByText(template.name)).toBeInTheDocument()
      })
    })

    it('renders template descriptions', () => {
      render(<TemplatesModal {...defaultProps} />)
      agentTemplates.forEach((template) => {
        expect(screen.getByText(template.description)).toBeInTheDocument()
      })
    })

    it('renders template topology labels', () => {
      render(<TemplatesModal {...defaultProps} />)
      // Each template has a topology shown
      agentTemplates.forEach((template) => {
        const topologyText = screen.getAllByText(template.topology)
        expect(topologyText.length).toBeGreaterThan(0)
      })
    })
  })

  // ===========================================================================
  // TEMPLATE AGENTS
  // ===========================================================================
  describe('template agents', () => {
    it('renders agent names for each template', () => {
      render(<TemplatesModal {...defaultProps} />)
      // Get all unique agent names from templates
      const allAgentNames = agentTemplates.flatMap((t) => t.agents.map((a) => a.name))
      allAgentNames.forEach((name) => {
        expect(screen.getByText(name)).toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // TEMPLATE SELECTION
  // ===========================================================================
  describe('template selection', () => {
    it('calls onSelectTemplate when template card is clicked', () => {
      render(<TemplatesModal {...defaultProps} />)
      const firstTemplate = agentTemplates[0]
      const templateCard = screen.getByText(firstTemplate.name).closest('.card')
      if (templateCard) {
        fireEvent.click(templateCard)
        expect(mockOnSelectTemplate).toHaveBeenCalledWith(firstTemplate)
      }
    })

    it('calls onSelectTemplate for each template', () => {
      render(<TemplatesModal {...defaultProps} />)
      agentTemplates.forEach((template) => {
        vi.clearAllMocks()
        render(<TemplatesModal {...defaultProps} />)
        const templateCard = screen.getAllByText(template.name)[0].closest('.card')
        if (templateCard) {
          fireEvent.click(templateCard)
          expect(mockOnSelectTemplate).toHaveBeenCalledWith(template)
        }
      })
    })
  })

  // ===========================================================================
  // CLOSE FUNCTIONALITY
  // ===========================================================================
  describe('close functionality', () => {
    it('calls onClose when close button in header clicked', () => {
      render(<TemplatesModal {...defaultProps} />)
      // Find the X button (first button that's not the Close text button)
      const buttons = screen.getAllByRole('button')
      const headerCloseButton = buttons.find((btn) => !btn.textContent?.includes('Close'))
      if (headerCloseButton) {
        fireEvent.click(headerCloseButton)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })

    it('calls onClose when Close button clicked', () => {
      render(<TemplatesModal {...defaultProps} />)
      const closeButton = screen.getByText('Close')
      fireEvent.click(closeButton)
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // MODAL STRUCTURE
  // ===========================================================================
  describe('modal structure', () => {
    it('renders overlay backdrop', () => {
      render(<TemplatesModal {...defaultProps} />)
      const overlay = document.querySelector('.fixed.inset-0')
      expect(overlay).toBeTruthy()
    })

    it('has scrollable content area', () => {
      render(<TemplatesModal {...defaultProps} />)
      const scrollableArea = document.querySelector('.overflow-y-auto')
      expect(scrollableArea).toBeTruthy()
    })

    it('renders templates in a grid', () => {
      render(<TemplatesModal {...defaultProps} />)
      const grid = document.querySelector('.grid')
      expect(grid).toBeTruthy()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('renders without crashing when templates is exported', () => {
      expect(agentTemplates).toBeDefined()
      expect(agentTemplates.length).toBeGreaterThan(0)
    })

    it('each template has required properties', () => {
      agentTemplates.forEach((template) => {
        expect(template.name).toBeDefined()
        expect(template.description).toBeDefined()
        expect(template.topology).toBeDefined()
        expect(template.agents).toBeDefined()
        expect(Array.isArray(template.agents)).toBe(true)
      })
    })

    it('each template agent has required properties', () => {
      agentTemplates.forEach((template) => {
        template.agents.forEach((agent) => {
          expect(agent.name).toBeDefined()
          expect(agent.type).toBeDefined()
        })
      })
    })
  })
})
