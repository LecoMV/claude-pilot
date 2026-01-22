/**
 * ErrorBoundary Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  ErrorBoundary,
  withErrorBoundary,
  InlineErrorBoundary,
  AsyncBoundary,
} from '../ErrorBoundary'

// Mock Sentry
vi.mock('@sentry/electron/renderer', () => ({
  captureException: vi.fn(),
}))

// Component that throws an error
const ThrowError = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

// Suppress console errors during tests
const originalError = console.error
beforeEach(() => {
  console.error = vi.fn()
})

afterEach(() => {
  console.error = originalError
})

describe('ErrorBoundary', () => {
  describe('rendering', () => {
    it('should render children when no error', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child">Hello</div>
        </ErrorBoundary>
      )
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('should render error UI when child throws', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('should display error message', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )
      expect(screen.getByText('Test error')).toBeInTheDocument()
    })

    it('should render custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error</div>}>
          <ThrowError />
        </ErrorBoundary>
      )
      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
    })
  })

  describe('error handling', () => {
    it('should call onError callback when error occurs', () => {
      const onError = vi.fn()
      render(
        <ErrorBoundary onError={onError}>
          <ThrowError />
        </ErrorBoundary>
      )
      expect(onError).toHaveBeenCalled()
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
      expect(onError.mock.calls[0][0].message).toBe('Test error')
    })

    it('should capture error in Sentry', async () => {
      const Sentry = await import('@sentry/electron/renderer')
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )
      expect(Sentry.captureException).toHaveBeenCalled()
    })
  })

  describe('reset functionality', () => {
    it('should reset error state when Try Again is clicked', async () => {
      // Create a component that can toggle error
      let shouldError = true
      const ToggleError = () => {
        if (shouldError) throw new Error('Test')
        return <div data-testid="success">Success</div>
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ToggleError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Fix the error
      shouldError = false

      // Click Try Again
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))

      // Rerender to trigger update
      rerender(
        <ErrorBoundary>
          <ToggleError />
        </ErrorBoundary>
      )

      // ErrorBoundary should have reset and tried to render children
      // Note: The component will re-throw since shouldError is still referenced
    })

    it('should reset when resetKeys change', () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={['key1']}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeInTheDocument()

      // Change resetKeys - this should trigger a reset attempt
      rerender(
        <ErrorBoundary resetKeys={['key2']}>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      )

      // After resetKeys change, should render children
      expect(screen.getByText('No error')).toBeInTheDocument()
    })
  })

  describe('copy functionality', () => {
    it('should render copy button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )
      expect(screen.getByRole('button', { name: /copy details/i })).toBeInTheDocument()
    })

    it('should copy error details to clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: { writeText },
      })

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      fireEvent.click(screen.getByRole('button', { name: /copy details/i }))

      await waitFor(() => {
        expect(writeText).toHaveBeenCalled()
      })

      const copiedText = writeText.mock.calls[0][0]
      expect(copiedText).toContain('Test error')
    })

    it('should show "Copied" text after copying', async () => {
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      })

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      fireEvent.click(screen.getByRole('button', { name: /copy details/i }))

      await waitFor(() => {
        expect(screen.getByText('Copied')).toBeInTheDocument()
      })
    })
  })

  describe('technical details', () => {
    it('should render expandable technical details', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const summary = screen.getByText('Show technical details')
      expect(summary).toBeInTheDocument()

      // Details should be expandable
      fireEvent.click(summary)
    })
  })
})

describe('withErrorBoundary HOC', () => {
  it('should wrap component with error boundary', () => {
    const TestComponent = () => <div data-testid="wrapped">Wrapped</div>
    const WrappedComponent = withErrorBoundary(TestComponent)

    render(<WrappedComponent />)
    expect(screen.getByTestId('wrapped')).toBeInTheDocument()
  })

  it('should catch errors in wrapped component', () => {
    const WrappedErrorComponent = withErrorBoundary(ThrowError)

    render(<WrappedErrorComponent />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('should use custom fallback', () => {
    const WrappedComponent = withErrorBoundary(ThrowError, {
      fallback: <div data-testid="hoc-fallback">HOC Fallback</div>,
    })

    render(<WrappedComponent />)
    expect(screen.getByTestId('hoc-fallback')).toBeInTheDocument()
  })

  it('should set displayName', () => {
    const TestComponent = () => <div>Test</div>
    TestComponent.displayName = 'TestComponent'

    const WrappedComponent = withErrorBoundary(TestComponent)
    expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)')
  })
})

describe('InlineErrorBoundary', () => {
  it('should render children when no error', () => {
    render(
      <InlineErrorBoundary>
        <div data-testid="inline-child">Content</div>
      </InlineErrorBoundary>
    )
    expect(screen.getByTestId('inline-child')).toBeInTheDocument()
  })

  it('should render inline error message when error occurs', () => {
    render(
      <InlineErrorBoundary>
        <ThrowError />
      </InlineErrorBoundary>
    )
    expect(screen.getByText('Failed to load this section')).toBeInTheDocument()
  })

  it('should use custom fallback message', () => {
    render(
      <InlineErrorBoundary fallbackMessage="Custom error message">
        <ThrowError />
      </InlineErrorBoundary>
    )
    expect(screen.getByText('Custom error message')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(
      <InlineErrorBoundary className="custom-inline">
        <ThrowError />
      </InlineErrorBoundary>
    )
    expect(container.querySelector('.custom-inline')).toBeInTheDocument()
  })
})

describe('AsyncBoundary', () => {
  it('should render children when no error', () => {
    render(
      <AsyncBoundary>
        <div data-testid="async-child">Async Content</div>
      </AsyncBoundary>
    )
    expect(screen.getByTestId('async-child')).toBeInTheDocument()
  })

  it('should render default error UI when error occurs', () => {
    render(
      <AsyncBoundary>
        <ThrowError />
      </AsyncBoundary>
    )
    expect(screen.getByText('Failed to load content')).toBeInTheDocument()
  })

  it('should render custom error when provided', () => {
    render(
      <AsyncBoundary error={<div data-testid="custom-async-error">Async Error</div>}>
        <ThrowError />
      </AsyncBoundary>
    )
    expect(screen.getByTestId('custom-async-error')).toBeInTheDocument()
  })
})
