// PostgreSQL Service - Native pg driver with connection pooling
// Replaces shell-based execSync calls for security and performance

import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg'

export interface PostgresConfig {
  host: string
  port: number
  user: string
  database: string
  password?: string
}

class PostgresService {
  private pool: Pool | null = null
  private config: PostgresConfig | null = null

  /**
   * Connect to PostgreSQL with the given configuration
   * Uses connection pooling for efficient resource usage
   */
  async connect(config?: PostgresConfig): Promise<boolean> {
    try {
      // Use provided config or fall back to environment variables
      const dbConfig: PostgresConfig = config || {
        host: process.env.CLAUDE_PG_HOST || 'localhost',
        port: parseInt(process.env.CLAUDE_PG_PORT || '5433', 10),
        user: process.env.CLAUDE_PG_USER || 'deploy',
        database: process.env.CLAUDE_PG_DATABASE || 'claude_memory',
        password: process.env.CLAUDE_PG_PASSWORD || undefined,
      }

      // If already connected with same config, reuse pool
      if (this.pool && this.config &&
          this.config.host === dbConfig.host &&
          this.config.port === dbConfig.port &&
          this.config.database === dbConfig.database) {
        return true
      }

      // Close existing pool if config changed
      if (this.pool) {
        await this.disconnect()
      }

      const poolConfig: PoolConfig = {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database,
        password: dbConfig.password,
        max: 10,                         // Max connections in pool
        idleTimeoutMillis: 30000,        // Close idle connections after 30s
        connectionTimeoutMillis: 5000,   // Fail fast on connection issues
      }

      this.pool = new Pool(poolConfig)
      this.config = dbConfig

      // Handle pool errors to prevent unhandled rejections
      this.pool.on('error', (err) => {
        console.error('[PostgreSQL] Unexpected pool error:', err)
      })

      // Verify connection works
      await this.pool.query('SELECT 1')
      console.log('[PostgreSQL] Connected successfully via pg driver')
      return true
    } catch (error) {
      console.error('[PostgreSQL] Connection failed:', error)
      this.pool = null
      this.config = null
      return false
    }
  }

  /**
   * Disconnect and close the connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
      this.config = null
      console.log('[PostgreSQL] Disconnected')
    }
  }

  /**
   * Check if we have an active connection
   */
  async isConnected(): Promise<boolean> {
    if (!this.pool) return false
    try {
      await this.pool.query('SELECT 1')
      return true
    } catch {
      return false
    }
  }

  /**
   * Execute a parameterized query and return typed results
   * ALWAYS use parameterized queries to prevent SQL injection
   *
   * @param sql - SQL query with $1, $2, etc. placeholders
   * @param params - Array of parameter values
   * @returns Array of row objects
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
    }
    const result: QueryResult<T> = await this.pool.query(sql, params)
    return result.rows
  }

  /**
   * Execute a query and return a single value
   * Useful for COUNT, SUM, etc.
   */
  async queryScalar<T = unknown>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const rows = await this.query(sql, params)
    if (rows.length === 0) return null
    const firstRow = rows[0] as Record<string, unknown>
    const keys = Object.keys(firstRow)
    if (keys.length === 0) return null
    return firstRow[keys[0]] as T
  }

  /**
   * Execute a raw query string (for advanced use cases)
   * WARNING: Only use for trusted queries - prefer parameterized queries
   */
  async queryRaw<T extends QueryResultRow = QueryResultRow>(
    sql: string
  ): Promise<{ rows: T[]; rowCount: number; fields: string[] }> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
    }

    // Block dangerous operations
    const upperSql = sql.toUpperCase().trim()
    if (
      upperSql.includes('DROP ') ||
      upperSql.includes('TRUNCATE ') ||
      (upperSql.includes('DELETE FROM ') && !upperSql.includes('WHERE'))
    ) {
      throw new Error(
        'Dangerous operation detected. DROP, TRUNCATE, and DELETE without WHERE are not allowed.'
      )
    }

    const result: QueryResult<T> = await this.pool.query(sql)
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      fields: result.fields.map((f) => f.name),
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getPoolStats(): { total: number; idle: number; waiting: number } | null {
    if (!this.pool) return null
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    }
  }
}

// Export singleton instance
export const postgresService = new PostgresService()

// Export class for testing
export { PostgresService }
