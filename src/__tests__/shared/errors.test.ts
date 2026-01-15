import { describe, it, expect } from 'vitest'
import {
  AppError,
  IPCError,
  FilesystemError,
  NetworkError,
  DatabaseError,
  ProcessError,
  ValidationError,
  UIError,
  ServiceUnavailableError,
  ok,
  err,
  tryCatch,
  isOperationalError,
  getErrorMessage,
  getErrorCode,
} from '@shared/errors'

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error', {
        context: { operation: 'test' },
      })

      expect(error.message).toBe('Test error')
      expect(error.code).toBe('ERR_UNKNOWN')
      expect(error.severity).toBe('error')
      expect(error.category).toBe('unknown')
      expect(error.isOperational).toBe(true)
      expect(error.timestamp).toBeDefined()
      expect(error.name).toBe('AppError')
    })

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', {
        code: 'ERR_CUSTOM',
        severity: 'critical',
        category: 'network',
        context: { operation: 'custom', component: 'test' },
        isOperational: false,
      })

      expect(error.code).toBe('ERR_CUSTOM')
      expect(error.severity).toBe('critical')
      expect(error.category).toBe('network')
      expect(error.context.component).toBe('test')
      expect(error.isOperational).toBe(false)
    })

    it('should serialize to JSON correctly', () => {
      const error = new AppError('JSON test', {
        code: 'ERR_JSON',
        context: { operation: 'json' },
      })

      const json = error.toJSON()

      expect(json.name).toBe('AppError')
      expect(json.message).toBe('JSON test')
      expect(json.code).toBe('ERR_JSON')
      expect(json.timestamp).toBeDefined()
    })

    it('should capture stack trace', () => {
      const error = new AppError('Stack test', {
        context: { operation: 'stack' },
      })

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AppError')
    })

    it('should preserve cause error', () => {
      const cause = new Error('Original error')
      const error = new AppError('Wrapped error', {
        context: { operation: 'wrap' },
        cause,
      })

      expect(error.cause).toBe(cause)
    })
  })

  describe('IPCError', () => {
    it('should create IPC error with channel info', () => {
      const error = new IPCError('IPC failed', {
        channel: 'test:channel',
        metadata: { arg: 'value' },
      })

      expect(error.code).toBe('ERR_IPC')
      expect(error.category).toBe('ipc')
      expect(error.context.operation).toBe('ipc:test:channel')
      expect(error.context.metadata).toEqual({ arg: 'value' })
    })
  })

  describe('FilesystemError', () => {
    it('should create filesystem error with path and operation', () => {
      const error = new FilesystemError('Read failed', {
        path: '/test/path',
        operation: 'read',
      })

      expect(error.code).toBe('ERR_FILESYSTEM')
      expect(error.category).toBe('filesystem')
      expect(error.context.operation).toBe('fs:read')
      expect(error.context.metadata).toEqual({ path: '/test/path' })
    })
  })

  describe('NetworkError', () => {
    it('should create network error with endpoint', () => {
      const error = new NetworkError('Connection failed', {
        endpoint: 'https://api.example.com',
        statusCode: 500,
      })

      expect(error.code).toBe('ERR_NETWORK')
      expect(error.severity).toBe('critical') // 500+ is critical
      expect(error.statusCode).toBe(500)
      expect(error.endpoint).toBe('https://api.example.com')
    })

    it('should set error severity for 4xx errors', () => {
      const error = new NetworkError('Not found', {
        endpoint: 'https://api.example.com',
        statusCode: 404,
      })

      expect(error.severity).toBe('error')
    })
  })

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Query failed', {
        database: 'postgresql',
        operation: 'select',
      })

      expect(error.code).toBe('ERR_DATABASE')
      expect(error.category).toBe('database')
      expect(error.context.operation).toBe('db:postgresql:select')
    })
  })

  describe('ProcessError', () => {
    it('should create process error', () => {
      const error = new ProcessError('Process failed', {
        command: 'npm test',
        exitCode: 1,
      })

      expect(error.code).toBe('ERR_PROCESS')
      expect(error.category).toBe('process')
      expect(error.exitCode).toBe(1)
    })

    it('should set warning severity for exit code 0', () => {
      const error = new ProcessError('Process warning', {
        command: 'npm test',
        exitCode: 0,
      })

      expect(error.severity).toBe('warning')
    })
  })

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input', {
        field: 'email',
        value: 'invalid',
        operation: 'validate',
      })

      expect(error.code).toBe('ERR_VALIDATION')
      expect(error.category).toBe('validation')
      expect(error.severity).toBe('warning')
      expect(error.field).toBe('email')
      expect(error.value).toBe('invalid')
    })
  })

  describe('UIError', () => {
    it('should create UI error', () => {
      const error = new UIError('Render failed', {
        component: 'Dashboard',
      })

      expect(error.code).toBe('ERR_UI')
      expect(error.category).toBe('ui')
      expect(error.context.component).toBe('Dashboard')
    })
  })

  describe('ServiceUnavailableError', () => {
    it('should create service unavailable error', () => {
      const error = new ServiceUnavailableError('Service down', {
        service: 'memgraph',
        fallback: 'Using mock data',
      })

      expect(error.code).toBe('ERR_SERVICE_UNAVAILABLE')
      expect(error.severity).toBe('warning')
      expect(error.context.metadata?.fallback).toBe('Using mock data')
    })
  })
})

describe('Result Type Helpers', () => {
  describe('ok', () => {
    it('should create success result', () => {
      const result = ok({ data: 'test' })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ data: 'test' })
      }
    })
  })

  describe('err', () => {
    it('should create error result', () => {
      const error = new AppError('Test', { context: { operation: 'test' } })
      const result = err(error)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe(error)
      }
    })
  })

  describe('tryCatch', () => {
    it('should return success for resolved promise', async () => {
      const result = await tryCatch(
        async () => 'success',
        { operation: 'test' }
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('success')
      }
    })

    it('should return error for rejected promise', async () => {
      const result = await tryCatch(
        async () => {
          throw new Error('Failed')
        },
        { operation: 'test' }
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toBe('Failed')
      }
    })
  })
})

describe('Helper Functions', () => {
  describe('isOperationalError', () => {
    it('should return true for operational AppError', () => {
      const error = new AppError('Test', {
        context: { operation: 'test' },
        isOperational: true,
      })

      expect(isOperationalError(error)).toBe(true)
    })

    it('should return false for non-operational AppError', () => {
      const error = new AppError('Test', {
        context: { operation: 'test' },
        isOperational: false,
      })

      expect(isOperationalError(error)).toBe(false)
    })

    it('should return false for regular Error', () => {
      const error = new Error('Test')

      expect(isOperationalError(error)).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      expect(getErrorMessage(new Error('Test message'))).toBe('Test message')
    })

    it('should return string as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error')
    })

    it('should return default for unknown types', () => {
      expect(getErrorMessage(123)).toBe('An unknown error occurred')
      expect(getErrorMessage(null)).toBe('An unknown error occurred')
    })
  })

  describe('getErrorCode', () => {
    it('should return code from AppError', () => {
      const error = new AppError('Test', {
        code: 'ERR_CUSTOM',
        context: { operation: 'test' },
      })

      expect(getErrorCode(error)).toBe('ERR_CUSTOM')
    })

    it('should return ERR_UNKNOWN for regular Error', () => {
      expect(getErrorCode(new Error('Test'))).toBe('ERR_UNKNOWN')
    })
  })
})
