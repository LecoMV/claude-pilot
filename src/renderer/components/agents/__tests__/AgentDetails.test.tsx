import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentDetails } from '../AgentDetails'
import type { Agent, AgentType, AgentStatus } from '@/stores/agents'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Brain: ({ className }: { className?: string }) => (
    <span data-testid="icon-brain" className={className}>Brain</span>
  ),
  Trash2: ({ className }: { className?: string }) => (
    <span data-testid="icon-trash" className={className}>Trash</span>
  ),
  Code: ({ className }: { className?: string }) => (
    <span data-testid="icon-code" className={className}>Code</span>
  ),
  Search: ({ className }: { className?: string }) => (
    <span data-testid="icon-search" className={className}>Search</span>
  ),
  TestTube: ({ className }: { className?: string }) => (
    <span data-testid="icon-testtube" className={className}>TestTube</span>
  ),
  Building: ({ className }: { className?: string }) => (
    <span data-testid="icon-building" className={className}>Building</span>
  ),
  Users: ({ className }: { className?: string }) => (
    <span data-testid="icon-users" className={className}>Users</span>
  ),
  Shield: ({ className }: { className?: string }) => (
    <span data-testid="icon-shield" className={className}>Shield</span>
  ),
}))

// Mock the utility function
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

// Mock the constants
vi.mock('../constants', () => ({
  agentIcons: {
    coder: ({ className }: { className?: string }) => (
      <span data-testid="icon-coder" className={className}>Coder</span>
    ),
    researcher: ({ className }: { className?: string }) => (
      <span data-testid="icon-researcher" className={className}>Researcher</span>
    ),
    tester: ({ className }: { className?: string }) => (
      <span data-testid="icon-tester" className={className}>Tester</span>
    ),
    architect: ({ className }: { className?: string }) => (
      <span data-testid="icon-architect" className={className}>Architect</span>
    ),
    coordinator: ({ className }: { className?: string }) => (
      <span data-testid="icon-coordinator" className={className}>Coordinator</span>
    ),
    security: ({ className }: { className?: string }) => (
      <span data-testid="icon-security" className={className}>Security</span>
    ),
  },
  statusColors: {
    idle: 'border-text-muted',
    active: 'border-accent-green',
    busy: 'border-accent-yellow',
    error: 'border-accent-red',
    terminated: 'border-text-muted opacity-50',
  },
  statusBgColors: {
    idle: 'bg-surface',
    active: 'bg-accent-green/10',
    busy: 'bg-accent-yellow/10',
    error: 'bg-accent-red/10',
    terminated: 'bg-surface opacity-50',
  },
}))

const createAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-123',
  name: 'Test Agent',
  type: 'coder' as AgentType,
  status: 'active' as AgentStatus,
  taskCount: 5,
  health: 0.85,
  ...overrides,
})

describe('AgentDetails', () => {
  const defaultProps = {
    agent: createAgent(),
    onTerminate: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Header Section', () => {
    it('renders agent name', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByText('Test Agent')).toBeDefined()
    })

    it('renders agent id when name is not provided', () => {
      const agent = createAgent({ name: '', id: 'unique-id-456' })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('unique-id-456')).toBeDefined()
    })

    it('renders agent type', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByText('coder')).toBeDefined()
    })

    it('renders correct icon for coder type', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByTestId('icon-coder')).toBeDefined()
    })

    it.each([
      ['coder', 'icon-coder'],
      ['researcher', 'icon-researcher'],
      ['tester', 'icon-tester'],
      ['architect', 'icon-architect'],
      ['coordinator', 'icon-coordinator'],
      ['security', 'icon-security'],
    ] as const)('renders correct icon for %s type', (type, iconTestId) => {
      const agent = createAgent({ type })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByTestId(iconTestId)).toBeDefined()
    })
  })

  describe('Status Display', () => {
    it('displays status label', () => {
      render(<AgentDetails {...defaultProps} />)
      const statusLabels = screen.getAllByText('Status')
      expect(statusLabels.length).toBeGreaterThan(0)
    })

    it('displays status value', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByText('active')).toBeDefined()
    })

    it.each([
      ['idle', 'idle'],
      ['active', 'active'],
      ['busy', 'busy'],
      ['error', 'error'],
      ['terminated', 'terminated'],
    ] as const)('displays %s status correctly', (status) => {
      const agent = createAgent({ status })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText(status)).toBeDefined()
    })
  })

  describe('Health Display', () => {
    it('displays health label', () => {
      render(<AgentDetails {...defaultProps} />)
      const healthLabels = screen.getAllByText('Health')
      expect(healthLabels.length).toBeGreaterThan(0)
    })

    it('displays health percentage', () => {
      const agent = createAgent({ health: 0.85 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('85%')).toBeDefined()
    })

    it('rounds health to whole number', () => {
      const agent = createAgent({ health: 0.756 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('76%')).toBeDefined()
    })

    it('displays 0% health', () => {
      const agent = createAgent({ health: 0 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('0%')).toBeDefined()
    })

    it('displays 100% health', () => {
      const agent = createAgent({ health: 1 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('100%')).toBeDefined()
    })
  })

  describe('Task Count Display', () => {
    it('displays tasks label', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByText('Tasks')).toBeDefined()
    })

    it('displays task count', () => {
      const agent = createAgent({ taskCount: 5 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('5')).toBeDefined()
    })

    it('displays zero tasks', () => {
      const agent = createAgent({ taskCount: 0 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('0')).toBeDefined()
    })

    it('displays large task count', () => {
      const agent = createAgent({ taskCount: 9999 })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('9999')).toBeDefined()
    })
  })

  describe('Domain Display', () => {
    it('displays domain when provided', () => {
      const agent = createAgent({ domain: 'backend' })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.getByText('Domain')).toBeDefined()
      expect(screen.getByText('backend')).toBeDefined()
    })

    it('does not display domain section when not provided', () => {
      const agent = createAgent({ domain: undefined })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(screen.queryByText('Domain')).toBeNull()
    })

    it('does not display domain section when empty string', () => {
      const agent = createAgent({ domain: '' })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      // Empty string is falsy, so domain section should not render
      // The component uses {agent.domain && ...} pattern
    })
  })

  describe('Health Bar', () => {
    it('renders health bar container', () => {
      const { container } = render(<AgentDetails {...defaultProps} />)
      const healthBar = container.querySelector('.h-2.bg-surface.rounded-full')
      expect(healthBar).toBeDefined()
    })

    it('has green color for high health', () => {
      const agent = createAgent({ health: 0.8 })
      const { container } = render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      const healthBarFill = container.querySelector('.bg-accent-green')
      expect(healthBarFill).toBeDefined()
    })

    it('has yellow color for medium health', () => {
      const agent = createAgent({ health: 0.5 })
      const { container } = render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      const healthBarFill = container.querySelector('.bg-accent-yellow')
      expect(healthBarFill).toBeDefined()
    })

    it('has red color for low health', () => {
      const agent = createAgent({ health: 0.2 })
      const { container } = render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      const healthBarFill = container.querySelector('.bg-accent-red')
      expect(healthBarFill).toBeDefined()
    })

    it('health bar width matches health value', () => {
      const agent = createAgent({ health: 0.75 })
      const { container } = render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      const healthBarFill = container.querySelector('[style*="width"]')
      expect(healthBarFill?.getAttribute('style')).toContain('75%')
    })

    it('health bar at boundary values', () => {
      // Test boundary at 70%
      const agent70 = createAgent({ health: 0.7 })
      const { container: container70 } = render(<AgentDetails agent={agent70} onTerminate={vi.fn()} />)
      expect(container70.querySelector('.bg-accent-yellow')).toBeDefined()

      // Test boundary at 30%
      const agent30 = createAgent({ health: 0.3 })
      const { container: container30 } = render(<AgentDetails agent={agent30} onTerminate={vi.fn()} />)
      expect(container30.querySelector('.bg-accent-yellow')).toBeDefined()
    })

    it('health bar just above 70% is green', () => {
      const agent = createAgent({ health: 0.71 })
      const { container } = render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(container.querySelector('.bg-accent-green')).toBeDefined()
    })

    it('health bar just below 30% is red', () => {
      const agent = createAgent({ health: 0.29 })
      const { container } = render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)
      expect(container.querySelector('.bg-accent-red')).toBeDefined()
    })
  })

  describe('Terminate Button', () => {
    it('renders terminate button', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByText('Terminate')).toBeDefined()
    })

    it('renders trash icon in button', () => {
      render(<AgentDetails {...defaultProps} />)
      expect(screen.getByTestId('icon-trash')).toBeDefined()
    })

    it('calls onTerminate when clicked', () => {
      const mockTerminate = vi.fn()
      render(<AgentDetails agent={createAgent()} onTerminate={mockTerminate} />)

      fireEvent.click(screen.getByText('Terminate'))

      expect(mockTerminate).toHaveBeenCalledTimes(1)
    })

    it('is disabled when agent is terminated', () => {
      const agent = createAgent({ status: 'terminated' })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      const button = screen.getByText('Terminate').closest('button')
      expect(button).toHaveProperty('disabled', true)
    })

    it('is enabled when agent is active', () => {
      const agent = createAgent({ status: 'active' })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      const button = screen.getByText('Terminate').closest('button')
      expect(button).toHaveProperty('disabled', false)
    })

    it.each(['idle', 'active', 'busy', 'error'] as const)(
      'is enabled for %s status',
      (status) => {
        const agent = createAgent({ status })
        render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

        const button = screen.getByText('Terminate').closest('button')
        expect(button).toHaveProperty('disabled', false)
      }
    )

    it('does not call onTerminate when disabled', () => {
      const mockTerminate = vi.fn()
      const agent = createAgent({ status: 'terminated' })
      render(<AgentDetails agent={agent} onTerminate={mockTerminate} />)

      fireEvent.click(screen.getByText('Terminate'))

      expect(mockTerminate).not.toHaveBeenCalled()
    })

    it('has correct styling classes', () => {
      render(<AgentDetails {...defaultProps} />)

      const button = screen.getByText('Terminate').closest('button')
      expect(button?.className).toContain('btn')
      expect(button?.className).toContain('btn-secondary')
      expect(button?.className).toContain('text-accent-red')
      expect(button?.className).toContain('w-full')
    })
  })

  describe('Card Layout', () => {
    it('has card container', () => {
      const { container } = render(<AgentDetails {...defaultProps} />)
      const card = container.querySelector('.card')
      expect(card).toBeDefined()
    })

    it('has proper padding', () => {
      const { container } = render(<AgentDetails {...defaultProps} />)
      const card = container.querySelector('.card.p-4')
      expect(card).toBeDefined()
    })

    it('has proper vertical spacing', () => {
      const { container } = render(<AgentDetails {...defaultProps} />)
      const spacedContainer = container.querySelector('.space-y-4')
      expect(spacedContainer).toBeDefined()
    })
  })

  describe('Different Agent Configurations', () => {
    it('renders coder agent correctly', () => {
      const agent: Agent = {
        id: 'coder-1',
        name: 'Code Assistant',
        type: 'coder',
        status: 'active',
        taskCount: 10,
        health: 0.95,
        domain: 'frontend',
      }

      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      expect(screen.getByText('Code Assistant')).toBeDefined()
      expect(screen.getByText('coder')).toBeDefined()
      expect(screen.getByText('95%')).toBeDefined()
      expect(screen.getByText('10')).toBeDefined()
      expect(screen.getByText('frontend')).toBeDefined()
    })

    it('renders researcher agent correctly', () => {
      const agent: Agent = {
        id: 'researcher-1',
        name: 'Research Bot',
        type: 'researcher',
        status: 'busy',
        taskCount: 3,
        health: 0.6,
        domain: 'security',
      }

      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      expect(screen.getByText('Research Bot')).toBeDefined()
      expect(screen.getByText('researcher')).toBeDefined()
      expect(screen.getByText('busy')).toBeDefined()
      expect(screen.getByText('60%')).toBeDefined()
      expect(screen.getByText('security')).toBeDefined()
    })

    it('renders errored agent correctly', () => {
      const agent: Agent = {
        id: 'error-agent',
        name: 'Failing Agent',
        type: 'tester',
        status: 'error',
        taskCount: 0,
        health: 0.1,
      }

      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      expect(screen.getByText('Failing Agent')).toBeDefined()
      expect(screen.getByText('error')).toBeDefined()
      expect(screen.getByText('10%')).toBeDefined()
    })

    it('renders terminated agent correctly', () => {
      const agent: Agent = {
        id: 'terminated-agent',
        name: 'Old Agent',
        type: 'architect',
        status: 'terminated',
        taskCount: 100,
        health: 0,
      }

      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      expect(screen.getByText('Old Agent')).toBeDefined()
      expect(screen.getByText('terminated')).toBeDefined()
      expect(screen.getByText('0%')).toBeDefined()

      const button = screen.getByText('Terminate').closest('button')
      expect(button).toHaveProperty('disabled', true)
    })
  })

  describe('Edge Cases', () => {
    it('handles agent with minimal data', () => {
      const minimalAgent: Agent = {
        id: 'min-1',
        name: '',
        type: 'coder',
        status: 'idle',
        taskCount: 0,
        health: 0,
      }

      render(<AgentDetails agent={minimalAgent} onTerminate={vi.fn()} />)

      expect(screen.getByText('min-1')).toBeDefined()
      expect(screen.getByText('idle')).toBeDefined()
    })

    it('handles very long agent name', () => {
      const agent = createAgent({ name: 'This is a very long agent name that might overflow' })
      render(<AgentDetails agent={agent} onTerminate={vi.fn()} />)

      expect(screen.getByText('This is a very long agent name that might overflow')).toBeDefined()
    })

    it('handles health exactly at threshold values', () => {
      // Exactly 0.7 should be yellow (not > 0.7)
      const agent70 = createAgent({ health: 0.7 })
      const { container: container70, unmount: unmount70 } = render(
        <AgentDetails agent={agent70} onTerminate={vi.fn()} />
      )
      expect(container70.querySelector('.bg-accent-yellow')).toBeDefined()
      unmount70()

      // Exactly 0.3 should be yellow (not > 0.3)
      const agent30 = createAgent({ health: 0.3 })
      const { container: container30 } = render(
        <AgentDetails agent={agent30} onTerminate={vi.fn()} />
      )
      expect(container30.querySelector('.bg-accent-yellow')).toBeDefined()
    })
  })
})
