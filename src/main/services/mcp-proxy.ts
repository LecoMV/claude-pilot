/**
 * MCP Proxy/Federation Service
 * Federates multiple MCP servers into a unified interface
 * Feature: deploy-zebp
 *
 * Now includes MCP Sampling protocol support (deploy-toag):
 * When an MCP server sends a sampling/createMessage request,
 * it's routed to the MCPSamplingService for LLM completion.
 */

import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { mcpSamplingService } from './inference'
import type { MCPSamplingRequest } from './inference/types'
import { mcpElicitationService, type ElicitationRequest } from './mcp'

// MCP Protocol types
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string // Which server provides this tool
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{ name: string; description?: string; required?: boolean }>
  serverId: string
}

export interface FederatedServer {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastPing?: number
  tools: MCPTool[]
  resources: MCPResource[]
  prompts: MCPPrompt[]
  error?: string
  process?: ChildProcess
}

export interface ProxyConfig {
  loadBalancing: 'round-robin' | 'least-connections' | 'capability-based'
  healthCheckInterval: number // ms
  connectionTimeout: number // ms
  retryAttempts: number
  cacheToolsFor: number // ms to cache tool listings
}

export interface ProxyStats {
  totalRequests: number
  totalErrors: number
  serverStats: Record<string, {
    requests: number
    errors: number
    avgLatency: number
  }>
  uptime: number
}

const DEFAULT_CONFIG: ProxyConfig = {
  loadBalancing: 'capability-based',
  healthCheckInterval: 30000,
  connectionTimeout: 10000,
  retryAttempts: 3,
  cacheToolsFor: 60000,
}

class MCPProxyService extends EventEmitter {
  private servers: Map<string, FederatedServer> = new Map()
  private config: ProxyConfig = DEFAULT_CONFIG
  private healthCheckTimer?: NodeJS.Timeout
  private stats: ProxyStats = {
    totalRequests: 0,
    totalErrors: 0,
    serverStats: {},
    uptime: Date.now(),
  }
  private toolCache: Map<string, MCPTool[]> = new Map()
  private toolCacheTime: Map<string, number> = new Map()
  private initialized = false

  /**
   * Initialize the proxy service
   */
  async initialize(config?: Partial<ProxyConfig>): Promise<void> {
    if (this.initialized) return

    this.config = { ...DEFAULT_CONFIG, ...config }

    // Load federated servers from config
    await this.loadServersFromConfig()

    // Start health checks
    this.startHealthChecks()

    this.initialized = true
    console.info('[MCP-Proxy] Initialized with', this.servers.size, 'servers')
  }

  /**
   * Load servers from Claude's MCP config
   */
  private async loadServersFromConfig(): Promise<void> {
    const claudeDir = join(app.getPath('home'), '.claude')
    const configPaths = [
      join(claudeDir, 'mcp.json'),
      join(claudeDir, 'settings.json'),
    ]

    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8')
          const config = JSON.parse(content)
          const mcpServers = config.mcpServers || {}

          for (const [name, serverConfig] of Object.entries(mcpServers)) {
            const cfg = serverConfig as {
              command: string
              args?: string[]
              env?: Record<string, string>
              disabled?: boolean
            }

            if (cfg.disabled) continue

            this.servers.set(name, {
              id: name,
              name,
              command: cfg.command,
              args: cfg.args || [],
              env: cfg.env,
              status: 'disconnected',
              tools: [],
              resources: [],
              prompts: [],
            })
          }
        } catch (error) {
          console.error('[MCP-Proxy] Failed to load config from', configPath, error)
        }
      }
    }
  }

  /**
   * Register a new federated server
   */
  registerServer(server: Omit<FederatedServer, 'status' | 'tools' | 'resources' | 'prompts'>): void {
    this.servers.set(server.id, {
      ...server,
      status: 'disconnected',
      tools: [],
      resources: [],
      prompts: [],
    })
    this.stats.serverStats[server.id] = { requests: 0, errors: 0, avgLatency: 0 }
    console.info('[MCP-Proxy] Registered server:', server.name)
  }

  /**
   * Unregister a server
   */
  unregisterServer(serverId: string): void {
    const server = this.servers.get(serverId)
    if (server?.process) {
      server.process.kill()
    }
    this.servers.delete(serverId)
    delete this.stats.serverStats[serverId]
  }

  /**
   * Connect to a specific server
   */
  async connectServer(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId)
    if (!server) return false

    server.status = 'connecting'
    this.emit('server:connecting', serverId)

    try {
      // Spawn the MCP server process
      const process = spawn(server.command, server.args, {
        env: { ...process.env, ...server.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      server.process = process

      // Set up communication
      let buffer = ''
      process.stdout?.on('data', (data) => {
        buffer += data.toString()
        // Parse JSON-RPC messages
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line)
              this.handleServerMessage(serverId, message)
            } catch {
              // Not JSON, ignore
            }
          }
        }
      })

      process.stderr?.on('data', (data) => {
        console.error(`[MCP-Proxy] ${server.name} stderr:`, data.toString())
      })

      process.on('error', (error) => {
        server.status = 'error'
        server.error = error.message
        this.emit('server:error', serverId, error)
      })

      process.on('exit', (code) => {
        server.status = 'disconnected'
        server.process = undefined
        this.emit('server:disconnected', serverId, code)
      })

      // Initialize the connection (MCP protocol)
      await this.sendInitialize(serverId)

      // Request capabilities
      await this.refreshServerCapabilities(serverId)

      server.status = 'connected'
      server.lastPing = Date.now()
      this.emit('server:connected', serverId)

      return true
    } catch (error) {
      server.status = 'error'
      server.error = (error as Error).message
      this.emit('server:error', serverId, error)
      return false
    }
  }

  /**
   * Send initialize request to server
   * Advertises sampling and elicitation capabilities to enable MCP protocols
   */
  private async sendInitialize(serverId: string): Promise<void> {
    await this.sendRequest(serverId, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        // MCP Sampling protocol support (deploy-toag)
        sampling: {},
        // MCP Elicitation protocol support (deploy-uz39)
        elicitation: {},
      },
      clientInfo: {
        name: 'claude-pilot-proxy',
        version: app.getVersion(),
      },
    })
  }

  /**
   * Refresh a server's capabilities (tools, resources, prompts)
   */
  async refreshServerCapabilities(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server || server.status !== 'connected') return

    try {
      // Get tools
      const toolsResponse = await this.sendRequest(serverId, 'tools/list', {})
      server.tools = (toolsResponse.tools || []).map((t: MCPTool) => ({
        ...t,
        serverId,
      }))

      // Get resources
      const resourcesResponse = await this.sendRequest(serverId, 'resources/list', {})
      server.resources = (resourcesResponse.resources || []).map((r: MCPResource) => ({
        ...r,
        serverId,
      }))

      // Get prompts
      const promptsResponse = await this.sendRequest(serverId, 'prompts/list', {})
      server.prompts = (promptsResponse.prompts || []).map((p: MCPPrompt) => ({
        ...p,
        serverId,
      }))

      // Update cache
      this.toolCache.set(serverId, server.tools)
      this.toolCacheTime.set(serverId, Date.now())

      this.emit('server:capabilities', serverId, {
        tools: server.tools.length,
        resources: server.resources.length,
        prompts: server.prompts.length,
      })
    } catch (error) {
      console.error('[MCP-Proxy] Failed to refresh capabilities for', serverId, error)
    }
  }

  /**
   * Get all federated tools across all connected servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = []
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        tools.push(...server.tools)
      }
    }
    return tools
  }

  /**
   * Get all federated resources
   */
  getAllResources(): MCPResource[] {
    const resources: MCPResource[] = []
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        resources.push(...server.resources)
      }
    }
    return resources
  }

  /**
   * Get all federated prompts
   */
  getAllPrompts(): MCPPrompt[] {
    const prompts: MCPPrompt[] = []
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        prompts.push(...server.prompts)
      }
    }
    return prompts
  }

  /**
   * Call a tool on the appropriate server
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: unknown; isError?: boolean }> {
    this.stats.totalRequests++

    // Find which server has this tool
    let targetServer: FederatedServer | undefined
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        const tool = server.tools.find((t) => t.name === toolName)
        if (tool) {
          targetServer = server
          break
        }
      }
    }

    if (!targetServer) {
      this.stats.totalErrors++
      return { content: `Tool '${toolName}' not found in any connected server`, isError: true }
    }

    const serverStats = this.stats.serverStats[targetServer.id]
    serverStats.requests++

    const startTime = Date.now()

    try {
      const response = await this.sendRequest(targetServer.id, 'tools/call', {
        name: toolName,
        arguments: args,
      })

      const latency = Date.now() - startTime
      serverStats.avgLatency = (serverStats.avgLatency + latency) / 2

      return { content: response.content }
    } catch (error) {
      serverStats.errors++
      this.stats.totalErrors++
      return { content: (error as Error).message, isError: true }
    }
  }

  /**
   * Read a resource from the appropriate server
   */
  async readResource(uri: string): Promise<{ contents: unknown }> {
    // Find which server has this resource
    for (const server of this.servers.values()) {
      if (server.status === 'connected') {
        const resource = server.resources.find((r) => r.uri === uri)
        if (resource) {
          return this.sendRequest(server.id, 'resources/read', { uri })
        }
      }
    }
    throw new Error(`Resource '${uri}' not found in any connected server`)
  }

  /**
   * Send JSON-RPC request to a server
   */
  private sendRequest(
    serverId: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const server = this.servers.get(serverId)
      if (!server?.process?.stdin) {
        reject(new Error(`Server ${serverId} not connected`))
        return
      }

      const id = Date.now().toString()
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      // Set up response handler
      const timeout = setTimeout(() => {
        reject(new Error(`Request to ${serverId} timed out`))
      }, this.config.connectionTimeout)

      const responseHandler = (responseServerId: string, message: Record<string, unknown>) => {
        if (responseServerId === serverId && message.id === id) {
          clearTimeout(timeout)
          this.removeListener('server:message', responseHandler)
          if (message.error) {
            reject(new Error((message.error as Record<string, string>).message))
          } else {
            resolve(message.result as Record<string, unknown>)
          }
        }
      }

      this.on('server:message', responseHandler)

      // Send the request
      server.process.stdin.write(JSON.stringify(request) + '\n')
    })
  }

  /**
   * Handle incoming message from a server
   */
  private handleServerMessage(serverId: string, message: Record<string, unknown>): void {
    // Check if this is a sampling request (MCP Sampling protocol)
    if (message.method === 'sampling/createMessage') {
      this.handleSamplingRequest(serverId, message)
      return
    }

    // Check if this is an elicitation request (MCP Elicitation protocol)
    if (message.method === 'elicitation/create') {
      this.handleElicitationRequest(serverId, message)
      return
    }

    this.emit('server:message', serverId, message)
  }

  /**
   * Handle MCP Sampling protocol request from a server
   * Routes to the MCPSamplingService for LLM completion
   */
  private async handleSamplingRequest(
    serverId: string,
    message: Record<string, unknown>
  ): Promise<void> {
    const requestId = message.id as string | number
    const params = message.params as MCPSamplingRequest | undefined

    if (!params) {
      this.sendSamplingError(serverId, requestId, 'Invalid sampling request: missing params')
      return
    }

    try {
      // Initialize sampling service if not already done
      await mcpSamplingService.initialize()

      // Handle the sampling request
      const result = await mcpSamplingService.handleSamplingRequest(serverId, params)

      if (result.error) {
        this.sendSamplingError(serverId, requestId, result.error)
        return
      }

      if (result.response) {
        this.sendSamplingResponse(serverId, requestId, result.response)
      }
    } catch (error) {
      this.sendSamplingError(serverId, requestId, (error as Error).message)
    }
  }

  /**
   * Send sampling response back to the MCP server
   */
  private sendSamplingResponse(
    serverId: string,
    requestId: string | number,
    response: Record<string, unknown>
  ): void {
    const server = this.servers.get(serverId)
    if (!server?.process?.stdin) {
      console.error('[MCP-Proxy] Cannot send sampling response: server not connected')
      return
    }

    const responseMsg = {
      jsonrpc: '2.0',
      id: requestId,
      result: response,
    }

    server.process.stdin.write(JSON.stringify(responseMsg) + '\n')
    this.emit('sampling:response', { serverId, requestId })
  }

  /**
   * Send sampling error back to the MCP server
   */
  private sendSamplingError(
    serverId: string,
    requestId: string | number,
    errorMessage: string
  ): void {
    const server = this.servers.get(serverId)
    if (!server?.process?.stdin) {
      console.error('[MCP-Proxy] Cannot send sampling error: server not connected')
      return
    }

    const errorResponse = {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32000,
        message: errorMessage,
      },
    }

    server.process.stdin.write(JSON.stringify(errorResponse) + '\n')
    this.emit('sampling:error', { serverId, requestId, error: errorMessage })
  }

  /**
   * Handle MCP Elicitation protocol request from a server
   * Routes to the MCPElicitationService for user interaction
   */
  private async handleElicitationRequest(
    serverId: string,
    message: Record<string, unknown>
  ): Promise<void> {
    const requestId = message.id as string | number
    const params = message.params as ElicitationRequest | undefined

    if (!params) {
      this.sendElicitationError(serverId, requestId, 'Invalid elicitation request: missing params')
      return
    }

    try {
      // Initialize elicitation service if not already done
      await mcpElicitationService.initialize()

      // Handle the elicitation request
      const result = await mcpElicitationService.handleElicitationRequest(serverId, params)

      if (result.status === 'error') {
        this.sendElicitationError(serverId, requestId, result.error || 'Unknown error')
        return
      }

      // Send success response
      this.sendElicitationResponse(serverId, requestId, {
        status: result.status,
        data: result.data,
        token: result.token,
      })
    } catch (error) {
      this.sendElicitationError(serverId, requestId, (error as Error).message)
    }
  }

  /**
   * Send elicitation response back to the MCP server
   */
  private sendElicitationResponse(
    serverId: string,
    requestId: string | number,
    response: Record<string, unknown>
  ): void {
    const server = this.servers.get(serverId)
    if (!server?.process?.stdin) {
      console.error('[MCP-Proxy] Cannot send elicitation response: server not connected')
      return
    }

    const responseMsg = {
      jsonrpc: '2.0',
      id: requestId,
      result: response,
    }

    server.process.stdin.write(JSON.stringify(responseMsg) + '\n')
    this.emit('elicitation:response', { serverId, requestId })
  }

  /**
   * Send elicitation error back to the MCP server
   */
  private sendElicitationError(
    serverId: string,
    requestId: string | number,
    errorMessage: string
  ): void {
    const server = this.servers.get(serverId)
    if (!server?.process?.stdin) {
      console.error('[MCP-Proxy] Cannot send elicitation error: server not connected')
      return
    }

    const errorResponse = {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32000,
        message: errorMessage,
      },
    }

    server.process.stdin.write(JSON.stringify(errorResponse) + '\n')
    this.emit('elicitation:error', { serverId, requestId, error: errorMessage })
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks()
    }, this.config.healthCheckInterval)
  }

  /**
   * Perform health checks on all servers
   */
  private async performHealthChecks(): Promise<void> {
    for (const [serverId, server] of this.servers) {
      if (server.status === 'connected') {
        try {
          await this.sendRequest(serverId, 'ping', {})
          server.lastPing = Date.now()
        } catch {
          server.status = 'error'
          server.error = 'Health check failed'
          this.emit('server:unhealthy', serverId)
        }
      }
    }
  }

  /**
   * Get all server statuses
   */
  getServers(): FederatedServer[] {
    return Array.from(this.servers.values()).map((s) => ({
      ...s,
      process: undefined, // Don't expose process object
    }))
  }

  /**
   * Get a specific server
   */
  getServer(serverId: string): FederatedServer | undefined {
    const server = this.servers.get(serverId)
    if (server) {
      return { ...server, process: undefined }
    }
    return undefined
  }

  /**
   * Get proxy statistics
   */
  getStats(): ProxyStats {
    return { ...this.stats }
  }

  /**
   * Get configuration
   */
  getConfig(): ProxyConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProxyConfig>): void {
    this.config = { ...this.config, ...config }

    // Restart health checks with new interval
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.startHealthChecks()
    }
  }

  /**
   * Connect all servers
   */
  async connectAll(): Promise<void> {
    const connectPromises = Array.from(this.servers.keys()).map((id) =>
      this.connectServer(id).catch((e) => console.error('[MCP-Proxy] Failed to connect', id, e))
    )
    await Promise.all(connectPromises)
  }

  /**
   * Disconnect all servers
   */
  disconnectAll(): void {
    for (const [serverId, server] of this.servers) {
      if (server.process) {
        server.process.kill()
        server.process = undefined
      }
      server.status = 'disconnected'
      this.emit('server:disconnected', serverId)
    }
  }

  /**
   * Shutdown the proxy service
   */
  shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }
    this.disconnectAll()
    this.initialized = false
    console.info('[MCP-Proxy] Shutdown complete')
  }
}

// Export singleton
export const mcpProxyService = new MCPProxyService()

// Export class for testing
export { MCPProxyService }
