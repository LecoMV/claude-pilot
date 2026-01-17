/**
 * OCSF (Open Cybersecurity Schema Framework) Audit Logging Service
 * Implements structured audit logging for SOC 2 compliance
 *
 * Event classes used:
 * - 6003: API Activity (IPC calls, MCP operations)
 * - 6001: Authentication (credential access, settings changes)
 * - 6002: Authorization (permission checks)
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, statSync, renameSync, readdirSync, unlinkSync } from 'fs'

// OCSF Activity Types
export enum ActivityType {
  CREATE = 1,
  READ = 2,
  UPDATE = 3,
  DELETE = 4,
  EXECUTE = 5,
  DENY = 6,
  ERROR = 7,
  AUTHENTICATE = 8,
  AUTHORIZE = 9,
}

// OCSF Severity Levels
export enum Severity {
  UNKNOWN = 0,
  INFORMATIONAL = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
  CRITICAL = 5,
}

// OCSF Status Codes
export enum StatusCode {
  UNKNOWN = 0,
  SUCCESS = 1,
  FAILURE = 2,
  PARTIAL = 3,
}

// OCSF Event Categories
export enum EventCategory {
  APPLICATION = 'application',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  CONFIGURATION = 'configuration',
  DATA_ACCESS = 'data_access',
  SYSTEM = 'system',
}

// Audit event structure (OCSF-compliant)
export interface AuditEvent {
  id?: number
  time: number                    // Unix timestamp in milliseconds
  class_uid: number               // OCSF class (6003 for API Activity)
  class_name: string              // Human-readable class name
  category_uid: number            // Category ID
  category_name: EventCategory    // Category name
  activity_id: ActivityType       // Activity type
  activity_name: string           // Human-readable activity
  severity_id: Severity           // Severity level
  status_id: StatusCode           // Operation status
  status_detail?: string          // Optional status message
  message: string                 // Event description
  // Actor (who)
  actor_user?: string             // User identifier
  actor_process?: string          // Process name
  actor_session?: string          // Session ID
  // Target (what)
  target_type?: string            // Resource type (ipc, mcp, memory, etc.)
  target_name?: string            // Resource name (channel, server, query)
  target_data?: string            // Additional target data (JSON)
  // Metadata
  metadata_version: string        // OCSF version
  metadata_product_name: string   // Product name
  metadata_product_version: string // App version
  // Raw data for debugging
  raw_data?: string               // Original event data (JSON)
}

// Log rotation config
const MAX_LOG_SIZE_MB = 10
const MAX_LOG_FILES = 5

class AuditService {
  private db: Database.Database | null = null
  private dbPath: string = ''
  private initialized = false
  private appVersion: string = '0.0.0'

  /**
   * Initialize the audit service
   * Creates SQLite database and tables
   */
  initialize(): boolean {
    if (this.initialized) return true

    try {
      // Create audit directory in app data
      const auditDir = join(app.getPath('userData'), 'audit')
      if (!existsSync(auditDir)) {
        mkdirSync(auditDir, { recursive: true })
      }

      this.dbPath = join(auditDir, 'audit.db')
      this.appVersion = app.getVersion()

      // Check if rotation needed before opening
      this.rotateIfNeeded()

      // Open database
      this.db = new Database(this.dbPath)

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL')

      // Create audit table if not exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          time INTEGER NOT NULL,
          class_uid INTEGER NOT NULL,
          class_name TEXT NOT NULL,
          category_uid INTEGER NOT NULL,
          category_name TEXT NOT NULL,
          activity_id INTEGER NOT NULL,
          activity_name TEXT NOT NULL,
          severity_id INTEGER NOT NULL DEFAULT 1,
          status_id INTEGER NOT NULL DEFAULT 1,
          status_detail TEXT,
          message TEXT NOT NULL,
          actor_user TEXT,
          actor_process TEXT,
          actor_session TEXT,
          target_type TEXT,
          target_name TEXT,
          target_data TEXT,
          metadata_version TEXT NOT NULL,
          metadata_product_name TEXT NOT NULL,
          metadata_product_version TEXT NOT NULL,
          raw_data TEXT,
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_events(time);
        CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_events(category_name);
        CREATE INDEX IF NOT EXISTS idx_audit_activity ON audit_events(activity_id);
        CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_events(target_type, target_name);
      `)

      this.initialized = true
      console.log('[Audit] Initialized at', this.dbPath)

      // Log service start
      this.log({
        category: EventCategory.SYSTEM,
        activity: ActivityType.EXECUTE,
        message: 'Audit service initialized',
        targetType: 'system',
        targetName: 'audit_service',
      })

      return true
    } catch (error) {
      console.error('[Audit] Initialization failed:', error)
      return false
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private rotateIfNeeded(): void {
    if (!existsSync(this.dbPath)) return

    try {
      const stats = statSync(this.dbPath)
      const sizeMB = stats.size / (1024 * 1024)

      if (sizeMB >= MAX_LOG_SIZE_MB) {
        const auditDir = join(app.getPath('userData'), 'audit')
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const rotatedPath = join(auditDir, `audit-${timestamp}.db`)

        // Close current connection if open
        if (this.db) {
          this.db.close()
          this.db = null
        }

        // Rename current file
        renameSync(this.dbPath, rotatedPath)
        console.log('[Audit] Rotated log to', rotatedPath)

        // Clean up old files
        this.cleanupOldLogs(auditDir)
      }
    } catch (error) {
      console.error('[Audit] Rotation check failed:', error)
    }
  }

  /**
   * Remove old log files beyond retention limit
   */
  private cleanupOldLogs(auditDir: string): void {
    try {
      const files = readdirSync(auditDir)
        .filter(f => f.startsWith('audit-') && f.endsWith('.db'))
        .sort()
        .reverse()

      // Keep only MAX_LOG_FILES rotated logs
      const toDelete = files.slice(MAX_LOG_FILES)
      for (const file of toDelete) {
        unlinkSync(join(auditDir, file))
        console.log('[Audit] Deleted old log:', file)
      }
    } catch (error) {
      console.error('[Audit] Cleanup failed:', error)
    }
  }

  /**
   * Log an audit event
   */
  log(params: {
    category: EventCategory
    activity: ActivityType
    message: string
    severity?: Severity
    status?: StatusCode
    statusDetail?: string
    actorUser?: string
    actorProcess?: string
    actorSession?: string
    targetType?: string
    targetName?: string
    targetData?: unknown
    rawData?: unknown
  }): void {
    if (!this.initialized || !this.db) {
      console.warn('[Audit] Not initialized, dropping event:', params.message)
      return
    }

    try {
      // Check rotation periodically
      this.rotateIfNeeded()

      // Reopen db if closed during rotation
      if (!this.db) {
        this.db = new Database(this.dbPath)
        this.db.pragma('journal_mode = WAL')
      }

      const event: AuditEvent = {
        time: Date.now(),
        class_uid: 6003, // API Activity
        class_name: 'API Activity',
        category_uid: this.getCategoryUid(params.category),
        category_name: params.category,
        activity_id: params.activity,
        activity_name: this.getActivityName(params.activity),
        severity_id: params.severity ?? Severity.INFORMATIONAL,
        status_id: params.status ?? StatusCode.SUCCESS,
        status_detail: params.statusDetail,
        message: params.message,
        actor_user: params.actorUser,
        actor_process: params.actorProcess ?? 'claude-pilot',
        actor_session: params.actorSession,
        target_type: params.targetType,
        target_name: params.targetName,
        target_data: params.targetData ? JSON.stringify(params.targetData) : undefined,
        metadata_version: '1.1.0', // OCSF version
        metadata_product_name: 'Claude Pilot',
        metadata_product_version: this.appVersion,
        raw_data: params.rawData ? JSON.stringify(params.rawData) : undefined,
      }

      const stmt = this.db.prepare(`
        INSERT INTO audit_events (
          time, class_uid, class_name, category_uid, category_name,
          activity_id, activity_name, severity_id, status_id, status_detail,
          message, actor_user, actor_process, actor_session,
          target_type, target_name, target_data,
          metadata_version, metadata_product_name, metadata_product_version,
          raw_data
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?
        )
      `)

      stmt.run(
        event.time,
        event.class_uid,
        event.class_name,
        event.category_uid,
        event.category_name,
        event.activity_id,
        event.activity_name,
        event.severity_id,
        event.status_id,
        event.status_detail,
        event.message,
        event.actor_user,
        event.actor_process,
        event.actor_session,
        event.target_type,
        event.target_name,
        event.target_data,
        event.metadata_version,
        event.metadata_product_name,
        event.metadata_product_version,
        event.raw_data
      )
    } catch (error) {
      console.error('[Audit] Failed to log event:', error)
    }
  }

  /**
   * Convenience method for IPC audit logging
   */
  logIPC(channel: string, success: boolean, details?: string): void {
    this.log({
      category: EventCategory.APPLICATION,
      activity: ActivityType.EXECUTE,
      message: `IPC call: ${channel}`,
      status: success ? StatusCode.SUCCESS : StatusCode.FAILURE,
      statusDetail: details,
      targetType: 'ipc',
      targetName: channel,
    })
  }

  /**
   * Convenience method for credential access audit
   */
  logCredentialAccess(key: string, operation: 'read' | 'write' | 'delete'): void {
    const activityMap = {
      read: ActivityType.READ,
      write: ActivityType.UPDATE,
      delete: ActivityType.DELETE,
    }

    this.log({
      category: EventCategory.AUTHENTICATION,
      activity: activityMap[operation],
      message: `Credential ${operation}: ${key}`,
      severity: Severity.MEDIUM,
      targetType: 'credential',
      targetName: key,
    })
  }

  /**
   * Convenience method for data access audit
   */
  logDataAccess(source: string, operation: 'read' | 'write' | 'query', details?: string): void {
    const activityMap = {
      read: ActivityType.READ,
      write: ActivityType.UPDATE,
      query: ActivityType.READ,
    }

    this.log({
      category: EventCategory.DATA_ACCESS,
      activity: activityMap[operation],
      message: `Data ${operation}: ${source}`,
      statusDetail: details,
      targetType: 'database',
      targetName: source,
    })
  }

  /**
   * Query audit events with filters
   */
  query(params?: {
    startTime?: number
    endTime?: number
    category?: EventCategory
    activity?: ActivityType
    targetType?: string
    limit?: number
    offset?: number
  }): AuditEvent[] {
    if (!this.initialized || !this.db) return []

    try {
      let sql = 'SELECT * FROM audit_events WHERE 1=1'
      const bindings: unknown[] = []

      if (params?.startTime) {
        sql += ' AND time >= ?'
        bindings.push(params.startTime)
      }
      if (params?.endTime) {
        sql += ' AND time <= ?'
        bindings.push(params.endTime)
      }
      if (params?.category) {
        sql += ' AND category_name = ?'
        bindings.push(params.category)
      }
      if (params?.activity) {
        sql += ' AND activity_id = ?'
        bindings.push(params.activity)
      }
      if (params?.targetType) {
        sql += ' AND target_type = ?'
        bindings.push(params.targetType)
      }

      sql += ' ORDER BY time DESC'

      if (params?.limit) {
        sql += ' LIMIT ?'
        bindings.push(params.limit)
      }
      if (params?.offset) {
        sql += ' OFFSET ?'
        bindings.push(params.offset)
      }

      const stmt = this.db.prepare(sql)
      return stmt.all(...bindings) as AuditEvent[]
    } catch (error) {
      console.error('[Audit] Query failed:', error)
      return []
    }
  }

  /**
   * Get audit statistics
   */
  getStats(): {
    totalEvents: number
    eventsByCategory: Record<string, number>
    eventsByActivity: Record<string, number>
    last24hCount: number
    dbSizeMB: number
  } {
    if (!this.initialized || !this.db) {
      return {
        totalEvents: 0,
        eventsByCategory: {},
        eventsByActivity: {},
        last24hCount: 0,
        dbSizeMB: 0,
      }
    }

    try {
      const total = this.db.prepare('SELECT COUNT(*) as count FROM audit_events').get() as { count: number }

      const byCategory = this.db.prepare(`
        SELECT category_name, COUNT(*) as count
        FROM audit_events
        GROUP BY category_name
      `).all() as Array<{ category_name: string; count: number }>

      const byActivity = this.db.prepare(`
        SELECT activity_name, COUNT(*) as count
        FROM audit_events
        GROUP BY activity_name
      `).all() as Array<{ activity_name: string; count: number }>

      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      const last24h = this.db.prepare('SELECT COUNT(*) as count FROM audit_events WHERE time >= ?').get(dayAgo) as { count: number }

      const stats = existsSync(this.dbPath) ? statSync(this.dbPath) : { size: 0 }

      return {
        totalEvents: total.count,
        eventsByCategory: Object.fromEntries(byCategory.map(r => [r.category_name, r.count])),
        eventsByActivity: Object.fromEntries(byActivity.map(r => [r.activity_name, r.count])),
        last24hCount: last24h.count,
        dbSizeMB: stats.size / (1024 * 1024),
      }
    } catch (error) {
      console.error('[Audit] Stats failed:', error)
      return {
        totalEvents: 0,
        eventsByCategory: {},
        eventsByActivity: {},
        last24hCount: 0,
        dbSizeMB: 0,
      }
    }
  }

  /**
   * Export events to JSON
   */
  exportJSON(params?: { startTime?: number; endTime?: number }): string {
    const events = this.query({
      ...params,
      limit: 10000, // Safety limit
    })
    return JSON.stringify(events, null, 2)
  }

  /**
   * Export events to CSV
   */
  exportCSV(params?: { startTime?: number; endTime?: number }): string {
    const events = this.query({
      ...params,
      limit: 10000,
    })

    if (events.length === 0) return ''

    const headers = [
      'time', 'class_name', 'category_name', 'activity_name',
      'severity_id', 'status_id', 'message',
      'actor_user', 'actor_process', 'target_type', 'target_name'
    ]

    const rows = events.map(e => [
      new Date(e.time).toISOString(),
      e.class_name,
      e.category_name,
      e.activity_name,
      e.severity_id,
      e.status_id,
      `"${(e.message || '').replace(/"/g, '""')}"`,
      e.actor_user || '',
      e.actor_process || '',
      e.target_type || '',
      e.target_name || '',
    ].join(','))

    return [headers.join(','), ...rows].join('\n')
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initialized = false
    }
  }

  private getCategoryUid(category: EventCategory): number {
    const map: Record<EventCategory, number> = {
      [EventCategory.APPLICATION]: 1,
      [EventCategory.AUTHENTICATION]: 2,
      [EventCategory.AUTHORIZATION]: 3,
      [EventCategory.CONFIGURATION]: 4,
      [EventCategory.DATA_ACCESS]: 5,
      [EventCategory.SYSTEM]: 6,
    }
    return map[category] || 0
  }

  private getActivityName(activity: ActivityType): string {
    const map: Record<ActivityType, string> = {
      [ActivityType.CREATE]: 'Create',
      [ActivityType.READ]: 'Read',
      [ActivityType.UPDATE]: 'Update',
      [ActivityType.DELETE]: 'Delete',
      [ActivityType.EXECUTE]: 'Execute',
      [ActivityType.DENY]: 'Deny',
      [ActivityType.ERROR]: 'Error',
      [ActivityType.AUTHENTICATE]: 'Authenticate',
      [ActivityType.AUTHORIZE]: 'Authorize',
    }
    return map[activity] || 'Unknown'
  }
}

// Export singleton instance
export const auditService = new AuditService()

// Export class for testing
export { AuditService }
