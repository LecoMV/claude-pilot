/**
 * Button Component Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button'

describe('Button', () => {
  describe('rendering', () => {
    it('should render with children', () => {
      render(<Button>Click me</Button>)
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
    })

    it('should render with default variant (secondary)', () => {
      render(<Button>Test</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-surface')
    })

    it('should render with primary variant', () => {
      render(<Button variant="primary">Primary</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-accent-purple')
    })

    it('should render with danger variant', () => {
      render(<Button variant="danger">Danger</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-accent-red')
    })

    it('should render with success variant', () => {
      render(<Button variant="success">Success</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-accent-green')
    })

    it('should render with ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-transparent')
    })
  })

  describe('sizes', () => {
    it('should render with small size', () => {
      render(<Button size="sm">Small</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('px-3')
      expect(button).toHaveClass('text-xs')
    })

    it('should render with medium size (default)', () => {
      render(<Button size="md">Medium</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('px-4')
      expect(button).toHaveClass('text-sm')
    })

    it('should render with large size', () => {
      render(<Button size="lg">Large</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('px-6')
      expect(button).toHaveClass('text-base')
    })
  })

  describe('interaction', () => {
    it('should call onClick when clicked', () => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>Click</Button>)

      fireEvent.click(screen.getByRole('button'))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('should not call onClick when disabled', () => {
      const onClick = vi.fn()
      render(
        <Button onClick={onClick} disabled>
          Click
        </Button>
      )

      fireEvent.click(screen.getByRole('button'))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('should not call onClick when loading', () => {
      const onClick = vi.fn()
      render(
        <Button onClick={onClick} loading>
          Click
        </Button>
      )

      fireEvent.click(screen.getByRole('button'))
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('states', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')

      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveClass('opacity-50', 'cursor-not-allowed')
    })

    it('should show loading spinner when loading', () => {
      render(<Button loading>Loading</Button>)
      const button = screen.getByRole('button')

      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button.querySelector('svg.animate-spin')).toBeInTheDocument()
    })

    it('should be disabled when loading', () => {
      render(<Button loading>Loading</Button>)
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })

  describe('icons', () => {
    it('should render left icon', () => {
      render(<Button leftIcon={<span data-testid="left-icon">L</span>}>With Icon</Button>)
      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('should render right icon', () => {
      render(<Button rightIcon={<span data-testid="right-icon">R</span>}>With Icon</Button>)
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('should not render left icon when loading', () => {
      render(
        <Button loading leftIcon={<span data-testid="left-icon">L</span>}>
          Loading
        </Button>
      )
      expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument()
    })

    it('should still render right icon when loading', () => {
      render(
        <Button loading rightIcon={<span data-testid="right-icon">R</span>}>
          Loading
        </Button>
      )
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })
  })

  describe('fullWidth', () => {
    it('should apply full width class when fullWidth is true', () => {
      render(<Button fullWidth>Full Width</Button>)
      expect(screen.getByRole('button')).toHaveClass('w-full')
    })

    it('should not apply full width class by default', () => {
      render(<Button>Normal Width</Button>)
      expect(screen.getByRole('button')).not.toHaveClass('w-full')
    })
  })

  describe('className', () => {
    it('should apply custom className', () => {
      render(<Button className="custom-class">Custom</Button>)
      expect(screen.getByRole('button')).toHaveClass('custom-class')
    })
  })

  describe('ref forwarding', () => {
    it('should forward ref to button element', () => {
      const ref = vi.fn()
      render(<Button ref={ref}>Ref Button</Button>)
      expect(ref).toHaveBeenCalled()
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement)
    })
  })

  describe('accessibility', () => {
    it('should support aria-label', () => {
      render(<Button aria-label="Custom label" />)
      expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
    })

    it('should support type attribute', () => {
      render(<Button type="submit">Submit</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
    })
  })
})
