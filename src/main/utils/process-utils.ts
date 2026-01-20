/**
 * Process Utilities - Linux /proc filesystem parsing
 *
 * Replaces shell-based `ps` commands with direct /proc access.
 * No shell spawning required - pure filesystem reads.
 *
 * @see docs/Research/Electron App Architecture Research Guide.md (Chapter 4)
 * @module process-utils
 */

import { readdirSync, readFileSync, existsSync, readlinkSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Types
// ============================================================================

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  cmdline: string
  state: string
  tty?: string
  uid?: number
}

export interface ProcessTreeNode extends ProcessInfo {
  children: ProcessTreeNode[]
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get process info from /proc/{pid}
 *
 * @param pid - Process ID
 * @returns ProcessInfo or null if process doesn't exist
 */
export function getProcessInfo(pid: number | string): ProcessInfo | null {
  const procPath = join('/proc', String(pid))

  try {
    // Read cmdline (null-separated arguments)
    const cmdlinePath = join(procPath, 'cmdline')
    const cmdline = existsSync(cmdlinePath)
      ? readFileSync(cmdlinePath, 'utf-8').replace(/\0/g, ' ').trim()
      : ''

    // Read stat for process state and ppid
    const statPath = join(procPath, 'stat')
    if (!existsSync(statPath)) return null

    const stat = readFileSync(statPath, 'utf-8')

    // Parse stat: pid (name) state ppid ...
    // Name can contain spaces/parens, so find last ) to parse correctly
    const lastParen = stat.lastIndexOf(')')
    if (lastParen === -1) return null

    const afterName = stat.slice(lastParen + 2).split(' ')
    const nameMatch = stat.match(/\((.+)\)/)

    const state = afterName[0] || 'U'
    const ppid = parseInt(afterName[1]) || 0
    const ttyNr = parseInt(afterName[4]) || 0

    // Get name from comm (more reliable for truncated names)
    const commPath = join(procPath, 'comm')
    const name = existsSync(commPath)
      ? readFileSync(commPath, 'utf-8').trim()
      : nameMatch?.[1] || 'unknown'

    // Get UID from status file
    let uid: number | undefined
    const statusPath = join(procPath, 'status')
    if (existsSync(statusPath)) {
      const status = readFileSync(statusPath, 'utf-8')
      const uidMatch = status.match(/Uid:\s+(\d+)/)
      if (uidMatch) uid = parseInt(uidMatch[1])
    }

    // Convert tty number to tty name (simplified)
    const tty = ttyNr > 0 ? `pts/${ttyNr & 0xff}` : undefined

    return {
      pid: typeof pid === 'number' ? pid : parseInt(pid),
      ppid,
      name,
      cmdline,
      state,
      tty,
      uid,
    }
  } catch {
    // Process may have exited between enumeration and read
    return null
  }
}

/**
 * List all processes on the system
 *
 * @returns Array of ProcessInfo objects
 */
export function listProcesses(): ProcessInfo[] {
  try {
    return readdirSync('/proc')
      .filter((entry) => /^\d+$/.test(entry))
      .map((pid) => getProcessInfo(pid))
      .filter((p): p is ProcessInfo => p !== null)
  } catch {
    return []
  }
}

/**
 * Find processes matching a filter
 *
 * @param filter - Function to test each process
 * @returns Matching ProcessInfo objects
 */
export function findProcesses(filter: (proc: ProcessInfo) => boolean): ProcessInfo[] {
  return listProcesses().filter(filter)
}

/**
 * Find processes by name (exact match)
 *
 * @param name - Process name to find
 * @returns Matching ProcessInfo objects
 */
export function findByName(name: string): ProcessInfo[] {
  return findProcesses((p) => p.name === name)
}

/**
 * Find processes by command line pattern
 *
 * @param pattern - Regex or string to match against cmdline
 * @returns Matching ProcessInfo objects
 */
export function findByCmdline(pattern: string | RegExp): ProcessInfo[] {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
  return findProcesses((p) => regex.test(p.cmdline))
}

/**
 * Get child processes of a given parent PID
 *
 * @param ppid - Parent process ID
 * @returns Array of child ProcessInfo objects
 */
export function getChildren(ppid: number): ProcessInfo[] {
  return findProcesses((p) => p.ppid === ppid)
}

/**
 * Build a process tree starting from a given PID
 *
 * @param pid - Root process ID
 * @returns ProcessTreeNode or null if process doesn't exist
 */
export function buildProcessTree(pid: number): ProcessTreeNode | null {
  const proc = getProcessInfo(pid)
  if (!proc) return null

  const children = getChildren(pid)
    .map((child) => buildProcessTree(child.pid))
    .filter((node): node is ProcessTreeNode => node !== null)

  return { ...proc, children }
}

/**
 * Check if a process is running
 *
 * @param pid - Process ID to check
 * @returns true if process exists
 */
export function isRunning(pid: number): boolean {
  return existsSync(join('/proc', String(pid)))
}

/**
 * Get processes attached to a TTY
 *
 * @param tty - TTY name (e.g., 'pts/0')
 * @returns Array of ProcessInfo objects
 */
export function getProcessesByTTY(tty: string): ProcessInfo[] {
  return findProcesses((p) => p.tty === tty)
}

/**
 * Find Claude Code processes
 * Looks for processes with 'claude' in name or cmdline
 *
 * @returns Array of Claude-related ProcessInfo objects
 */
export function findClaudeProcesses(): ProcessInfo[] {
  return findProcesses(
    (p) =>
      p.name.toLowerCase().includes('claude') ||
      p.cmdline.toLowerCase().includes('claude') ||
      p.cmdline.includes('anthropic')
  )
}

/**
 * Find MCP server processes
 * Looks for processes spawned by Claude with MCP-related commands
 *
 * @returns Array of MCP-related ProcessInfo objects
 */
export function findMCPProcesses(): ProcessInfo[] {
  return findProcesses(
    (p) =>
      p.cmdline.includes('mcp') ||
      p.cmdline.includes('@modelcontextprotocol') ||
      p.name.includes('mcp')
  )
}

/**
 * Get the current working directory of a process from /proc/{pid}/cwd
 *
 * @param pid - Process ID
 * @returns Working directory path or null if not accessible
 */
export function getProcessCwd(pid: number): string | null {
  try {
    const cwdPath = join('/proc', String(pid), 'cwd')
    if (!existsSync(cwdPath)) return null

    // cwd is a symlink to the actual directory
    return readlinkSync(cwdPath)
  } catch {
    // Permission denied or process exited
    return null
  }
}

/**
 * Get memory usage for a process from /proc/{pid}/statm
 *
 * @param pid - Process ID
 * @returns Memory usage in bytes, or null if process doesn't exist
 */
export function getProcessMemory(pid: number): { rss: number; vsize: number } | null {
  try {
    const statmPath = join('/proc', String(pid), 'statm')
    if (!existsSync(statmPath)) return null

    const statm = readFileSync(statmPath, 'utf-8').split(' ')
    const pageSize = 4096 // Standard page size on Linux

    return {
      vsize: parseInt(statm[0]) * pageSize,
      rss: parseInt(statm[1]) * pageSize,
    }
  } catch {
    return null
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  getProcessInfo,
  listProcesses,
  findProcesses,
  findByName,
  findByCmdline,
  getChildren,
  buildProcessTree,
  isRunning,
  getProcessesByTTY,
  findClaudeProcesses,
  findMCPProcesses,
  getProcessCwd,
  getProcessMemory,
}
