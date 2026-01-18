/**
 * Interactive Worker - High-Priority Task Processing
 *
 * Handles time-sensitive operations that need quick response:
 * - Real-time embedding generation
 * - Quick file analysis
 * - User-facing computations
 *
 * Uses SharedArrayBuffer when available for zero-copy data transfer.
 *
 * @see docs/Research/Electron Worker Thread Optimization Strategies.md
 */

const { workerData } = require('worker_threads')

// Verify pool configuration
if (workerData?.poolType !== 'interactive') {
  console.warn('[InteractiveWorker] Running with unexpected pool type:', workerData?.poolType)
}

/**
 * Task handlers for interactive operations
 */
const taskHandlers = {
  /**
   * Compute text embedding hash (placeholder for actual embedding)
   * In production, this would call Ollama or other embedding service
   */
  async computeEmbeddingHash(data) {
    const { text } = data
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input for embedding')
    }

    // Simple hash computation (placeholder)
    // In production: Call embedding model via MessagePort
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }

    return {
      hash,
      length: text.length,
      timestamp: Date.now(),
    }
  },

  /**
   * Analyze file content structure
   */
  async analyzeFileStructure(data) {
    const { content, filename } = data
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content for file analysis')
    }

    const lines = content.split('\n')
    const stats = {
      filename,
      lineCount: lines.length,
      charCount: content.length,
      emptyLines: lines.filter((l) => l.trim() === '').length,
      avgLineLength: content.length / lines.length,
    }

    // Detect file type by extension or content
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase()
      stats.extension = ext
      stats.fileType = getFileType(ext)
    }

    return stats
  },

  /**
   * Tokenize text for processing
   */
  async tokenize(data) {
    const { text, options = {} } = data
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input for tokenization')
    }

    const { lowercase = true, removeStopwords = false } = options

    // Simple tokenization
    let tokens = text.split(/\s+/).filter((t) => t.length > 0)

    if (lowercase) {
      tokens = tokens.map((t) => t.toLowerCase())
    }

    if (removeStopwords) {
      const stopwords = new Set([
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'for',
        'of',
        'with',
        'by',
      ])
      tokens = tokens.filter((t) => !stopwords.has(t))
    }

    return {
      tokens,
      count: tokens.length,
      unique: new Set(tokens).size,
    }
  },

  /**
   * Process SharedArrayBuffer data (when COOP/COEP enabled)
   */
  async processSharedBuffer(data) {
    const { buffer, offset = 0, length } = data

    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error('Expected SharedArrayBuffer')
    }

    const view = new Uint8Array(buffer, offset, length)

    // Example: Compute checksum of buffer
    let checksum = 0
    for (let i = 0; i < view.length; i++) {
      checksum = (checksum + view[i]) & 0xffffffff
    }

    return {
      checksum,
      length: view.length,
      firstByte: view[0],
      lastByte: view[view.length - 1],
    }
  },

  /**
   * Ping-pong buffer reuse pattern
   * Returns data to be recycled for next operation
   */
  async pingPong(data) {
    const { inputBuffer, operation } = data

    // Process input buffer
    const result = await taskHandlers[operation]?.(data)

    // Return buffer for reuse (zero-copy when using Transferable)
    return {
      result,
      recycledBuffer: inputBuffer,
    }
  },
}

/**
 * Get file type from extension
 */
function getFileType(ext) {
  const typeMap = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c-header',
    hpp: 'cpp-header',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    txt: 'text',
    html: 'html',
    css: 'css',
    sql: 'sql',
  }
  return typeMap[ext] || 'unknown'
}

/**
 * Main task dispatcher
 */
module.exports = async function ({ task, data }) {
  const handler = taskHandlers[task]

  if (!handler) {
    throw new Error(`Unknown interactive task: ${task}`)
  }

  const start = performance.now()
  const result = await handler(data)
  const duration = performance.now() - start

  return {
    ...result,
    _meta: {
      task,
      duration,
      poolType: 'interactive',
      timestamp: Date.now(),
    },
  }
}
