/**
 * Input Component Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '../Input'

describe('Input', () => {
  describe('rendering', () => {
    it('should render an input element', () => {
      render(<Input />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('should render with placeholder', () => {
      render(<Input placeholder="Enter text" />)
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('should render with label', () => {
      render(<Input label="Email" />)
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
    })

    it('should render helper text', () => {
      render(<Input helperText="This is a hint" />)
      expect(screen.getByText('This is a hint')).toBeInTheDocument()
    })

    it('should render error message', () => {
      render(<Input error="This field is required" />)
      expect(screen.getByRole('alert')).toHaveTextContent('This field is required')
    })

    it('should not render helper text when error is present', () => {
      render(<Input helperText="Hint" error="Error" />)
      expect(screen.queryByText('Hint')).not.toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  describe('sizes', () => {
    it('should render with small size', () => {
      render(<Input size="sm" />)
      expect(screen.getByRole('textbox')).toHaveClass('px-3', 'text-xs')
    })

    it('should render with medium size (default)', () => {
      render(<Input size="md" />)
      expect(screen.getByRole('textbox')).toHaveClass('px-4', 'text-sm')
    })

    it('should render with large size', () => {
      render(<Input size="lg" />)
      expect(screen.getByRole('textbox')).toHaveClass('px-4', 'text-base')
    })
  })

  describe('interaction', () => {
    it('should call onChange when value changes', () => {
      const onChange = vi.fn()
      render(<Input onChange={onChange} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'test' } })

      expect(onChange).toHaveBeenCalled()
    })

    it('should update value', () => {
      render(<Input />)
      const input = screen.getByRole('textbox')

      fireEvent.change(input, { target: { value: 'hello' } })
      expect(input).toHaveValue('hello')
    })

    it('should handle controlled value', () => {
      const { rerender } = render(<Input value="initial" onChange={() => {}} />)
      expect(screen.getByRole('textbox')).toHaveValue('initial')

      rerender(<Input value="updated" onChange={() => {}} />)
      expect(screen.getByRole('textbox')).toHaveValue('updated')
    })
  })

  describe('states', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Input disabled />)
      const input = screen.getByRole('textbox')

      expect(input).toBeDisabled()
      expect(input).toHaveClass('opacity-50', 'cursor-not-allowed')
    })

    it('should show error state', () => {
      render(<Input error="Error message" />)
      const input = screen.getByRole('textbox')

      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveClass('border-accent-red')
    })

    it('should have error label color', () => {
      render(<Input label="Field" error="Error" />)
      const label = screen.getByText('Field')
      expect(label).toHaveClass('text-accent-red')
    })
  })

  describe('icons', () => {
    it('should render left icon', () => {
      render(<Input leftIcon={<span data-testid="left-icon">L</span>} />)
      expect(screen.getByTestId('left-icon')).toBeInTheDocument()
    })

    it('should render right icon', () => {
      render(<Input rightIcon={<span data-testid="right-icon">R</span>} />)
      expect(screen.getByTestId('right-icon')).toBeInTheDocument()
    })

    it('should apply padding for left icon', () => {
      render(<Input leftIcon={<span>L</span>} size="md" />)
      expect(screen.getByRole('textbox')).toHaveClass('pl-10')
    })

    it('should apply padding for right icon', () => {
      render(<Input rightIcon={<span>R</span>} size="md" />)
      expect(screen.getByRole('textbox')).toHaveClass('pr-10')
    })
  })

  describe('fullWidth', () => {
    it('should apply full width when fullWidth is true', () => {
      const { container } = render(<Input fullWidth />)
      expect(container.firstChild).toHaveClass('w-full')
    })
  })

  describe('className', () => {
    it('should apply custom className to input', () => {
      render(<Input className="custom-class" />)
      expect(screen.getByRole('textbox')).toHaveClass('custom-class')
    })
  })

  describe('ref forwarding', () => {
    it('should forward ref to input element', () => {
      const ref = vi.fn()
      render(<Input ref={ref} />)
      expect(ref).toHaveBeenCalled()
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLInputElement)
    })
  })

  describe('accessibility', () => {
    it('should associate label with input via id', () => {
      render(<Input label="Username" id="user-input" />)
      const label = screen.getByText('Username')
      const input = screen.getByRole('textbox')

      expect(label).toHaveAttribute('for', 'user-input')
      expect(input).toHaveAttribute('id', 'user-input')
    })

    it('should generate unique id if not provided', () => {
      render(<Input label="Test" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id')
    })

    it('should have aria-describedby for error', () => {
      render(<Input id="test" error="Error message" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'test-error')
    })

    it('should have aria-describedby for helper text', () => {
      render(<Input id="test" helperText="Helper" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'test-helper')
    })

    it('should support type attribute', () => {
      render(<Input type="email" />)
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')
    })

    it('should support required attribute', () => {
      render(<Input required />)
      expect(screen.getByRole('textbox')).toBeRequired()
    })
  })

  describe('input types', () => {
    it('should render as password input', () => {
      render(<Input type="password" />)
      const input = document.querySelector('input[type="password"]')
      expect(input).toBeInTheDocument()
    })

    it('should render as number input', () => {
      render(<Input type="number" />)
      expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    })
  })
})
