/**
 * MCP Controllers Index
 *
 * Re-exports all MCP-related tRPC routers for use in the main router.
 *
 * @module mcp/index
 */

export { mcpRouter, type MCPRouter } from './mcp.controller'
export { proxyRouter, type ProxyRouter } from './proxy.controller'
