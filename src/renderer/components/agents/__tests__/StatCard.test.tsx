import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StatCard } from '../StatCard'
import { Brain, Code, Users, Shield, Zap, Activity } from 'lucide-react'

// Mock lucide-react icons for consistent testing
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react')
  return {
    ...actual,
    Brain: ({ className }: { className?: string }) => (
      <span data-testid="icon-brain" className={className}>Brain</span>
    ),
    Code: ({ className }: { className?: string }) => (
      <span data-testid="icon-code" className={className}>Code</span>
    ),
    Users: ({ className }: { className?: string }) => (
      <span data-testid="icon-users" className={className}>Users</span>
    ),
    Shield: ({ className }: { className?: string }) => (
      <span data-testid="icon-shield" className={className}>Shield</span>
    ),
    Zap: ({ className }: { className?: string }) => (
      <span data-testid="icon-zap" className={className}>Zap</span>
    ),
    Activity: ({ className }: { className?: string }) => (
      <span data-testid="icon-activity" className={className}>Activity</span>
    ),
  }
})

// Mock the utility function
vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}))

describe('StatCard', () => {
  describe('Rendering', () => {
    it('renders with numeric value', () => {
      render(
        <StatCard
          icon={Brain}
          value={42}
          label="Total Agents"
          color="text-accent-purple"
        />
      )

      expect(screen.getByText('42')).toBeDefined()
      expect(screen.getByText('Total Agents')).toBeDefined()
    })

    it('renders with string value', () => {
      render(
        <StatCard
          icon={Brain}
          value="Online"
          label="Status"
          color="text-accent-green"
        />
      )

      expect(screen.getByText('Online')).toBeDefined()
      expect(screen.getByText('Status')).toBeDefined()
    })

    it('renders with zero value', () => {
      render(
        <StatCard
          icon={Brain}
          value={0}
          label="Errors"
          color="text-accent-red"
        />
      )

      expect(screen.getByText('0')).toBeDefined()
    })

    it('renders the provided icon', () => {
      render(
        <StatCard
          icon={Brain}
          value={5}
          label="Active"
          color="text-accent-blue"
        />
      )

      expect(screen.getByTestId('icon-brain')).toBeDefined()
    })
  })

  describe('Icon Rendering', () => {
    it('renders Brain icon', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color="text-accent-purple"
        />
      )

      expect(screen.getByTestId('icon-brain')).toBeDefined()
    })

    it('renders Code icon', () => {
      render(
        <StatCard
          icon={Code}
          value={1}
          label="Test"
          color="text-accent-blue"
        />
      )

      expect(screen.getByTestId('icon-code')).toBeDefined()
    })

    it('renders Users icon', () => {
      render(
        <StatCard
          icon={Users}
          value={1}
          label="Test"
          color="text-accent-green"
        />
      )

      expect(screen.getByTestId('icon-users')).toBeDefined()
    })

    it('renders Shield icon', () => {
      render(
        <StatCard
          icon={Shield}
          value={1}
          label="Test"
          color="text-accent-yellow"
        />
      )

      expect(screen.getByTestId('icon-shield')).toBeDefined()
    })

    it('applies correct color class to icon', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color="text-accent-purple"
        />
      )

      const icon = screen.getByTestId('icon-brain')
      expect(icon.className).toContain('text-accent-purple')
    })
  })

  describe('Value Display', () => {
    it('displays large numeric values', () => {
      render(
        <StatCard
          icon={Brain}
          value={1000000}
          label="Total"
          color="text-accent-blue"
        />
      )

      expect(screen.getByText('1000000')).toBeDefined()
    })

    it('displays negative numeric values', () => {
      render(
        <StatCard
          icon={Brain}
          value={-5}
          label="Delta"
          color="text-accent-red"
        />
      )

      expect(screen.getByText('-5')).toBeDefined()
    })

    it('displays decimal values', () => {
      render(
        <StatCard
          icon={Brain}
          value={3.14}
          label="Ratio"
          color="text-accent-blue"
        />
      )

      expect(screen.getByText('3.14')).toBeDefined()
    })

    it('displays formatted string values', () => {
      render(
        <StatCard
          icon={Brain}
          value="99.9%"
          label="Uptime"
          color="text-accent-green"
        />
      )

      expect(screen.getByText('99.9%')).toBeDefined()
    })

    it('value has correct styling classes', () => {
      render(
        <StatCard
          icon={Brain}
          value={42}
          label="Count"
          color="text-accent-blue"
        />
      )

      const value = screen.getByText('42')
      expect(value.className).toContain('text-lg')
      expect(value.className).toContain('font-semibold')
      expect(value.className).toContain('text-text-primary')
    })
  })

  describe('Label Display', () => {
    it('displays the label text', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Active Agents"
          color="text-accent-blue"
        />
      )

      expect(screen.getByText('Active Agents')).toBeDefined()
    })

    it('displays long labels', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="This is a very long label for testing purposes"
          color="text-accent-blue"
        />
      )

      expect(screen.getByText('This is a very long label for testing purposes')).toBeDefined()
    })

    it('label has correct styling classes', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test Label"
          color="text-accent-blue"
        />
      )

      const label = screen.getByText('Test Label')
      expect(label.className).toContain('text-xs')
      expect(label.className).toContain('text-text-muted')
    })
  })

  describe('Color Variations', () => {
    it.each([
      ['text-accent-purple', 'purple'],
      ['text-accent-blue', 'blue'],
      ['text-accent-green', 'green'],
      ['text-accent-yellow', 'yellow'],
      ['text-accent-red', 'red'],
    ])('applies %s color correctly', (colorClass) => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color={colorClass}
        />
      )

      const icon = screen.getByTestId('icon-brain')
      expect(icon.className).toContain(colorClass)
    })

    it('handles custom color classes', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color="text-pink-500"
        />
      )

      const icon = screen.getByTestId('icon-brain')
      expect(icon.className).toContain('text-pink-500')
    })
  })

  describe('Layout and Structure', () => {
    it('has card container with padding', () => {
      const { container } = render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color="text-accent-blue"
        />
      )

      const card = container.querySelector('.card')
      expect(card).toBeDefined()
      expect(card?.className).toContain('p-3')
    })

    it('has flex layout for content', () => {
      const { container } = render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color="text-accent-blue"
        />
      )

      const flexContainer = container.querySelector('.flex.items-center.gap-3')
      expect(flexContainer).toBeDefined()
    })

    it('icon has correct size classes', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="Test"
          color="text-accent-blue"
        />
      )

      const icon = screen.getByTestId('icon-brain')
      expect(icon.className).toContain('w-5')
      expect(icon.className).toContain('h-5')
    })
  })

  describe('Use Cases', () => {
    it('works as agent count card', () => {
      render(
        <StatCard
          icon={Users}
          value={8}
          label="Active Agents"
          color="text-accent-green"
        />
      )

      expect(screen.getByText('8')).toBeDefined()
      expect(screen.getByText('Active Agents')).toBeDefined()
      expect(screen.getByTestId('icon-users')).toBeDefined()
    })

    it('works as task count card', () => {
      render(
        <StatCard
          icon={Zap}
          value={156}
          label="Tasks Completed"
          color="text-accent-yellow"
        />
      )

      expect(screen.getByText('156')).toBeDefined()
      expect(screen.getByText('Tasks Completed')).toBeDefined()
      expect(screen.getByTestId('icon-zap')).toBeDefined()
    })

    it('works as status card', () => {
      render(
        <StatCard
          icon={Activity}
          value="Healthy"
          label="System Status"
          color="text-accent-green"
        />
      )

      expect(screen.getByText('Healthy')).toBeDefined()
      expect(screen.getByText('System Status')).toBeDefined()
      expect(screen.getByTestId('icon-activity')).toBeDefined()
    })

    it('works as error count card', () => {
      render(
        <StatCard
          icon={Shield}
          value={0}
          label="Security Alerts"
          color="text-accent-red"
        />
      )

      expect(screen.getByText('0')).toBeDefined()
      expect(screen.getByText('Security Alerts')).toBeDefined()
      expect(screen.getByTestId('icon-shield')).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty string label', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label=""
          color="text-accent-blue"
        />
      )

      // Component should still render without errors
      expect(screen.getByText('1')).toBeDefined()
    })

    it('handles empty string value', () => {
      render(
        <StatCard
          icon={Brain}
          value=""
          label="Test"
          color="text-accent-blue"
        />
      )

      // Component should still render without errors
      expect(screen.getByText('Test')).toBeDefined()
    })

    it('handles whitespace-only label', () => {
      render(
        <StatCard
          icon={Brain}
          value={1}
          label="   "
          color="text-accent-blue"
        />
      )

      // Component should still render
      expect(screen.getByText('1')).toBeDefined()
    })
  })
})
