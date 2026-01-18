/**
 * Claude Status Hook - tRPC React Query Integration
 *
 * Provides Claude Code version and project list with automatic caching.
 *
 * @example
 * const { version, projects, isLoading } = useClaudeStatus()
 */

import { trpc } from '@/lib/trpc/react'

/**
 * Get Claude Code version
 */
export function useClaudeVersion() {
  const query = trpc.claude.version.useQuery(undefined, {
    staleTime: 60000, // Version changes rarely
    refetchOnWindowFocus: false,
    retry: 1,
  })

  return {
    version: query.data ?? 'unknown',
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  }
}

/**
 * Get Claude projects list
 */
export function useClaudeProjects() {
  const query = trpc.claude.projects.useQuery(undefined, {
    staleTime: 10000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  return {
    projects: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  }
}

/**
 * Combined hook for Claude status (version + projects)
 */
export function useClaudeStatus() {
  const versionQuery = trpc.claude.version.useQuery(undefined, {
    staleTime: 60000,
    refetchOnWindowFocus: false,
  })

  const projectsQuery = trpc.claude.projects.useQuery(undefined, {
    staleTime: 10000,
    refetchOnWindowFocus: true,
  })

  return {
    version: versionQuery.data ?? 'unknown',
    projects: projectsQuery.data ?? [],
    loading: versionQuery.isLoading || projectsQuery.isLoading,
    error: versionQuery.error?.message || projectsQuery.error?.message || null,
    refresh: () => {
      versionQuery.refetch()
      projectsQuery.refetch()
    },
  }
}
