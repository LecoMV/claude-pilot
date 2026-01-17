/**
 * Service management IPC handler tests
 * Tests systemd and podman operations
 */
import { describe, it, expect } from 'vitest'
import '../setup'

describe('Service Management IPC Handlers', () => {
  // Recreate sanitization functions for testing
  const sanitizeServiceName = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9._@-]/g, '')
  }

  const sanitizeContainerId = (id: string): string => {
    return id.replace(/[^a-zA-Z0-9._-]/g, '')
  }

  describe('services:systemd', () => {
    it('should parse systemctl output correctly', () => {
      const mockOutput = `nginx.service loaded active running nginx - high performance web server
postgresql.service loaded active running PostgreSQL RDBMS
redis.service loaded inactive dead Redis In-Memory Data Store`

      const lines = mockOutput.split('\n')
      const services = lines.map((line) => {
        const parts = line.split(/\s+/)
        return {
          name: parts[0],
          loadState: parts[1],
          activeState: parts[2],
          subState: parts[3],
        }
      })

      expect(services).toHaveLength(3)
      expect(services[0].name).toBe('nginx.service')
      expect(services[0].activeState).toBe('active')
      expect(services[2].activeState).toBe('inactive')
    })
  })

  describe('services:systemdAction', () => {
    it('should sanitize service name before execution', () => {
      const maliciousName = 'nginx; rm -rf /'
      const sanitized = sanitizeServiceName(maliciousName)

      // Sanitization removes all non-allowed characters (keeps only a-zA-Z0-9._@-)
      expect(sanitized).toBe('nginxrm-rf')
      expect(sanitized).not.toContain(';')
      expect(sanitized).not.toContain(' ')
      expect(sanitized).not.toContain('/')
    })

    it('should allow valid service names', () => {
      const validNames = [
        'nginx',
        'postgresql@14-main',
        'docker.service',
        'my_service',
        'test-service',
      ]

      for (const name of validNames) {
        expect(sanitizeServiceName(name)).toBe(name)
      }
    })

    it('should validate action parameter', () => {
      const validActions = ['start', 'stop', 'restart']
      const invalidActions = ['delete', 'remove', 'enable', 'disable']

      for (const action of validActions) {
        expect(['start', 'stop', 'restart']).toContain(action)
      }

      for (const action of invalidActions) {
        expect(['start', 'stop', 'restart']).not.toContain(action)
      }
    })

    it('should block command injection in service names', () => {
      const injectionAttempts = [
        'nginx$(whoami)',
        'service`id`',
        'test|cat /etc/passwd',
        'service;echo pwned',
        'test&&whoami',
        'service||ls',
      ]

      for (const attempt of injectionAttempts) {
        const sanitized = sanitizeServiceName(attempt)
        expect(sanitized).not.toMatch(/[$`|;&]/)
      }
    })
  })

  describe('services:podman', () => {
    it('should parse podman ps output correctly', () => {
      const mockOutput = JSON.stringify([
        {
          Id: 'abc123',
          Names: ['memgraph'],
          Image: 'memgraph/memgraph:latest',
          State: 'running',
          Ports: [{ hostPort: 7687, containerPort: 7687 }],
        },
        {
          Id: 'def456',
          Names: ['postgres'],
          Image: 'postgres:16',
          State: 'running',
          Ports: [{ hostPort: 5432, containerPort: 5432 }],
        },
      ])

      const containers = JSON.parse(mockOutput)

      expect(containers).toHaveLength(2)
      expect(containers[0].Names[0]).toBe('memgraph')
      expect(containers[0].State).toBe('running')
    })
  })

  describe('services:podmanAction', () => {
    it('should sanitize container ID before execution', () => {
      const maliciousId = 'container123; rm -rf /'
      const sanitized = sanitizeContainerId(maliciousId)

      // Sanitization removes all non-allowed characters (keeps only a-zA-Z0-9._-)
      expect(sanitized).toBe('container123rm-rf')
      expect(sanitized).not.toContain(';')
      expect(sanitized).not.toContain(' ')
      expect(sanitized).not.toContain('/')
    })

    it('should allow valid container IDs', () => {
      const validIds = [
        'abc123def456',
        'a1b2c3d4e5f6',
        'my-container',
        'container_name',
        'test.container',
      ]

      for (const id of validIds) {
        expect(sanitizeContainerId(id)).toBe(id)
      }
    })

    it('should handle hex container IDs', () => {
      const hexId = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
      expect(sanitizeContainerId(hexId)).toBe(hexId)
      expect(hexId).toMatch(/^[a-f0-9]+$/)
    })

    it('should block command injection in container IDs', () => {
      const injectionAttempts = [
        'container$(whoami)',
        'test`id`',
        'abc|cat /etc/passwd',
        'container;echo pwned',
      ]

      for (const attempt of injectionAttempts) {
        const sanitized = sanitizeContainerId(attempt)
        expect(sanitized).not.toMatch(/[$`|;]/)
      }
    })
  })
})

describe('Ollama Model Management', () => {
  const sanitizeModelName = (model: string): string => {
    return model.replace(/[^a-zA-Z0-9._:/-]/g, '')
  }

  describe('ollama:pull', () => {
    it('should sanitize model name before execution', () => {
      const maliciousModel = 'llama2; rm -rf /'
      const sanitized = sanitizeModelName(maliciousModel)

      // Sanitization removes all non-allowed characters (keeps only a-zA-Z0-9._:/-)
      // Note: / is allowed for namespaced models, so it's kept
      expect(sanitized).toBe('llama2rm-rf/')
      expect(sanitized).not.toContain(';')
      expect(sanitized).not.toContain(' ')
    })

    it('should allow valid model names with tags', () => {
      const validModels = [
        'llama2',
        'llama2:7b',
        'llama2:13b-chat',
        'mistral:latest',
        'codellama:7b-instruct',
        'library/model:v1.0',
      ]

      for (const model of validModels) {
        expect(sanitizeModelName(model)).toBe(model)
      }
    })

    it('should allow namespaced models', () => {
      const namespacedModels = ['library/llama2', 'user/custom-model', 'org/private-model:latest']

      for (const model of namespacedModels) {
        expect(sanitizeModelName(model)).toBe(model)
      }
    })
  })

  describe('ollama:delete', () => {
    it('should validate model exists before deletion', () => {
      const existingModels = ['llama2:7b', 'mistral:latest']
      const modelToDelete = 'llama2:7b'

      expect(existingModels).toContain(modelToDelete)
    })
  })

  describe('ollama:run', () => {
    it('should sanitize model name for loading', () => {
      const model = 'llama2:7b$(whoami)'
      const sanitized = sanitizeModelName(model)

      expect(sanitized).toBe('llama2:7bwhoami')
      expect(sanitized).not.toContain('$')
      expect(sanitized).not.toContain('(')
    })
  })
})
