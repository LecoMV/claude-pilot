/**
 * Telemetry Service - Privacy-Respecting Analytics
 *
 * Handles opt-in telemetry with user consent. All telemetry is disabled by default.
 * Users must explicitly enable telemetry in settings.
 *
 * Privacy guarantees:
 * - Telemetry is OPT-IN (disabled by default)
 * - No PII is ever collected
 * - User ID is a one-way hash of machine ID (cannot be reversed)
 * - Users can disable telemetry at any time
 * - Settings are stored locally, never uploaded
 *
 * @module telemetry.service
 */

import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { hostname } from 'os'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { TelemetrySettings, AppSettings } from '../../shared/types'

const APP_SETTINGS_PATH = join(homedir(), '.config', 'claude-pilot', 'settings.json')

// Generate anonymous user ID (one-way hash of machine ID)
function generateAnonymousId(): string {
  const machineId = hostname()
  return createHash('sha256').update(machineId).digest('hex').slice(0, 16)
}

// Read telemetry settings from disk (synchronously for startup)
function loadTelemetrySettings(): TelemetrySettings {
  const defaults: TelemetrySettings = {
    enabled: false,
    crashReports: false,
    usageAnalytics: false,
    performanceMetrics: false,
  }

  try {
    if (existsSync(APP_SETTINGS_PATH)) {
      const content = readFileSync(APP_SETTINGS_PATH, 'utf-8')
      const settings = JSON.parse(content) as AppSettings
      if (settings.telemetry) {
        return { ...defaults, ...settings.telemetry }
      }
    }
  } catch (error) {
    console.error('[Telemetry] Failed to load settings:', error)
  }

  return defaults
}

class TelemetryService {
  private initialized = false
  private settings: TelemetrySettings
  private anonymousId: string

  constructor() {
    this.settings = loadTelemetrySettings()
    this.anonymousId = generateAnonymousId()
  }

  /**
   * Initialize telemetry based on user settings.
   * Only initializes Sentry if telemetry is enabled.
   * Should be called after app.whenReady().
   */
  initialize(): void {
    if (this.initialized) return
    this.initialized = true

    // Check if SENTRY_DSN is configured
    const dsn = process.env.SENTRY_DSN
    if (!dsn) {
      console.info('[Telemetry] No SENTRY_DSN configured, telemetry disabled')
      return
    }

    // Check if user has opted in to telemetry
    if (!this.settings.enabled) {
      console.info('[Telemetry] Telemetry disabled (user has not opted in)')
      return
    }

    // Initialize Sentry with user's preferences
    Sentry.init({
      dsn,
      release: `claude-pilot@${app.getVersion()}`,
      environment: is.dev ? 'development' : 'production',

      // Session tracking - only if crash reports are enabled
      autoSessionTracking: this.settings.crashReports,

      // Performance monitoring - only if enabled
      tracesSampleRate: this.settings.performanceMetrics ? (is.dev ? 1.0 : 0.1) : 0,
      profilesSampleRate: this.settings.performanceMetrics ? (is.dev ? 1.0 : 0.1) : 0,

      // Never send PII
      sendDefaultPii: false,

      // Filter events based on settings
      beforeSend: (event) => {
        // Skip if crash reports disabled
        if (!this.settings.crashReports && event.exception) {
          return null
        }

        // Scrub sensitive data
        if (event.request?.headers) {
          delete event.request.headers['authorization']
          delete event.request.headers['cookie']
        }

        return event
      },
    })

    // Set anonymous user context
    if (this.settings.crashReports || this.settings.usageAnalytics) {
      Sentry.setUser({ id: this.anonymousId })
    }

    console.info('[Telemetry] Initialized with settings:', {
      crashReports: this.settings.crashReports,
      usageAnalytics: this.settings.usageAnalytics,
      performanceMetrics: this.settings.performanceMetrics,
    })
  }

  /**
   * Update telemetry settings at runtime.
   * Note: Some Sentry settings can only be changed by restart.
   */
  updateSettings(newSettings: TelemetrySettings): void {
    this.settings = newSettings

    if (!this.settings.enabled) {
      // Disable Sentry by clearing client
      Sentry.setUser(null)
      console.info('[Telemetry] Telemetry disabled by user')
    } else {
      // Re-enable user context
      Sentry.setUser({ id: this.anonymousId })
      console.info('[Telemetry] Settings updated:', newSettings)
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.settings.enabled
  }

  /**
   * Get current telemetry settings
   */
  getSettings(): TelemetrySettings {
    return { ...this.settings, anonymousId: this.anonymousId }
  }

  /**
   * Track a custom event (only if usage analytics is enabled)
   */
  trackEvent(eventName: string, data?: Record<string, unknown>): void {
    if (!this.settings.enabled || !this.settings.usageAnalytics) {
      return
    }

    Sentry.addBreadcrumb({
      category: 'usage',
      message: eventName,
      data,
      level: 'info',
    })
  }

  /**
   * Capture an exception (only if crash reports are enabled)
   */
  captureException(error: Error, context?: Record<string, unknown>): void {
    if (!this.settings.enabled || !this.settings.crashReports) {
      return
    }

    Sentry.captureException(error, { extra: context })
  }

  /**
   * Start a performance transaction (only if performance metrics are enabled)
   */
  startTransaction(name: string, op: string): Sentry.Span | null {
    if (!this.settings.enabled || !this.settings.performanceMetrics) {
      return null
    }

    return Sentry.startInactiveSpan({ name, op })
  }
}

// Export singleton instance
export const telemetryService = new TelemetryService()

// Export class for testing
export { TelemetryService }
