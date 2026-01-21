import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  ErrorMessage,
  ErrorCodes,
  ConnectionError,
  LoadError,
  PermissionError,
  ValidationError,
  NetworkError,
} from '../ErrorMessage'

describe('ErrorMessage', () => {
  describe('Basic Rendering', () => {
    it('renders error message', () => {
      render(<ErrorMessage message="Test error message" />)
      expect(screen.getByText('Test error message')).toBeInTheDocument()
    })

    it('renders with error code', () => {
      render(<ErrorMessage message="Test error" code={ErrorCodes.MCP_CONN_001} />)
      expect(screen.getByText(ErrorCodes.MCP_CONN_001)).toBeInTheDocument()
    })

    it('renders details when provided', () => {
      render(
        <ErrorMessage
          message="Main error"
          details="Additional details about the error"
          variant="inline"
        />
      )
      expect(screen.getByText('Additional details about the error')).toBeInTheDocument()
    })

    it('hides icon when showIcon is false', () => {
      render(<ErrorMessage message="Test error" showIcon={false} variant="inline" />)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  describe('Variants', () => {
    it('renders inline variant with compact styling', () => {
      render(<ErrorMessage message="Inline error" variant="inline" />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('p-2', 'text-sm')
    })

    it('renders banner variant with larger styling', () => {
      render(<ErrorMessage message="Banner error" variant="banner" />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('p-4')
    })

    it('renders minimal variant without background', () => {
      render(<ErrorMessage message="Minimal error" variant="minimal" />)
      expect(screen.getByText('Minimal error')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('banner variant shows severity label', () => {
      render(<ErrorMessage message="Error with label" variant="banner" severity="error" />)
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  describe('Severity Levels', () => {
    it('applies critical severity styles', () => {
      render(<ErrorMessage message="Critical!" severity="critical" variant="inline" />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-accent-red/10')
    })

    it('applies error severity styles', () => {
      render(<ErrorMessage message="Error!" severity="error" variant="inline" />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-accent-red/10')
    })

    it('applies warning severity styles', () => {
      render(<ErrorMessage message="Warning!" severity="warning" variant="inline" />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-accent-yellow/10')
    })

    it('applies info severity styles', () => {
      render(<ErrorMessage message="Info" severity="info" variant="inline" />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveClass('bg-accent-blue/10')
    })
  })

  describe('Actions', () => {
    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn()
      render(<ErrorMessage message="Retryable error" onRetry={onRetry} variant="inline" />)

      fireEvent.click(screen.getByTitle('Retry'))
      expect(onRetry).toHaveBeenCalledOnce()
    })

    it('calls onDismiss when dismiss button is clicked', () => {
      const onDismiss = vi.fn()
      render(<ErrorMessage message="Dismissable error" onDismiss={onDismiss} variant="inline" />)

      fireEvent.click(screen.getByTitle('Dismiss'))
      expect(onDismiss).toHaveBeenCalledOnce()
    })

    it('renders custom action button', () => {
      const onAction = vi.fn()
      render(
        <ErrorMessage
          message="Error with action"
          action={{ label: 'Fix it', handler: onAction }}
          variant="inline"
        />
      )

      fireEvent.click(screen.getByText('Fix it'))
      expect(onAction).toHaveBeenCalledOnce()
    })

    it('banner variant shows retry button with text', () => {
      const onRetry = vi.fn()
      render(<ErrorMessage message="Banner error" onRetry={onRetry} variant="banner" />)

      const retryButton = screen.getByText('Retry')
      expect(retryButton).toBeInTheDocument()
      fireEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledOnce()
    })
  })

  describe('Accessibility', () => {
    it('has alert role for inline variant', () => {
      render(<ErrorMessage message="Alert error" variant="inline" />)
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('has aria-live polite for inline variant', () => {
      render(<ErrorMessage message="Polite error" variant="inline" />)
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
    })

    it('has aria-live assertive for banner variant', () => {
      render(<ErrorMessage message="Assertive error" variant="banner" />)
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive')
    })
  })
})

describe('Pre-built Error Components', () => {
  describe('ConnectionError', () => {
    it('renders with service name', () => {
      render(<ConnectionError service="PostgreSQL" />)
      expect(screen.getByText(/Failed to connect to PostgreSQL/)).toBeInTheDocument()
    })

    it('calls onRetry when provided', () => {
      const onRetry = vi.fn()
      render(<ConnectionError service="PostgreSQL" onRetry={onRetry} />)
      fireEvent.click(screen.getByText('Retry'))
      expect(onRetry).toHaveBeenCalledOnce()
    })
  })

  describe('LoadError', () => {
    it('renders with resource name', () => {
      render(<LoadError resource="sessions" />)
      expect(screen.getByText(/Failed to load sessions/)).toBeInTheDocument()
    })
  })

  describe('PermissionError', () => {
    it('renders with action description', () => {
      render(<PermissionError action="delete this file" />)
      expect(screen.getByText(/Cannot delete this file/)).toBeInTheDocument()
    })
  })

  describe('ValidationError', () => {
    it('renders validation message', () => {
      render(<ValidationError message="Email format is invalid" />)
      expect(screen.getByText('Email format is invalid')).toBeInTheDocument()
    })

    it('uses minimal variant', () => {
      render(<ValidationError message="Invalid input" />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('NetworkError', () => {
    it('renders network unavailable message', () => {
      render(<NetworkError />)
      expect(screen.getByText(/Network connection unavailable/)).toBeInTheDocument()
    })
  })
})

describe('ErrorCodes', () => {
  it('has MCP error codes', () => {
    expect(ErrorCodes.MCP_CONN_001).toBe('MCP-CONN-001')
    expect(ErrorCodes.MCP_CONF_001).toBe('MCP-CONF-001')
  })

  it('has session error codes', () => {
    expect(ErrorCodes.SES_LOAD_001).toBe('SES-LOAD-001')
    expect(ErrorCodes.SES_TRANS_001).toBe('SES-TRANS-001')
  })

  it('has memory error codes', () => {
    expect(ErrorCodes.MEM_CONN_001).toBe('MEM-CONN-001')
    expect(ErrorCodes.MEM_QUERY_001).toBe('MEM-QUERY-001')
  })

  it('has system error codes', () => {
    expect(ErrorCodes.SYS_PERM_001).toBe('SYS-PERM-001')
    expect(ErrorCodes.SYS_FILE_001).toBe('SYS-FILE-001')
  })
})
