/**
 * Tests for useClaudeStatus hooks
 *
 * Tests useClaudeVersion, useClaudeProjects, and useClaudeStatus hooks
 * that provide Claude Code version and project information.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useClaudeVersion, useClaudeProjects, useClaudeStatus } from '../useClaudeStatus'

// Mock tRPC hooks
const mockVersionUseQuery = vi.fn()
const mockProjectsUseQuery = vi.fn()

vi.mock('@/lib/trpc/react', () => ({
  trpc: {
    claude: {
      version: {
        useQuery: (...args: unknown[]) => mockVersionUseQuery(...args),
      },
      projects: {
        useQuery: (...args: unknown[]) => mockProjectsUseQuery(...args),
      },
    },
  },
}))

describe('useClaudeStatus hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useClaudeVersion', () => {
    it('should return loading state initially', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeVersion())

      expect(result.current.loading).toBe(true)
      expect(result.current.version).toBe('unknown')
      expect(result.current.error).toBeNull()
    })

    it('should return version when data is loaded', () => {
      mockVersionUseQuery.mockReturnValue({
        data: '1.2.3',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeVersion())

      expect(result.current.loading).toBe(false)
      expect(result.current.version).toBe('1.2.3')
      expect(result.current.error).toBeNull()
    })

    it('should return error when query fails', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch version' },
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeVersion())

      expect(result.current.loading).toBe(false)
      expect(result.current.version).toBe('unknown')
      expect(result.current.error).toBe('Failed to fetch version')
    })

    it('should call useQuery with correct options', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      renderHook(() => useClaudeVersion())

      expect(mockVersionUseQuery).toHaveBeenCalledWith(undefined, {
        staleTime: 60000,
        refetchOnWindowFocus: false,
        retry: 1,
      })
    })

    it('should provide refresh function', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({ data: '1.2.4' })
      mockVersionUseQuery.mockReturnValue({
        data: '1.2.3',
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useClaudeVersion())

      await act(async () => {
        await result.current.refresh()
      })

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('useClaudeProjects', () => {
    it('should return loading state initially', () => {
      mockProjectsUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeProjects())

      expect(result.current.loading).toBe(true)
      expect(result.current.projects).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('should return projects when data is loaded', () => {
      const mockProjects = [
        { name: 'project-1', path: '/home/user/project-1' },
        { name: 'project-2', path: '/home/user/project-2' },
      ]

      mockProjectsUseQuery.mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeProjects())

      expect(result.current.loading).toBe(false)
      expect(result.current.projects).toEqual(mockProjects)
      expect(result.current.error).toBeNull()
    })

    it('should return error when query fails', () => {
      mockProjectsUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch projects' },
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeProjects())

      expect(result.current.loading).toBe(false)
      expect(result.current.projects).toEqual([])
      expect(result.current.error).toBe('Failed to fetch projects')
    })

    it('should call useQuery with correct options', () => {
      mockProjectsUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      renderHook(() => useClaudeProjects())

      expect(mockProjectsUseQuery).toHaveBeenCalledWith(undefined, {
        staleTime: 10000,
        refetchOnWindowFocus: true,
        retry: 1,
      })
    })

    it('should provide refresh function', async () => {
      const mockRefetch = vi.fn().mockResolvedValue({ data: [] })
      mockProjectsUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() => useClaudeProjects())

      await act(async () => {
        await result.current.refresh()
      })

      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('useClaudeStatus', () => {
    it('should return loading state when either query is loading', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.loading).toBe(true)
    })

    it('should return version and projects when both are loaded', () => {
      const mockProjects = [{ name: 'test', path: '/test' }]

      mockVersionUseQuery.mockReturnValue({
        data: '2.0.0',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.loading).toBe(false)
      expect(result.current.version).toBe('2.0.0')
      expect(result.current.projects).toEqual(mockProjects)
      expect(result.current.error).toBeNull()
    })

    it('should return error from version query', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Version error' },
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.error).toBe('Version error')
    })

    it('should return error from projects query when version has no error', () => {
      mockVersionUseQuery.mockReturnValue({
        data: '1.0.0',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Projects error' },
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.error).toBe('Projects error')
    })

    it('should prefer version error when both queries have errors', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Version error' },
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Projects error' },
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.error).toBe('Version error')
    })

    it('should refresh both queries when refresh is called', async () => {
      const mockVersionRefetch = vi.fn().mockResolvedValue({})
      const mockProjectsRefetch = vi.fn().mockResolvedValue({})

      mockVersionUseQuery.mockReturnValue({
        data: '1.0.0',
        isLoading: false,
        error: null,
        refetch: mockVersionRefetch,
      })
      mockProjectsUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: mockProjectsRefetch,
      })

      const { result } = renderHook(() => useClaudeStatus())

      act(() => {
        result.current.refresh()
      })

      expect(mockVersionRefetch).toHaveBeenCalled()
      expect(mockProjectsRefetch).toHaveBeenCalled()
    })

    it('should call useQuery with correct options for combined hook', () => {
      mockVersionUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      })

      renderHook(() => useClaudeStatus())

      expect(mockVersionUseQuery).toHaveBeenCalledWith(undefined, {
        staleTime: 60000,
        refetchOnWindowFocus: false,
      })
      expect(mockProjectsUseQuery).toHaveBeenCalledWith(undefined, {
        staleTime: 10000,
        refetchOnWindowFocus: true,
      })
    })

    it('should handle empty projects array gracefully', () => {
      mockVersionUseQuery.mockReturnValue({
        data: '1.0.0',
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.projects).toEqual([])
    })

    it('should default to unknown version when data is null', () => {
      mockVersionUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
      mockProjectsUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { result } = renderHook(() => useClaudeStatus())

      expect(result.current.version).toBe('unknown')
    })
  })
})
