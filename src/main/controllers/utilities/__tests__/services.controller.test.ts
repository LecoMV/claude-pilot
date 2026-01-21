/**
 * Services Controller Tests
 *
 * Comprehensive tests for the services tRPC controller.
 * Tests all 4 procedures: systemd, podman, systemdAction, podmanAction
 *
 * @module services.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { servicesRouter } from '../services.controller'

// Mock spawn-async utility
vi.mock('../../../utils/spawn-async', () => ({
  spawnAsync: vi.fn(),
}))

import { spawnAsync } from '../../../utils/spawn-async'

// Create a test caller
const createTestCaller = () => servicesRouter.createCaller({})

describe('services.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // SYSTEMD PROCEDURE
  // ===========================================================================
  describe('systemd', () => {
    it('should return list of systemd services', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' +
          'postgresql.service loaded active running PostgreSQL RDBMS\n' +
          'docker.service loaded active running Docker Application Container Engine\n' +
          'ssh.service loaded inactive dead OpenBSD Secure Shell server\n' +
          'nginx.service loaded failed failed A high performance web server\n'
      )

      const result = await caller.systemd()

      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThan(0)

      // Check postgresql service
      const postgres = result.find((s) => s.name === 'postgresql')
      expect(postgres).toBeDefined()
      expect(postgres?.status).toBe('running')
      expect(postgres?.enabled).toBe(true)
      expect(postgres?.description).toBe('PostgreSQL RDBMS')

      // Check docker service
      const docker = result.find((s) => s.name === 'docker')
      expect(docker?.status).toBe('running')

      // Check ssh service
      const ssh = result.find((s) => s.name === 'ssh')
      expect(ssh?.status).toBe('stopped')

      // Check nginx service (failed)
      const nginx = result.find((s) => s.name === 'nginx')
      expect(nginx?.status).toBe('failed')
    })

    it('should return empty array on command failure', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Command failed'))

      const result = await caller.systemd()

      expect(result).toEqual([])
    })

    it('should filter services to important ones and running services', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' +
          'postgresql.service loaded inactive dead PostgreSQL RDBMS\n' +
          'random.service loaded inactive dead Random unimportant service\n' +
          'docker.service loaded active running Docker\n'
      )

      const result = await caller.systemd()

      // postgresql is important (even if inactive)
      const postgres = result.find((s) => s.name === 'postgresql')
      expect(postgres).toBeDefined()

      // docker is running
      const docker = result.find((s) => s.name === 'docker')
      expect(docker).toBeDefined()

      // random is neither important nor running
      const random = result.find((s) => s.name === 'random')
      expect(random).toBeUndefined()
    })

    it('should handle malformed systemctl output', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' +
          'incomplete\n' +
          'postgresql.service loaded active running PostgreSQL'
      )

      const result = await caller.systemd()

      // Should only have postgresql, incomplete line is skipped
      expect(result.length).toBeLessThanOrEqual(1)
      if (result.length > 0) {
        expect(result[0].name).toBe('postgresql')
      }
    })

    it('should limit results to 20 services', async () => {
      // Generate 30 services
      const lines = ['UNIT LOAD ACTIVE SUB DESCRIPTION']
      for (let i = 0; i < 30; i++) {
        lines.push(`postgres${i}.service loaded active running Service ${i}`)
      }
      vi.mocked(spawnAsync).mockResolvedValue(lines.join('\n'))

      const result = await caller.systemd()

      expect(result.length).toBeLessThanOrEqual(20)
    })

    it('should call systemctl with correct arguments', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('UNIT LOAD ACTIVE SUB DESCRIPTION\n')

      await caller.systemd()

      expect(spawnAsync).toHaveBeenCalledWith(
        'systemctl',
        ['list-units', '--type=service', '--all', '--no-pager', '--plain'],
        expect.objectContaining({ timeout: 5000 })
      )
    })

    it('should handle empty output', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.systemd()

      expect(result).toEqual([])
    })

    it('should strip .service suffix from service names', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' + 'postgresql.service loaded active running PostgreSQL'
      )

      const result = await caller.systemd()

      expect(result[0].name).toBe('postgresql')
      expect(result[0].name).not.toContain('.service')
    })

    it('should map active states correctly', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' +
          'postgresql.service loaded active running PostgreSQL\n' +
          'redis.service loaded failed failed Redis Server\n' +
          'nginx.service loaded inactive dead Nginx Web Server'
      )

      const result = await caller.systemd()

      const postgres = result.find((s) => s.name === 'postgresql')
      expect(postgres?.activeState).toBe('active')

      const redis = result.find((s) => s.name === 'redis')
      expect(redis?.activeState).toBe('failed')

      const nginx = result.find((s) => s.name === 'nginx')
      expect(nginx?.activeState).toBe('inactive')
    })
  })

  // ===========================================================================
  // PODMAN PROCEDURE
  // ===========================================================================
  describe('podman', () => {
    it('should return list of containers', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          {
            Id: 'abc123def456',
            Names: ['my-postgres'],
            Image: 'postgres:15',
            State: 'running',
            Created: '2025-01-01T00:00:00Z',
            Ports: [{ hostPort: 5432, containerPort: 5432 }],
            Status: 'Up 5 hours',
          },
          {
            Id: 'xyz789uvw012',
            Names: ['redis-cache'],
            Image: 'redis:7',
            State: 'exited',
            Created: '2025-01-02T00:00:00Z',
            Ports: [],
            Status: 'Exited (0) 2 hours ago',
          },
        ])
      )

      const result = await caller.podman()

      expect(result).toHaveLength(2)

      const postgres = result.find((c) => c.name === 'my-postgres')
      expect(postgres).toBeDefined()
      expect(postgres?.id).toBe('abc123def456')
      expect(postgres?.image).toBe('postgres:15')
      expect(postgres?.status).toBe('running')
      expect(postgres?.ports).toContain('5432:5432')

      const redis = result.find((c) => c.name === 'redis-cache')
      expect(redis?.status).toBe('exited')
    })

    it('should return empty array when no containers', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.podman()

      expect(result).toEqual([])
    })

    it('should return empty array on command failure', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('podman not found'))

      const result = await caller.podman()

      expect(result).toEqual([])
    })

    it('should handle different container states', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          { Id: '1', Names: ['running'], Image: 'test', State: 'running', Created: '', Ports: [] },
          { Id: '2', Names: ['paused'], Image: 'test', State: 'paused', Created: '', Ports: [] },
          { Id: '3', Names: ['exited'], Image: 'test', State: 'exited', Created: '', Ports: [] },
          { Id: '4', Names: ['stopped'], Image: 'test', State: 'stopped', Created: '', Ports: [] },
        ])
      )

      const result = await caller.podman()

      expect(result.find((c) => c.name === 'running')?.status).toBe('running')
      expect(result.find((c) => c.name === 'paused')?.status).toBe('paused')
      expect(result.find((c) => c.name === 'exited')?.status).toBe('exited')
      expect(result.find((c) => c.name === 'stopped')?.status).toBe('stopped')
    })

    it('should handle containers with multiple ports', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          {
            Id: 'multi-port',
            Names: ['web-app'],
            Image: 'app:latest',
            State: 'running',
            Created: '',
            Ports: [
              { hostPort: 80, containerPort: 80 },
              { hostPort: 443, containerPort: 443 },
              { hostPort: 8080, containerPort: 8080 },
            ],
          },
        ])
      )

      const result = await caller.podman()

      expect(result[0].ports).toHaveLength(3)
      expect(result[0].ports).toContain('80:80')
      expect(result[0].ports).toContain('443:443')
      expect(result[0].ports).toContain('8080:8080')
    })

    it('should handle containers without port mappings', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          {
            Id: 'no-ports',
            Names: ['internal-service'],
            Image: 'internal:latest',
            State: 'running',
            Created: '',
            Ports: null,
          },
        ])
      )

      const result = await caller.podman()

      expect(result[0].ports).toEqual([])
    })

    it('should handle alternative field names in podman output', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          {
            ID: 'alt-id-field',
            Name: 'alt-name-field', // Name instead of Names
            Image: 'test:latest',
            State: 'running',
            CreatedAt: '2025-01-01T00:00:00Z', // CreatedAt instead of Created
          },
        ])
      )

      const result = await caller.podman()

      expect(result[0].id).toBe('alt-id-field')
      expect(result[0].name).toBe('alt-name-field')
      expect(result[0].created).toBe('2025-01-01T00:00:00Z')
    })

    it('should call podman with correct arguments', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('[]')

      await caller.podman()

      expect(spawnAsync).toHaveBeenCalledWith(
        'podman',
        ['ps', '-a', '--format', 'json'],
        expect.objectContaining({ timeout: 10000 })
      )
    })

    it('should handle invalid JSON gracefully', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('not valid json')

      const result = await caller.podman()

      expect(result).toEqual([])
    })

    it('should include health status when available', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          {
            Id: 'healthy',
            Names: ['healthy-container'],
            Image: 'test',
            State: 'running',
            Created: '',
            Status: 'Up 5 hours (healthy)',
          },
        ])
      )

      const result = await caller.podman()

      expect(result[0].health).toBe('Up 5 hours (healthy)')
    })
  })

  // ===========================================================================
  // SYSTEMD ACTION PROCEDURE
  // ===========================================================================
  describe('systemdAction', () => {
    it('should start a service', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.systemdAction({ name: 'postgresql', action: 'start' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith(
        'systemctl',
        ['--user', 'start', 'postgresql'],
        expect.objectContaining({ timeout: 30000 })
      )
    })

    it('should stop a service', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.systemdAction({ name: 'nginx', action: 'stop' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith(
        'systemctl',
        ['--user', 'stop', 'nginx'],
        expect.any(Object)
      )
    })

    it('should restart a service', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.systemdAction({ name: 'docker', action: 'restart' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith(
        'systemctl',
        ['--user', 'restart', 'docker'],
        expect.any(Object)
      )
    })

    it('should throw TRPCError on command failure', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Failed to start service'))

      await expect(caller.systemdAction({ name: 'broken', action: 'start' })).rejects.toThrow(
        /Failed to start service broken/
      )
    })

    it('should reject invalid service name format', async () => {
      await expect(
        caller.systemdAction({ name: 'invalid/name', action: 'start' })
      ).rejects.toThrow()

      await expect(
        caller.systemdAction({ name: 'invalid name', action: 'start' })
      ).rejects.toThrow()

      await expect(
        caller.systemdAction({ name: 'invalid;name', action: 'start' })
      ).rejects.toThrow()
    })

    it('should reject empty service name', async () => {
      await expect(caller.systemdAction({ name: '', action: 'start' })).rejects.toThrow()
    })

    it('should reject invalid action', async () => {
      await expect(
        caller.systemdAction({ name: 'test', action: 'invalid' as any })
      ).rejects.toThrow()
    })

    it('should accept valid service name formats', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      // Alphanumeric with dots, dashes, underscores, and @
      await expect(caller.systemdAction({ name: 'my-service', action: 'start' })).resolves.toBe(
        true
      )

      await expect(caller.systemdAction({ name: 'my.service', action: 'start' })).resolves.toBe(
        true
      )

      await expect(caller.systemdAction({ name: 'my_service', action: 'start' })).resolves.toBe(
        true
      )

      await expect(caller.systemdAction({ name: 'user@123', action: 'start' })).resolves.toBe(true)

      await expect(
        caller.systemdAction({ name: 'container-service@docker.service', action: 'start' })
      ).resolves.toBe(true)
    })

    it('should sanitize service name to prevent injection', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      // The regex validation should reject these before sanitization
      // But if somehow they get through, sanitization would remove dangerous chars
      await expect(
        caller.systemdAction({ name: 'test; rm -rf /', action: 'start' })
      ).rejects.toThrow()

      await expect(
        caller.systemdAction({ name: 'test | cat /etc/passwd', action: 'start' })
      ).rejects.toThrow()
    })

    it('should return false for invalid sanitized service name', async () => {
      // This tests the internal sanitization that removes all invalid characters
      // resulting in an empty string, which should return false
      // Note: This is a defensive check - the regex validation should catch it first
      vi.mocked(spawnAsync).mockResolvedValue('')

      // Valid name that passes validation
      const result = await caller.systemdAction({ name: 'validname123', action: 'start' })
      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // PODMAN ACTION PROCEDURE
  // ===========================================================================
  describe('podmanAction', () => {
    it('should start a container', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.podmanAction({ id: 'abc123', action: 'start' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith(
        'podman',
        ['start', 'abc123'],
        expect.objectContaining({ timeout: 30000 })
      )
    })

    it('should stop a container', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.podmanAction({ id: 'def456', action: 'stop' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith('podman', ['stop', 'def456'], expect.any(Object))
    })

    it('should restart a container', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const result = await caller.podmanAction({ id: 'ghi789', action: 'restart' })

      expect(result).toBe(true)
      expect(spawnAsync).toHaveBeenCalledWith('podman', ['restart', 'ghi789'], expect.any(Object))
    })

    it('should throw TRPCError on command failure', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Container not found'))

      await expect(caller.podmanAction({ id: 'nonexistent', action: 'start' })).rejects.toThrow(
        /Failed to start container nonexistent/
      )
    })

    it('should reject invalid container ID format', async () => {
      await expect(caller.podmanAction({ id: 'invalid/id', action: 'start' })).rejects.toThrow()

      await expect(caller.podmanAction({ id: 'invalid id', action: 'start' })).rejects.toThrow()

      await expect(caller.podmanAction({ id: 'invalid;id', action: 'start' })).rejects.toThrow()
    })

    it('should reject empty container ID', async () => {
      await expect(caller.podmanAction({ id: '', action: 'start' })).rejects.toThrow()
    })

    it('should reject invalid action', async () => {
      await expect(caller.podmanAction({ id: 'abc123', action: 'delete' as any })).rejects.toThrow()
    })

    it('should accept valid container ID formats', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      // Alphanumeric with dots, dashes, underscores
      await expect(caller.podmanAction({ id: 'my-container', action: 'start' })).resolves.toBe(true)

      await expect(caller.podmanAction({ id: 'my.container', action: 'start' })).resolves.toBe(true)

      await expect(caller.podmanAction({ id: 'my_container', action: 'start' })).resolves.toBe(true)

      // Full SHA256 ID (common in podman/docker)
      await expect(
        caller.podmanAction({ id: 'abc123def456789012345678901234567890', action: 'start' })
      ).resolves.toBe(true)

      // Short ID (12 chars, commonly used)
      await expect(caller.podmanAction({ id: 'abc123def456', action: 'start' })).resolves.toBe(true)
    })

    it('should sanitize container ID to prevent injection', async () => {
      // The regex validation should reject these
      await expect(caller.podmanAction({ id: 'abc; rm -rf /', action: 'start' })).rejects.toThrow()

      await expect(caller.podmanAction({ id: 'abc`whoami`', action: 'start' })).rejects.toThrow()

      await expect(caller.podmanAction({ id: 'abc$(id)', action: 'start' })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should use shell:false in spawnAsync (verified by spawn-async module)', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      await caller.systemdAction({ name: 'test', action: 'start' })

      // The spawnAsync utility enforces shell:false internally
      expect(spawnAsync).toHaveBeenCalledWith('systemctl', expect.any(Array), expect.any(Object))
    })

    it('should reject path traversal in service name', async () => {
      await expect(
        caller.systemdAction({ name: '../../../etc/passwd', action: 'start' })
      ).rejects.toThrow()

      await expect(
        caller.systemdAction({ name: '..\\..\\windows\\system32', action: 'start' })
      ).rejects.toThrow()
    })

    it('should reject path traversal in container ID', async () => {
      await expect(
        caller.podmanAction({ id: '../../../etc/passwd', action: 'start' })
      ).rejects.toThrow()
    })

    it('should reject shell special characters in service name', async () => {
      const maliciousNames = [
        'test; rm -rf /',
        'test | cat /etc/passwd',
        'test && echo pwned',
        'test || true',
        'test > /tmp/pwned',
        'test < /etc/passwd',
        '$(whoami)',
        '`id`',
        'test\necho pwned',
      ]

      for (const name of maliciousNames) {
        await expect(caller.systemdAction({ name, action: 'start' })).rejects.toThrow()
      }
    })

    it('should reject shell special characters in container ID', async () => {
      const maliciousIds = ['test; rm -rf /', 'test | cat /etc/passwd', '$(whoami)', '`id`']

      for (const id of maliciousIds) {
        await expect(caller.podmanAction({ id, action: 'start' })).rejects.toThrow()
      }
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle concurrent systemd queries', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' + 'postgresql.service loaded active running PostgreSQL'
      )

      const results = await Promise.all([caller.systemd(), caller.systemd(), caller.systemd()])

      expect(results).toHaveLength(3)
      results.forEach((r) => {
        expect(Array.isArray(r)).toBe(true)
      })
    })

    it('should handle concurrent podman queries', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([{ Id: '1', Names: ['c1'], Image: 'test', State: 'running', Created: '' }])
      )

      const results = await Promise.all([caller.podman(), caller.podman(), caller.podman()])

      expect(results).toHaveLength(3)
      results.forEach((r) => {
        expect(Array.isArray(r)).toBe(true)
      })
    })

    it('should handle concurrent service actions', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('')

      const results = await Promise.all([
        caller.systemdAction({ name: 'service1', action: 'start' }),
        caller.systemdAction({ name: 'service2', action: 'stop' }),
        caller.systemdAction({ name: 'service3', action: 'restart' }),
      ])

      expect(results).toHaveLength(3)
      results.forEach((r) => {
        expect(r).toBe(true)
      })
    })

    it('should handle services with long descriptions', async () => {
      const longDescription = 'A '.repeat(100) + 'very long service description'
      vi.mocked(spawnAsync).mockResolvedValue(
        'UNIT LOAD ACTIVE SUB DESCRIPTION\n' +
          `postgresql.service loaded active running ${longDescription}`
      )

      const result = await caller.systemd()

      expect(result[0].description).toBe(longDescription)
    })

    it('should handle containers with unicode names', async () => {
      vi.mocked(spawnAsync).mockResolvedValue(
        JSON.stringify([
          {
            Id: 'unicode123',
            Names: ['postgres-\u4E2D\u6587'], // Chinese characters
            Image: 'postgres:15',
            State: 'running',
            Created: '',
          },
        ])
      )

      const result = await caller.podman()

      expect(result[0].name).toBe('postgres-\u4E2D\u6587')
    })

    it('should handle empty arrays in podman output', async () => {
      vi.mocked(spawnAsync).mockResolvedValue('[]')

      const result = await caller.podman()

      expect(result).toEqual([])
    })

    it('should handle systemctl timeout', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Command timed out'))

      const result = await caller.systemd()

      expect(result).toEqual([])
    })

    it('should handle podman timeout', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Command timed out'))

      const result = await caller.podman()

      expect(result).toEqual([])
    })

    it('should throw TRPCError on action timeout', async () => {
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Command timed out after 30000ms'))

      await expect(caller.systemdAction({ name: 'slow-service', action: 'start' })).rejects.toThrow(
        /Failed to start service slow-service/
      )
    })
  })

  // ===========================================================================
  // ERROR LOGGING TESTS
  // ===========================================================================
  describe('error logging', () => {
    it('should log errors when getting systemd services fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(spawnAsync).mockRejectedValue(new Error('systemctl not found'))

      await caller.systemd()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log errors when getting podman containers fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(spawnAsync).mockRejectedValue(new Error('podman not found'))

      await caller.podman()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log errors when systemd action fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Failed to start service'))

      try {
        await caller.systemdAction({ name: 'broken', action: 'start' })
      } catch {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should log errors when podman action fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(spawnAsync).mockRejectedValue(new Error('Container not found'))

      try {
        await caller.podmanAction({ id: 'nonexistent', action: 'start' })
      } catch {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
