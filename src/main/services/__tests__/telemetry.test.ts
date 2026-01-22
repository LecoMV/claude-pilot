/**
 * Telemetry Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Sentry before importing TelemetryService
vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  startInactiveSpan: vi.fn(() => ({ end: vi.fn() })),
}))

// Mock electron
vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
  },
}))

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

// Mock os
vi.mock('os', () => ({
  hostname: vi.fn(() => 'test-machine'),
  homedir: vi.fn(() => '/home/test'),
}))

import * as Sentry from '@sentry/electron/main'
import { existsSync, readFileSync } from 'fs'
import { TelemetryService } from '../telemetry'

describe('TelemetryService', () => {
  let service: TelemetryService
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    vi.clearAllMocks()
    originalEnv = { ...process.env }

    // Default: no settings file, no SENTRY_DSN
    vi.mocked(existsSync).mockReturnValue(false)
    delete process.env.SENTRY_DSN
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('constructor', () => {
    it('should initialize with defaults when no settings file', () => {
      service = new TelemetryService()
      const settings = service.getSettings()

      expect(settings.enabled).toBe(false)
      expect(settings.crashReports).toBe(false)
      expect(settings.usageAnalytics).toBe(false)
      expect(settings.performanceMetrics).toBe(false)
    })

    it('should load settings from file when available', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: {
            enabled: true,
            crashReports: true,
            usageAnalytics: false,
            performanceMetrics: true,
          },
        })
      )

      service = new TelemetryService()
      const settings = service.getSettings()

      expect(settings.enabled).toBe(true)
      expect(settings.crashReports).toBe(true)
      expect(settings.usageAnalytics).toBe(false)
      expect(settings.performanceMetrics).toBe(true)
    })

    it('should handle invalid settings file gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      service = new TelemetryService()
      const settings = service.getSettings()

      // Should fall back to defaults
      expect(settings.enabled).toBe(false)
    })

    it('should generate anonymous ID from machine hostname', () => {
      service = new TelemetryService()
      const settings = service.getSettings()

      // Anonymous ID should be a 16-char hex string
      expect(settings.anonymousId).toMatch(/^[a-f0-9]{16}$/)
    })
  })

  describe('initialize', () => {
    it('should not initialize Sentry when no DSN', () => {
      service = new TelemetryService()
      service.initialize()

      expect(Sentry.init).not.toHaveBeenCalled()
    })

    it('should not initialize Sentry when telemetry is disabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'

      service = new TelemetryService()
      service.initialize()

      expect(Sentry.init).not.toHaveBeenCalled()
    })

    it('should initialize Sentry when enabled and DSN is set', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: {
            enabled: true,
            crashReports: true,
          },
        })
      )

      service = new TelemetryService()
      service.initialize()

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          sendDefaultPii: false,
        })
      )
    })

    it('should only initialize once', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true },
        })
      )

      service = new TelemetryService()
      service.initialize()
      service.initialize()

      expect(Sentry.init).toHaveBeenCalledTimes(1)
    })

    it('should set user context when crash reports or analytics enabled', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: {
            enabled: true,
            crashReports: true,
          },
        })
      )

      service = new TelemetryService()
      service.initialize()

      expect(Sentry.setUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
        })
      )
    })
  })

  describe('isEnabled', () => {
    it('should return false when disabled', () => {
      service = new TelemetryService()
      expect(service.isEnabled()).toBe(false)
    })

    it('should return true when enabled', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true },
        })
      )

      service = new TelemetryService()
      expect(service.isEnabled()).toBe(true)
    })
  })

  describe('updateSettings', () => {
    it('should update settings at runtime', () => {
      service = new TelemetryService()

      service.updateSettings({
        enabled: true,
        crashReports: true,
        usageAnalytics: true,
        performanceMetrics: false,
      })

      expect(service.isEnabled()).toBe(true)
    })

    it('should clear Sentry user when disabled', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true },
        })
      )

      service = new TelemetryService()

      service.updateSettings({
        enabled: false,
        crashReports: false,
        usageAnalytics: false,
        performanceMetrics: false,
      })

      expect(Sentry.setUser).toHaveBeenCalledWith(null)
    })
  })

  describe('trackEvent', () => {
    it('should not track when telemetry is disabled', () => {
      service = new TelemetryService()
      service.trackEvent('test_event', { key: 'value' })

      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled()
    })

    it('should not track when usage analytics is disabled', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true, usageAnalytics: false },
        })
      )

      service = new TelemetryService()
      service.trackEvent('test_event', { key: 'value' })

      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled()
    })

    it('should track when enabled and usage analytics is on', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true, usageAnalytics: true },
        })
      )

      service = new TelemetryService()
      service.trackEvent('test_event', { key: 'value' })

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'usage',
        message: 'test_event',
        data: { key: 'value' },
        level: 'info',
      })
    })
  })

  describe('captureException', () => {
    it('should not capture when telemetry is disabled', () => {
      service = new TelemetryService()
      service.captureException(new Error('Test error'))

      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('should not capture when crash reports is disabled', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true, crashReports: false },
        })
      )

      service = new TelemetryService()
      service.captureException(new Error('Test error'))

      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('should capture when enabled and crash reports is on', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true, crashReports: true },
        })
      )

      const error = new Error('Test error')
      const context = { userId: '123' }

      service = new TelemetryService()
      service.captureException(error, context)

      expect(Sentry.captureException).toHaveBeenCalledWith(error, { extra: context })
    })
  })

  describe('startTransaction', () => {
    it('should return null when telemetry is disabled', () => {
      service = new TelemetryService()
      const result = service.startTransaction('test', 'operation')

      expect(result).toBeNull()
      expect(Sentry.startInactiveSpan).not.toHaveBeenCalled()
    })

    it('should return null when performance metrics is disabled', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true, performanceMetrics: false },
        })
      )

      service = new TelemetryService()
      const result = service.startTransaction('test', 'operation')

      expect(result).toBeNull()
    })

    it('should start transaction when enabled and performance metrics is on', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true, performanceMetrics: true },
        })
      )

      service = new TelemetryService()
      const result = service.startTransaction('test', 'operation')

      expect(result).not.toBeNull()
      expect(Sentry.startInactiveSpan).toHaveBeenCalledWith({
        name: 'test',
        op: 'operation',
      })
    })
  })

  describe('privacy guarantees', () => {
    it('should never send PII', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123'
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          telemetry: { enabled: true },
        })
      )

      service = new TelemetryService()
      service.initialize()

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          sendDefaultPii: false,
        })
      )
    })

    it('should use anonymous one-way hash as user ID', () => {
      service = new TelemetryService()
      const settings = service.getSettings()

      // Should be a hash, not the raw hostname
      expect(settings.anonymousId).not.toBe('test-machine')
      expect(settings.anonymousId).toMatch(/^[a-f0-9]{16}$/)
    })
  })
})
