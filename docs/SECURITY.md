# Security Model

Claude Pilot implements defense-in-depth security following Electron security best practices.

## Process Isolation

### Main Process

The main process runs with full Node.js access and handles all security-sensitive operations:

- Filesystem access (read/write/delete)
- Child process spawning
- Network requests
- Credential management
- Database connections

**Security controls:**

- Input validation on all IPC handlers
- Command injection prevention via sanitization
- Path traversal protection
- SQL/Cypher injection prevention

### Renderer Process

The renderer process runs sandboxed with restricted capabilities:

```javascript
// BrowserWindow configuration
{
  webPreferences: {
    nodeIntegration: false,        // No Node.js APIs
    contextIsolation: true,        // Separate contexts
    sandbox: true,                 // OS-level sandbox
    webSecurity: true,             // Same-origin policy
    allowRunningInsecureContent: false
  }
}
```

### Preload Script

The preload script serves as the security boundary:

```typescript
// Only whitelisted channels allowed
const ALLOWED_CHANNELS = [
  'system:status',
  'memory:learnings',
  'mcp:list',
  // ... explicitly listed channels
]

const ALLOWED_EVENT_CHANNELS = [
  'terminal:data',
  'session:update',
  // ... explicitly listed events
]

// Validation before every IPC call
contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!validateChannel(channel)) {
      throw new Error(`Channel not allowed: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...args)
  },
})
```

## Input Validation

### IPC Schema Validation

All IPC handlers validate input using Zod schemas:

```typescript
// shared/validation.ts
export const ipcSchemas = {
  'memory:raw': z.object({
    source: z.enum(['postgresql', 'memgraph', 'qdrant']),
    query: z.string().max(10000),
    params: z.array(z.unknown()).optional(),
  }),
  // ... schemas for all channels
}

// Usage in handler
const validated = validate(ipcSchemas['memory:raw'], input)
```

### Command Injection Prevention

Sanitization functions for all user input that becomes shell arguments:

```typescript
// Sanitize service names (systemd)
const sanitizeServiceName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9._@-]/g, '')
}

// Sanitize container IDs (podman)
const sanitizeContainerId = (id: string): string => {
  return id.replace(/[^a-zA-Z0-9._-]/g, '')
}

// Sanitize model names (Ollama)
const sanitizeModelName = (model: string): string => {
  return model.replace(/[^a-zA-Z0-9._:/-]/g, '')
}
```

### SQL Injection Prevention

Dangerous query patterns are blocked:

```typescript
// Block patterns
const DANGEROUS_SQL = [
  /drop\s+(table|database|index|schema)/i,
  /truncate/i,
  /delete\s+from\s+\w+\s*$/i, // DELETE without WHERE
]

// Cypher patterns
const DANGEROUS_CYPHER = [
  /detach\s+delete/i,
  /match\s*\([^)]+\)\s*delete/i, // Unrestricted DELETE
]
```

## Credential Management

### OS Keychain Integration

Credentials stored using Electron's safeStorage API:

```typescript
// Store credential
const encrypted = safeStorage.encryptString(value)
store.set(`credentials.${key}`, encrypted.toString('base64'))

// Retrieve credential
const encrypted = Buffer.from(stored, 'base64')
const decrypted = safeStorage.decryptString(encrypted)
```

**Properties:**

- Encryption keys managed by OS (Keychain/DPAPI/Secret Service)
- Per-user isolation
- Memory protection against dumps
- No plaintext in logs

### Audit Logging

All credential operations logged:

```typescript
auditService.logCredentialAccess(key, 'read')
auditService.logCredentialAccess(key, 'write')
auditService.logCredentialAccess(key, 'delete')
```

## Audit Trail

### OCSF Compliance

Open Cybersecurity Schema Framework (OCSF) structured logging:

```typescript
interface AuditEvent {
  time: number // Unix timestamp
  class_uid: number // OCSF class (6003 = API Activity)
  category_name: EventCategory // application, authentication, etc.
  activity_id: ActivityType // CREATE, READ, UPDATE, DELETE
  severity_id: Severity // INFORMATIONAL to CRITICAL
  status_id: StatusCode // SUCCESS, FAILURE
  message: string // Event description
  target_type?: string // Resource type
  target_name?: string // Resource name
}
```

### Event Categories

| Category       | Logged Events                |
| -------------- | ---------------------------- |
| APPLICATION    | IPC calls, MCP operations    |
| AUTHENTICATION | Credential access, key usage |
| AUTHORIZATION  | Permission checks            |
| CONFIGURATION  | Settings changes             |
| DATA_ACCESS    | Database queries             |
| SYSTEM         | Service start/stop           |

### Retention

- Max log size: 10MB per database
- Max log files: 5 rotated
- Automatic rotation on size threshold

## Network Security

### External Connections

| Service    | Protocol | Authentication |
| ---------- | -------- | -------------- |
| PostgreSQL | TCP/SSL  | User/password  |
| Memgraph   | Bolt     | None (local)   |
| Qdrant     | HTTP     | None (local)   |
| Ollama     | HTTP     | None (local)   |

### Localhost Binding

All external services expected to bind to localhost only:

```yaml
PostgreSQL: localhost:5433
Memgraph: localhost:7687
Qdrant: localhost:6333
Ollama: localhost:11434
```

## Threat Model

### Threat: Malicious IPC Messages

**Mitigation:**

- Channel whitelist in preload
- Schema validation in handlers
- Input sanitization

### Threat: Command Injection

**Mitigation:**

- Regex sanitization of all shell arguments
- No template interpolation in commands
- Whitelist of allowed actions

### Threat: SQL/Cypher Injection

**Mitigation:**

- Parameterized queries only
- Dangerous pattern blocking
- Query length limits

### Threat: Path Traversal

**Mitigation:**

- Path sanitization
- Absolute path resolution
- Working directory restrictions

### Threat: Credential Theft

**Mitigation:**

- OS keychain storage
- No plaintext logging
- Memory protection

### Threat: Unauthorized Access

**Mitigation:**

- Audit logging
- Session tracking
- Activity monitoring

## Security Testing

### Test Coverage

```typescript
// Security test suite
describe('IPC Security Tests', () => {
  it('should block command injection', () => {})
  it('should block SQL injection', () => {})
  it('should block path traversal', () => {})
  it('should validate channel whitelist', () => {})
  it('should sanitize service names', () => {})
})
```

### Static Analysis

- ESLint security plugins
- TypeScript strict mode
- Dependency vulnerability scanning (npm audit)

## Incident Response

### Error Handling

All security-relevant errors logged with context:

```typescript
const appError = new IPCError('Validation failed', {
  channel: 'memory:raw',
  cause: error,
  metadata: { query: sanitized },
})
auditService.log({
  category: EventCategory.APPLICATION,
  activity: ActivityType.ERROR,
  severity: Severity.HIGH,
  message: appError.message,
})
```

### Recovery

- Graceful degradation on service failures
- Automatic reconnection to databases
- Error boundaries in React components
