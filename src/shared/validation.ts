// Input validation layer for IPC communication

import { ValidationError } from './errors'

/**
 * Validation schema types
 */
type ValidationType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'any'

interface ValidationRule {
  type: ValidationType
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  enum?: unknown[]
  items?: ValidationRule
  properties?: Record<string, ValidationRule>
  custom?: (value: unknown) => boolean | string
}

type Schema = Record<string, ValidationRule>

/**
 * Validate a value against a rule
 */
function validateValue(
  value: unknown,
  rule: ValidationRule,
  fieldName: string,
  operation: string
): void {
  // Check required
  if (value === undefined || value === null) {
    if (rule.required) {
      throw new ValidationError(`${fieldName} is required`, {
        field: fieldName,
        operation,
      })
    }
    return
  }

  // Type checking
  if (rule.type !== 'any') {
    const actualType = Array.isArray(value) ? 'array' : typeof value
    if (actualType !== rule.type) {
      throw new ValidationError(
        `${fieldName} must be a ${rule.type}, got ${actualType}`,
        { field: fieldName, value, operation }
      )
    }
  }

  // String validations
  if (rule.type === 'string' && typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      throw new ValidationError(
        `${fieldName} must be at least ${rule.minLength} characters`,
        { field: fieldName, value, operation }
      )
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      throw new ValidationError(
        `${fieldName} must be at most ${rule.maxLength} characters`,
        { field: fieldName, value, operation }
      )
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      throw new ValidationError(`${fieldName} has invalid format`, {
        field: fieldName,
        value,
        operation,
      })
    }
  }

  // Number validations
  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      throw new ValidationError(`${fieldName} must be at least ${rule.min}`, {
        field: fieldName,
        value,
        operation,
      })
    }
    if (rule.max !== undefined && value > rule.max) {
      throw new ValidationError(`${fieldName} must be at most ${rule.max}`, {
        field: fieldName,
        value,
        operation,
      })
    }
  }

  // Enum validation
  if (rule.enum && !rule.enum.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${rule.enum.join(', ')}`,
      { field: fieldName, value, operation }
    )
  }

  // Array validation
  if (rule.type === 'array' && Array.isArray(value) && rule.items) {
    value.forEach((item, index) => {
      validateValue(item, rule.items!, `${fieldName}[${index}]`, operation)
    })
  }

  // Object validation
  if (rule.type === 'object' && typeof value === 'object' && rule.properties) {
    const obj = value as Record<string, unknown>
    for (const [key, propRule] of Object.entries(rule.properties)) {
      validateValue(obj[key], propRule, `${fieldName}.${key}`, operation)
    }
  }

  // Custom validation
  if (rule.custom) {
    const result = rule.custom(value)
    if (result !== true) {
      throw new ValidationError(
        typeof result === 'string' ? result : `${fieldName} failed custom validation`,
        { field: fieldName, value, operation }
      )
    }
  }
}

/**
 * Validate input against a schema
 */
export function validate<T>(
  input: unknown,
  schema: Schema,
  operation: string
): T {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Input must be an object', { operation })
  }

  const obj = input as Record<string, unknown>

  for (const [key, rule] of Object.entries(schema)) {
    validateValue(obj[key], rule, key, operation)
  }

  return input as T
}

/**
 * Common validation helpers
 */
export const validators = {
  string(options?: Partial<ValidationRule>): ValidationRule {
    return { type: 'string', ...options }
  },

  number(options?: Partial<ValidationRule>): ValidationRule {
    return { type: 'number', ...options }
  },

  boolean(options?: Partial<ValidationRule>): ValidationRule {
    return { type: 'boolean', ...options }
  },

  array(items?: ValidationRule, options?: Partial<ValidationRule>): ValidationRule {
    return { type: 'array', items, ...options }
  },

  object(
    properties?: Record<string, ValidationRule>,
    options?: Partial<ValidationRule>
  ): ValidationRule {
    return { type: 'object', properties, ...options }
  },

  any(options?: Partial<ValidationRule>): ValidationRule {
    return { type: 'any', ...options }
  },

  // Common patterns
  filePath: (): ValidationRule => ({
    type: 'string',
    required: true,
    pattern: /^[/~][\w\-./]+$/,
    custom: (v) => {
      const path = v as string
      // Prevent path traversal
      if (path.includes('..')) {
        return 'Path traversal is not allowed'
      }
      return true
    },
  }),

  email: (): ValidationRule => ({
    type: 'string',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  }),

  url: (): ValidationRule => ({
    type: 'string',
    pattern: /^https?:\/\/.+/,
  }),

  port: (): ValidationRule => ({
    type: 'number',
    min: 1,
    max: 65535,
  }),

  nonEmptyString: (): ValidationRule => ({
    type: 'string',
    required: true,
    minLength: 1,
  }),

  id: (): ValidationRule => ({
    type: 'string',
    required: true,
    pattern: /^[\w-]+$/,
  }),
}

/**
 * IPC channel validation schemas
 */
export const ipcSchemas: Record<string, Schema> = {
  // MCP channels
  'mcp:toggle': {
    name: validators.nonEmptyString(),
    enabled: { type: 'boolean', required: true },
  },

  'mcp:getServer': {
    name: validators.nonEmptyString(),
  },

  'mcp:saveConfig': {
    content: validators.string({ required: true, maxLength: 500000 }),
  },

  // Memory channels
  'memory:learnings': {
    query: validators.string(),
    limit: validators.number({ min: 1, max: 1000 }),
  },

  'memory:graph': {
    query: validators.string(),
    limit: validators.number({ min: 1, max: 500 }),
  },

  'memory:vectors': {
    query: validators.nonEmptyString(),
    limit: validators.number({ min: 1, max: 100 }),
  },

  'memory:qdrant:browse': {
    collection: validators.string({ pattern: /^[\w-]+$/ }),
    limit: validators.number({ min: 1, max: 500 }),
    offset: validators.string(),
  },

  'memory:qdrant:search': {
    query: validators.nonEmptyString(),
    collection: validators.string({ pattern: /^[\w-]+$/ }),
    limit: validators.number({ min: 1, max: 100 }),
  },

  'memory:memgraph:search': {
    keyword: validators.nonEmptyString(),
    nodeType: validators.string({ pattern: /^[\w-]+$/ }),
    limit: validators.number({ min: 1, max: 500 }),
  },

  'memory:raw': {
    source: {
      type: 'string',
      required: true,
      enum: ['postgresql', 'memgraph', 'qdrant'],
    },
    query: validators.nonEmptyString(),
  },

  // Profile channels
  'profile:saveSettings': {
    model: validators.string(),
    maxTokens: validators.number({ min: 1, max: 200000 }),
    thinkingEnabled: validators.boolean(),
    thinkingBudget: validators.number({ min: 1000, max: 100000 }),
  },

  'profile:saveClaudemd': {
    content: validators.string({ maxLength: 100000 }),
  },

  'profile:toggleRule': {
    name: validators.nonEmptyString(),
    enabled: { type: 'boolean', required: true },
  },

  'profile:saveRule': {
    path: validators.filePath(),
    content: validators.string({ maxLength: 100000 }),
  },

  // Profiles (multi-profile management)
  'profiles:get': {
    id: validators.id(),
  },

  'profiles:delete': {
    id: validators.id(),
  },

  'profiles:activate': {
    id: validators.id(),
  },

  // Context channels
  'context:setAutoCompact': {
    enabled: { type: 'boolean', required: true },
  },

  // Services channels
  'services:systemdAction': {
    name: validators.nonEmptyString(),
    action: { type: 'string', required: true, enum: ['start', 'stop', 'restart'] },
  },

  'services:podmanAction': {
    id: validators.id(),
    action: { type: 'string', required: true, enum: ['start', 'stop', 'restart'] },
  },

  // Logs channels
  'logs:recent': {
    limit: validators.number({ min: 1, max: 10000 }),
  },

  'logs:stream': {
    sources: validators.array(validators.nonEmptyString()),
  },

  // Ollama channels
  'ollama:pull': {
    model: validators.nonEmptyString(),
  },

  'ollama:delete': {
    model: validators.nonEmptyString(),
  },

  'ollama:run': {
    model: validators.nonEmptyString(),
  },

  'ollama:stop': {
    model: validators.nonEmptyString(),
  },

  // Agent channels
  'agents:spawn': {
    type: {
      type: 'string',
      required: true,
      enum: ['coder', 'researcher', 'tester', 'architect', 'coordinator', 'security'],
    },
    name: validators.nonEmptyString(),
  },

  'agents:terminate': {
    id: validators.id(),
  },

  'agents:initSwarm': {
    topology: {
      type: 'string',
      required: true,
      enum: ['mesh', 'hierarchical', 'ring', 'star'],
    },
  },

  // Chat channels
  'chat:send': {
    projectPath: validators.filePath(),
    message: validators.nonEmptyString(),
    messageId: validators.id(),
  },

  // Settings channels
  'settings:save': {
    settings: validators.object(undefined, { required: true }),
  },

  // Shell channels
  'shell:openPath': {
    path: validators.filePath(),
  },

  'shell:openExternal': {
    url: validators.url(),
  },

  // Terminal channels
  'terminal:write': {
    id: validators.id(),
    data: validators.string({ maxLength: 10000 }),
  },

  'terminal:resize': {
    id: validators.id(),
    cols: validators.number({ min: 1, max: 500 }),
    rows: validators.number({ min: 1, max: 200 }),
  },

  'terminal:close': {
    id: validators.id(),
  },

  'terminal:openAt': {
    path: validators.filePath(),
  },

  // Sessions channels
  'sessions:get': {
    sessionId: validators.nonEmptyString(),
  },

  'sessions:getMessages': {
    sessionId: validators.nonEmptyString(),
    limit: validators.number({ min: 1, max: 10000 }),
  },

  'sessions:watch': {
    enable: { type: 'boolean', required: true },
  },
}

/**
 * Validate IPC input for a specific channel
 */
export function validateIPCInput<T>(
  channel: string,
  args: unknown[]
): T {
  const schema = ipcSchemas[channel]
  if (!schema) {
    // No validation schema defined, allow through
    return args as unknown as T
  }

  // Convert array args to object based on schema keys
  const keys = Object.keys(schema)
  const input: Record<string, unknown> = {}
  keys.forEach((key, index) => {
    input[key] = args[index]
  })

  return validate<T>(input, schema, channel)
}

/**
 * Sanitize string input to prevent injection
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, '') // Remove control characters
    .trim()
}

/**
 * Sanitize path to prevent traversal
 */
export function sanitizePath(input: string): string {
  return input
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*]/g, '') // Remove invalid path characters
    .trim()
}
