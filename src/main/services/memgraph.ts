// Memgraph Service - Direct Bolt protocol connection
import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver'

class MemgraphService {
  private driver: Driver | null = null
  private readonly uri = 'bolt://localhost:7687'
  private readonly user = '' // Memgraph default: no auth
  private readonly password = ''

  async connect(): Promise<boolean> {
    try {
      if (this.driver) return true

      this.driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password), {
        maxConnectionPoolSize: 10,
        connectionAcquisitionTimeout: 5000,
        connectionTimeout: 5000,
      })

      // Verify connection
      await this.driver.verifyConnectivity()
      console.info('[Memgraph] Connected successfully via Bolt protocol')
      return true
    } catch (error) {
      console.error('[Memgraph] Connection failed:', error)
      this.driver = null
      return false
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close()
      this.driver = null
    }
  }

  async isConnected(): Promise<boolean> {
    if (!this.driver) return false
    try {
      await this.driver.verifyConnectivity()
      return true
    } catch {
      return false
    }
  }

  private getSession(): Session {
    if (!this.driver) {
      throw new Error('Not connected to Memgraph')
    }
    return this.driver.session()
  }

  // Execute a Cypher query and return results
  async query<T = Record<string, unknown>>(
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const session = this.getSession()
    try {
      const result = await session.run(cypher, params)
      return result.records.map((record: Neo4jRecord) => {
        const obj: Record<string, unknown> = {}
        record.keys.forEach((key: string) => {
          const value = record.get(key)
          obj[key] = this.convertNeo4jValue(value)
        })
        return obj as T
      })
    } finally {
      await session.close()
    }
  }

  // Convert neo4j types to plain JS types
  private convertNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) return null

    // Handle neo4j integers
    if (neo4j.isInt(value)) {
      return neo4j.integer.toNumber(value)
    }

    // Handle nodes
    if (this.isNode(value)) {
      return {
        id: neo4j.integer.toNumber(value.identity),
        labels: value.labels,
        properties: this.convertProperties(value.properties),
      }
    }

    // Handle relationships
    if (this.isRelationship(value)) {
      return {
        id: neo4j.integer.toNumber(value.identity),
        type: value.type,
        startNodeId: neo4j.integer.toNumber(value.start),
        endNodeId: neo4j.integer.toNumber(value.end),
        properties: this.convertProperties(value.properties),
      }
    }

    // Handle paths
    if (this.isPath(value)) {
      return {
        start: this.convertNeo4jValue(value.start),
        end: this.convertNeo4jValue(value.end),
        segments: value.segments.map(
          (seg: { start: unknown; end: unknown; relationship: unknown }) => ({
            start: this.convertNeo4jValue(seg.start),
            end: this.convertNeo4jValue(seg.end),
            relationship: this.convertNeo4jValue(seg.relationship),
          })
        ),
      }
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((v) => this.convertNeo4jValue(v))
    }

    // Handle objects/maps
    if (typeof value === 'object') {
      return this.convertProperties(value as Record<string, unknown>)
    }

    return value
  }

  private convertProperties(props: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props)) {
      result[key] = this.convertNeo4jValue(value)
    }
    return result
  }

  private isNode(
    value: unknown
  ): value is { identity: unknown; labels: string[]; properties: Record<string, unknown> } {
    return value !== null && typeof value === 'object' && 'labels' in value && 'properties' in value
  }

  private isRelationship(value: unknown): value is {
    identity: unknown
    type: string
    start: unknown
    end: unknown
    properties: Record<string, unknown>
  } {
    return (
      value !== null &&
      typeof value === 'object' &&
      'type' in value &&
      'start' in value &&
      'end' in value
    )
  }

  private isPath(value: unknown): value is {
    start: unknown
    end: unknown
    segments: Array<{ start: unknown; end: unknown; relationship: unknown }>
  } {
    return value !== null && typeof value === 'object' && 'segments' in value
  }

  // Get database stats
  async getStats(): Promise<{ nodes: number; edges: number; labels: string[] }> {
    const [nodeCount] = await this.query<{ count: number }>('MATCH (n) RETURN count(n) as count')
    const [edgeCount] = await this.query<{ count: number }>(
      'MATCH ()-[r]->() RETURN count(r) as count'
    )
    const labels = await this.query<{ label: string }>(
      'MATCH (n) RETURN DISTINCT labels(n)[0] as label ORDER BY label'
    )

    return {
      nodes: nodeCount?.count || 0,
      edges: edgeCount?.count || 0,
      labels: labels.map((l) => l.label).filter(Boolean),
    }
  }

  // Search nodes by keyword
  // Handles different node types with their specific property structures:
  // - CyberTechnique: instruction, input, output, category
  // - Technology/Feature/etc: name, description, title
  async searchNodes(
    keyword: string,
    nodeType?: string,
    limit = 50
  ): Promise<
    Array<{
      id: number
      label: string
      type: string
      properties: Record<string, unknown>
    }>
  > {
    const typeFilter = nodeType ? `AND labels(n)[0] = $nodeType` : ''
    // Case-insensitive search across multiple property fields
    // Different node types have different properties:
    // - CyberTechnique: instruction, input, output, category
    // - Technology, Feature, etc: name, description, title
    const keywordLower = keyword.toLowerCase()
    const cypher = `
      MATCH (n)
      WHERE (
        toLower(coalesce(n.name, '')) CONTAINS $keyword
        OR toLower(coalesce(n.title, '')) CONTAINS $keyword
        OR toLower(coalesce(n.description, '')) CONTAINS $keyword
        OR toLower(coalesce(n.instruction, '')) CONTAINS $keyword
        OR toLower(coalesce(n.category, '')) CONTAINS $keyword
        OR toLower(coalesce(n.output, '')) CONTAINS $keyword
      )
      ${typeFilter}
      RETURN id(n) as id, labels(n)[0] as type, n as node
      LIMIT $limit
    `

    const results = await this.query<{
      id: number
      type: string
      node: { properties: Record<string, unknown> }
    }>(cypher, { keyword: keywordLower, nodeType, limit: neo4j.int(limit) })

    return results.map((r) => {
      const props = r.node.properties
      // Get a meaningful label based on node type
      let label: string
      if (props.name) {
        label = props.name as string
      } else if (props.title) {
        label = props.title as string
      } else if (props.instruction) {
        // For CyberTechnique nodes, use instruction (truncated)
        const instr = props.instruction as string
        label = instr.length > 80 ? instr.slice(0, 80) + '...' : instr
      } else if (props.category) {
        label = `[${props.category}] ${props.id || `Node ${r.id}`}`
      } else {
        label = `Node ${r.id}`
      }

      return {
        id: r.id,
        label,
        type: r.type || 'Unknown',
        properties: props,
      }
    })
  }

  // Fast text search using Memgraph text indexes (Tantivy-powered)
  // Uses text_search.regex_search for CyberTechnique nodes
  // Falls back to CONTAINS for other node types
  async textSearch(
    keyword: string,
    nodeType?: string,
    limit = 50
  ): Promise<
    Array<{
      id: number
      label: string
      type: string
      properties: Record<string, unknown>
      score: number
    }>
  > {
    const results: Array<{
      id: number
      label: string
      type: string
      properties: Record<string, unknown>
      score: number
    }> = []

    // Escape regex special characters in keyword
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase()
    const regexPattern = `.*${escapedKeyword}.*`

    try {
      // Search CyberTechnique instruction index
      if (!nodeType || nodeType === 'CyberTechnique') {
        const instrResults = await this.query<{
          node: { id: number; labels: string[]; properties: Record<string, unknown> }
          score: number
        }>(
          `
          CALL text_search.regex_search('cyber_instr', $pattern)
          YIELD node, score
          RETURN node, score
          LIMIT $limit
        `,
          { pattern: regexPattern, limit: neo4j.int(limit) }
        )

        for (const r of instrResults) {
          const props = r.node.properties
          const instr = (props.instruction as string) || ''
          results.push({
            id: r.node.id,
            label: instr.length > 80 ? instr.slice(0, 80) + '...' : instr,
            type: 'CyberTechnique',
            properties: props,
            score: r.score,
          })
        }
      }

      // Also search category index for more diverse results
      if (!nodeType || nodeType === 'CyberTechnique') {
        const remaining = limit - results.length
        if (remaining > 0) {
          const catResults = await this.query<{
            node: { id: number; labels: string[]; properties: Record<string, unknown> }
            score: number
          }>(
            `
            CALL text_search.regex_search('cyber_cat', $pattern)
            YIELD node, score
            RETURN node, score
            LIMIT $limit
          `,
            { pattern: regexPattern, limit: neo4j.int(remaining) }
          )

          // Add unique results only
          const existingIds = new Set(results.map((r) => r.id))
          for (const r of catResults) {
            if (!existingIds.has(r.node.id)) {
              const props = r.node.properties
              results.push({
                id: r.node.id,
                label: `[${props.category}] ${((props.instruction as string) || '').slice(0, 60)}...`,
                type: 'CyberTechnique',
                properties: props,
                score: r.score,
              })
            }
          }
        }
      }
    } catch (error) {
      // Text search failed, fall back to CONTAINS-based search
      console.warn('[Memgraph] Text index search failed, using fallback:', error)
      const fallbackResults = await this.searchNodes(keyword, nodeType, limit)
      return fallbackResults.map((r) => ({ ...r, score: 1.0 }))
    }

    // For non-CyberTechnique types, use CONTAINS-based search
    if (nodeType && nodeType !== 'CyberTechnique') {
      const fallbackResults = await this.searchNodes(keyword, nodeType, limit)
      return fallbackResults.map((r) => ({ ...r, score: 1.0 }))
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  // Get sample graph for visualization
  async getSampleGraph(limit = 100): Promise<{
    nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
    edges: Array<{
      id: string
      source: string
      target: string
      type: string
      properties: Record<string, unknown>
    }>
  }> {
    const cypher = `
      MATCH (n)
      WITH n LIMIT $limit
      OPTIONAL MATCH (n)-[r]->(m)
      RETURN
        id(n) as sourceId, labels(n)[0] as sourceType, n as sourceNode,
        id(m) as targetId, labels(m)[0] as targetType, m as targetNode,
        id(r) as relId, type(r) as relType, r as rel
      LIMIT ${limit * 2}
    `

    const results = await this.query<{
      sourceId: number
      sourceType: string
      sourceNode: { properties: Record<string, unknown> }
      targetId: number | null
      targetType: string | null
      targetNode: { properties: Record<string, unknown> } | null
      relId: number | null
      relType: string | null
      rel: { properties: Record<string, unknown> } | null
    }>(cypher, { limit: neo4j.int(limit) })

    const nodes = new Map<
      string,
      { id: string; label: string; type: string; properties: Record<string, unknown> }
    >()
    const edges = new Map<
      string,
      {
        id: string
        source: string
        target: string
        type: string
        properties: Record<string, unknown>
      }
    >()

    // Helper to get a meaningful label for a node
    const getNodeLabel = (props: Record<string, unknown>, nodeId: string): string => {
      if (props.name) return props.name as string
      if (props.title) return props.title as string
      if (props.instruction) {
        const instr = props.instruction as string
        return instr.length > 60 ? instr.slice(0, 60) + '...' : instr
      }
      if (props.category) {
        return `[${props.category}]`
      }
      return `Node ${nodeId}`
    }

    for (const row of results) {
      // Add source node
      const sourceId = String(row.sourceId)
      if (!nodes.has(sourceId)) {
        const props = row.sourceNode?.properties || {}
        nodes.set(sourceId, {
          id: sourceId,
          label: getNodeLabel(props, sourceId),
          type: row.sourceType || 'Unknown',
          properties: props,
        })
      }

      // Add target node if exists
      if (row.targetId !== null && row.targetNode) {
        const targetId = String(row.targetId)
        if (!nodes.has(targetId)) {
          const props = row.targetNode?.properties || {}
          nodes.set(targetId, {
            id: targetId,
            label: getNodeLabel(props, targetId),
            type: row.targetType || 'Unknown',
            properties: props,
          })
        }

        // Add edge
        if (row.relId !== null) {
          const edgeId = String(row.relId)
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              id: edgeId,
              source: sourceId,
              target: targetId,
              type: row.relType || 'RELATED',
              properties: row.rel?.properties || {},
            })
          }
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values()),
    }
  }

  // Get node type distribution
  async getTypeDistribution(): Promise<Array<{ type: string; count: number }>> {
    const results = await this.query<{ type: string; count: number }>(
      'MATCH (n) RETURN labels(n)[0] as type, count(*) as count ORDER BY count DESC LIMIT 20'
    )
    return results
  }

  /**
   * Ensure required indexes exist for optimal query performance.
   * Should be called during application startup.
   */
  async ensureIndexes(): Promise<void> {
    const indexes = [
      // Label indexes for faster node lookups
      'CREATE INDEX ON :CyberTechnique',
      'CREATE INDEX ON :Technology',
      'CREATE INDEX ON :Feature',
      'CREATE INDEX ON :Category',
      // Property indexes for common search fields
      'CREATE INDEX ON :CyberTechnique(category)',
      'CREATE INDEX ON :CyberTechnique(id)',
      'CREATE INDEX ON :Technology(name)',
      'CREATE INDEX ON :Feature(name)',
    ]

    for (const indexQuery of indexes) {
      try {
        await this.query(indexQuery)
        console.info(`[Memgraph] Index created: ${indexQuery.slice(0, 50)}...`)
      } catch (error) {
        // Index may already exist, which is fine
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (!errorMsg.includes('already exists')) {
          console.warn(`[Memgraph] Index creation warning: ${errorMsg}`)
        }
      }
    }
    console.info('[Memgraph] Index verification complete')
  }

  /**
   * Get optimized database stats using SHOW STORAGE INFO when available.
   * Falls back to COUNT queries if storage info is not available.
   */
  async getOptimizedStats(): Promise<{
    nodes: number
    edges: number
    labels: string[]
    indexes: number
  }> {
    try {
      // Try to get stats from storage info (much faster than full scan)
      const storageInfo = await this.query<{
        storage_mode: string
        vertex_count: number
        edge_count: number
      }>('SHOW STORAGE INFO')

      if (storageInfo.length > 0) {
        const info = storageInfo[0]
        const labels = await this.query<{ label: string }>(
          'MATCH (n) RETURN DISTINCT labels(n)[0] as label LIMIT 50'
        )
        const indexCount = await this.query<{ count: number }>('SHOW INDEX INFO')

        return {
          nodes: info.vertex_count || 0,
          edges: info.edge_count || 0,
          labels: labels.map((l) => l.label).filter(Boolean),
          indexes: indexCount.length,
        }
      }
    } catch {
      // SHOW STORAGE INFO not available, fall back to count queries
    }

    // Fallback: Use sampled counts for very large databases
    const [nodeCount] = await this.query<{ count: number }>('MATCH (n) RETURN count(n) as count')
    const [edgeCount] = await this.query<{ count: number }>(
      'MATCH ()-[r]->() RETURN count(r) as count'
    )
    const labels = await this.query<{ label: string }>(
      'MATCH (n) RETURN DISTINCT labels(n)[0] as label LIMIT 50'
    )

    return {
      nodes: nodeCount?.count || 0,
      edges: edgeCount?.count || 0,
      labels: labels.map((l) => l.label).filter(Boolean),
      indexes: 0,
    }
  }
}

// Singleton instance
export const memgraphService = new MemgraphService()
