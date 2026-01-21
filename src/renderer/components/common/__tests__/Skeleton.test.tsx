/**
 * Skeleton Component Tests
 *
 * Tests for the loading skeleton placeholder components.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonList, SkeletonGrid, SkeletonTable, PageSkeleton } from '../Skeleton'

describe('Skeleton', () => {
  describe('Basic Rendering', () => {
    it('renders text variant by default', () => {
      render(<Skeleton />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).not.toBeNull()
      expect(skeleton).toHaveClass('h-4')
    })

    it('applies pulse animation by default', () => {
      render(<Skeleton />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).toHaveClass('animate-pulse')
    })

    it('accepts custom className', () => {
      render(<Skeleton className="custom-class" />)
      const skeleton = document.querySelector('.custom-class')
      expect(skeleton).not.toBeNull()
    })
  })

  describe('Variants', () => {
    it('renders circular variant as rounded-full', () => {
      render(<Skeleton variant="circular" />)
      const skeleton = document.querySelector('.rounded-full')
      expect(skeleton).not.toBeNull()
    })

    it('circular variant defaults to 40px square', () => {
      render(<Skeleton variant="circular" />)
      const skeleton = document.querySelector('.rounded-full')
      expect(skeleton).toHaveStyle({ width: '40px', height: '40px' })
    })

    it('circular variant accepts custom dimensions', () => {
      render(<Skeleton variant="circular" width={60} height={60} />)
      const skeleton = document.querySelector('.rounded-full')
      expect(skeleton).toHaveStyle({ width: '60px', height: '60px' })
    })

    it('renders rectangular variant', () => {
      render(<Skeleton variant="rectangular" />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).not.toBeNull()
      expect(skeleton).toHaveStyle({ height: '100px' })
    })

    it('rectangular variant accepts custom height', () => {
      render(<Skeleton variant="rectangular" height={200} />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).toHaveStyle({ height: '200px' })
    })

    it('renders card variant with nested skeletons', () => {
      render(<Skeleton variant="card" />)
      const card = document.querySelector('.p-4')
      expect(card).not.toBeNull()
      // Card contains circular skeleton and text skeletons
      const circular = document.querySelector('.rounded-full')
      expect(circular).not.toBeNull()
    })
  })

  describe('Text Lines', () => {
    it('renders single line for lines=1', () => {
      render(<Skeleton variant="text" lines={1} />)
      const skeletons = document.querySelectorAll('.h-4')
      expect(skeletons).toHaveLength(1)
    })

    it('renders multiple lines when lines > 1', () => {
      render(<Skeleton variant="text" lines={3} />)
      const container = document.querySelector('.space-y-2')
      expect(container).not.toBeNull()
      const lines = container?.querySelectorAll('.h-4')
      expect(lines).toHaveLength(3)
    })

    it('last line is 80% width for multiple lines', () => {
      render(<Skeleton variant="text" lines={3} />)
      const container = document.querySelector('.space-y-2')
      const lines = container?.querySelectorAll('.h-4')
      const lastLine = lines?.[2]
      expect(lastLine).toHaveStyle({ width: '80%' })
    })
  })

  describe('Animation', () => {
    it('applies wave animation when specified', () => {
      render(<Skeleton animation="wave" />)
      const skeleton = document.querySelector('.skeleton-wave')
      expect(skeleton).not.toBeNull()
    })

    it('removes animation when animation=none', () => {
      render(<Skeleton animation="none" />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).not.toHaveClass('animate-pulse')
      expect(skeleton).not.toHaveClass('skeleton-wave')
    })
  })

  describe('Dimensions', () => {
    it('accepts width as number (pixels)', () => {
      render(<Skeleton width={200} />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).toHaveStyle({ width: '200px' })
    })

    it('accepts width as string', () => {
      render(<Skeleton width="50%" />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).toHaveStyle({ width: '50%' })
    })

    it('accepts height as number (pixels)', () => {
      render(<Skeleton height={100} />)
      const skeleton = document.querySelector('.bg-surface-hover')
      expect(skeleton).toHaveStyle({ height: '100px' })
    })
  })
})

describe('SkeletonList', () => {
  it('renders 5 items by default', () => {
    render(<SkeletonList />)
    const items = document.querySelectorAll('.flex.items-center.gap-4')
    expect(items).toHaveLength(5)
  })

  it('renders specified number of items', () => {
    render(<SkeletonList count={3} />)
    const items = document.querySelectorAll('.flex.items-center.gap-4')
    expect(items).toHaveLength(3)
  })

  it('shows avatar by default', () => {
    render(<SkeletonList count={1} />)
    const avatar = document.querySelector('.rounded-full')
    expect(avatar).not.toBeNull()
  })

  it('hides avatar when showAvatar=false', () => {
    render(<SkeletonList count={1} showAvatar={false} />)
    const avatar = document.querySelector('.rounded-full')
    expect(avatar).toBeNull()
  })

  it('applies custom item height', () => {
    render(<SkeletonList count={1} itemHeight={80} />)
    const item = document.querySelector('.flex.items-center')
    expect(item).toHaveStyle({ height: '80px' })
  })

  it('accepts custom className', () => {
    render(<SkeletonList className="custom-list" />)
    const container = document.querySelector('.custom-list')
    expect(container).not.toBeNull()
  })
})

describe('SkeletonGrid', () => {
  it('renders 6 items by default', () => {
    render(<SkeletonGrid />)
    const items = document.querySelectorAll('.bg-surface.rounded-lg')
    expect(items).toHaveLength(6)
  })

  it('renders specified number of items', () => {
    render(<SkeletonGrid count={4} />)
    const items = document.querySelectorAll('.bg-surface.rounded-lg')
    expect(items).toHaveLength(4)
  })

  it('uses 3 columns by default', () => {
    render(<SkeletonGrid />)
    const grid = document.querySelector('.grid')
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' })
  })

  it('accepts custom column count', () => {
    render(<SkeletonGrid columns={2} />)
    const grid = document.querySelector('.grid')
    expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(2, 1fr)' })
  })

  it('applies custom card height', () => {
    render(<SkeletonGrid count={1} cardHeight={200} />)
    const card = document.querySelector('.bg-surface.rounded-lg')
    expect(card).toHaveStyle({ height: '200px' })
  })
})

describe('SkeletonTable', () => {
  it('renders 5 rows by default', () => {
    render(<SkeletonTable />)
    const rows = document.querySelectorAll('.animate-pulse')
    expect(rows).toHaveLength(5)
  })

  it('renders header by default', () => {
    render(<SkeletonTable />)
    const header = document.querySelector('.bg-surface-hover')
    expect(header).not.toBeNull()
  })

  it('hides header when showHeader=false', () => {
    render(<SkeletonTable showHeader={false} />)
    // Check that no header row with bg-surface-hover exists (header has this, rows have bg-surface)
    const container = document.querySelector('.space-y-2')
    const header = container?.querySelector(':scope > .bg-surface-hover')
    expect(header).toBeNull()
  })

  it('renders specified number of rows', () => {
    render(<SkeletonTable rows={3} />)
    const rows = document.querySelectorAll('.animate-pulse')
    expect(rows).toHaveLength(3)
  })

  it('renders specified number of columns', () => {
    render(<SkeletonTable rows={1} columns={6} />)
    const row = document.querySelector('.animate-pulse')
    const cells = row?.querySelectorAll('.h-4')
    expect(cells).toHaveLength(6)
  })
})

describe('PageSkeleton', () => {
  it('renders header section', () => {
    render(<PageSkeleton />)
    const header = document.querySelector('.flex.items-center.justify-between')
    expect(header).not.toBeNull()
  })

  it('renders stats grid', () => {
    render(<PageSkeleton />)
    const grid = document.querySelector('.grid')
    expect(grid).not.toBeNull()
  })

  it('renders with fade-in animation', () => {
    render(<PageSkeleton />)
    const container = document.querySelector('.animate-in')
    expect(container).not.toBeNull()
  })

  it('renders 3-column main content layout', () => {
    render(<PageSkeleton />)
    const mainGrid = document.querySelector('.grid-cols-3')
    expect(mainGrid).not.toBeNull()
  })
})
