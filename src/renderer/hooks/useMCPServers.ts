/**
 * MCP Servers Hook - tRPC React Query Integration
 *
 * Provides type-safe access to MCP server list with automatic caching.
 *
 * @example
 * const { data: servers, isLoading, refetch } = useMCPServers()
 */

import { trpc } from '@/lib/trpc/react'

export function useMCPServers() {
  const query = trpc.mcp.list.useQuery(undefined, {
    staleTime: 10000, // MCP config changes rarely
    refetchOnWindowFocus: true,
    retry: 1,
  })

  return {
    servers: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
    isRefetching: query.isRefetching,
  }
}

/**
 * Connect to a specific MCP server
 */
export function useMCPConnect() {
  const utils = trpc.useUtils()
  const connect = trpc.mcp.connect.useMutation({
    onSuccess: () => {
      // Invalidate the list to refetch after connect
      utils.mcp.list.invalidate()
    },
  })

  return {
    connect: connect.mutate,
    connectAsync: connect.mutateAsync,
    isConnecting: connect.isPending,
    error: connect.error?.message ?? null,
  }
}

/**
 * Disconnect from an MCP server
 */
export function useMCPDisconnect() {
  const utils = trpc.useUtils()
  const disconnect = trpc.mcp.disconnect.useMutation({
    onSuccess: () => {
      utils.mcp.list.invalidate()
    },
  })

  return {
    disconnect: disconnect.mutate,
    disconnectAsync: disconnect.mutateAsync,
    isDisconnecting: disconnect.isPending,
    error: disconnect.error?.message ?? null,
  }
}
