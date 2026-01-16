// Memgraph Service - Direct Bolt protocol connection
import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver'

class MemgraphService {
  private driver: Driver | null = null
  private readonly uri = 'bolt://localhost:7687'
  private readonly user = ''  // Memgraph default: no auth
  private readonly password = ''

  async connect(): Promise<boolean> {
    try {
      if (this.driver) return true

      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password),
        {
          maxConnectionPoolSize: 10,
          connectionAcquisitionTimeout: 5000,
          connectionTimeout: 5000,
        }
      )

      // Verify connection
      await this.driver.verifyConnectivity()
      console.log('[Memgraph] Connected successfully via Bolt protocol')
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
        segments: value.segments.map((seg: { start: unknown; end: unknown; relationship: unknown }) => ({
          start: this.convertNeo4jValue(seg.start),
          end: this.convertNeo4jValue(seg.end),
          relationship: this.convertNeo4jValue(seg.relationship),
        })),
      }
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => this.convertNeo4jValue(v))
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

  private isNode(value: unknown): value is { identity: unknown; labels: string[]; properties: Record<string, unknown> } {
    return value !== null && typeof value === 'object' && 'labels' in value && 'properties' in value
  }

  private isRelationship(value: unknown): value is { identity: unknown; type: string; start: unknown; end: unknown; properties: Record<string, unknown> } {
    return value !== null && typeof value === 'object' && 'type' in value && 'start' in value && 'end' in value
  }

  private isPath(value: unknown): value is { start: unknown; end: unknown; segments: Array<{ start: unknown; end: unknown; relationship: unknown }> } {
    return value !== null && typeof value === 'object' && 'segments' in value
  }

  // Get database stats
  async getStats(): Promise<{ nodes: number; edges: number; labels: string[] }> {
    const [nodeCount] = await this.query<{ count: number }>('MATCH (n) RETURN count(n) as count')
    const [edgeCount] = await this.query<{ count: number }>('MATCH ()-[r]->() RETURN count(r) as count')
    const labels = await this.query<{ label: string }>('MATCH (n) RETURN DISTINCT labels(n)[0] as label ORDER BY label')

    return {
      nodes: nodeCount?.count || 0,
      edges: edgeCount?.count || 0,
      labels: labels.map(l => l.label).filter(Boolean),
    }
  }

  // Search nodes by keyword
  async searchNodes(
    keyword: string,
    nodeType?: string,
    limit = 50
  ): Promise<Array<{
    id: number
    label: string
    type: string
    properties: Record<string, unknown>
  }>> {
    const typeFilter = nodeType ? `AND labels(n)[0] = $nodeType` : ''
    const cypher = `
      MATCH (n)
      WHERE (n.name CONTAINS $keyword OR n.title CONTAINS $keyword OR n.description CONTAINS $keyword)
      ${typeFilter}
      RETURN id(n) as id, labels(n)[0] as type, n as node
      LIMIT $limit
    `

    const results = await this.query<{
      id: number
      type: string
      node: { properties: Record<string, unknown> }
    }>(cypher, { keyword, nodeType, limit: neo4j.int(limit) })

    return results.map(r => ({
      id: r.id,
      label: (r.node.properties.name || r.node.properties.title || `Node ${r.id}`) as string,
      type: r.type || 'Unknown',
      properties: r.node.properties,
    }))
  }

  // Get sample graph for visualization
  async getSampleGraph(limit = 100): Promise<{
    nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>
    edges: Array<{ id: string; source: string; target: string; type: string; properties: Record<string, unknown> }>
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

    const nodes = new Map<string, { id: string; label: string; type: string; properties: Record<string, unknown> }>()
    const edges = new Map<string, { id: string; source: string; target: string; type: string; properties: Record<string, unknown> }>()

    for (const row of results) {
      // Add source node
      const sourceId = String(row.sourceId)
      if (!nodes.has(sourceId)) {
        const props = row.sourceNode?.properties || {}
        nodes.set(sourceId, {
          id: sourceId,
          label: (props.name || props.title || `Node ${sourceId}`) as string,
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
            label: (props.name || props.title || `Node ${targetId}`) as string,
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
}

// Singleton instance
export const memgraphService = new MemgraphService()
