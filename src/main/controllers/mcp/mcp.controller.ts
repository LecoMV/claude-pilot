/**
 * MCP Controller - MCP Server Configuration Management
 *
 * Type-safe tRPC controller for managing MCP server configurations.
 * Reads and writes to ~/.claude/mcp.json and settings.json.
 *
 * Migrated from handlers.ts (6 handlers):
 * - mcp:list - returns MCPServer[] from getMCPServers()
 * - mcp:toggle - toggles server enabled status
 * - mcp:getServer - get single server by name
 * - mcp:reload - signal config refresh
 * - mcp:getConfig - read settings.json content
 * - mcp:saveConfig - validate JSON and write settings.json
 *
 * @module mcp.controller
 */

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure, auditedProcedure } from '../../trpc/trpc'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { MCPServer, MCPServerConfig, MCPServerMetadata } from '../../../shared/types'
import { getMCPServerMetadata, inferServerCategory } from '../../../shared/mcp-metadata-registry'

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_DIR = join(homedir(), '.claude')
const MCP_JSON_PATH = join(CLAUDE_DIR, 'mcp.json')
const SETTINGS_JSON_PATH = join(CLAUDE_DIR, 'settings.json')

// ============================================================================
// Schemas
// ============================================================================

const ServerNameSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name cannot be empty')
    .max(100, 'Server name cannot exceed 100 characters'),
})

const ToggleServerSchema = z.object({
  name: z
    .string()
    .min(1, 'Server name cannot be empty')
    .max(100, 'Server name cannot exceed 100 characters'),
  enabled: z.boolean(),
})

const SaveConfigSchema = z.object({
  content: z.string().min(1, 'Config content cannot be empty'),
})

// ============================================================================
// Helper Functions
// ============================================================================

interface MCPConfigFile {
  mcpServers?: Record<
    string,
    {
      command: string
      args?: string[]
      env?: Record<string, string>
      disabled?: boolean
    }
  >
}

/**
 * Read MCP servers from config files (mcp.json and settings.json)
 */
async function getMCPServers(): Promise<MCPServer[]> {
  const servers: MCPServer[] = []
  const configPaths = [MCP_JSON_PATH, SETTINGS_JSON_PATH]

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8')
        const config = JSON.parse(content) as MCPConfigFile
        const mcpServers = config.mcpServers || {}

        for (const [name, serverConfig] of Object.entries(mcpServers)) {
          // Check if we already have this server from a previous config file
          if (servers.find((s) => s.name === name)) {
            continue
          }

          const cfg: MCPServerConfig = {
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env,
            disabled: serverConfig.disabled,
          }

          // Get metadata for this server
          const knownMetadata = getMCPServerMetadata(name)
          const metadata: MCPServerMetadata = knownMetadata || {
            name,
            description: `MCP server: ${serverConfig.command}`,
            category: inferServerCategory(name, serverConfig.command),
          }

          servers.push({
            name,
            status: serverConfig.disabled ? 'offline' : 'online',
            config: cfg,
            metadata,
          })
        }
      } catch (error) {
        console.error('[MCP] Failed to read config from', configPath, error)
      }
    }
  }

  return servers
}

/**
 * Get a single server by name
 */
async function getServerByName(name: string): Promise<MCPServer | null> {
  const servers = await getMCPServers()
  return servers.find((s) => s.name === name) || null
}

/**
 * Toggle server enabled/disabled status
 * Writes to mcp.json if it exists, otherwise settings.json
 */
async function toggleServer(name: string, enabled: boolean): Promise<boolean> {
  // Try mcp.json first, then settings.json
  const configPath = existsSync(MCP_JSON_PATH) ? MCP_JSON_PATH : SETTINGS_JSON_PATH

  try {
    let config: MCPConfigFile = {}

    if (existsSync(configPath)) {
      const content = await readFile(configPath, 'utf-8')
      config = JSON.parse(content) as MCPConfigFile
    }

    if (!config.mcpServers) {
      config.mcpServers = {}
    }

    const serverConfig = config.mcpServers[name]
    if (!serverConfig) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `MCP server not found: ${name}`,
      })
    }

    // Update the disabled flag (disabled = !enabled)
    config.mcpServers[name] = {
      ...serverConfig,
      disabled: !enabled,
    }

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.info('[MCP] Toggled server', name, 'to', enabled ? 'enabled' : 'disabled')
    return true
  } catch (error) {
    if (error instanceof TRPCError) throw error
    console.error('[MCP] Failed to toggle server:', error)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to toggle MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

/**
 * Read settings.json content
 */
async function getConfigContent(): Promise<string> {
  if (existsSync(SETTINGS_JSON_PATH)) {
    try {
      return await readFile(SETTINGS_JSON_PATH, 'utf-8')
    } catch (error) {
      console.error('[MCP] Failed to read settings.json:', error)
    }
  }
  return '{}'
}

/**
 * Validate and save settings.json content
 */
async function saveConfigContent(content: string): Promise<true> {
  try {
    // Validate JSON
    JSON.parse(content)
  } catch {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid JSON content',
    })
  }

  try {
    await writeFile(SETTINGS_JSON_PATH, content, 'utf-8')
    console.info('[MCP] Saved settings.json')
    return true
  } catch (error) {
    console.error('[MCP] Failed to save settings.json:', error)
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to save settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

// ============================================================================
// Router
// ============================================================================

export const mcpRouter = router({
  /**
   * List all MCP servers from config
   */
  list: publicProcedure.query((): Promise<MCPServer[]> => {
    return getMCPServers()
  }),

  /**
   * Toggle a server's enabled/disabled status
   */
  toggle: auditedProcedure.input(ToggleServerSchema).mutation(({ input }): Promise<boolean> => {
    return toggleServer(input.name, input.enabled)
  }),

  /**
   * Get a single server by name
   */
  getServer: publicProcedure
    .input(ServerNameSchema)
    .query(({ input }): Promise<MCPServer | null> => {
      return getServerByName(input.name)
    }),

  /**
   * Signal config refresh (Claude Code will pick up changes)
   * Returns true to indicate refresh was requested
   */
  reload: auditedProcedure.mutation((): boolean => {
    console.info('[MCP] Config reload requested')
    // The actual reload happens when Claude Code picks up the file changes
    // This is a no-op signal to indicate the request was received
    return true
  }),

  /**
   * Get the raw settings.json content
   */
  getConfig: publicProcedure.query((): Promise<string> => {
    return getConfigContent()
  }),

  /**
   * Validate and save settings.json content
   */
  saveConfig: auditedProcedure.input(SaveConfigSchema).mutation(({ input }): Promise<boolean> => {
    return saveConfigContent(input.content)
  }),
})

export type MCPRouter = typeof mcpRouter
