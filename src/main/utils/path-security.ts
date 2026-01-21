/**
 * Path Security Utilities
 *
 * Provides path validation and sanitization to prevent traversal attacks:
 * - Validates paths against allowed base directories
 * - Resolves symlinks to canonical paths
 * - Detects and rejects traversal sequences (../, ..\)
 * - Creates Zod schemas for path validation
 *
 * @module utils/path-security
 * @see SEC-2 Path Traversal Prevention
 */

import { realpath, access, constants } from 'fs/promises'
import { existsSync, realpathSync } from 'fs'
import { resolve, normalize, isAbsolute, join, relative } from 'path'
import { homedir } from 'os'
import { z } from 'zod'

const HOME = homedir()

/**
 * Default allowed base paths for file operations
 * All paths must be within one of these directories
 */
export const DEFAULT_ALLOWED_PATHS = [HOME, '/tmp', '/var/tmp']

/**
 * Result of path validation
 */
export interface PathValidationResult {
  valid: boolean
  canonicalPath?: string
  error?: string
}

/**
 * Options for path validation
 */
export interface PathValidationOptions {
  /** Allowed base directories (defaults to home, /tmp, /var/tmp) */
  allowedPaths?: string[]
  /** Whether to require the path to exist */
  mustExist?: boolean
  /** Whether to resolve symlinks */
  resolveSymlinks?: boolean
  /** Whether to allow absolute paths only */
  absoluteOnly?: boolean
  /** Maximum path length */
  maxLength?: number
}

/**
 * Patterns that indicate path traversal attempts
 */
const TRAVERSAL_PATTERNS = [
  /\.\.\//g, // Unix traversal
  /\.\.\\/g, // Windows traversal
  /\.\./g, // General double-dot
  /%2e%2e/gi, // URL-encoded traversal
  /%252e%252e/gi, // Double URL-encoded
  /\.\.%2f/gi, // Mixed encoding
  /\.\.%5c/gi, // Mixed encoding (backslash)
]

/**
 * Check if a path contains traversal sequences
 */
export function containsTraversal(path: string): boolean {
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(path)) {
      return true
    }
  }
  return false
}

/**
 * Normalize a path for comparison
 * - Converts to absolute if relative
 * - Normalizes separators
 * - Does NOT resolve symlinks (caller should do that separately)
 */
export function normalizePath(inputPath: string, basePath?: string): string {
  let normalized = normalize(inputPath)

  // Make absolute if relative
  if (!isAbsolute(normalized)) {
    normalized = resolve(basePath || process.cwd(), normalized)
  }

  // Ensure trailing slash is handled consistently
  return normalized
}

/**
 * Check if a path is within any of the allowed base paths
 */
export function isWithinAllowedPaths(canonicalPath: string, allowedPaths: string[]): boolean {
  for (const basePath of allowedPaths) {
    // Expand ~ to home directory
    const expandedBase = basePath.startsWith('~') ? basePath.replace('~', HOME) : basePath

    // Get canonical base path
    let canonicalBase: string
    try {
      canonicalBase = existsSync(expandedBase) ? realpathSync(expandedBase) : expandedBase
    } catch {
      canonicalBase = expandedBase
    }

    // Check if path is within base or is the base itself
    if (canonicalPath === canonicalBase) {
      return true
    }

    // Use relative path to check containment
    const rel = relative(canonicalBase, canonicalPath)
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
      return true
    }
  }

  return false
}

/**
 * Validate a path synchronously
 *
 * @param inputPath Path to validate
 * @param options Validation options
 * @returns Validation result
 */
export function validatePathSync(
  inputPath: string,
  options: PathValidationOptions = {}
): PathValidationResult {
  const {
    allowedPaths = DEFAULT_ALLOWED_PATHS,
    mustExist = false,
    resolveSymlinks = true,
    absoluteOnly = false,
    maxLength = 4096,
  } = options

  // Check for empty path
  if (!inputPath || inputPath.trim() === '') {
    return { valid: false, error: 'Path cannot be empty' }
  }

  // Check length
  if (inputPath.length > maxLength) {
    return { valid: false, error: `Path exceeds maximum length of ${maxLength}` }
  }

  // Check for traversal sequences in the raw input
  if (containsTraversal(inputPath)) {
    return { valid: false, error: 'Path contains traversal sequences' }
  }

  // Check absolute requirement
  if (absoluteOnly && !isAbsolute(inputPath)) {
    return { valid: false, error: 'Path must be absolute' }
  }

  // Normalize the path
  const normalized = normalizePath(inputPath)

  // Check for traversal in normalized path
  if (containsTraversal(normalized)) {
    return { valid: false, error: 'Normalized path contains traversal sequences' }
  }

  // Resolve symlinks if requested and path exists
  let canonicalPath = normalized
  if (resolveSymlinks && existsSync(normalized)) {
    try {
      canonicalPath = realpathSync(normalized)
    } catch (error) {
      return {
        valid: false,
        error: `Failed to resolve path: ${(error as Error).message}`,
      }
    }
  }

  // Check if path exists if required
  if (mustExist && !existsSync(canonicalPath)) {
    return { valid: false, error: 'Path does not exist' }
  }

  // Check if within allowed paths
  if (!isWithinAllowedPaths(canonicalPath, allowedPaths)) {
    return {
      valid: false,
      error: `Path is outside allowed directories. Allowed: ${allowedPaths.join(', ')}`,
    }
  }

  return { valid: true, canonicalPath }
}

/**
 * Validate a path asynchronously (better for existence checks)
 *
 * @param inputPath Path to validate
 * @param options Validation options
 * @returns Promise resolving to validation result
 */
export async function validatePath(
  inputPath: string,
  options: PathValidationOptions = {}
): Promise<PathValidationResult> {
  const {
    allowedPaths = DEFAULT_ALLOWED_PATHS,
    mustExist = false,
    resolveSymlinks = true,
    absoluteOnly = false,
    maxLength = 4096,
  } = options

  // Check for empty path
  if (!inputPath || inputPath.trim() === '') {
    return { valid: false, error: 'Path cannot be empty' }
  }

  // Check length
  if (inputPath.length > maxLength) {
    return { valid: false, error: `Path exceeds maximum length of ${maxLength}` }
  }

  // Check for traversal sequences in the raw input
  if (containsTraversal(inputPath)) {
    return { valid: false, error: 'Path contains traversal sequences' }
  }

  // Check absolute requirement
  if (absoluteOnly && !isAbsolute(inputPath)) {
    return { valid: false, error: 'Path must be absolute' }
  }

  // Normalize the path
  const normalized = normalizePath(inputPath)

  // Check for traversal in normalized path
  if (containsTraversal(normalized)) {
    return { valid: false, error: 'Normalized path contains traversal sequences' }
  }

  // Resolve symlinks if requested and path exists
  let canonicalPath = normalized
  if (resolveSymlinks) {
    try {
      canonicalPath = await realpath(normalized)
    } catch {
      // Path might not exist yet, use normalized
      canonicalPath = normalized
    }
  }

  // Check if path exists if required
  if (mustExist) {
    try {
      await access(canonicalPath, constants.F_OK)
    } catch {
      return { valid: false, error: 'Path does not exist' }
    }
  }

  // Check if within allowed paths
  if (!isWithinAllowedPaths(canonicalPath, allowedPaths)) {
    return {
      valid: false,
      error: `Path is outside allowed directories. Allowed: ${allowedPaths.join(', ')}`,
    }
  }

  return { valid: true, canonicalPath }
}

/**
 * Sanitize a path by removing dangerous patterns
 * Only use for display/logging - always validate for actual file operations
 */
export function sanitizePath(inputPath: string): string {
  let sanitized = inputPath

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '')

  // Remove traversal sequences
  sanitized = sanitized.replace(/\.\.\//g, '')
  sanitized = sanitized.replace(/\.\.\\/g, '')

  // Remove URL encoding of traversal
  sanitized = sanitized.replace(/%2e%2e%2f/gi, '')
  sanitized = sanitized.replace(/%2e%2e%5c/gi, '')

  return sanitized
}

/**
 * Create a safe path by joining and validating
 */
export function safePath(basePath: string, ...segments: string[]): PathValidationResult {
  // Validate each segment doesn't contain traversal
  for (const segment of segments) {
    if (containsTraversal(segment)) {
      return { valid: false, error: `Segment contains traversal: ${segment}` }
    }
  }

  // Join the paths
  const joined = join(basePath, ...segments)

  // Validate the resulting path
  return validatePathSync(joined, {
    allowedPaths: [basePath],
    resolveSymlinks: false,
  })
}

/**
 * Create a Zod schema for validating project paths
 */
export function createProjectPathSchema(options: PathValidationOptions = {}) {
  return z
    .string()
    .min(1, 'Path cannot be empty')
    .max(options.maxLength || 4096, 'Path too long')
    .refine((path) => !containsTraversal(path), {
      message: 'Path contains traversal sequences (..)',
    })
    .refine(
      (path) => {
        const result = validatePathSync(path, options)
        return result.valid
      },
      { message: 'Path is outside allowed directories' }
    )
    .transform((path) => {
      const result = validatePathSync(path, options)
      return result.canonicalPath || path
    })
}

/**
 * Create a Zod schema for validating file paths with extra restrictions
 */
export function createFilePathSchema(options: PathValidationOptions = {}) {
  return z
    .string()
    .min(1, 'File path cannot be empty')
    .max(options.maxLength || 4096, 'File path too long')
    .refine((path) => !containsTraversal(path), {
      message: 'File path contains traversal sequences (..)',
    })
    .refine((path) => !path.includes('\0'), { message: 'File path contains null bytes' })
    .refine(
      (path) => {
        const result = validatePathSync(path, { ...options, mustExist: false })
        return result.valid
      },
      { message: 'File path is outside allowed directories' }
    )
    .transform((path) => {
      const result = validatePathSync(path, options)
      return result.canonicalPath || path
    })
}

/**
 * Secure project path schema - use this in controllers
 * Validates path is within home directory
 */
export const SecureProjectPathSchema = z.object({
  projectPath: createProjectPathSchema({
    allowedPaths: [HOME, '/tmp', '/var/tmp'],
    resolveSymlinks: true,
  }),
})

/**
 * Secure file path schema - use this in controllers
 */
export const SecureFilePathSchema = z.object({
  filePath: createFilePathSchema({
    allowedPaths: [HOME, '/tmp', '/var/tmp'],
    resolveSymlinks: true,
  }),
})

// Export patterns for testing
export { TRAVERSAL_PATTERNS }
