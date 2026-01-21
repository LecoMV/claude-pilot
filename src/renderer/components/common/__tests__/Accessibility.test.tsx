/**
 * Accessibility Tests (axe-core)
 *
 * Automated WCAG 2.1 Level AA compliance testing for key components.
 * Uses axe-core for programmatic accessibility validation.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { Button } from '../Button'
import { Input } from '../Input'
import { EmptyState, SessionsEmptyState, ErrorEmptyState } from '../EmptyState'
import { Skeleton, SkeletonList, SkeletonGrid } from '../Skeleton'
import { ErrorMessage, ConnectionError, NetworkError } from '../ErrorMessage'
import { Modal } from '../Modal'

// Extend expect with axe matchers
expect.extend(toHaveNoViolations)

describe('Accessibility Tests', () => {
  describe('Button Component', () => {
    it('should have no accessibility violations with text', async () => {
      const { container } = render(<Button>Click me</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with loading state', async () => {
      const { container } = render(<Button loading>Loading</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations when disabled', async () => {
      const { container } = render(<Button disabled>Disabled</Button>)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with all variants', async () => {
      const variants = ['primary', 'secondary', 'ghost', 'danger', 'success'] as const
      for (const variant of variants) {
        const { container } = render(<Button variant={variant}>Button</Button>)
        const results = await axe(container)
        expect(results).toHaveNoViolations()
      }
    })
  })

  describe('Input Component', () => {
    it('should have no violations with label', async () => {
      const { container } = render(<Input label="Email" type="email" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with error state', async () => {
      const { container } = render(<Input label="Email" error="Invalid email address" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with helper text', async () => {
      const { container } = render(
        <Input label="Password" type="password" helperText="Must be at least 8 characters" />
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('EmptyState Component', () => {
    it('should have no violations with basic props', async () => {
      const { container } = render(
        <EmptyState title="No items" description="Add some items to get started" />
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with action button', async () => {
      const { container } = render(
        <EmptyState
          title="No items"
          description="Add some items"
          action={<Button>Add Item</Button>}
        />
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('SessionsEmptyState should have no violations', async () => {
      const { container } = render(<SessionsEmptyState />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('ErrorEmptyState should have no violations', async () => {
      const { container } = render(<ErrorEmptyState error="Something went wrong" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('ErrorEmptyState with retry should have no violations', async () => {
      const { container } = render(<ErrorEmptyState onRetry={() => {}} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Skeleton Component', () => {
    it('should have no violations for text skeleton', async () => {
      const { container } = render(<Skeleton variant="text" lines={3} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations for card skeleton', async () => {
      const { container } = render(<Skeleton variant="card" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('SkeletonList should have no violations', async () => {
      const { container } = render(<SkeletonList count={3} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('SkeletonGrid should have no violations', async () => {
      const { container } = render(<SkeletonGrid count={6} columns={3} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('ErrorMessage Component', () => {
    it('should have no violations with inline variant', async () => {
      const { container } = render(<ErrorMessage message="An error occurred" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with banner variant', async () => {
      const { container } = render(
        <ErrorMessage message="Critical error" variant="banner" severity="critical" />
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with retry action', async () => {
      const { container } = render(<ErrorMessage message="Failed to load" onRetry={() => {}} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('ConnectionError should have no violations', async () => {
      const { container } = render(<ConnectionError service="Database" />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('NetworkError should have no violations', async () => {
      const { container } = render(<NetworkError />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Modal Component', () => {
    it('should have no violations when open', async () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('should have no violations with form content', async () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Form Modal">
          <form>
            <Input label="Name" />
            <Button type="submit">Submit</Button>
          </form>
        </Modal>
      )
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
