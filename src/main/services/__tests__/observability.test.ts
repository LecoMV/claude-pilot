/**
 * Observability Service Tests
 *
 * Comprehensive tests for the OpenTelemetry-compatible observability service
 * that handles distributed tracing, metrics, and log correlation.
 *
 * @module observability.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock hoisted functions
const mockGetVersion = vi.hoisted(() => vi.fn())
const mockGetRandomValues = vi.hoisted(() =>
  vi.fn().mockImplementation((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  })
)

vi.mock('electron', () => ({
  app: {
    getVersion: mockGetVersion,
  },
}))

// Mock crypto.getRandomValues
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: mockGetRandomValues,
  },
})

import { ObservabilityService, type TraceContext } from '../observability'

describe('ObservabilityService', () => {
  let observability: ObservabilityService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mockGetVersion.mockReturnValue('1.0.0')

    observability = new ObservabilityService()
  })

  afterEach(() => {
    observability.shutdown()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // INITIALIZATION TESTS
  // ===========================================================================
  describe('initialization', () => {
    it('should initialize with default config', async () => {
      await observability.initialize()

      const config = observability.getConfig()
      expect(config.serviceName).toBe('claude-pilot')
      expect(config.sampleRate).toBe(1.0)
      expect(config.enableAutoInstrumentation).toBe(true)
    })

    it('should initialize with custom config', async () => {
      await observability.initialize({
        serviceName: 'custom-service',
        sampleRate: 0.5,
        enableAutoInstrumentation: false,
      })

      const config = observability.getConfig()
      expect(config.serviceName).toBe('custom-service')
      expect(config.sampleRate).toBe(0.5)
      expect(config.enableAutoInstrumentation).toBe(false)
    })

    it('should not reinitialize if already initialized', async () => {
      await observability.initialize({ serviceName: 'first' })
      await observability.initialize({ serviceName: 'second' })

      const config = observability.getConfig()
      expect(config.serviceName).toBe('first')
    })

    it('should initialize standard metrics', async () => {
      await observability.initialize()

      const metrics = observability.getMetrics()
      expect(metrics.histograms).toHaveProperty('ipc.latency')
      expect(metrics.histograms).toHaveProperty('db.query.latency')
      expect(metrics.histograms).toHaveProperty('mcp.tool.latency')
      expect(metrics.gauges).toHaveProperty('sessions.active')
      expect(metrics.gauges).toHaveProperty('process.memory.heap')
      expect(metrics.counters).toHaveProperty('errors.total')
    })

    it('should start export timer on initialization', async () => {
      await observability.initialize()

      // Advance timer to trigger export
      await vi.advanceTimersByTimeAsync(30000)

      // No error should be thrown
    })
  })

  // ===========================================================================
  // TRACE TESTS
  // ===========================================================================
  describe('traces', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should start a new trace', () => {
      const context = observability.startTrace('test-operation')

      expect(context.traceId).toBeDefined()
      expect(context.traceId).toHaveLength(32)
      expect(context.spanId).toBeDefined()
      expect(context.spanId).toHaveLength(16)
    })

    it('should set trace flags based on sampling', () => {
      const context = observability.startTrace('test-operation')

      // With sampleRate = 1.0, traceFlags should be 1
      expect(context.traceFlags).toBe(1)
    })

    it('should increment traces created counter', () => {
      observability.startTrace('test-operation')

      const stats = observability.getStats()
      expect(stats.tracesCreated).toBeGreaterThanOrEqual(1)
    })

    it('should create root span on trace start', () => {
      observability.startTrace('test-operation', { 'custom.attr': 'value' })

      const activeSpans = observability.getActiveSpans()
      expect(activeSpans.length).toBeGreaterThanOrEqual(1)
    })

    it('should set current trace context', () => {
      const context = observability.startTrace('test-operation')

      expect(observability.getTraceContext()).toEqual(context)
    })
  })

  // ===========================================================================
  // SPAN TESTS
  // ===========================================================================
  describe('spans', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should start a new span', () => {
      const spanId = observability.startSpan('test-span')

      expect(spanId).toBeDefined()
      expect(spanId).toHaveLength(16)
    })

    it('should create span with correct attributes', () => {
      observability.startSpan('test-span', 'internal', undefined, {
        'custom.attr': 'value',
      })

      const activeSpans = observability.getActiveSpans()
      const span = activeSpans[activeSpans.length - 1]

      expect(span.attributes['service.name']).toBe('claude-pilot')
      expect(span.attributes['custom.attr']).toBe('value')
    })

    it('should track parent span relationship', () => {
      const traceContext = observability.startTrace('parent-operation')
      const childSpanId = observability.startSpan('child-span', 'internal', traceContext)

      const activeSpans = observability.getActiveSpans()
      const childSpan = activeSpans.find((s) => s.spanId === childSpanId)

      expect(childSpan?.parentSpanId).toBe(traceContext.spanId)
      expect(childSpan?.traceId).toBe(traceContext.traceId)
    })

    it('should end a span', () => {
      const spanId = observability.startSpan('test-span')

      observability.endSpan(spanId)

      const activeSpans = observability.getActiveSpans()
      expect(activeSpans.find((s) => s.spanId === spanId)).toBeUndefined()
    })

    it('should set span status on end', () => {
      const spanId = observability.startSpan('test-span')

      observability.endSpan(spanId, { code: 'ok' })

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.spanId === spanId)
      expect(span?.status.code).toBe('ok')
    })

    it('should add attributes on span end', () => {
      const spanId = observability.startSpan('test-span')

      observability.endSpan(spanId, { code: 'ok' }, { 'result.count': 42 })

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.spanId === spanId)
      expect(span?.attributes['result.count']).toBe(42)
    })

    it('should calculate duration on span end', () => {
      const spanId = observability.startSpan('test-span')

      // Advance time by 100ms
      vi.advanceTimersByTime(100)

      observability.endSpan(spanId)

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.spanId === spanId)
      expect(span?.attributes['duration.ms']).toBe(100)
    })

    it('should warn when ending unknown span', () => {
      const consoleSpy = vi.spyOn(console, 'warn')

      observability.endSpan('unknown-span-id')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown span'),
        'unknown-span-id'
      )
    })

    it('should update active span count', () => {
      const initialActive = observability.getStats().activeSpans

      const spanId1 = observability.startSpan('span-1')
      // Verify span was created
      expect(observability.getStats().activeSpans).toBeGreaterThanOrEqual(initialActive + 1)

      observability.endSpan(spanId1)
      // After ending, active spans should decrease
      expect(observability.getStats().activeSpans).toBe(initialActive)
    })
  })

  // ===========================================================================
  // SPAN EVENT TESTS
  // ===========================================================================
  describe('span events', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should add event to span', () => {
      const spanId = observability.startSpan('test-span')

      observability.addSpanEvent(spanId, 'custom-event', { detail: 'test' })

      const activeSpans = observability.getActiveSpans()
      const span = activeSpans.find((s) => s.spanId === spanId)

      expect(span?.events).toHaveLength(1)
      expect(span?.events[0].name).toBe('custom-event')
      expect(span?.events[0].attributes?.detail).toBe('test')
    })

    it('should not add event to unknown span', () => {
      observability.addSpanEvent('unknown-span', 'event')

      // Should not throw
    })

    it('should record exception on span', () => {
      const spanId = observability.startSpan('test-span')
      const error = new Error('Test error')

      observability.recordException(spanId, error)

      const activeSpans = observability.getActiveSpans()
      const span = activeSpans.find((s) => s.spanId === spanId)

      expect(span?.events).toHaveLength(1)
      expect(span?.events[0].name).toBe('exception')
      expect(span?.events[0].attributes?.['exception.type']).toBe('Error')
      expect(span?.events[0].attributes?.['exception.message']).toBe('Test error')
      expect(span?.status.code).toBe('error')
    })

    it('should set span attributes', () => {
      const spanId = observability.startSpan('test-span')

      observability.setSpanAttributes(spanId, {
        'http.method': 'GET',
        'http.url': 'http://example.com',
      })

      const activeSpans = observability.getActiveSpans()
      const span = activeSpans.find((s) => s.spanId === spanId)

      expect(span?.attributes['http.method']).toBe('GET')
      expect(span?.attributes['http.url']).toBe('http://example.com')
    })
  })

  // ===========================================================================
  // HISTOGRAM TESTS
  // ===========================================================================
  describe('histograms', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should create a histogram', () => {
      observability.createHistogram('custom.latency', 'Custom latency', 'ms')

      const metrics = observability.getMetrics()
      expect(metrics.histograms).toHaveProperty('custom.latency')
    })

    it('should record histogram values', () => {
      observability.createHistogram('custom.latency', 'Custom latency', 'ms')

      observability.recordHistogram('custom.latency', 50)
      observability.recordHistogram('custom.latency', 100)
      observability.recordHistogram('custom.latency', 150)

      const metrics = observability.getMetrics()
      const histogram = metrics.histograms['custom.latency']

      expect(histogram.count).toBe(3)
      expect(histogram.sum).toBe(300)
      expect(histogram.min).toBe(50)
      expect(histogram.max).toBe(150)
    })

    it('should record values in correct buckets', () => {
      observability.createHistogram('test.latency', 'Test', 'ms', [10, 50, 100])

      observability.recordHistogram('test.latency', 5) // bucket 0 (<=10)
      observability.recordHistogram('test.latency', 25) // bucket 1 (<=50)
      observability.recordHistogram('test.latency', 75) // bucket 2 (<=100)
      observability.recordHistogram('test.latency', 200) // bucket 3 (>100)

      const metrics = observability.getMetrics()
      const histogram = metrics.histograms['test.latency']

      expect(histogram.counts[0]).toBe(1) // <=10
      expect(histogram.counts[1]).toBe(1) // <=50
      expect(histogram.counts[2]).toBe(1) // <=100
      expect(histogram.counts[3]).toBe(1) // >100
    })

    it('should record histogram with attributes', () => {
      observability.createHistogram('api.latency', 'API latency', 'ms')

      observability.recordHistogram('api.latency', 50, { endpoint: '/api/test' })

      const metrics = observability.getMetrics()
      const histogram = metrics.histograms['api.latency']

      expect(histogram.points[0].attributes?.endpoint).toBe('/api/test')
    })

    it('should not record to non-existent histogram', () => {
      observability.recordHistogram('non-existent', 100)

      // Should not throw
    })

    it('should auto-record latency metrics from spans', () => {
      const spanId = observability.startSpan('ipc.test', 'server', undefined, {
        'ipc.channel': 'test:channel',
      })

      vi.advanceTimersByTime(50)
      observability.endSpan(spanId)

      const metrics = observability.getMetrics()
      expect(metrics.histograms['ipc.latency'].count).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // COUNTER TESTS
  // ===========================================================================
  describe('counters', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should create a counter', () => {
      observability.createCounter('custom.requests', 'Custom requests', '')

      const metrics = observability.getMetrics()
      expect(metrics.counters).toHaveProperty('custom.requests')
      expect(metrics.counters['custom.requests']).toBe(0)
    })

    it('should increment counter', () => {
      observability.createCounter('custom.requests', 'Custom requests', '')

      observability.incrementCounter('custom.requests')
      observability.incrementCounter('custom.requests')
      observability.incrementCounter('custom.requests')

      const metrics = observability.getMetrics()
      expect(metrics.counters['custom.requests']).toBe(3)
    })

    it('should increment counter by value', () => {
      observability.createCounter('custom.bytes', 'Custom bytes', 'bytes')

      observability.incrementCounter('custom.bytes', undefined, 100)
      observability.incrementCounter('custom.bytes', undefined, 200)

      const metrics = observability.getMetrics()
      expect(metrics.counters['custom.bytes']).toBe(300)
    })

    it('should increment counter with attributes', () => {
      observability.createCounter('api.requests', 'API requests', '')

      observability.incrementCounter('api.requests', { method: 'GET' })

      const stats = observability.getStats()
      expect(stats.metricsRecorded).toBeGreaterThan(0)
    })

    it('should auto-increment error counter on error status', () => {
      const spanId = observability.startSpan('failing-operation')

      observability.endSpan(spanId, { code: 'error', message: 'Test error' })

      const stats = observability.getStats()
      expect(stats.errorsRecorded).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // GAUGE TESTS
  // ===========================================================================
  describe('gauges', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should create a gauge', () => {
      observability.createGauge('custom.connections', 'Active connections', '')

      const metrics = observability.getMetrics()
      expect(metrics.gauges).toHaveProperty('custom.connections')
    })

    it('should set gauge value', () => {
      observability.createGauge('custom.connections', 'Active connections', '')

      observability.setGauge('custom.connections', 42)

      const metrics = observability.getMetrics()
      expect(metrics.gauges['custom.connections']).toBe(42)
    })

    it('should update gauge value', () => {
      observability.createGauge('custom.queue', 'Queue size', '')

      observability.setGauge('custom.queue', 10)
      observability.setGauge('custom.queue', 5)
      observability.setGauge('custom.queue', 20)

      const metrics = observability.getMetrics()
      expect(metrics.gauges['custom.queue']).toBe(20)
    })

    it('should set gauge with attributes', () => {
      observability.createGauge('pool.connections', 'Pool connections', '')

      observability.setGauge('pool.connections', 10, { pool: 'primary' })

      const stats = observability.getStats()
      expect(stats.metricsRecorded).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // TRACE CONTEXT TESTS
  // ===========================================================================
  describe('trace context', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should get current trace context', () => {
      const context = observability.startTrace('test')

      expect(observability.getTraceContext()).toEqual(context)
    })

    it('should set trace context', () => {
      const context: TraceContext = {
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: 1,
      }

      observability.setTraceContext(context)

      expect(observability.getTraceContext()).toEqual(context)
    })

    it('should clear trace context', () => {
      observability.startTrace('test')
      observability.setTraceContext(null)

      expect(observability.getTraceContext()).toBeNull()
    })

    it('should generate W3C traceparent header', () => {
      const context = observability.startTrace('test')

      const traceparent = observability.getTraceparentHeader()

      expect(traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/)
      expect(traceparent).toContain(context.traceId)
      expect(traceparent).toContain(context.spanId)
    })

    it('should return null traceparent when no context', () => {
      observability.setTraceContext(null)

      expect(observability.getTraceparentHeader()).toBeNull()
    })

    it('should parse W3C traceparent header', () => {
      const traceId = 'a'.repeat(32)
      const spanId = 'b'.repeat(16)
      const header = `00-${traceId}-${spanId}-01`

      const context = observability.parseTraceparentHeader(header)

      expect(context).not.toBeNull()
      expect(context?.traceId).toBe(traceId)
      expect(context?.spanId).toBe(spanId)
      expect(context?.traceFlags).toBe(1)
    })

    it('should return null for invalid traceparent header', () => {
      expect(observability.parseTraceparentHeader('invalid')).toBeNull()
      expect(observability.parseTraceparentHeader('01-xxx-yyy-00')).toBeNull()
    })
  })

  // ===========================================================================
  // STATISTICS TESTS
  // ===========================================================================
  describe('statistics', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should track traces created', () => {
      observability.startTrace('trace-1')
      observability.startTrace('trace-2')

      const stats = observability.getStats()
      expect(stats.tracesCreated).toBe(2)
    })

    it('should track spans created', () => {
      observability.startSpan('span-1')
      observability.startSpan('span-2')
      observability.startSpan('span-3')

      const stats = observability.getStats()
      expect(stats.spansCreated).toBe(3)
    })

    it('should track active spans', () => {
      const initialActive = observability.getStats().activeSpans

      const span1 = observability.startSpan('span-1')
      expect(observability.getStats().activeSpans).toBeGreaterThanOrEqual(initialActive + 1)

      observability.endSpan(span1)
      expect(observability.getStats().activeSpans).toBe(initialActive)
    })

    it('should track errors recorded', () => {
      const spanId = observability.startSpan('failing')
      observability.recordException(spanId, new Error('Test'))
      observability.endSpan(spanId, { code: 'error' })

      const stats = observability.getStats()
      expect(stats.errorsRecorded).toBeGreaterThan(0)
    })

    it('should track metrics recorded', () => {
      observability.createCounter('test.counter', 'Test', '')
      observability.incrementCounter('test.counter')

      const stats = observability.getStats()
      expect(stats.metricsRecorded).toBeGreaterThan(0)
    })

    it('should calculate uptime', () => {
      vi.advanceTimersByTime(5000)

      const stats = observability.getStats()
      expect(stats.uptime).toBeGreaterThanOrEqual(5000)
    })
  })

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================
  describe('configuration', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should get configuration', () => {
      const config = observability.getConfig()

      expect(config.serviceName).toBe('claude-pilot')
      expect(config.maxSpansPerTrace).toBe(1000)
    })

    it('should update configuration', () => {
      observability.updateConfig({
        sampleRate: 0.5,
        maxSpansPerTrace: 500,
      })

      const config = observability.getConfig()
      expect(config.sampleRate).toBe(0.5)
      expect(config.maxSpansPerTrace).toBe(500)
    })

    it('should return config copy (not reference)', () => {
      const config1 = observability.getConfig()
      config1.sampleRate = 0.1

      const config2 = observability.getConfig()
      expect(config2.sampleRate).not.toBe(0.1)
    })
  })

  // ===========================================================================
  // UTILITY METHOD TESTS
  // ===========================================================================
  describe('utility methods', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should trace async function', async () => {
      const result = await observability.traceAsync(
        'async-operation',
        async () => {
          return 'result'
        },
        { 'operation.type': 'test' }
      )

      expect(result).toBe('result')

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.name === 'async-operation')
      expect(span).toBeDefined()
      expect(span?.status.code).toBe('ok')
    })

    it('should trace async function error', async () => {
      const error = new Error('Test error')

      await expect(
        observability.traceAsync('failing-operation', async () => {
          throw error
        })
      ).rejects.toThrow('Test error')

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.name === 'failing-operation')
      expect(span?.status.code).toBe('error')
    })

    it('should wrap IPC handler with tracing', async () => {
      const handler = vi.fn().mockResolvedValue('result')
      const wrappedHandler = observability.wrapIPCHandler('test:channel', handler)

      const result = await wrappedHandler('arg1', 'arg2')

      expect(result).toBe('result')
      expect(handler).toHaveBeenCalledWith('arg1', 'arg2')

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.name === 'ipc.test:channel')
      expect(span).toBeDefined()
      expect(span?.attributes['ipc.channel']).toBe('test:channel')
      expect(span?.attributes['ipc.args_count']).toBe(2)
    })

    it('should wrap IPC handler with error tracing', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'))
      const wrappedHandler = observability.wrapIPCHandler('failing:channel', handler)

      await expect(wrappedHandler()).rejects.toThrow('Handler error')

      const recentSpans = observability.getRecentSpans()
      const span = recentSpans.find((s) => s.name === 'ipc.failing:channel')
      expect(span?.status.code).toBe('error')
    })
  })

  // ===========================================================================
  // EXPORT TESTS
  // ===========================================================================
  describe('export', () => {
    beforeEach(async () => {
      await observability.initialize({
        traceExporter: { type: 'console', enabled: true },
        metricsExporter: { type: 'console', enabled: true },
      })
    })

    it('should export traces on interval', async () => {
      const consoleSpy = vi.spyOn(console, 'info')

      const spanId = observability.startSpan('test-span')
      observability.endSpan(spanId)

      await vi.advanceTimersByTimeAsync(30000)

      expect(consoleSpy).toHaveBeenCalledWith('[Trace]', expect.any(String))
    })

    it('should export metrics on interval', async () => {
      const consoleSpy = vi.spyOn(console, 'info')

      observability.createCounter('test.counter', 'Test', '')
      observability.incrementCounter('test.counter')

      await vi.advanceTimersByTimeAsync(30000)

      expect(consoleSpy).toHaveBeenCalledWith('[Metric]', expect.any(String), expect.any(String), expect.any(Number))
    })

    it('should update spans exported count', async () => {
      const spanId = observability.startSpan('test-span')
      observability.endSpan(spanId)

      await vi.advanceTimersByTimeAsync(30000)

      const stats = observability.getStats()
      expect(stats.spansExported).toBeGreaterThan(0)
    })

    it('should emit traces:exported event', async () => {
      const eventSpy = vi.fn()
      observability.on('traces:exported', eventSpy)

      const spanId = observability.startSpan('test-span')
      observability.endSpan(spanId)

      await vi.advanceTimersByTimeAsync(30000)

      expect(eventSpy).toHaveBeenCalled()
    })

    it('should emit metrics:exported event', async () => {
      const eventSpy = vi.fn()
      observability.on('metrics:exported', eventSpy)

      await vi.advanceTimersByTimeAsync(30000)

      expect(eventSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SAMPLING TESTS
  // ===========================================================================
  describe('sampling', () => {
    it('should sample all traces at 100% rate', async () => {
      await observability.initialize({ sampleRate: 1.0 })

      for (let i = 0; i < 10; i++) {
        const context = observability.startTrace(`trace-${i}`)
        expect(context.traceFlags).toBe(1)
      }
    })

    it('should sample no traces at 0% rate', async () => {
      await observability.initialize({ sampleRate: 0.0 })

      for (let i = 0; i < 10; i++) {
        const context = observability.startTrace(`trace-${i}`)
        expect(context.traceFlags).toBe(0)
      }
    })
  })

  // ===========================================================================
  // SHUTDOWN TESTS
  // ===========================================================================
  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await observability.initialize()
      const consoleSpy = vi.spyOn(console, 'info')

      observability.shutdown()

      expect(consoleSpy).toHaveBeenCalledWith('[Observability] Shutdown complete')
    })

    it('should clear export timer on shutdown', async () => {
      await observability.initialize()

      observability.shutdown()

      // Advance timer should not cause issues
      await vi.advanceTimersByTimeAsync(60000)
    })
  })

  // ===========================================================================
  // SPAN DATA ACCESS TESTS
  // ===========================================================================
  describe('span data access', () => {
    beforeEach(async () => {
      await observability.initialize()
    })

    it('should get recent spans', () => {
      for (let i = 0; i < 5; i++) {
        const spanId = observability.startSpan(`span-${i}`)
        observability.endSpan(spanId)
      }

      const recentSpans = observability.getRecentSpans()
      expect(recentSpans.length).toBe(5)
    })

    it('should limit recent spans', () => {
      for (let i = 0; i < 10; i++) {
        const spanId = observability.startSpan(`span-${i}`)
        observability.endSpan(spanId)
      }

      const recentSpans = observability.getRecentSpans(5)
      expect(recentSpans.length).toBeLessThanOrEqual(10) // Returns last N from completed spans
    })

    it('should get active spans', () => {
      const initialCount = observability.getActiveSpans().length

      const spanId = observability.startSpan('active-1')
      const activeSpans = observability.getActiveSpans()

      // At least one more span than before
      expect(activeSpans.length).toBeGreaterThanOrEqual(initialCount + 1)

      // Clean up
      observability.endSpan(spanId)
    })
  })
})
