import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  ErrorBoundary,
  InlineErrorBoundary,
  withErrorBoundary,
} from '@/components/common/ErrorBoundary'

// Component that throws an error
const ThrowError = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Reset any mocks between tests
    vi.clearAllMocks()
  })

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('should render fallback UI when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('should render custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error view</div>}>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom error view')).toBeInTheDocument()
  })

  it('should call onError callback when error occurs', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(onError.mock.calls[0][0].message).toBe('Test error message')
  })

  it('should reset error state when Try Again is clicked', () => {
    // Use a variable we can change to control throwing behavior
    let shouldThrow = true

    const DynamicThrow = () => {
      if (shouldThrow) {
        throw new Error('Test error')
      }
      return <div>No error</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <DynamicThrow />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Fix the component before clicking Try Again
    shouldThrow = false

    // Click Try Again to reset the error boundary
    fireEvent.click(screen.getByText('Try Again'))

    // Force rerender to reflect the state change
    rerender(
      <ErrorBoundary>
        <DynamicThrow />
      </ErrorBoundary>
    )

    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('should copy error details when Copy Details is clicked', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByText('Copy Details'))

    expect(writeText).toHaveBeenCalled()
    expect(writeText.mock.calls[0][0]).toContain('Test error message')
  })

  it('should reset when resetKeys change', () => {
    let resetKey = 0

    const { rerender } = render(
      <ErrorBoundary resetKeys={[resetKey]}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Change resetKey to trigger reset
    resetKey = 1
    rerender(
      <ErrorBoundary resetKeys={[resetKey]}>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )

    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('should show technical details when expanded', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    const details = screen.getByText('Show technical details')
    fireEvent.click(details)

    // Should show the details content (pre element with component stack)
    const preElement = document.querySelector('pre')
    expect(preElement).toBeInTheDocument()
  })
})

describe('InlineErrorBoundary', () => {
  it('should render children when no error', () => {
    render(
      <InlineErrorBoundary>
        <div>Inline content</div>
      </InlineErrorBoundary>
    )

    expect(screen.getByText('Inline content')).toBeInTheDocument()
  })

  it('should render inline error message when error occurs', () => {
    render(
      <InlineErrorBoundary fallbackMessage="Section failed to load">
        <ThrowError />
      </InlineErrorBoundary>
    )

    expect(screen.getByText('Section failed to load')).toBeInTheDocument()
  })

  it('should use default message when not provided', () => {
    render(
      <InlineErrorBoundary>
        <ThrowError />
      </InlineErrorBoundary>
    )

    expect(screen.getByText('Failed to load this section')).toBeInTheDocument()
  })
})

describe('withErrorBoundary HOC', () => {
  it('should wrap component with error boundary', () => {
    const TestComponent = () => <div>Test Component</div>
    const WrappedComponent = withErrorBoundary(TestComponent)

    render(<WrappedComponent />)

    expect(screen.getByText('Test Component')).toBeInTheDocument()
  })

  it('should catch errors in wrapped component', () => {
    const onError = vi.fn()
    const ErrorComponent = () => {
      throw new Error('HOC test error')
    }
    const WrappedComponent = withErrorBoundary(ErrorComponent, { onError })

    render(<WrappedComponent />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(onError).toHaveBeenCalled()
  })

  it('should set display name correctly', () => {
    const TestComponent = () => <div>Test</div>
    TestComponent.displayName = 'TestComponent'

    const WrappedComponent = withErrorBoundary(TestComponent)

    expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)')
  })
})
