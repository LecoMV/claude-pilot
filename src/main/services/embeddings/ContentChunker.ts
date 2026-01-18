/**
 * ContentChunker
 *
 * Intelligent text splitting for optimal embedding quality.
 * Features:
 * - Content-aware chunking (code, conversations, documentation)
 * - Semantic boundary detection
 * - Configurable overlap for context preservation
 * - Metadata preservation through chunks
 */

import { createHash } from 'crypto'
import type { ContentType, ChunkConfig, ChunkMetadata, ContentChunk } from './types'

// Approximate tokens per character (rough estimate for English text)
const CHARS_PER_TOKEN = 4

export class ContentChunker {
  private configs: Record<ContentType, ChunkConfig>

  constructor(configs?: Partial<Record<ContentType, ChunkConfig>>) {
    // Default configs
    this.configs = {
      code: { contentType: 'code', chunkSize: 400, overlapSize: 25 },
      conversation: { contentType: 'conversation', chunkSize: 300, overlapSize: 75 },
      tool_result: { contentType: 'tool_result', chunkSize: 200, overlapSize: 20 },
      learning: { contentType: 'learning', chunkSize: 500, overlapSize: 50 },
      documentation: { contentType: 'documentation', chunkSize: 800, overlapSize: 80 },
      ...configs,
    }
  }

  /**
   * Chunk content based on its type
   */
  chunk(
    content: string,
    contentType: ContentType,
    baseMetadata: Partial<ChunkMetadata>
  ): ContentChunk[] {
    if (!content || content.trim().length === 0) {
      return []
    }

    const config = this.configs[contentType]
    const chunks: ContentChunk[] = []

    // Choose chunking strategy based on content type
    let textChunks: string[]
    switch (contentType) {
      case 'code':
        textChunks = this.chunkCode(content, config)
        break
      case 'conversation':
        textChunks = this.chunkConversation(content, config)
        break
      case 'documentation':
        textChunks = this.chunkDocumentation(content, config)
        break
      default:
        textChunks = this.chunkGeneric(content, config)
    }

    // Build chunk objects with metadata
    const totalChunks = textChunks.length
    for (let i = 0; i < textChunks.length; i++) {
      const text = textChunks[i]
      const contentHash = this.hashContent(text)

      chunks.push({
        text,
        contentHash,
        metadata: {
          sourceId: baseMetadata.sourceId || 'unknown',
          sourceType: contentType,
          chunkIndex: i,
          totalChunks,
          timestamp: baseMetadata.timestamp || Date.now(),
          sessionId: baseMetadata.sessionId,
          projectPath: baseMetadata.projectPath,
          filePath: baseMetadata.filePath,
          speaker: baseMetadata.speaker,
          toolName: baseMetadata.toolName,
        },
      })
    }

    return chunks
  }

  /**
   * Chunk code with awareness of function/class boundaries
   */
  private chunkCode(content: string, config: ChunkConfig): string[] {
    const maxChars = config.chunkSize * CHARS_PER_TOKEN
    const overlapChars = config.overlapSize * CHARS_PER_TOKEN

    // Try to split at logical boundaries: functions, classes, methods
    const boundaries = this.findCodeBoundaries(content)

    if (boundaries.length > 0) {
      return this.splitAtBoundaries(content, boundaries, maxChars, overlapChars)
    }

    // Fallback to line-based splitting
    return this.chunkByLines(content, maxChars, overlapChars)
  }

  /**
   * Chunk conversations preserving message boundaries
   */
  private chunkConversation(content: string, config: ChunkConfig): string[] {
    const maxChars = config.chunkSize * CHARS_PER_TOKEN
    const overlapChars = config.overlapSize * CHARS_PER_TOKEN

    // Split by message markers (common patterns)
    const messagePatterns = [/^(Human|User|Assistant|Claude|AI):\s*/gim, /^(>>|>)\s*/gm, /^---+$/gm]

    const boundaries: number[] = [0]
    for (const pattern of messagePatterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        if (!boundaries.includes(match.index)) {
          boundaries.push(match.index)
        }
      }
    }

    boundaries.sort((a, b) => a - b)

    if (boundaries.length > 1) {
      return this.splitAtBoundaries(content, boundaries, maxChars, overlapChars)
    }

    // Fallback to paragraph-based splitting
    return this.chunkByParagraphs(content, maxChars, overlapChars)
  }

  /**
   * Chunk documentation preserving section structure
   */
  private chunkDocumentation(content: string, config: ChunkConfig): string[] {
    const maxChars = config.chunkSize * CHARS_PER_TOKEN
    const overlapChars = config.overlapSize * CHARS_PER_TOKEN

    // Split at headers and section markers
    const headerPattern = /^#{1,6}\s+.+$|^[A-Z][A-Za-z\s]+:?\s*$/gm

    const boundaries: number[] = [0]
    let match
    while ((match = headerPattern.exec(content)) !== null) {
      if (!boundaries.includes(match.index)) {
        boundaries.push(match.index)
      }
    }

    boundaries.sort((a, b) => a - b)

    if (boundaries.length > 1) {
      return this.splitAtBoundaries(content, boundaries, maxChars, overlapChars)
    }

    // Fallback to paragraph-based splitting
    return this.chunkByParagraphs(content, maxChars, overlapChars)
  }

  /**
   * Generic chunking with overlap
   */
  private chunkGeneric(content: string, config: ChunkConfig): string[] {
    const maxChars = config.chunkSize * CHARS_PER_TOKEN
    const overlapChars = config.overlapSize * CHARS_PER_TOKEN

    return this.chunkByParagraphs(content, maxChars, overlapChars)
  }

  /**
   * Find code structure boundaries (functions, classes, etc.)
   */
  private findCodeBoundaries(content: string): number[] {
    const boundaries: number[] = [0]

    // Common function/class patterns across languages
    const patterns = [
      // JavaScript/TypeScript
      /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+/gm,
      // Python
      /^(?:def|class|async def)\s+\w+/gm,
      // Go
      /^func\s+(?:\([^)]+\)\s+)?\w+/gm,
      // Rust
      /^(?:pub\s+)?(?:fn|struct|enum|impl|trait)\s+\w+/gm,
      // Java/C#
      /^(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|void|int|String)\s+\w+/gm,
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        if (!boundaries.includes(match.index)) {
          boundaries.push(match.index)
        }
      }
    }

    return boundaries.sort((a, b) => a - b)
  }

  /**
   * Split content at specified boundaries with max size constraint
   */
  private splitAtBoundaries(
    content: string,
    boundaries: number[],
    maxChars: number,
    overlapChars: number
  ): string[] {
    const chunks: string[] = []
    let currentChunk = ''

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i]
      const nextBoundary = boundaries[i + 1] || content.length
      const segment = content.slice(boundary, nextBoundary)

      // If adding this segment exceeds max, save current and start new
      if (currentChunk.length + segment.length > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())

        // Start new chunk with overlap from end of previous
        if (overlapChars > 0 && currentChunk.length > overlapChars) {
          currentChunk = currentChunk.slice(-overlapChars)
        } else {
          currentChunk = ''
        }
      }

      currentChunk += segment
    }

    // Add remaining content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }

    return chunks.filter((c) => c.length > 0)
  }

  /**
   * Chunk by paragraphs (double newlines)
   */
  private chunkByParagraphs(content: string, maxChars: number, overlapChars: number): string[] {
    const paragraphs = content.split(/\n\s*\n/)
    const chunks: string[] = []
    let currentChunk = ''

    for (const para of paragraphs) {
      const trimmed = para.trim()
      if (!trimmed) continue

      if (currentChunk.length + trimmed.length + 2 > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())

        // Overlap
        if (overlapChars > 0 && currentChunk.length > overlapChars) {
          currentChunk = currentChunk.slice(-overlapChars) + '\n\n'
        } else {
          currentChunk = ''
        }
      }

      currentChunk += (currentChunk ? '\n\n' : '') + trimmed
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }

    // If any chunk is still too large, split by lines
    return chunks.flatMap((chunk) => {
      if (chunk.length > maxChars) {
        return this.chunkByLines(chunk, maxChars, overlapChars)
      }
      return [chunk]
    })
  }

  /**
   * Chunk by lines with overlap
   */
  private chunkByLines(content: string, maxChars: number, overlapChars: number): string[] {
    const lines = content.split('\n')
    const chunks: string[] = []
    let currentChunk = ''

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim())

        // Overlap
        if (overlapChars > 0) {
          const overlapLines = currentChunk.split('\n').slice(-3).join('\n')
          currentChunk = overlapLines.length < overlapChars ? overlapLines + '\n' : ''
        } else {
          currentChunk = ''
        }
      }

      currentChunk += (currentChunk ? '\n' : '') + line
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }

    // Final fallback: character-level splitting for very long lines
    return chunks.flatMap((chunk) => {
      if (chunk.length > maxChars * 1.5) {
        return this.chunkByChars(chunk, maxChars, overlapChars)
      }
      return [chunk]
    })
  }

  /**
   * Last resort: character-level chunking with word boundary awareness
   */
  private chunkByChars(content: string, maxChars: number, overlapChars: number): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < content.length) {
      let end = Math.min(start + maxChars, content.length)

      // Try to break at word boundary
      if (end < content.length) {
        const lastSpace = content.lastIndexOf(' ', end)
        if (lastSpace > start + maxChars * 0.5) {
          end = lastSpace
        }
      }

      chunks.push(content.slice(start, end).trim())
      start = end - overlapChars
    }

    return chunks.filter((c) => c.length > 0)
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN)
  }

  /**
   * Get chunk config for content type
   */
  getConfig(contentType: ContentType): ChunkConfig {
    return { ...this.configs[contentType] }
  }

  /**
   * Update chunk config
   */
  setConfig(contentType: ContentType, config: Partial<ChunkConfig>): void {
    this.configs[contentType] = {
      ...this.configs[contentType],
      ...config,
    }
  }
}

// Export factory function
export function createContentChunker(
  configs?: Partial<Record<ContentType, ChunkConfig>>
): ContentChunker {
  return new ContentChunker(configs)
}
