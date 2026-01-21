/**
 * Path Validation Utilities
 *
 * Provides secure path validation to prevent path traversal attacks.
 * All file operations should use these utilities before accessing the filesystem.
 *
 * @module path-validation
 */

import { resolve, normalize, relative, isAbsolute } from 'path'
import { homedir } from 'os'

/**
 * Validates that a path is safe and doesn't contain traversal attempts.
 *
 * @param inputPath - The path to validate
 * @param allowedBase - Optional base directory to restrict access to
 * @returns The normalized absolute path if valid
 * @throws Error if the path is invalid or outside allowed boundaries
 */
export function validatePath(inputPath: string, allowedBase?: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string')
  }

  // Normalize and resolve the path
  const normalizedPath = normalize(inputPath)
  const absolutePath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(process.cwd(), normalizedPath)

  // Check for null bytes (potential injection)
  if (absolutePath.includes('\0')) {
    throw new Error('Invalid path: path contains null bytes')
  }

  // Check for path traversal attempts
  if (inputPath.includes('..')) {
    // Verify the resolved path is still within expected boundaries
    const resolvedPath = resolve(absolutePath)
    if (resolvedPath !== absolutePath) {
      throw new Error('Invalid path: path traversal detected')
    }
  }

  // If an allowed base is specified, ensure the path is within it
  if (allowedBase) {
    const normalizedBase = resolve(allowedBase)
    const relativePath = relative(normalizedBase, absolutePath)

    // If relative path starts with '..' it's outside the base
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error(`Invalid path: path must be within ${allowedBase}`)
    }
  }

  return absolutePath
}

/**
 * Validates a path is within the user's home directory.
 *
 * @param inputPath - The path to validate
 * @returns The normalized absolute path if valid
 */
export function validateHomePath(inputPath: string): string {
  return validatePath(inputPath, homedir())
}

/**
 * Validates a path is within a temporary directory.
 *
 * @param inputPath - The path to validate
 * @returns The normalized absolute path if valid
 */
export function validateTempPath(inputPath: string): string {
  const absolutePath = validatePath(inputPath)

  // Check if within allowed temp directories
  const isInTemp = ['/tmp', '/var/tmp'].some((tempDir) => {
    const rel = relative(tempDir, absolutePath)
    return !rel.startsWith('..') && !isAbsolute(rel)
  })

  if (!isInTemp) {
    throw new Error('Invalid path: path must be within a temporary directory')
  }

  return absolutePath
}

/**
 * Validates a path is within the Claude configuration directory.
 *
 * @param inputPath - The path to validate
 * @returns The normalized absolute path if valid
 */
export function validateClaudePath(inputPath: string): string {
  const claudeDir = resolve(homedir(), '.claude')
  return validatePath(inputPath, claudeDir)
}

/**
 * Validates a path is within the project directory.
 *
 * @param inputPath - The path to validate
 * @param projectRoot - The project root directory
 * @returns The normalized absolute path if valid
 */
export function validateProjectPath(inputPath: string, projectRoot: string): string {
  const validatedRoot = validatePath(projectRoot)
  return validatePath(inputPath, validatedRoot)
}

/**
 * Checks if a path is safe without throwing.
 *
 * @param inputPath - The path to check
 * @param allowedBase - Optional base directory to restrict access to
 * @returns true if the path is valid, false otherwise
 */
export function isPathSafe(inputPath: string, allowedBase?: string): boolean {
  try {
    validatePath(inputPath, allowedBase)
    return true
  } catch {
    return false
  }
}

/**
 * Sanitizes a filename by removing or replacing unsafe characters.
 *
 * @param filename - The filename to sanitize
 * @returns A safe filename
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed'
  }

  return (
    filename
      // Remove null bytes
      .replace(/\0/g, '')
      // Remove path separators
      .replace(/[/\\]/g, '_')
      // Remove other potentially dangerous characters
      .replace(/[<>:"|?*]/g, '_')
      // Remove leading/trailing dots and spaces
      .replace(/^[\s.]+|[\s.]+$/g, '')
      // Limit length
      .slice(0, 255) ||
    // Fallback for empty result
    'unnamed'
  )
}

/**
 * Joins path segments safely, validating the result.
 *
 * @param base - The base directory
 * @param segments - Path segments to join
 * @returns The validated joined path
 */
export function safeJoin(base: string, ...segments: string[]): string {
  const sanitizedSegments = segments.map(sanitizeFilename)
  const joinedPath = resolve(base, ...sanitizedSegments)
  return validatePath(joinedPath, base)
}
