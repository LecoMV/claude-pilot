/**
 * EmptyState Component Tests
 *
 * Tests for the empty state placeholder components.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  EmptyState,
  SessionsEmptyState,
  MemoryEmptyState,
  BeadsEmptyState,
  LogsEmptyState,
  MCPEmptyState,
  AgentsEmptyState,
  SearchEmptyState,
  GraphEmptyState,
  ErrorEmptyState,
} from '../EmptyState'

describe('EmptyState', () => {
  describe('Basic Rendering', () => {
    it('renders title', () => {
      render(<EmptyState title="No items found" />)
      expect(screen.getByText('No items found')).toBeInTheDocument()
    })

    it('renders description when provided', () => {
      render(<EmptyState title="Empty" description="Try adding some items" />)
      expect(screen.getByText('Try adding some items')).toBeInTheDocument()
    })

    it('does not render description when not provided', () => {
      render(<EmptyState title="Empty" />)
      expect(screen.queryByText('Try adding some items')).not.toBeInTheDocument()
    })

    it('renders icon when provided', () => {
      render(<EmptyState title="Empty" icon={<svg data-testid="custom-icon" />} />)
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument()
    })

    it('renders action when provided', () => {
      render(<EmptyState title="Empty" action={<button>Add Item</button>} />)
      expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument()
    })
  })

  describe('Size Variants', () => {
    it('applies sm size classes', () => {
      const { container } = render(<EmptyState title="Test" size="sm" />)
      expect(container.firstChild).toHaveClass('py-8', 'px-4')
    })

    it('applies md size classes by default', () => {
      const { container } = render(<EmptyState title="Test" />)
      expect(container.firstChild).toHaveClass('py-12', 'px-6')
    })

    it('applies lg size classes', () => {
      const { container } = render(<EmptyState title="Test" size="lg" />)
      expect(container.firstChild).toHaveClass('py-16', 'px-8')
    })

    it('applies correct title size for sm variant', () => {
      render(<EmptyState title="Test" size="sm" />)
      const title = screen.getByText('Test')
      expect(title).toHaveClass('text-base')
    })

    it('applies correct title size for lg variant', () => {
      render(<EmptyState title="Test" size="lg" />)
      const title = screen.getByText('Test')
      expect(title).toHaveClass('text-xl')
    })
  })

  describe('Custom Styling', () => {
    it('accepts custom className', () => {
      const { container } = render(<EmptyState title="Test" className="custom-class" />)
      expect(container.firstChild).toHaveClass('custom-class')
    })

    it('centers content', () => {
      const { container } = render(<EmptyState title="Test" />)
      expect(container.firstChild).toHaveClass(
        'flex',
        'flex-col',
        'items-center',
        'justify-center',
        'text-center'
      )
    })
  })
})

describe('Pre-built Empty States', () => {
  describe('SessionsEmptyState', () => {
    it('renders sessions empty state', () => {
      render(<SessionsEmptyState />)
      expect(screen.getByText('No sessions found')).toBeInTheDocument()
    })

    it('shows helpful description', () => {
      render(<SessionsEmptyState />)
      expect(screen.getByText(/Start a new Claude Code session/)).toBeInTheDocument()
    })

    it('contains SVG icon', () => {
      const { container } = render(<SessionsEmptyState />)
      expect(container.querySelector('svg')).not.toBeNull()
    })
  })

  describe('MemoryEmptyState', () => {
    it('renders memory empty state', () => {
      render(<MemoryEmptyState />)
      expect(screen.getByText('No learnings stored')).toBeInTheDocument()
    })

    it('mentions /learn command', () => {
      render(<MemoryEmptyState />)
      expect(screen.getByText(/Use \/learn/)).toBeInTheDocument()
    })
  })

  describe('BeadsEmptyState', () => {
    it('renders beads empty state', () => {
      render(<BeadsEmptyState />)
      expect(screen.getByText('No open issues')).toBeInTheDocument()
    })

    it('mentions bd create command', () => {
      render(<BeadsEmptyState />)
      expect(screen.getByText(/bd create/)).toBeInTheDocument()
    })
  })

  describe('LogsEmptyState', () => {
    it('renders logs empty state', () => {
      render(<LogsEmptyState />)
      expect(screen.getByText('No logs available')).toBeInTheDocument()
    })
  })

  describe('MCPEmptyState', () => {
    it('renders MCP empty state', () => {
      render(<MCPEmptyState />)
      expect(screen.getByText('No MCP servers configured')).toBeInTheDocument()
    })

    it('mentions extending Claude capabilities', () => {
      render(<MCPEmptyState />)
      expect(screen.getByText(/extend Claude's capabilities/)).toBeInTheDocument()
    })
  })

  describe('AgentsEmptyState', () => {
    it('renders agents empty state', () => {
      render(<AgentsEmptyState />)
      expect(screen.getByText('No active agents')).toBeInTheDocument()
    })

    it('mentions Claude Flow', () => {
      render(<AgentsEmptyState />)
      expect(screen.getByText(/Claude Flow/)).toBeInTheDocument()
    })
  })

  describe('SearchEmptyState', () => {
    it('renders search empty state with query', () => {
      render(<SearchEmptyState query="test search" />)
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('shows the search query in description', () => {
      render(<SearchEmptyState query="my query" />)
      expect(screen.getByText(/No matches for "my query"/)).toBeInTheDocument()
    })

    it('uses sm size variant', () => {
      const { container } = render(<SearchEmptyState query="test" />)
      expect(container.firstChild).toHaveClass('py-8', 'px-4')
    })
  })

  describe('GraphEmptyState', () => {
    it('renders graph empty state', () => {
      render(<GraphEmptyState />)
      expect(screen.getByText('No graph data')).toBeInTheDocument()
    })

    it('mentions connecting to memory systems', () => {
      render(<GraphEmptyState />)
      expect(screen.getByText(/Connect to memory systems/)).toBeInTheDocument()
    })
  })

  describe('ErrorEmptyState', () => {
    it('renders error state', () => {
      render(<ErrorEmptyState />)
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('shows custom error message', () => {
      render(<ErrorEmptyState error="Connection failed" />)
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })

    it('shows default error message when none provided', () => {
      render(<ErrorEmptyState />)
      expect(
        screen.getByText('An unexpected error occurred. Please try again.')
      ).toBeInTheDocument()
    })

    it('renders retry button when onRetry provided', () => {
      render(<ErrorEmptyState onRetry={() => {}} />)
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('does not render retry button when onRetry not provided', () => {
      render(<ErrorEmptyState />)
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    })

    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn()
      render(<ErrorEmptyState onRetry={onRetry} />)

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('uses red color for error icon', () => {
      const { container } = render(<ErrorEmptyState />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('text-accent-red')
    })
  })
})
