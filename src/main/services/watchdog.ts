/**
 * Watchdog Auto-Recovery Service
 * Monitors critical services and automatically restarts them on failure
 */

import { execSync } from 'child_process'
import { EventEmitter } from 'events'
import { auditService, ActivityType, EventCategory, Severity, StatusCode } from './audit'

// Service definitions
export interface ServiceDefinition {
  id: string
  name: string
  type: 'systemd' | 'podman' | 'process' | 'http'
  // For systemd services
  unitName?: string
  // For podman containers
  containerName?: string
  // For HTTP health checks
  healthUrl?: string
  healthTimeout?: number
  // Recovery settings
  maxRestarts: number
  restartDelay: number // ms between restarts
  cooldownPeriod: number // ms before resetting restart counter
}

export interface ServiceHealth {
  id: string
  name: string
  status: 'healthy' | 'unhealthy' | 'recovering' | 'failed'
  lastCheck: number
  lastHealthy: number
  restartCount: number
  lastRestart?: number
  error?: string
}

export interface RecoveryEvent {
  id: string
  serviceId: string
  serviceName: string
  timestamp: number
  action: 'restart' | 'alert' | 'recovery_failed'
  success: boolean
  message: string
}

// Default service configurations
const DEFAULT_SERVICES: ServiceDefinition[] = [
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    type: 'systemd',
    unitName: 'postgresql@16-main',
    maxRestarts: 3,
    restartDelay: 5000,
    cooldownPeriod: 300000, // 5 minutes
  },
  {
    id: 'memgraph',
    name: 'Memgraph',
    type: 'podman',
    containerName: 'memgraph',
    maxRestarts: 3,
    restartDelay: 5000,
    cooldownPeriod: 300000,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'systemd',
    unitName: 'ollama',
    maxRestarts: 3,
    restartDelay: 5000,
    cooldownPeriod: 300000,
  },
]

class WatchdogService extends EventEmitter {
  private services: Map<string, ServiceDefinition> = new Map()
  private health: Map<string, ServiceHealth> = new Map()
  private recoveryHistory: RecoveryEvent[] = []
  private checkInterval: NodeJS.Timeout | null = null
  private enabled: boolean = false
  private checkIntervalMs: number = 30000 // 30 seconds

  constructor() {
    super()
    // Load default services
    for (const service of DEFAULT_SERVICES) {
      this.services.set(service.id, service)
      this.health.set(service.id, {
        id: service.id,
        name: service.name,
        status: 'healthy',
        lastCheck: 0,
        lastHealthy: Date.now(),
        restartCount: 0,
      })
    }
  }

  /**
   * Start the watchdog service
   */
  start(): void {
    if (this.enabled) return

    this.enabled = true
    console.info('[Watchdog] Starting service monitoring')

    // Initial check
    this.checkAllServices()

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllServices()
    }, this.checkIntervalMs)

    auditService.log({
      category: EventCategory.SYSTEM,
      activity: ActivityType.EXECUTE,
      message: 'Watchdog service started',
      targetType: 'watchdog',
      targetName: 'service',
    })
  }

  /**
   * Stop the watchdog service
   */
  stop(): void {
    if (!this.enabled) return

    this.enabled = false
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    console.info('[Watchdog] Service monitoring stopped')

    auditService.log({
      category: EventCategory.SYSTEM,
      activity: ActivityType.EXECUTE,
      message: 'Watchdog service stopped',
      targetType: 'watchdog',
      targetName: 'service',
    })
  }

  /**
   * Check all registered services
   */
  private async checkAllServices(): Promise<void> {
    for (const [id, service] of this.services) {
      try {
        const isHealthy = await this.checkService(service)
        this.updateHealth(id, isHealthy)
      } catch (error) {
        console.error(`[Watchdog] Error checking ${service.name}:`, error)
        this.updateHealth(id, false, (error as Error).message)
      }
    }
  }

  /**
   * Check a single service's health
   */
  private checkService(service: ServiceDefinition): Promise<boolean> | boolean {
    switch (service.type) {
      case 'systemd':
        if (!service.unitName) return false
        return this.checkSystemdService(service.unitName)

      case 'podman':
        if (!service.containerName) return false
        return this.checkPodmanContainer(service.containerName)

      case 'http':
        if (!service.healthUrl) return false
        return this.checkHttpHealth(service.healthUrl, service.healthTimeout)

      case 'process':
        return this.checkProcess(service.id)

      default:
        return false
    }
  }

  /**
   * Check systemd service status
   */
  private checkSystemdService(unitName: string): boolean {
    try {
      const result = execSync(`systemctl is-active ${unitName} 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim()
      return result === 'active'
    } catch {
      return false
    }
  }

  /**
   * Check podman container status
   */
  private checkPodmanContainer(containerName: string): boolean {
    try {
      const result = execSync(
        `podman inspect --format '{{.State.Status}}' ${containerName} 2>/dev/null`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim()
      return result === 'running'
    } catch {
      return false
    }
  }

  /**
   * Check HTTP health endpoint
   */
  private async checkHttpHealth(url: string, timeout: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Check if a process is running by name
   */
  private checkProcess(processName: string): boolean {
    try {
      execSync(`pgrep -f ${processName}`, { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  /**
   * Update service health and trigger recovery if needed
   */
  private updateHealth(serviceId: string, isHealthy: boolean, error?: string): void {
    const health = this.health.get(serviceId)
    const service = this.services.get(serviceId)
    if (!health || !service) return

    const now = Date.now()
    health.lastCheck = now

    if (isHealthy) {
      // Service is healthy
      if (health.status !== 'healthy') {
        console.info(`[Watchdog] ${service.name} is now healthy`)
        this.emit('service:recovered', { serviceId, serviceName: service.name })
      }
      health.status = 'healthy'
      health.lastHealthy = now
      health.error = undefined

      // Reset restart count after cooldown
      if (health.lastRestart && now - health.lastRestart > service.cooldownPeriod) {
        health.restartCount = 0
      }
    } else {
      // Service is unhealthy
      health.error = error || 'Service not responding'

      if (health.status === 'healthy') {
        console.info(`[Watchdog] ${service.name} became unhealthy: ${health.error}`)
        health.status = 'unhealthy'
        this.emit('service:unhealthy', {
          serviceId,
          serviceName: service.name,
          error: health.error,
        })

        // Attempt recovery
        this.attemptRecovery(serviceId)
      }
    }
  }

  /**
   * Attempt to recover a failed service
   */
  private async attemptRecovery(serviceId: string): Promise<void> {
    const health = this.health.get(serviceId)
    const service = this.services.get(serviceId)
    if (!health || !service) return

    // Check if we've exceeded max restarts
    if (health.restartCount >= service.maxRestarts) {
      console.error(`[Watchdog] ${service.name} exceeded max restarts (${service.maxRestarts})`)
      health.status = 'failed'

      this.logRecoveryEvent(
        serviceId,
        'recovery_failed',
        false,
        `Exceeded max restarts (${service.maxRestarts})`
      )

      this.emit('service:failed', {
        serviceId,
        serviceName: service.name,
        restartCount: health.restartCount,
      })
      return
    }

    // Mark as recovering
    health.status = 'recovering'
    health.restartCount++

    console.info(
      `[Watchdog] Attempting to restart ${service.name} (attempt ${health.restartCount}/${service.maxRestarts})`
    )

    // Wait before restart
    await this.sleep(service.restartDelay)

    try {
      const success = await this.restartService(service)
      health.lastRestart = Date.now()

      if (success) {
        console.info(`[Watchdog] ${service.name} restart initiated`)
        this.logRecoveryEvent(serviceId, 'restart', true, `Restart attempt ${health.restartCount}`)
      } else {
        console.error(`[Watchdog] Failed to restart ${service.name}`)
        this.logRecoveryEvent(
          serviceId,
          'restart',
          false,
          `Restart attempt ${health.restartCount} failed`
        )
      }
    } catch (error) {
      console.error(`[Watchdog] Error restarting ${service.name}:`, error)
      this.logRecoveryEvent(serviceId, 'restart', false, (error as Error).message)
    }
  }

  /**
   * Restart a service
   */
  private restartService(service: ServiceDefinition): boolean {
    try {
      switch (service.type) {
        case 'systemd':
          execSync(`systemctl restart ${service.unitName}`, { timeout: 30000 })
          return true

        case 'podman':
          execSync(`podman restart ${service.containerName}`, { timeout: 30000 })
          return true

        default:
          return false
      }
    } catch {
      return false
    }
  }

  /**
   * Log a recovery event
   */
  private logRecoveryEvent(
    serviceId: string,
    action: RecoveryEvent['action'],
    success: boolean,
    message: string
  ): void {
    const service = this.services.get(serviceId)
    if (!service) return

    const event: RecoveryEvent = {
      id: `${serviceId}-${Date.now()}`,
      serviceId,
      serviceName: service.name,
      timestamp: Date.now(),
      action,
      success,
      message,
    }

    this.recoveryHistory.push(event)

    // Keep only last 100 events
    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory = this.recoveryHistory.slice(-100)
    }

    // Audit log
    auditService.log({
      category: EventCategory.SYSTEM,
      activity: success ? ActivityType.EXECUTE : ActivityType.ERROR,
      message: `Watchdog ${action}: ${service.name}`,
      severity: success ? Severity.INFORMATIONAL : Severity.HIGH,
      status: success ? StatusCode.SUCCESS : StatusCode.FAILURE,
      statusDetail: message,
      targetType: 'service',
      targetName: serviceId,
    })

    this.emit('recovery:event', event)
  }

  /**
   * Get all service health statuses
   */
  getHealth(): ServiceHealth[] {
    return Array.from(this.health.values())
  }

  /**
   * Get health for a specific service
   */
  getServiceHealth(serviceId: string): ServiceHealth | null {
    return this.health.get(serviceId) || null
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(limit: number = 50): RecoveryEvent[] {
    return this.recoveryHistory.slice(-limit)
  }

  /**
   * Add a custom service to monitor
   */
  addService(service: ServiceDefinition): void {
    this.services.set(service.id, service)
    this.health.set(service.id, {
      id: service.id,
      name: service.name,
      status: 'healthy',
      lastCheck: 0,
      lastHealthy: Date.now(),
      restartCount: 0,
    })
  }

  /**
   * Remove a service from monitoring
   */
  removeService(serviceId: string): void {
    this.services.delete(serviceId)
    this.health.delete(serviceId)
  }

  /**
   * Check if watchdog is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Set check interval
   */
  setCheckInterval(ms: number): void {
    this.checkIntervalMs = Math.max(5000, ms) // Minimum 5 seconds
    if (this.enabled) {
      this.stop()
      this.start()
    }
  }

  /**
   * Force check a specific service
   */
  async forceCheck(serviceId: string): Promise<ServiceHealth | null> {
    const service = this.services.get(serviceId)
    if (!service) return null

    try {
      const isHealthy = await this.checkService(service)
      this.updateHealth(serviceId, isHealthy)
    } catch (error) {
      this.updateHealth(serviceId, false, (error as Error).message)
    }

    return this.health.get(serviceId) || null
  }

  /**
   * Force restart a service
   */
  async forceRestart(serviceId: string): Promise<boolean> {
    const service = this.services.get(serviceId)
    if (!service) return false

    try {
      const success = await this.restartService(service)
      this.logRecoveryEvent(serviceId, 'restart', success, 'Manual restart')
      return success
    } catch (error) {
      this.logRecoveryEvent(serviceId, 'restart', false, (error as Error).message)
      return false
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Export singleton
export const watchdogService = new WatchdogService()

// Export class for testing
export { WatchdogService }
