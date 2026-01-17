/**
 * OpenTelemetry Observability Service
 * Distributed tracing, metrics, and log correlation for Claude Pilot
 * Feature: deploy-rjvh
 */

import { EventEmitter } from 'events'
import { app } from 'electron'

// Trace and span types (simplified OTEL-compatible format)
export interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId?: string
  traceFlags: number
}

export interface SpanEvent {
  name: string
  timestamp: number
  attributes?: Record<string, SpanAttributeValue>
}

export type SpanAttributeValue = string | number | boolean | string[] | number[] | boolean[]

export interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startTime: number
  endTime?: number
  status: SpanStatus
  attributes: Record<string, SpanAttributeValue>
  events: SpanEvent[]
  links: SpanLink[]
}

export interface SpanLink {
  traceId: string
  spanId: string
  attributes?: Record<string, SpanAttributeValue>
}

export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer'

export interface SpanStatus {
  code: 'unset' | 'ok' | 'error'
  message?: string
}

// Metrics types
export interface MetricPoint {
  timestamp: number
  value: number
  attributes?: Record<string, string>
}

export interface Metric {
  name: string
  description: string
  unit: string
  type: 'counter' | 'gauge' | 'histogram' | 'summary'
  points: MetricPoint[]
}

export interface HistogramBucket {
  boundary: number
  count: number
}

export interface HistogramMetric extends Metric {
  type: 'histogram'
  buckets: number[]
  counts: number[]
  sum: number
  count: number
  min: number
  max: number
}

// Export configuration
export interface ExporterConfig {
  type: 'console' | 'otlp' | 'jaeger' | 'zipkin' | 'prometheus'
  endpoint?: string
  headers?: Record<string, string>
  enabled: boolean
}

export interface ObservabilityConfig {
  serviceName: string
  serviceVersion: string
  environment: string
  traceExporter?: ExporterConfig
  metricsExporter?: ExporterConfig
  sampleRate: number // 0.0 to 1.0
  enableAutoInstrumentation: boolean
  maxSpansPerTrace: number
  maxAttributeLength: number
  enabledInstrumentations: string[]
}

export interface ObservabilityStats {
  tracesCreated: number
  spansCreated: number
  spansExported: number
  metricsRecorded: number
  errorsRecorded: number
  exportErrors: number
  activeSpans: number
  uptime: number
}

// Default histogram buckets (latency in ms)
const DEFAULT_LATENCY_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

const DEFAULT_CONFIG: ObservabilityConfig = {
  serviceName: 'claude-pilot',
  serviceVersion: app.getVersion(),
  environment: process.env.NODE_ENV || 'development',
  sampleRate: 1.0,
  enableAutoInstrumentation: true,
  maxSpansPerTrace: 1000,
  maxAttributeLength: 2048,
  enabledInstrumentations: ['ipc', 'database', 'mcp', 'http'],
}

/**
 * Generate a 128-bit trace ID (32 hex chars)
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a 64-bit span ID (16 hex chars)
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

class ObservabilityService extends EventEmitter {
  private config: ObservabilityConfig = DEFAULT_CONFIG
  private activeSpans: Map<string, SpanData> = new Map()
  private completedSpans: SpanData[] = []
  private metrics: Map<string, Metric> = new Map()
  private histograms: Map<string, HistogramMetric> = new Map()
  private counters: Map<string, number> = new Map()
  private gauges: Map<string, number> = new Map()
  private stats: ObservabilityStats = {
    tracesCreated: 0,
    spansCreated: 0,
    spansExported: 0,
    metricsRecorded: 0,
    errorsRecorded: 0,
    exportErrors: 0,
    activeSpans: 0,
    uptime: Date.now(),
  }
  private initialized = false
  private exportTimer?: NodeJS.Timeout
  private currentTraceContext: TraceContext | null = null

  /**
   * Initialize the observability service
   */
  async initialize(config?: Partial<ObservabilityConfig>): Promise<void> {
    if (this.initialized) return

    this.config = { ...DEFAULT_CONFIG, ...config }

    // Initialize standard metrics
    this.initializeStandardMetrics()

    // Start export timer (every 30 seconds)
    this.exportTimer = setInterval(() => {
      this.exportTraces()
      this.exportMetrics()
    }, 30000)

    this.initialized = true
    console.info(
      '[Observability] Initialized:',
      this.config.serviceName,
      '@',
      this.config.serviceVersion
    )
  }

  /**
   * Initialize standard application metrics
   */
  private initializeStandardMetrics(): void {
    // IPC latency histogram
    this.createHistogram('ipc.latency', 'IPC handler latency in milliseconds', 'ms')

    // Database query latency
    this.createHistogram('db.query.latency', 'Database query latency in milliseconds', 'ms')

    // MCP tool call latency
    this.createHistogram('mcp.tool.latency', 'MCP tool call latency in milliseconds', 'ms')

    // Active sessions gauge
    this.createGauge('sessions.active', 'Number of active Claude sessions', '')

    // Memory usage gauge
    this.createGauge('process.memory.heap', 'Heap memory usage in bytes', 'bytes')

    // Error counter
    this.createCounter('errors.total', 'Total number of errors', '')
  }

  /**
   * Start a new trace
   */
  startTrace(name: string, attributes?: Record<string, SpanAttributeValue>): TraceContext {
    const traceId = generateTraceId()
    const spanId = generateSpanId()

    const context: TraceContext = {
      traceId,
      spanId,
      traceFlags: this.shouldSample() ? 1 : 0,
    }

    if (context.traceFlags === 1) {
      this.startSpan(name, 'internal', context, attributes)
      this.stats.tracesCreated++
    }

    this.currentTraceContext = context
    return context
  }

  /**
   * Start a new span within a trace
   */
  startSpan(
    name: string,
    kind: SpanKind = 'internal',
    context?: TraceContext,
    attributes?: Record<string, SpanAttributeValue>
  ): string {
    const spanId = generateSpanId()
    const traceId = context?.traceId || this.currentTraceContext?.traceId || generateTraceId()
    const parentSpanId = context?.spanId || this.currentTraceContext?.spanId

    const span: SpanData = {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      startTime: Date.now(),
      status: { code: 'unset' },
      attributes: {
        'service.name': this.config.serviceName,
        'service.version': this.config.serviceVersion,
        'deployment.environment': this.config.environment,
        ...(attributes || {}),
      },
      events: [],
      links: [],
    }

    this.activeSpans.set(spanId, span)
    this.stats.spansCreated++
    this.stats.activeSpans = this.activeSpans.size

    this.emit('span:started', span)
    return spanId
  }

  /**
   * End a span
   */
  endSpan(
    spanId: string,
    status?: SpanStatus,
    attributes?: Record<string, SpanAttributeValue>
  ): void {
    const span = this.activeSpans.get(spanId)
    if (!span) {
      console.warn('[Observability] Attempted to end unknown span:', spanId)
      return
    }

    span.endTime = Date.now()
    span.status = status || { code: 'ok' }

    if (attributes) {
      Object.assign(span.attributes, attributes)
    }

    // Calculate duration and record latency
    const duration = span.endTime - span.startTime
    span.attributes['duration.ms'] = duration

    this.activeSpans.delete(spanId)
    this.completedSpans.push(span)
    this.stats.activeSpans = this.activeSpans.size

    // Auto-record latency metrics based on span attributes
    if (span.attributes['ipc.channel']) {
      this.recordHistogram('ipc.latency', duration, {
        channel: String(span.attributes['ipc.channel']),
      })
    } else if (span.attributes['db.system']) {
      this.recordHistogram('db.query.latency', duration, {
        system: String(span.attributes['db.system']),
      })
    } else if (span.attributes['mcp.tool']) {
      this.recordHistogram('mcp.tool.latency', duration, {
        tool: String(span.attributes['mcp.tool']),
      })
    }

    if (status?.code === 'error') {
      this.stats.errorsRecorded++
      this.incrementCounter('errors.total', { type: span.name })
    }

    this.emit('span:ended', span)
  }

  /**
   * Add an event to a span
   */
  addSpanEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, SpanAttributeValue>
  ): void {
    const span = this.activeSpans.get(spanId)
    if (!span) return

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    })
  }

  /**
   * Set span attributes
   */
  setSpanAttributes(spanId: string, attributes: Record<string, SpanAttributeValue>): void {
    const span = this.activeSpans.get(spanId)
    if (!span) return

    Object.assign(span.attributes, attributes)
  }

  /**
   * Record an exception on a span
   */
  recordException(spanId: string, error: Error): void {
    const span = this.activeSpans.get(spanId)
    if (!span) return

    span.events.push({
      name: 'exception',
      timestamp: Date.now(),
      attributes: {
        'exception.type': error.name,
        'exception.message': error.message,
        'exception.stacktrace': error.stack || '',
      },
    })

    span.status = {
      code: 'error',
      message: error.message,
    }
  }

  /**
   * Create a histogram metric
   */
  createHistogram(
    name: string,
    description: string,
    unit: string,
    buckets: number[] = DEFAULT_LATENCY_BUCKETS
  ): void {
    this.histograms.set(name, {
      name,
      description,
      unit,
      type: 'histogram',
      points: [],
      buckets,
      counts: new Array(buckets.length + 1).fill(0),
      sum: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
    })
  }

  /**
   * Record a histogram value
   */
  recordHistogram(
    name: string,
    value: number,
    attributes?: Record<string, string>
  ): void {
    const histogram = this.histograms.get(name)
    if (!histogram) return

    histogram.points.push({
      timestamp: Date.now(),
      value,
      attributes,
    })

    histogram.sum += value
    histogram.count++
    histogram.min = Math.min(histogram.min, value)
    histogram.max = Math.max(histogram.max, value)

    // Find bucket
    let bucketIndex = histogram.buckets.length
    for (let i = 0; i < histogram.buckets.length; i++) {
      if (value <= histogram.buckets[i]) {
        bucketIndex = i
        break
      }
    }
    histogram.counts[bucketIndex]++

    this.stats.metricsRecorded++
  }

  /**
   * Create a counter metric
   */
  createCounter(name: string, description: string, unit: string): void {
    this.metrics.set(name, {
      name,
      description,
      unit,
      type: 'counter',
      points: [],
    })
    this.counters.set(name, 0)
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, attributes?: Record<string, string>, value = 1): void {
    const current = this.counters.get(name) || 0
    this.counters.set(name, current + value)

    const metric = this.metrics.get(name)
    if (metric) {
      metric.points.push({
        timestamp: Date.now(),
        value: current + value,
        attributes,
      })
    }

    this.stats.metricsRecorded++
  }

  /**
   * Create a gauge metric
   */
  createGauge(name: string, description: string, unit: string): void {
    this.metrics.set(name, {
      name,
      description,
      unit,
      type: 'gauge',
      points: [],
    })
    this.gauges.set(name, 0)
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, attributes?: Record<string, string>): void {
    this.gauges.set(name, value)

    const metric = this.metrics.get(name)
    if (metric) {
      metric.points.push({
        timestamp: Date.now(),
        value,
        attributes,
      })
    }

    this.stats.metricsRecorded++
  }

  /**
   * Determine if this trace should be sampled
   */
  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate
  }

  /**
   * Export traces (currently to console, can be extended to OTLP)
   */
  private async exportTraces(): Promise<void> {
    if (this.completedSpans.length === 0) return

    const spansToExport = [...this.completedSpans]
    this.completedSpans = []

    try {
      // For now, emit for local consumption
      // In production, would send to OTLP endpoint
      if (this.config.traceExporter?.type === 'console') {
        for (const span of spansToExport) {
          console.info('[Trace]', JSON.stringify(span))
        }
      }

      this.stats.spansExported += spansToExport.length
      this.emit('traces:exported', spansToExport.length)
    } catch (error) {
      this.stats.exportErrors++
      console.error('[Observability] Failed to export traces:', error)
    }
  }

  /**
   * Export metrics (currently to console, can be extended to Prometheus)
   */
  private async exportMetrics(): Promise<void> {
    try {
      if (this.config.metricsExporter?.type === 'console') {
        for (const [name, metric] of this.metrics) {
          console.info('[Metric]', name, metric.type, this.counters.get(name) || this.gauges.get(name))
        }
        for (const [name, histogram] of this.histograms) {
          console.info('[Histogram]', name, {
            count: histogram.count,
            sum: histogram.sum,
            min: histogram.min,
            max: histogram.max,
            avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
          })
        }
      }

      this.emit('metrics:exported')
    } catch (error) {
      this.stats.exportErrors++
      console.error('[Observability] Failed to export metrics:', error)
    }
  }

  /**
   * Get current trace context
   */
  getTraceContext(): TraceContext | null {
    return this.currentTraceContext
  }

  /**
   * Set current trace context (for context propagation)
   */
  setTraceContext(context: TraceContext | null): void {
    this.currentTraceContext = context
  }

  /**
   * Create W3C Trace Context header
   */
  getTraceparentHeader(): string | null {
    if (!this.currentTraceContext) return null

    const { traceId, spanId, traceFlags } = this.currentTraceContext
    return `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, '0')}`
  }

  /**
   * Parse W3C Trace Context header
   */
  parseTraceparentHeader(header: string): TraceContext | null {
    const parts = header.split('-')
    if (parts.length !== 4 || parts[0] !== '00') return null

    return {
      traceId: parts[1],
      spanId: parts[2],
      traceFlags: parseInt(parts[3], 16),
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): { counters: Record<string, number>; gauges: Record<string, number>; histograms: Record<string, HistogramMetric> } {
    const countersObj: Record<string, number> = {}
    const gaugesObj: Record<string, number> = {}
    const histogramsObj: Record<string, HistogramMetric> = {}

    this.counters.forEach((value, key) => {
      countersObj[key] = value
    })
    this.gauges.forEach((value, key) => {
      gaugesObj[key] = value
    })
    this.histograms.forEach((value, key) => {
      histogramsObj[key] = { ...value }
    })

    return { counters: countersObj, gauges: gaugesObj, histograms: histogramsObj }
  }

  /**
   * Get recent spans for debugging
   */
  getRecentSpans(limit = 100): SpanData[] {
    return this.completedSpans.slice(-limit)
  }

  /**
   * Get active spans
   */
  getActiveSpans(): SpanData[] {
    return Array.from(this.activeSpans.values())
  }

  /**
   * Get statistics
   */
  getStats(): ObservabilityStats {
    return { ...this.stats, uptime: Date.now() - this.stats.uptime }
  }

  /**
   * Get configuration
   */
  getConfig(): ObservabilityConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ObservabilityConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Utility: Trace an async function
   */
  async traceAsync<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, SpanAttributeValue>
  ): Promise<T> {
    const spanId = this.startSpan(name, 'internal', undefined, attributes)
    try {
      const result = await fn()
      this.endSpan(spanId, { code: 'ok' })
      return result
    } catch (error) {
      this.recordException(spanId, error as Error)
      this.endSpan(spanId, { code: 'error', message: (error as Error).message })
      throw error
    }
  }

  /**
   * Utility: Create IPC handler wrapper with tracing
   */
  wrapIPCHandler<T>(
    channel: string,
    handler: (...args: unknown[]) => Promise<T> | T
  ): (...args: unknown[]) => Promise<T> {
    return async (...args: unknown[]): Promise<T> => {
      const spanId = this.startSpan(`ipc.${channel}`, 'server', undefined, {
        'ipc.channel': channel,
        'ipc.args_count': args.length,
      })

      try {
        const result = await handler(...args)
        this.endSpan(spanId, { code: 'ok' })
        return result
      } catch (error) {
        this.recordException(spanId, error as Error)
        this.endSpan(spanId, { code: 'error', message: (error as Error).message })
        throw error
      }
    }
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer)
    }

    // Final export
    this.exportTraces()
    this.exportMetrics()

    this.initialized = false
    console.info('[Observability] Shutdown complete')
  }
}

// Export singleton
export const observabilityService = new ObservabilityService()

// Export class for testing
export { ObservabilityService }
