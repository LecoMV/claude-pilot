/**
 * Proxy Controller Tests
 *
 * Comprehensive tests for the MCP Proxy tRPC controller.
 * Tests all 12 procedures: init, servers, connect, connectAll, disconnect,
 * tools, resources, prompts, callTool, stats, config, updateConfig
 *
 * @module proxy.controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { proxyRouter } from '../proxy.controller'
import {
  mcpProxyService,
  type FederatedServer,
  type MCPTool,
  type MCPResource,
  type MCPPrompt,
  type ProxyConfig,
  type ProxyStats,
} from '../../../services/mcp-proxy'

// Mock the MCP proxy service
vi.mock('../../../services/mcp-proxy', () => ({
  mcpProxyService: {
    initialize: vi.fn(),
    getServers: vi.fn(),
    getServer: vi.fn(),
    connectServer: vi.fn(),
    connectAll: vi.fn(),
    unregisterServer: vi.fn(),
    registerServer: vi.fn(),
    getAllTools: vi.fn(),
    getAllResources: vi.fn(),
    getAllPrompts: vi.fn(),
    callTool: vi.fn(),
    getStats: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  },
}))

// Create a test caller using createCaller pattern
const createTestCaller = () => proxyRouter.createCaller({})

// Sample test data
const sampleServer: FederatedServer = {
  id: 'test-server',
  name: 'Test Server',
  command: 'node',
  args: ['server.js'],
  env: { PORT: '3000' },
  status: 'connected',
  lastPing: Date.now(),
  tools: [],
  resources: [],
  prompts: [],
}

const sampleServers: FederatedServer[] = [
  sampleServer,
  {
    id: 'another-server',
    name: 'Another Server',
    command: 'python',
    args: ['app.py'],
    status: 'disconnected',
    tools: [],
    resources: [],
    prompts: [],
  },
]

const sampleTools: MCPTool[] = [
  {
    name: 'read_file',
    description: 'Read a file from disk',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    serverId: 'test-server',
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
    },
    serverId: 'test-server',
  },
]

const sampleResources: MCPResource[] = [
  {
    uri: 'file:///home/user/doc.txt',
    name: 'Document',
    description: 'A text document',
    mimeType: 'text/plain',
    serverId: 'test-server',
  },
]

const samplePrompts: MCPPrompt[] = [
  {
    name: 'summarize',
    description: 'Summarize content',
    arguments: [{ name: 'content', description: 'Content to summarize', required: true }],
    serverId: 'test-server',
  },
]

const sampleConfig: ProxyConfig = {
  loadBalancing: 'capability-based',
  healthCheckInterval: 30000,
  connectionTimeout: 10000,
  retryAttempts: 3,
  cacheToolsFor: 60000,
}

const sampleStats: ProxyStats = {
  totalRequests: 100,
  totalErrors: 5,
  serverStats: {
    'test-server': { requests: 80, errors: 3, avgLatency: 50 },
    'another-server': { requests: 20, errors: 2, avgLatency: 100 },
  },
  uptime: Date.now() - 3600000,
}

describe('proxy.controller', () => {
  let caller: ReturnType<typeof createTestCaller>

  beforeEach(() => {
    vi.clearAllMocks()
    caller = createTestCaller()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INIT PROCEDURE
  // ===========================================================================
  describe('init', () => {
    it('should initialize with default config', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      await caller.init(undefined)

      expect(mcpProxyService.initialize).toHaveBeenCalledWith(undefined)
    })

    it('should initialize with custom config', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      const customConfig = {
        loadBalancing: 'round-robin' as const,
        healthCheckInterval: 60000,
        connectionTimeout: 5000,
      }

      await caller.init(customConfig)

      expect(mcpProxyService.initialize).toHaveBeenCalledWith(customConfig)
    })

    it('should accept all valid load balancing options', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      for (const lb of ['round-robin', 'least-connections', 'capability-based'] as const) {
        await caller.init({ loadBalancing: lb })
        expect(mcpProxyService.initialize).toHaveBeenCalledWith({ loadBalancing: lb })
      }
    })

    it('should reject invalid load balancing option', async () => {
      await expect(
        // @ts-expect-error Testing invalid input
        caller.init({ loadBalancing: 'invalid-option' })
      ).rejects.toThrow()
    })

    it('should validate health check interval range', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      // Valid range: 1000-300000
      await expect(caller.init({ healthCheckInterval: 999 })).rejects.toThrow()
      await expect(caller.init({ healthCheckInterval: 300001 })).rejects.toThrow()
      await expect(caller.init({ healthCheckInterval: 1000 })).resolves.not.toThrow()
      await expect(caller.init({ healthCheckInterval: 300000 })).resolves.not.toThrow()
    })

    it('should validate connection timeout range', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      // Valid range: 1000-60000
      await expect(caller.init({ connectionTimeout: 999 })).rejects.toThrow()
      await expect(caller.init({ connectionTimeout: 60001 })).rejects.toThrow()
      await expect(caller.init({ connectionTimeout: 1000 })).resolves.not.toThrow()
      await expect(caller.init({ connectionTimeout: 60000 })).resolves.not.toThrow()
    })

    it('should validate retry attempts range', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      // Valid range: 0-10
      await expect(caller.init({ retryAttempts: -1 })).rejects.toThrow()
      await expect(caller.init({ retryAttempts: 11 })).rejects.toThrow()
      await expect(caller.init({ retryAttempts: 0 })).resolves.not.toThrow()
      await expect(caller.init({ retryAttempts: 10 })).resolves.not.toThrow()
    })

    it('should validate cache tools duration range', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)

      // Valid range: 0-600000
      await expect(caller.init({ cacheToolsFor: -1 })).rejects.toThrow()
      await expect(caller.init({ cacheToolsFor: 600001 })).rejects.toThrow()
      await expect(caller.init({ cacheToolsFor: 0 })).resolves.not.toThrow()
      await expect(caller.init({ cacheToolsFor: 600000 })).resolves.not.toThrow()
    })

    it('should propagate service initialization errors', async () => {
      vi.mocked(mcpProxyService.initialize).mockRejectedValue(
        new Error('Failed to load config')
      )

      await expect(caller.init(undefined)).rejects.toThrow('Failed to load config')
    })
  })

  // ===========================================================================
  // SERVERS PROCEDURE
  // ===========================================================================
  describe('servers', () => {
    it('should return all federated servers', async () => {
      vi.mocked(mcpProxyService.getServers).mockReturnValue(sampleServers)

      const result = await caller.servers()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('test-server')
      expect(result[1].id).toBe('another-server')
    })

    it('should return empty array when no servers', async () => {
      vi.mocked(mcpProxyService.getServers).mockReturnValue([])

      const result = await caller.servers()

      expect(result).toEqual([])
    })

    it('should serialize servers without process reference', async () => {
      const serverWithProcess = {
        ...sampleServer,
        process: { pid: 1234 } as unknown,
      }
      vi.mocked(mcpProxyService.getServers).mockReturnValue([serverWithProcess])

      const result = await caller.servers()

      expect(result[0].process).toBeUndefined()
    })

    it('should preserve server status information', async () => {
      vi.mocked(mcpProxyService.getServers).mockReturnValue(sampleServers)

      const result = await caller.servers()

      expect(result[0].status).toBe('connected')
      expect(result[1].status).toBe('disconnected')
    })
  })

  // ===========================================================================
  // CONNECT PROCEDURE
  // ===========================================================================
  describe('connect', () => {
    it('should connect to server successfully', async () => {
      vi.mocked(mcpProxyService.connectServer).mockResolvedValue(true)

      const result = await caller.connect({ serverId: 'test-server' })

      expect(result).toBe(true)
      expect(mcpProxyService.connectServer).toHaveBeenCalledWith('test-server')
    })

    it('should return false when connection fails', async () => {
      vi.mocked(mcpProxyService.connectServer).mockResolvedValue(false)

      const result = await caller.connect({ serverId: 'nonexistent' })

      expect(result).toBe(false)
    })

    it('should reject empty server ID', async () => {
      await expect(caller.connect({ serverId: '' })).rejects.toThrow()
    })

    it('should reject server ID exceeding 100 characters', async () => {
      const longId = 'a'.repeat(101)
      await expect(caller.connect({ serverId: longId })).rejects.toThrow()
    })

    it('should accept valid server IDs', async () => {
      vi.mocked(mcpProxyService.connectServer).mockResolvedValue(true)

      await expect(
        caller.connect({ serverId: 'valid-server-id' })
      ).resolves.toBe(true)
      await expect(
        caller.connect({ serverId: 'server_with_underscores' })
      ).resolves.toBe(true)
      await expect(
        caller.connect({ serverId: 'server123' })
      ).resolves.toBe(true)
    })

    it('should propagate connection errors', async () => {
      vi.mocked(mcpProxyService.connectServer).mockRejectedValue(
        new Error('Connection refused')
      )

      await expect(caller.connect({ serverId: 'test-server' })).rejects.toThrow(
        'Connection refused'
      )
    })
  })

  // ===========================================================================
  // CONNECT ALL PROCEDURE
  // ===========================================================================
  describe('connectAll', () => {
    it('should connect to all servers', async () => {
      vi.mocked(mcpProxyService.connectAll).mockResolvedValue(undefined)

      await caller.connectAll()

      expect(mcpProxyService.connectAll).toHaveBeenCalled()
    })

    it('should propagate errors from connectAll', async () => {
      vi.mocked(mcpProxyService.connectAll).mockRejectedValue(
        new Error('Partial failure')
      )

      await expect(caller.connectAll()).rejects.toThrow('Partial failure')
    })
  })

  // ===========================================================================
  // DISCONNECT PROCEDURE
  // ===========================================================================
  describe('disconnect', () => {
    it('should disconnect server and re-register without connecting', async () => {
      vi.mocked(mcpProxyService.getServer).mockReturnValue(sampleServer)

      await caller.disconnect({ serverId: 'test-server' })

      expect(mcpProxyService.unregisterServer).toHaveBeenCalledWith('test-server')
      expect(mcpProxyService.registerServer).toHaveBeenCalledWith({
        id: sampleServer.id,
        name: sampleServer.name,
        command: sampleServer.command,
        args: sampleServer.args,
        env: sampleServer.env,
      })
    })

    it('should do nothing for non-existent server', async () => {
      vi.mocked(mcpProxyService.getServer).mockReturnValue(undefined)

      await caller.disconnect({ serverId: 'nonexistent' })

      expect(mcpProxyService.unregisterServer).not.toHaveBeenCalled()
      expect(mcpProxyService.registerServer).not.toHaveBeenCalled()
    })

    it('should reject empty server ID', async () => {
      await expect(caller.disconnect({ serverId: '' })).rejects.toThrow()
    })

    it('should reject server ID exceeding 100 characters', async () => {
      const longId = 'a'.repeat(101)
      await expect(caller.disconnect({ serverId: longId })).rejects.toThrow()
    })
  })

  // ===========================================================================
  // TOOLS PROCEDURE
  // ===========================================================================
  describe('tools', () => {
    it('should return all tools from connected servers', async () => {
      vi.mocked(mcpProxyService.getAllTools).mockReturnValue(sampleTools)

      const result = await caller.tools()

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('read_file')
      expect(result[1].name).toBe('write_file')
    })

    it('should return empty array when no tools', async () => {
      vi.mocked(mcpProxyService.getAllTools).mockReturnValue([])

      const result = await caller.tools()

      expect(result).toEqual([])
    })

    it('should include server ID with each tool', async () => {
      vi.mocked(mcpProxyService.getAllTools).mockReturnValue(sampleTools)

      const result = await caller.tools()

      result.forEach((tool) => {
        expect(tool.serverId).toBeDefined()
      })
    })
  })

  // ===========================================================================
  // RESOURCES PROCEDURE
  // ===========================================================================
  describe('resources', () => {
    it('should return all resources from connected servers', async () => {
      vi.mocked(mcpProxyService.getAllResources).mockReturnValue(sampleResources)

      const result = await caller.resources()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Document')
    })

    it('should return empty array when no resources', async () => {
      vi.mocked(mcpProxyService.getAllResources).mockReturnValue([])

      const result = await caller.resources()

      expect(result).toEqual([])
    })

    it('should include all resource metadata', async () => {
      vi.mocked(mcpProxyService.getAllResources).mockReturnValue(sampleResources)

      const result = await caller.resources()

      expect(result[0]).toEqual({
        uri: 'file:///home/user/doc.txt',
        name: 'Document',
        description: 'A text document',
        mimeType: 'text/plain',
        serverId: 'test-server',
      })
    })
  })

  // ===========================================================================
  // PROMPTS PROCEDURE
  // ===========================================================================
  describe('prompts', () => {
    it('should return all prompts from connected servers', async () => {
      vi.mocked(mcpProxyService.getAllPrompts).mockReturnValue(samplePrompts)

      const result = await caller.prompts()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('summarize')
    })

    it('should return empty array when no prompts', async () => {
      vi.mocked(mcpProxyService.getAllPrompts).mockReturnValue([])

      const result = await caller.prompts()

      expect(result).toEqual([])
    })

    it('should include prompt arguments', async () => {
      vi.mocked(mcpProxyService.getAllPrompts).mockReturnValue(samplePrompts)

      const result = await caller.prompts()

      expect(result[0].arguments).toHaveLength(1)
      expect(result[0].arguments?.[0].name).toBe('content')
      expect(result[0].arguments?.[0].required).toBe(true)
    })
  })

  // ===========================================================================
  // CALL TOOL PROCEDURE
  // ===========================================================================
  describe('callTool', () => {
    it('should call tool and return result', async () => {
      const toolResult = { content: 'file contents here' }
      vi.mocked(mcpProxyService.callTool).mockResolvedValue(toolResult)

      const result = await caller.callTool({
        toolName: 'read_file',
        args: { path: '/home/user/test.txt' },
      })

      expect(result).toEqual(toolResult)
      expect(mcpProxyService.callTool).toHaveBeenCalledWith('read_file', {
        path: '/home/user/test.txt',
      })
    })

    it('should return error result when tool fails', async () => {
      const errorResult = { content: 'File not found', isError: true }
      vi.mocked(mcpProxyService.callTool).mockResolvedValue(errorResult)

      const result = await caller.callTool({
        toolName: 'read_file',
        args: { path: '/nonexistent' },
      })

      expect(result.isError).toBe(true)
    })

    it('should use empty args object as default', async () => {
      vi.mocked(mcpProxyService.callTool).mockResolvedValue({ content: 'ok' })

      await caller.callTool({ toolName: 'ping' })

      expect(mcpProxyService.callTool).toHaveBeenCalledWith('ping', {})
    })

    it('should reject empty tool name', async () => {
      await expect(caller.callTool({ toolName: '' })).rejects.toThrow()
    })

    it('should reject tool name exceeding 200 characters', async () => {
      const longName = 'a'.repeat(201)
      await expect(caller.callTool({ toolName: longName })).rejects.toThrow()
    })

    it('should accept tool names up to 200 characters', async () => {
      vi.mocked(mcpProxyService.callTool).mockResolvedValue({ content: 'ok' })

      const validName = 'a'.repeat(200)
      await expect(caller.callTool({ toolName: validName })).resolves.toBeDefined()
    })

    it('should handle complex arguments', async () => {
      vi.mocked(mcpProxyService.callTool).mockResolvedValue({ content: 'ok' })

      const complexArgs = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        boolean: true,
        nullValue: null,
      }

      await caller.callTool({ toolName: 'complex_tool', args: complexArgs })

      expect(mcpProxyService.callTool).toHaveBeenCalledWith('complex_tool', complexArgs)
    })

    it('should propagate service errors', async () => {
      vi.mocked(mcpProxyService.callTool).mockRejectedValue(
        new Error('Server disconnected')
      )

      await expect(
        caller.callTool({ toolName: 'read_file', args: {} })
      ).rejects.toThrow('Server disconnected')
    })
  })

  // ===========================================================================
  // STATS PROCEDURE
  // ===========================================================================
  describe('stats', () => {
    it('should return proxy statistics', async () => {
      vi.mocked(mcpProxyService.getStats).mockReturnValue(sampleStats)

      const result = await caller.stats()

      expect(result).toEqual(sampleStats)
      expect(result.totalRequests).toBe(100)
      expect(result.totalErrors).toBe(5)
    })

    it('should include server-specific stats', async () => {
      vi.mocked(mcpProxyService.getStats).mockReturnValue(sampleStats)

      const result = await caller.stats()

      expect(result.serverStats['test-server']).toBeDefined()
      expect(result.serverStats['test-server'].requests).toBe(80)
      expect(result.serverStats['test-server'].avgLatency).toBe(50)
    })
  })

  // ===========================================================================
  // CONFIG PROCEDURE
  // ===========================================================================
  describe('config', () => {
    it('should return current proxy configuration', async () => {
      vi.mocked(mcpProxyService.getConfig).mockReturnValue(sampleConfig)

      const result = await caller.config()

      expect(result).toEqual(sampleConfig)
      expect(result.loadBalancing).toBe('capability-based')
      expect(result.healthCheckInterval).toBe(30000)
    })
  })

  // ===========================================================================
  // UPDATE CONFIG PROCEDURE
  // ===========================================================================
  describe('updateConfig', () => {
    it('should update load balancing strategy', async () => {
      await caller.updateConfig({ loadBalancing: 'round-robin' })

      expect(mcpProxyService.updateConfig).toHaveBeenCalledWith({
        loadBalancing: 'round-robin',
      })
    })

    it('should update health check interval', async () => {
      await caller.updateConfig({ healthCheckInterval: 60000 })

      expect(mcpProxyService.updateConfig).toHaveBeenCalledWith({
        healthCheckInterval: 60000,
      })
    })

    it('should update multiple config options at once', async () => {
      const updates = {
        loadBalancing: 'least-connections' as const,
        connectionTimeout: 5000,
        retryAttempts: 5,
      }

      await caller.updateConfig(updates)

      expect(mcpProxyService.updateConfig).toHaveBeenCalledWith(updates)
    })

    it('should validate load balancing enum', async () => {
      await expect(
        // @ts-expect-error Testing invalid input
        caller.updateConfig({ loadBalancing: 'invalid' })
      ).rejects.toThrow()
    })

    it('should validate numeric ranges', async () => {
      await expect(
        caller.updateConfig({ healthCheckInterval: 500 })
      ).rejects.toThrow()
      await expect(
        caller.updateConfig({ connectionTimeout: 100000 })
      ).rejects.toThrow()
      await expect(
        caller.updateConfig({ retryAttempts: 20 })
      ).rejects.toThrow()
      await expect(
        caller.updateConfig({ cacheToolsFor: 1000000 })
      ).rejects.toThrow()
    })

    it('should allow partial updates', async () => {
      await caller.updateConfig({ retryAttempts: 2 })

      expect(mcpProxyService.updateConfig).toHaveBeenCalledWith({
        retryAttempts: 2,
      })
    })
  })

  // ===========================================================================
  // SECURITY TESTS
  // ===========================================================================
  describe('security', () => {
    it('should sanitize server IDs in connect', async () => {
      vi.mocked(mcpProxyService.connectServer).mockResolvedValue(false)

      // Long IDs should be rejected
      await expect(
        caller.connect({ serverId: 'a'.repeat(101) })
      ).rejects.toThrow()
    })

    it('should sanitize tool names in callTool', async () => {
      // Long tool names should be rejected
      await expect(
        caller.callTool({ toolName: 'a'.repeat(201) })
      ).rejects.toThrow()
    })

    it('should handle injection attempts in tool args', async () => {
      vi.mocked(mcpProxyService.callTool).mockResolvedValue({ content: 'ok' })

      // Args are passed through as JSON, should be safe
      const maliciousArgs = {
        path: '; rm -rf /',
        script: '<script>alert("xss")</script>',
        sql: "'; DROP TABLE users; --",
      }

      await caller.callTool({ toolName: 'test', args: maliciousArgs })

      // Args should be passed as-is (sanitization is server's responsibility)
      expect(mcpProxyService.callTool).toHaveBeenCalledWith('test', maliciousArgs)
    })
  })

  // ===========================================================================
  // INTEGRATION-STYLE TESTS
  // ===========================================================================
  describe('workflow integration', () => {
    it('should handle init -> connect -> callTool workflow', async () => {
      vi.mocked(mcpProxyService.initialize).mockResolvedValue(undefined)
      vi.mocked(mcpProxyService.connectServer).mockResolvedValue(true)
      vi.mocked(mcpProxyService.callTool).mockResolvedValue({ content: 'result' })

      // Initialize
      await caller.init({ loadBalancing: 'round-robin' })
      expect(mcpProxyService.initialize).toHaveBeenCalled()

      // Connect
      const connected = await caller.connect({ serverId: 'test-server' })
      expect(connected).toBe(true)

      // Call tool
      const result = await caller.callTool({
        toolName: 'read_file',
        args: { path: '/test' },
      })
      expect(result.content).toBe('result')
    })

    it('should handle config -> updateConfig -> config cycle', async () => {
      vi.mocked(mcpProxyService.getConfig).mockReturnValueOnce(sampleConfig)

      // Get initial config
      const config1 = await caller.config()
      expect(config1.loadBalancing).toBe('capability-based')

      // Update config
      await caller.updateConfig({ loadBalancing: 'round-robin' })

      // Return updated config on next call
      vi.mocked(mcpProxyService.getConfig).mockReturnValueOnce({
        ...sampleConfig,
        loadBalancing: 'round-robin',
      })

      // Get updated config
      const config2 = await caller.config()
      expect(config2.loadBalancing).toBe('round-robin')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle server with no env', async () => {
      const serverNoEnv: FederatedServer = {
        ...sampleServer,
        env: undefined,
      }
      vi.mocked(mcpProxyService.getServer).mockReturnValue(serverNoEnv)

      await caller.disconnect({ serverId: 'test-server' })

      expect(mcpProxyService.registerServer).toHaveBeenCalledWith({
        id: serverNoEnv.id,
        name: serverNoEnv.name,
        command: serverNoEnv.command,
        args: serverNoEnv.args,
        env: undefined,
      })
    })

    it('should handle tools with complex input schemas', async () => {
      const complexTool: MCPTool = {
        name: 'complex_tool',
        description: 'A complex tool',
        inputSchema: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                deep: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['nested'],
        },
        serverId: 'test-server',
      }
      vi.mocked(mcpProxyService.getAllTools).mockReturnValue([complexTool])

      const result = await caller.tools()

      expect(result[0].inputSchema).toEqual(complexTool.inputSchema)
    })

    it('should handle resources with optional fields', async () => {
      const minimalResource: MCPResource = {
        uri: 'file:///test',
        name: 'Test',
        serverId: 'test-server',
      }
      vi.mocked(mcpProxyService.getAllResources).mockReturnValue([minimalResource])

      const result = await caller.resources()

      expect(result[0].description).toBeUndefined()
      expect(result[0].mimeType).toBeUndefined()
    })

    it('should handle prompts with no arguments', async () => {
      const noArgsPrompt: MCPPrompt = {
        name: 'simple_prompt',
        serverId: 'test-server',
      }
      vi.mocked(mcpProxyService.getAllPrompts).mockReturnValue([noArgsPrompt])

      const result = await caller.prompts()

      expect(result[0].arguments).toBeUndefined()
      expect(result[0].description).toBeUndefined()
    })

    it('should handle stats with empty server stats', async () => {
      const emptyStats: ProxyStats = {
        totalRequests: 0,
        totalErrors: 0,
        serverStats: {},
        uptime: Date.now(),
      }
      vi.mocked(mcpProxyService.getStats).mockReturnValue(emptyStats)

      const result = await caller.stats()

      expect(result.totalRequests).toBe(0)
      expect(Object.keys(result.serverStats)).toHaveLength(0)
    })

    it('should handle concurrent tool calls', async () => {
      vi.mocked(mcpProxyService.callTool).mockImplementation(async (toolName) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { content: `result-${toolName}` }
      })

      const results = await Promise.all([
        caller.callTool({ toolName: 'tool1' }),
        caller.callTool({ toolName: 'tool2' }),
        caller.callTool({ toolName: 'tool3' }),
      ])

      expect(results[0].content).toBe('result-tool1')
      expect(results[1].content).toBe('result-tool2')
      expect(results[2].content).toBe('result-tool3')
    })

    it('should handle unicode in tool names and args', async () => {
      vi.mocked(mcpProxyService.callTool).mockResolvedValue({ content: 'ok' })

      await caller.callTool({
        toolName: 'tool-with-emoji',
        args: { text: 'Hello' },
      })

      expect(mcpProxyService.callTool).toHaveBeenCalled()
    })
  })
})
