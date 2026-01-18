/**
 * Services Controller
 *
 * Type-safe tRPC controller for system service management.
 * Handles systemd services and Podman containers.
 *
 * Migrated from handlers.ts (4 handlers):
 * - services:systemd
 * - services:podman
 * - services:systemdAction
 * - services:podmanAction
 *
 * @module services.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { spawnAsync } from '../../utils/spawn-async'
import type { SystemdService, PodmanContainer } from '../../../shared/types'

// ============================================================================
// Schemas
// ============================================================================

const SystemdActionSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9._@-]+$/, 'Invalid service name'),
  action: z.enum(['start', 'stop', 'restart']),
})

const PodmanActionSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid container ID'),
  action: z.enum(['start', 'stop', 'restart']),
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize service name to prevent shell injection
 */
function sanitizeServiceName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._@-]/g, '')
}

/**
 * Sanitize container ID to prevent shell injection
 */
function sanitizeContainerId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '')
}

/**
 * Get systemd services
 */
async function getSystemdServices(): Promise<SystemdService[]> {
  const services: SystemdService[] = []
  const importantServices = ['postgresql', 'docker', 'ssh', 'nginx', 'redis', 'memcached', 'cron']

  try {
    const result = await spawnAsync(
      'systemctl',
      ['list-units', '--type=service', '--all', '--no-pager', '--plain'],
      { timeout: 5000 }
    )

    const lines = result.trim().split('\n').slice(1, 51) // Skip header, limit to 50

    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 4) continue

      const name = parts[0].replace('.service', '')
      const load = parts[1]
      const active = parts[2]
      const sub = parts[3]
      const description = parts.slice(4).join(' ')

      // Only include important or running services
      if (!importantServices.some((s) => name.includes(s)) && active !== 'active') {
        continue
      }

      let status: SystemdService['status'] = 'inactive'
      if (active === 'active') status = 'running'
      else if (active === 'failed') status = 'failed'
      else if (active === 'inactive') status = 'stopped'

      services.push({
        name,
        description: description || name,
        status,
        enabled: load === 'loaded',
        activeState: active,
        subState: sub,
      })
    }
  } catch (error) {
    console.error('Failed to get systemd services:', error)
  }

  return services.slice(0, 20)
}

/**
 * Get Podman containers
 */
async function getPodmanContainers(): Promise<PodmanContainer[]> {
  const containers: PodmanContainer[] = []

  try {
    const result = await spawnAsync('podman', ['ps', '-a', '--format', 'json'], { timeout: 10000 })

    if (!result.trim()) return containers

    const data = JSON.parse(result)

    for (const c of data) {
      let status: PodmanContainer['status'] = 'stopped'
      const state = (c.State || '').toLowerCase()
      if (state === 'running') status = 'running'
      else if (state === 'paused') status = 'paused'
      else if (state === 'exited') status = 'exited'

      const ports: string[] = []
      if (c.Ports) {
        for (const p of c.Ports) {
          if (p.hostPort && p.containerPort) {
            ports.push(`${p.hostPort}:${p.containerPort}`)
          }
        }
      }

      containers.push({
        id: c.Id || c.ID || '',
        name: (c.Names && c.Names[0]) || c.Name || '',
        image: c.Image || '',
        status,
        created: c.Created || c.CreatedAt || '',
        ports,
        state: c.State || '',
        health: c.Status || undefined,
      })
    }
  } catch (error) {
    console.error('Failed to get podman containers:', error)
  }

  return containers
}

/**
 * Execute systemd action
 */
async function systemdAction(name: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> {
  try {
    const safeName = sanitizeServiceName(name)
    if (!safeName) {
      console.error('Invalid service name:', name)
      return false
    }
    await spawnAsync('systemctl', ['--user', action, safeName], { timeout: 30000 })
    return true
  } catch (error) {
    console.error(`Failed to ${action} service ${name}:`, error)
    return false
  }
}

/**
 * Execute Podman container action
 */
async function podmanAction(id: string, action: 'start' | 'stop' | 'restart'): Promise<boolean> {
  try {
    const safeId = sanitizeContainerId(id)
    if (!safeId) {
      console.error('Invalid container ID:', id)
      return false
    }
    await spawnAsync('podman', [action, safeId], { timeout: 30000 })
    return true
  } catch (error) {
    console.error(`Failed to ${action} container ${id}:`, error)
    return false
  }
}

// ============================================================================
// Router
// ============================================================================

export const servicesRouter = router({
  /**
   * Get systemd services
   */
  systemd: publicProcedure.query((): Promise<SystemdService[]> => {
    return getSystemdServices()
  }),

  /**
   * Get Podman containers
   */
  podman: publicProcedure.query((): Promise<PodmanContainer[]> => {
    return getPodmanContainers()
  }),

  /**
   * Execute systemd service action
   */
  systemdAction: auditedProcedure
    .input(SystemdActionSchema)
    .mutation(({ input }): Promise<boolean> => {
      return systemdAction(input.name, input.action)
    }),

  /**
   * Execute Podman container action
   */
  podmanAction: auditedProcedure
    .input(PodmanActionSchema)
    .mutation(({ input }): Promise<boolean> => {
      return podmanAction(input.id, input.action)
    }),
})
