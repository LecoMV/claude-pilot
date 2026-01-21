/**
 * MCP Elicitation Service
 *
 * Handles MCP Elicitation protocol for server-initiated user interactions.
 * Supports form-based input collection, OAuth flows, and human-in-the-loop approvals.
 *
 * Elicitation allows MCP servers to:
 * - Request structured form input (JSON Schema validated)
 * - Initiate OAuth authorization flows
 * - Collect API keys/credentials securely
 * - Request human confirmation for sensitive operations
 *
 * @module mcp/elicitation
 */

import { EventEmitter } from 'events'
import {  shell } from 'electron'
import { randomUUID } from 'crypto'
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

/**
 * Elicitation request types
 */
export type ElicitationType = 'form' | 'oauth' | 'url' | 'confirmation'

/**
 * JSON Schema for form validation
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: unknown[]
  default?: unknown
  title?: string
  description?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string // email, uri, date-time, etc.
}

/**
 * Form elicitation request from MCP server
 */
export interface FormElicitationRequest {
  type: 'form'
  schema: JSONSchema
  title?: string
  description?: string
  submitLabel?: string
  cancelLabel?: string
}

/**
 * OAuth elicitation request from MCP server
 */
export interface OAuthElicitationRequest {
  type: 'oauth'
  authorizationUrl: string
  clientId: string
  scopes?: string[]
  state?: string
  pkce?: boolean
  redirectUri?: string // Optional override
}

/**
 * URL-mode elicitation for external credential flows
 */
export interface URLElicitationRequest {
  type: 'url'
  url: string
  title?: string
  description?: string
  expectToken?: boolean // Whether to expect a token on callback
}

/**
 * Simple confirmation request
 */
export interface ConfirmationElicitationRequest {
  type: 'confirmation'
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean // Red styling for destructive actions
}

/**
 * Union of all elicitation request types
 */
export type ElicitationRequest =
  | FormElicitationRequest
  | OAuthElicitationRequest
  | URLElicitationRequest
  | ConfirmationElicitationRequest

/**
 * Elicitation response from user
 */
export interface ElicitationResponse {
  id: string
  serverId: string
  type: ElicitationType
  status: 'completed' | 'cancelled' | 'error'
  data?: Record<string, unknown>
  token?: string // OAuth access token
  error?: string
}

/**
 * Pending elicitation request
 */
export interface PendingElicitation {
  id: string
  serverId: string
  request: ElicitationRequest
  timestamp: number
  resolve: (response: ElicitationResponse) => void
}

/**
 * Elicitation service configuration
 */
export interface ElicitationConfig {
  enabled: boolean
  allowedServers: string[] | '*'
  oauthCallbackPort: number // Port for OAuth callback server
  requestTimeoutMs: number // Max time to wait for user response
  autoApproveServers: string[] // Servers that don't need confirmation
}

// Default configuration
const DEFAULT_CONFIG: ElicitationConfig = {
  enabled: true,
  allowedServers: '*',
  oauthCallbackPort: 29170, // Random high port for OAuth callback
  requestTimeoutMs: 300000, // 5 minutes
  autoApproveServers: [],
}

class MCPElicitationService extends EventEmitter {
  private config: ElicitationConfig = DEFAULT_CONFIG
  private pendingRequests: Map<string, PendingElicitation> = new Map()
  private oauthServer: Server | null = null
  private oauthCallbacks: Map<string, (token: string | null, error?: string) => void> = new Map()
  private initialized = false

  /**
   * Initialize the elicitation service
   */
  async initialize(config?: Partial<ElicitationConfig>): Promise<void> {
    if (this.initialized) return

    this.config = { ...DEFAULT_CONFIG, ...config }

    // Start OAuth callback server
    await this.startOAuthServer()

    this.initialized = true
    console.info('[MCP-Elicitation] Initialized', {
      enabled: this.config.enabled,
      oauthPort: this.config.oauthCallbackPort,
    })
  }

  /**
   * Start local OAuth callback server
   */
  private async startOAuthServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.oauthServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleOAuthCallback(req, res)
      })

      this.oauthServer.on('error', (err) => {
        console.error('[MCP-Elicitation] OAuth server error:', err)
        reject(err)
      })

      this.oauthServer.listen(this.config.oauthCallbackPort, '127.0.0.1', () => {
        console.info(
          '[MCP-Elicitation] OAuth callback server listening on port',
          this.config.oauthCallbackPort
        )
        resolve()
      })
    })
  }

  /**
   * Handle OAuth callback from browser
   */
  private handleOAuthCallback(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.config.oauthCallbackPort}`)
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Send response page
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Complete</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>${error ? 'Authorization Failed' : 'Authorization Complete'}</h1>
          <p>${error ? errorDescription || error : 'You can close this window now.'}</p>
          <script>window.close()</script>
        </body>
      </html>
    `)

    // Process the callback
    if (state && this.oauthCallbacks.has(state)) {
      const callback = this.oauthCallbacks.get(state)!
      this.oauthCallbacks.delete(state)

      if (error) {
        callback(null, errorDescription || error)
      } else if (code) {
        // In a real implementation, we'd exchange the code for a token
        // For now, we return the code and let the MCP server handle the exchange
        callback(code)
      } else {
        callback(null, 'No code or error in callback')
      }
    }
  }

  /**
   * Check if a server is allowed to make elicitation requests
   */
  private isServerAllowed(serverId: string): boolean {
    if (!this.config.enabled) return false
    if (this.config.allowedServers === '*') return true
    return this.config.allowedServers.includes(serverId)
  }

  /**
   * Handle an elicitation request from an MCP server
   */
  async handleElicitationRequest(
    serverId: string,
    request: ElicitationRequest
  ): Promise<ElicitationResponse> {
    // Check if enabled and authorized
    if (!this.isServerAllowed(serverId)) {
      return {
        id: randomUUID(),
        serverId,
        type: request.type,
        status: 'error',
        error: `Server '${serverId}' is not authorized for elicitation`,
      }
    }

    const requestId = randomUUID()

    // Route to appropriate handler
    switch (request.type) {
      case 'form':
        return this.handleFormElicitation(requestId, serverId, request)
      case 'oauth':
        return this.handleOAuthElicitation(requestId, serverId, request)
      case 'url':
        return this.handleURLElicitation(requestId, serverId, request)
      case 'confirmation':
        return this.handleConfirmationElicitation(requestId, serverId, request)
      default:
        return {
          id: requestId,
          serverId,
          type: (request as ElicitationRequest).type,
          status: 'error',
          error: 'Unknown elicitation type',
        }
    }
  }

  /**
   * Handle form-based elicitation
   * Emits event for UI to show form dialog
   */
  private handleFormElicitation(
    id: string,
    serverId: string,
    request: FormElicitationRequest
  ): Promise<ElicitationResponse> {
    return new Promise((resolve) => {
      const pending: PendingElicitation = {
        id,
        serverId,
        request,
        timestamp: Date.now(),
        resolve,
      }

      this.pendingRequests.set(id, pending)

      // Emit event for UI to handle
      this.emit('elicitation:form', {
        id,
        serverId,
        schema: request.schema,
        title: request.title,
        description: request.description,
        submitLabel: request.submitLabel,
        cancelLabel: request.cancelLabel,
      })

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          resolve({
            id,
            serverId,
            type: 'form',
            status: 'error',
            error: 'Request timed out',
          })
        }
      }, this.config.requestTimeoutMs)
    })
  }

  /**
   * Handle OAuth elicitation
   * Opens browser for authorization flow
   */
  private async handleOAuthElicitation(
    id: string,
    serverId: string,
    request: OAuthElicitationRequest
  ): Promise<ElicitationResponse> {
    const state = randomUUID()
    const redirectUri =
      request.redirectUri || `http://127.0.0.1:${this.config.oauthCallbackPort}/callback`

    // Build authorization URL
    const authUrl = new URL(request.authorizationUrl)
    authUrl.searchParams.set('client_id', request.clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('state', state)

    if (request.scopes?.length) {
      authUrl.searchParams.set('scope', request.scopes.join(' '))
    }

    // PKCE support (recommended for public clients)
    let codeVerifier: string | undefined
    if (request.pkce) {
      // Generate code verifier and challenge
      const { randomBytes, createHash } = await import('crypto')
      codeVerifier = randomBytes(32).toString('base64url')
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
    }

    return new Promise((resolve) => {
      // Register callback handler
      this.oauthCallbacks.set(state, (token, error) => {
        if (error) {
          resolve({
            id,
            serverId,
            type: 'oauth',
            status: 'error',
            error,
          })
        } else {
          resolve({
            id,
            serverId,
            type: 'oauth',
            status: 'completed',
            token: token || undefined,
            data: codeVerifier ? { codeVerifier } : undefined,
          })
        }
      })

      // Emit event for UI notification
      this.emit('elicitation:oauth', { id, serverId, url: authUrl.toString() })

      // Open system browser (RFC 8252 compliant)
      shell.openExternal(authUrl.toString()).catch((err) => {
        this.oauthCallbacks.delete(state)
        resolve({
          id,
          serverId,
          type: 'oauth',
          status: 'error',
          error: `Failed to open browser: ${err.message}`,
        })
      })

      // Set timeout
      setTimeout(() => {
        if (this.oauthCallbacks.has(state)) {
          this.oauthCallbacks.delete(state)
          resolve({
            id,
            serverId,
            type: 'oauth',
            status: 'error',
            error: 'OAuth flow timed out',
          })
        }
      }, this.config.requestTimeoutMs)
    })
  }

  /**
   * Handle URL-mode elicitation
   * Opens URL in browser for external credential flows
   */
  private async handleURLElicitation(
    id: string,
    serverId: string,
    request: URLElicitationRequest
  ): Promise<ElicitationResponse> {
    // If expecting a token callback, use the OAuth callback flow
    if (request.expectToken) {
      const state = randomUUID()
      const url = new URL(request.url)
      url.searchParams.set('state', state)
      url.searchParams.set(
        'callback_url',
        `http://127.0.0.1:${this.config.oauthCallbackPort}/callback`
      )

      return new Promise((resolve) => {
        this.oauthCallbacks.set(state, (token, error) => {
          if (error) {
            resolve({ id, serverId, type: 'url', status: 'error', error })
          } else {
            resolve({ id, serverId, type: 'url', status: 'completed', token: token || undefined })
          }
        })

        this.emit('elicitation:url', { id, serverId, url: url.toString(), title: request.title })
        shell.openExternal(url.toString()).catch((err) => {
          this.oauthCallbacks.delete(state)
          resolve({ id, serverId, type: 'url', status: 'error', error: err.message })
        })

        setTimeout(() => {
          if (this.oauthCallbacks.has(state)) {
            this.oauthCallbacks.delete(state)
            resolve({ id, serverId, type: 'url', status: 'error', error: 'Request timed out' })
          }
        }, this.config.requestTimeoutMs)
      })
    }

    // Simple URL open without callback
    try {
      this.emit('elicitation:url', { id, serverId, url: request.url, title: request.title })
      await shell.openExternal(request.url)
      return { id, serverId, type: 'url', status: 'completed' }
    } catch (err) {
      return { id, serverId, type: 'url', status: 'error', error: (err as Error).message }
    }
  }

  /**
   * Handle confirmation elicitation
   * Emits event for UI to show confirmation dialog
   */
  private handleConfirmationElicitation(
    id: string,
    serverId: string,
    request: ConfirmationElicitationRequest
  ): Promise<ElicitationResponse> {
    // Auto-approve for configured servers
    if (this.config.autoApproveServers.includes(serverId)) {
      return Promise.resolve({
        id,
        serverId,
        type: 'confirmation',
        status: 'completed',
        data: { confirmed: true },
      })
    }

    return new Promise((resolve) => {
      const pending: PendingElicitation = {
        id,
        serverId,
        request,
        timestamp: Date.now(),
        resolve,
      }

      this.pendingRequests.set(id, pending)

      this.emit('elicitation:confirmation', {
        id,
        serverId,
        title: request.title,
        message: request.message,
        confirmLabel: request.confirmLabel,
        cancelLabel: request.cancelLabel,
        danger: request.danger,
      })

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          resolve({ id, serverId, type: 'confirmation', status: 'cancelled', error: 'Timed out' })
        }
      }, this.config.requestTimeoutMs)
    })
  }

  /**
   * Submit form response (called from UI)
   */
  submitFormResponse(id: string, data: Record<string, unknown>): boolean {
    const pending = this.pendingRequests.get(id)
    if (!pending || pending.request.type !== 'form') return false

    this.pendingRequests.delete(id)
    pending.resolve({
      id,
      serverId: pending.serverId,
      type: 'form',
      status: 'completed',
      data,
    })

    return true
  }

  /**
   * Cancel an elicitation request (called from UI)
   */
  cancelRequest(id: string): boolean {
    const pending = this.pendingRequests.get(id)
    if (!pending) return false

    this.pendingRequests.delete(id)
    pending.resolve({
      id,
      serverId: pending.serverId,
      type: pending.request.type,
      status: 'cancelled',
    })

    return true
  }

  /**
   * Submit confirmation response (called from UI)
   */
  submitConfirmation(id: string, confirmed: boolean): boolean {
    const pending = this.pendingRequests.get(id)
    if (!pending || pending.request.type !== 'confirmation') return false

    this.pendingRequests.delete(id)
    pending.resolve({
      id,
      serverId: pending.serverId,
      type: 'confirmation',
      status: confirmed ? 'completed' : 'cancelled',
      data: { confirmed },
    })

    return true
  }

  /**
   * Get pending elicitation requests
   */
  getPendingRequests(): Array<{
    id: string
    serverId: string
    type: ElicitationType
    timestamp: number
  }> {
    return Array.from(this.pendingRequests.values()).map((p) => ({
      id: p.id,
      serverId: p.serverId,
      type: p.request.type,
      timestamp: p.timestamp,
    }))
  }

  /**
   * Get configuration
   */
  getConfig(): ElicitationConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ElicitationConfig>): void {
    this.config = { ...this.config, ...config }
    this.emit('config:updated', this.config)
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    // Cancel all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.resolve({
        id,
        serverId: pending.serverId,
        type: pending.request.type,
        status: 'error',
        error: 'Service shutting down',
      })
    }
    this.pendingRequests.clear()

    // Stop OAuth server
    if (this.oauthServer) {
      return new Promise((resolve) => {
        this.oauthServer!.close(() => {
          this.oauthServer = null
          resolve()
        })
      })
    }
  }
}

// Export singleton
export const mcpElicitationService = new MCPElicitationService()

// Export class for testing
export { MCPElicitationService }
