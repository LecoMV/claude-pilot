/**
 * Modal Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Modal } from '../Modal'

describe('Modal', () => {
  beforeEach(() => {
    // Clear any modals that might be in the DOM
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Ensure body overflow is reset
    document.body.style.overflow = ''
  })

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('should render when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should render children', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div data-testid="content">Modal Content</div>
        </Modal>
      )
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })

    it('should render title', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Title">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByText('Test Title')).toBeInTheDocument()
    })

    it('should render description', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title" description="Test description">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByText('Test description')).toBeInTheDocument()
    })

    it('should render footer', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} footer={<button>Save</button>}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    })

    it('should render close button by default', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument()
    })

    it('should hide close button when showCloseButton is false', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} showCloseButton={false}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.queryByRole('button', { name: /close modal/i })).not.toBeInTheDocument()
    })
  })

  describe('sizes', () => {
    it('should apply small size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="sm">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveClass('max-w-sm')
    })

    it('should apply medium size by default', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveClass('max-w-md')
    })

    it('should apply large size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="lg">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveClass('max-w-lg')
    })

    it('should apply xl size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="xl">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveClass('max-w-xl')
    })

    it('should apply full size', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} size="full">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveClass('max-w-[90vw]')
    })
  })

  describe('closing behavior', () => {
    it('should call onClose when close button is clicked', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose} title="Title">
          <div>Content</div>
        </Modal>
      )

      fireEvent.click(screen.getByRole('button', { name: /close modal/i }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      )

      // Find the backdrop (the element with onClick that covers the screen)
      const backdrop = document.querySelector('[aria-hidden="true"]')
      expect(backdrop).toBeInTheDocument()

      fireEvent.click(backdrop!)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should not call onClose when backdrop click is disabled', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose} closeOnBackdropClick={false}>
          <div>Content</div>
        </Modal>
      )

      const backdrop = document.querySelector('[aria-hidden="true"]')
      fireEvent.click(backdrop!)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should call onClose when Escape is pressed', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose}>
          <div>Content</div>
        </Modal>
      )

      // Escape is handled on the modal panel via onKeyDown
      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should not call onClose on Escape when closeOnEscape is false', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose} closeOnEscape={false}>
          <div>Content</div>
        </Modal>
      )

      const dialog = screen.getByRole('dialog')
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('body scroll lock', () => {
    it('should prevent body scroll when open', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('should restore body scroll when closed', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )

      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  describe('accessibility', () => {
    it('should have role="dialog"', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have aria-modal="true"', () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('should have aria-labelledby when title is provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="My Title">
          <div>Content</div>
        </Modal>
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
    })

    it('should have aria-describedby when description is provided', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title" description="My description">
          <div>Content</div>
        </Modal>
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-describedby', 'modal-description')
    })
  })

  describe('focus management', () => {
    it('should focus first focusable element on open', async () => {
      render(
        <Modal isOpen={true} onClose={() => {}} showCloseButton={false}>
          <button>First Button</button>
          <button>Second Button</button>
        </Modal>
      )

      await waitFor(() => {
        expect(document.activeElement?.textContent).toContain('First Button')
      })
    })
  })

  describe('className', () => {
    it('should apply custom className to modal panel', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} className="custom-modal">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toHaveClass('custom-modal')
    })
  })

  describe('portal rendering', () => {
    it('should render modal in a portal', () => {
      const { baseElement } = render(
        <div id="app">
          <Modal isOpen={true} onClose={() => {}}>
            <div data-testid="modal-content">Content</div>
          </Modal>
        </div>
      )

      // Modal should be rendered directly in body, not inside #app
      // Verify the modal content exists in the DOM
      expect(screen.getByTestId('modal-content')).toBeInTheDocument()
      expect(baseElement.querySelector('body > div[role="presentation"]')).toBeInTheDocument()
    })
  })
})
