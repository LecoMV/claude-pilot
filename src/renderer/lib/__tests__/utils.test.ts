/**
 * Utils Tests
 *
 * Tests for utility functions used across the renderer.
 *
 * @module utils.test
 */

import { describe, it, expect } from 'vitest'
import { cn, formatBytes, formatNumber, formatDate, formatDuration, truncate } from '../utils'

describe('utils', () => {
  // ===========================================================================
  // cn (className utility)
  // ===========================================================================
  describe('cn', () => {
    it('merges class names', () => {
      const result = cn('foo', 'bar')
      expect(result).toBe('foo bar')
    })

    it('handles conditional classes', () => {
      const showBar = false
      const showBaz = true
      const result = cn('foo', showBar && 'bar', showBaz && 'baz')
      expect(result).toBe('foo baz')
    })

    it('merges Tailwind classes correctly', () => {
      const result = cn('p-4', 'p-2')
      expect(result).toBe('p-2')
    })

    it('handles undefined values', () => {
      const result = cn('foo', undefined, 'bar')
      expect(result).toBe('foo bar')
    })

    it('handles array input', () => {
      const result = cn(['foo', 'bar'])
      expect(result).toBe('foo bar')
    })

    it('returns empty string for no input', () => {
      const result = cn()
      expect(result).toBe('')
    })
  })

  // ===========================================================================
  // formatBytes
  // ===========================================================================
  describe('formatBytes', () => {
    it('returns "0 B" for zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
    })

    it('formats bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B')
    })

    it('formats kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
    })

    it('formats megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB')
      expect(formatBytes(1572864)).toBe('1.5 MB')
    })

    it('formats gigabytes correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB')
    })

    it('formats terabytes correctly', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB')
    })

    it('respects decimal places parameter', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB')
      expect(formatBytes(1536, 1)).toBe('1.5 KB')
      expect(formatBytes(1536, 3)).toBe('1.5 KB')
    })

    it('handles negative decimal places', () => {
      expect(formatBytes(1536, -1)).toBe('2 KB')
    })
  })

  // ===========================================================================
  // formatNumber
  // ===========================================================================
  describe('formatNumber', () => {
    it('formats small numbers as is', () => {
      expect(formatNumber(0)).toBe('0')
      expect(formatNumber(123)).toBe('123')
      expect(formatNumber(999)).toBe('999')
    })

    it('formats thousands with K suffix', () => {
      expect(formatNumber(1000)).toBe('1.0K')
      expect(formatNumber(1500)).toBe('1.5K')
      expect(formatNumber(10000)).toBe('10.0K')
      expect(formatNumber(999999)).toBe('1000.0K')
    })

    it('formats millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.0M')
      expect(formatNumber(1500000)).toBe('1.5M')
      expect(formatNumber(10000000)).toBe('10.0M')
    })
  })

  // ===========================================================================
  // formatDate
  // ===========================================================================
  describe('formatDate', () => {
    it('formats Date object', () => {
      const date = new Date('2024-03-15T14:30:00')
      const result = formatDate(date)
      expect(result).toContain('Mar')
      expect(result).toContain('15')
    })

    it('formats timestamp number', () => {
      const timestamp = new Date('2024-06-20T10:00:00').getTime()
      const result = formatDate(timestamp)
      expect(result).toContain('Jun')
      expect(result).toContain('20')
    })

    it('formats date string', () => {
      const result = formatDate('2024-12-25T08:30:00')
      expect(result).toContain('Dec')
      expect(result).toContain('25')
    })
  })

  // ===========================================================================
  // formatDuration
  // ===========================================================================
  describe('formatDuration', () => {
    it('formats seconds only', () => {
      expect(formatDuration(0)).toBe('0s')
      expect(formatDuration(1000)).toBe('1s')
      expect(formatDuration(30000)).toBe('30s')
      expect(formatDuration(59000)).toBe('59s')
    })

    it('formats minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s')
      expect(formatDuration(90000)).toBe('1m 30s')
      expect(formatDuration(300000)).toBe('5m 0s')
      expect(formatDuration(3599000)).toBe('59m 59s')
    })

    it('formats hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h 0m')
      expect(formatDuration(5400000)).toBe('1h 30m')
      expect(formatDuration(7200000)).toBe('2h 0m')
      expect(formatDuration(36000000)).toBe('10h 0m')
    })
  })

  // ===========================================================================
  // truncate
  // ===========================================================================
  describe('truncate', () => {
    it('returns string as-is if shorter than length', () => {
      expect(truncate('hello', 10)).toBe('hello')
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('truncates and adds ellipsis if longer than length', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
      expect(truncate('hello world', 8)).toBe('hello wo...')
    })

    it('handles empty string', () => {
      expect(truncate('', 10)).toBe('')
    })

    it('handles zero length', () => {
      expect(truncate('hello', 0)).toBe('...')
    })
  })
})
