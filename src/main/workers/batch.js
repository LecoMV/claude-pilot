/**
 * Batch Worker - Background Task Processing
 *
 * Handles CPU-intensive operations that don't need immediate response:
 * - Bulk embedding generation
 * - Codebase indexing
 * - Large file processing
 *
 * Uses SharedArrayBuffer when available for zero-copy data transfer.
 *
 * @see docs/Research/Electron Worker Thread Optimization Strategies.md
 */

const { workerData } = require('worker_threads')
const { createHash } = require('crypto')

// Verify pool configuration
if (workerData?.poolType !== 'background') {
  console.warn('[BatchWorker] Running with unexpected pool type:', workerData?.poolType)
}

/**
 * Task handlers for batch operations
 */
const taskHandlers = {
  /**
   * Bulk compute embeddings for multiple texts
   */
  async bulkComputeEmbeddings(data) {
    const { texts, options = {} } = data
    if (!Array.isArray(texts)) {
      throw new Error('Expected array of texts')
    }

    const results = []
    for (const text of texts) {
      // Placeholder embedding computation
      const hash = createHash('sha256').update(text).digest('hex')
      results.push({
        hash,
        length: text.length,
        dimensions: 384, // Placeholder dimension
      })
    }

    return {
      embeddings: results,
      count: results.length,
      options,
    }
  },

  /**
   * Index codebase files
   */
  async indexCodebase(data) {
    const { files, options = {} } = data
    if (!Array.isArray(files)) {
      throw new Error('Expected array of files')
    }

    const index = {
      files: [],
      symbols: [],
      stats: {
        totalFiles: files.length,
        totalLines: 0,
        totalChars: 0,
        byType: {},
      },
    }

    for (const file of files) {
      const { path, content, language } = file
      const lines = content.split('\n').length
      const chars = content.length

      index.files.push({
        path,
        lines,
        chars,
        language,
        hash: createHash('md5').update(content).digest('hex'),
      })

      index.stats.totalLines += lines
      index.stats.totalChars += chars
      index.stats.byType[language] = (index.stats.byType[language] || 0) + 1

      // Extract simple symbols (placeholder for tree-sitter integration)
      const symbolPattern = /(?:function|class|const|let|var|def|fn)\s+(\w+)/g
      let match
      while ((match = symbolPattern.exec(content)) !== null) {
        index.symbols.push({
          name: match[1],
          type: match[0].split(/\s+/)[0],
          file: path,
          position: match.index,
        })
      }
    }

    return index
  },

  /**
   * Process large file in chunks
   */
  async processLargeFile(data) {
    const { content, chunkSize = 65536, operation = 'hash' } = data
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content for processing')
    }

    const chunks = []
    const totalChunks = Math.ceil(content.length / chunkSize)

    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize)
      const chunkData = {
        index: chunks.length,
        offset: i,
        length: chunk.length,
      }

      if (operation === 'hash') {
        chunkData.hash = createHash('md5').update(chunk).digest('hex')
      } else if (operation === 'stats') {
        chunkData.lines = (chunk.match(/\n/g) || []).length
        chunkData.words = chunk.split(/\s+/).filter((w) => w).length
      }

      chunks.push(chunkData)
    }

    return {
      totalSize: content.length,
      chunkSize,
      totalChunks,
      chunks,
      operation,
    }
  },

  /**
   * Batch similarity computation
   */
  async batchSimilarity(data) {
    const { vectors, query } = data
    if (!Array.isArray(vectors) || !Array.isArray(query)) {
      throw new Error('Expected vectors and query arrays')
    }

    // Cosine similarity computation
    function cosineSimilarity(a, b) {
      if (a.length !== b.length) return 0
      let dotProduct = 0
      let normA = 0
      let normB = 0
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
      }
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
    }

    const similarities = vectors.map((vec, idx) => ({
      index: idx,
      similarity: cosineSimilarity(vec, query),
    }))

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity)

    return {
      results: similarities,
      queryDimensions: query.length,
      vectorCount: vectors.length,
    }
  },

  /**
   * Process SharedArrayBuffer data in batch
   */
  async processBatchBuffer(data) {
    const { buffer, itemSize, itemCount } = data

    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error('Expected SharedArrayBuffer')
    }

    const view = new Float32Array(buffer)
    const results = []

    for (let i = 0; i < itemCount; i++) {
      const offset = i * itemSize
      const item = view.slice(offset, offset + itemSize)

      // Compute statistics for each item
      let sum = 0
      let min = Infinity
      let max = -Infinity

      for (let j = 0; j < item.length; j++) {
        sum += item[j]
        min = Math.min(min, item[j])
        max = Math.max(max, item[j])
      }

      results.push({
        index: i,
        mean: sum / item.length,
        min,
        max,
        range: max - min,
      })
    }

    return {
      results,
      itemCount,
      itemSize,
    }
  },

  /**
   * Merge multiple indexes
   */
  async mergeIndexes(data) {
    const { indexes } = data
    if (!Array.isArray(indexes)) {
      throw new Error('Expected array of indexes')
    }

    const merged = {
      files: [],
      symbols: [],
      stats: {
        totalFiles: 0,
        totalLines: 0,
        totalChars: 0,
        byType: {},
      },
    }

    for (const index of indexes) {
      merged.files.push(...(index.files || []))
      merged.symbols.push(...(index.symbols || []))
      merged.stats.totalFiles += index.stats?.totalFiles || 0
      merged.stats.totalLines += index.stats?.totalLines || 0
      merged.stats.totalChars += index.stats?.totalChars || 0

      for (const [type, count] of Object.entries(index.stats?.byType || {})) {
        merged.stats.byType[type] = (merged.stats.byType[type] || 0) + count
      }
    }

    // Deduplicate files by path
    const seenPaths = new Set()
    merged.files = merged.files.filter((f) => {
      if (seenPaths.has(f.path)) return false
      seenPaths.add(f.path)
      return true
    })

    return merged
  },
}

/**
 * Main task dispatcher
 */
module.exports = async function ({ task, data }) {
  const handler = taskHandlers[task]

  if (!handler) {
    throw new Error(`Unknown batch task: ${task}`)
  }

  const start = performance.now()
  const result = await handler(data)
  const duration = performance.now() - start

  return {
    ...result,
    _meta: {
      task,
      duration,
      poolType: 'background',
      timestamp: Date.now(),
    },
  }
}
