/**
 * MCP Proxy Controller - MCP Proxy/Federation Management
 *
 * Type-safe tRPC controller for managing MCP proxy/federation services.
 * Provides unified access to multiple MCP servers.
 *
 * Migrated from handlers.ts (12 handlers):
 * - mcp:proxy:init - initialize with config
 * - mcp:proxy:servers - get all proxy servers
 * - mcp:proxy:connect - connect to specific server
 * - mcp:proxy:connectAll - connect to all servers
 * - mcp:proxy:disconnect - disconnect from server
 * - mcp:proxy:tools - get all tools
 * - mcp:proxy:resources - get all resources
 * - mcp:proxy:prompts - get all prompts
 * - mcp:proxy:callTool - call a tool with args
 * - mcp:proxy:stats - get proxy stats
 * - mcp:proxy:config - get current config
 * - mcp:proxy:updateConfig - update config
 *
 * @module proxy.controller
 */

import { z } from 'zod'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import {
  mcpProxyService,
  type FederatedServer,
  type MCPTool,
  type MCPResource,
  type MCPPrompt,
  type ProxyConfig,
  type ProxyStats,
} from '../../services/mcp-proxy'

// ============================================================================
// Schemas
// ============================================================================

const ProxyConfigSchema = z
  .object({
    loadBalancing: z.enum(['round-robin', 'least-connections', 'capability-based']).optional(),
    healthCheckInterval: z.number().min(1000).max(300000).optional(),
    connectionTimeout: z.number().min(1000).max(60000).optional(),
    retryAttempts: z.number().min(0).max(10).optional(),
    cacheToolsFor: z.number().min(0).max(600000).optional(),
  })
  .optional()

const ServerIdSchema = z.object({
  serverId: z
    .string()
    .min(1, 'Server ID cannot be empty')
    .max(100, 'Server ID cannot exceed 100 characters'),
})

const CallToolSchema = z.object({
  toolName: z
    .string()
    .min(1, 'Tool name cannot be empty')
    .max(200, 'Tool name cannot exceed 200 characters'),
  args: z.record(z.unknown()).default({}),
})

const UpdateConfigSchema = z.object({
  loadBalancing: z.enum(['round-robin', 'least-connections', 'capability-based']).optional(),
  healthCheckInterval: z.number().min(1000).max(300000).optional(),
  connectionTimeout: z.number().min(1000).max(60000).optional(),
  retryAttempts: z.number().min(0).max(10).optional(),
  cacheToolsFor: z.number().min(0).max(600000).optional(),
})

// ============================================================================
// Type Transformers
// ============================================================================

/**
 * Transform FederatedServer to a serializable format (removes process reference)
 */
function serializeServer(
  server: FederatedServer
): Omit<FederatedServer, 'process'> & { process?: undefined } {
  return {
    ...server,
    process: undefined,
  }
}

// ============================================================================
// Router
// ============================================================================

export const proxyRouter = router({
  /**
   * Initialize the proxy service with optional config
   */
  init: auditedProcedure.input(ProxyConfigSchema).mutation(({ input }): Promise<void> => {
    return mcpProxyService.initialize(input)
  }),

  /**
   * Get all federated servers
   */
  servers: publicProcedure.query((): FederatedServer[] => {
    return mcpProxyService.getServers().map(serializeServer) as FederatedServer[]
  }),

  /**
   * Connect to a specific server
   */
  connect: auditedProcedure.input(ServerIdSchema).mutation(({ input }): Promise<boolean> => {
    return mcpProxyService.connectServer(input.serverId)
  }),

  /**
   * Connect to all servers
   */
  connectAll: auditedProcedure.mutation((): Promise<void> => {
    return mcpProxyService.connectAll()
  }),

  /**
   * Disconnect from a specific server
   */
  disconnect: auditedProcedure.input(ServerIdSchema).mutation(({ input }): void => {
    const server = mcpProxyService.getServer(input.serverId)
    if (server) {
      // Use the service's internal disconnect mechanism
      mcpProxyService.unregisterServer(input.serverId)
      // Re-register without connecting
      mcpProxyService.registerServer({
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
      })
    }
  }),

  /**
   * Get all available tools from connected servers
   */
  tools: publicProcedure.query((): MCPTool[] => {
    return mcpProxyService.getAllTools()
  }),

  /**
   * Get all available resources from connected servers
   */
  resources: publicProcedure.query((): MCPResource[] => {
    return mcpProxyService.getAllResources()
  }),

  /**
   * Get all available prompts from connected servers
   */
  prompts: publicProcedure.query((): MCPPrompt[] => {
    return mcpProxyService.getAllPrompts()
  }),

  /**
   * Call a tool with arguments
   */
  callTool: auditedProcedure
    .input(CallToolSchema)
    .mutation(({ input }): Promise<{ content: unknown; isError?: boolean }> => {
      return mcpProxyService.callTool(input.toolName, input.args)
    }),

  /**
   * Get proxy statistics
   */
  stats: publicProcedure.query((): ProxyStats => {
    return mcpProxyService.getStats()
  }),

  /**
   * Get current proxy configuration
   */
  config: publicProcedure.query((): ProxyConfig => {
    return mcpProxyService.getConfig()
  }),

  /**
   * Update proxy configuration
   */
  updateConfig: auditedProcedure.input(UpdateConfigSchema).mutation(({ input }): void => {
    mcpProxyService.updateConfig(input)
  }),
})

export type ProxyRouter = typeof proxyRouter
