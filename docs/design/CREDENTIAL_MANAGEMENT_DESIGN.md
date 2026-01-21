# Global Credential Management System Design

> **Status**: Implemented (Phase 1), Design Complete (Phase 2-3)
> **Last Updated**: 2026-01-21
> **Author**: Claude Pilot Team

## Executive Summary

Claude Pilot requires a robust credential management system to securely store and manage:

- Database credentials (PostgreSQL, Memgraph, Qdrant)
- API keys (Anthropic, OpenAI, GitHub, etc.)
- OAuth tokens for external services
- MCP server authentication

This document describes the implemented system and plans for future enhancements.

---

## Architecture Overview

### Current Implementation (Phase 1 - Complete)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Pilot (Electron)                       │
├─────────────────────────────────────────────────────────────────┤
│  Renderer Process                  │  Main Process               │
│  ┌─────────────────────┐          │  ┌─────────────────────────┐│
│  │ tRPC Client         │──────────┼──│ credentials.controller   ││
│  │ trpc.credentials.*  │          │  │ - store()               ││
│  └─────────────────────┘          │  │ - retrieve()            ││
│                                    │  │ - delete()              ││
│                                    │  │ - has()                 ││
│                                    │  │ - list()                ││
│                                    │  └──────────┬──────────────┘│
│                                    │             │                │
│                                    │  ┌──────────▼──────────────┐│
│                                    │  │ credentialService       ││
│                                    │  │ (credentials.ts)        ││
│                                    │  └──────────┬──────────────┘│
│                                    │             │                │
│                                    │  ┌──────────▼──────────────┐│
│                                    │  │ Electron safeStorage    ││
│                                    │  │ + electron-store        ││
│                                    │  └──────────┬──────────────┘│
└─────────────────────────────────────────────────┼────────────────┘
                                                  │
                    ┌─────────────────────────────▼─────────────────────┐
                    │              OS Keychain/Secret Service           │
                    ├───────────────┬───────────────┬──────────────────┤
                    │ Windows DPAPI │ macOS Keychain│ Linux libsecret  │
                    └───────────────┴───────────────┴──────────────────┘
```

### Storage Architecture

#### Encryption Layers

| Layer       | Technology               | Purpose                        |
| ----------- | ------------------------ | ------------------------------ |
| Application | electron-store           | Persistent JSON storage        |
| Encryption  | safeStorage              | OS-level encryption of values  |
| OS Backend  | DPAPI/Keychain/libsecret | Hardware-backed key management |

#### Data Format

```typescript
interface EncryptedStore {
  credentials: Record<string, string> // key → "enc:hexdata" or "plain:hexdata"
  encryptionAvailable: boolean
}
```

Storage location: `~/.config/claude-pilot/credentials.json` (encrypted values)

---

## API Reference

### tRPC Endpoints

| Endpoint                            | Method   | Input          | Output      | Description                   |
| ----------------------------------- | -------- | -------------- | ----------- | ----------------------------- |
| `credentials.store`                 | mutation | `{key, value}` | `{success}` | Store encrypted credential    |
| `credentials.retrieve`              | query    | `{key}`        | `{value}`   | Retrieve decrypted credential |
| `credentials.delete`                | mutation | `{key}`        | `{success}` | Delete a credential           |
| `credentials.has`                   | query    | `{key}`        | `boolean`   | Check if credential exists    |
| `credentials.list`                  | query    | -              | `string[]`  | List all credential keys      |
| `credentials.isEncryptionAvailable` | query    | -              | `boolean`   | Check encryption status       |

### Key Naming Convention

```
<service>.<credential-type>

Examples:
  postgresql.password
  memgraph.password
  anthropic.apiKey
  github.token
  qdrant.apiKey
  openai.apiKey
```

---

## Security Analysis

### Threat Model

| Threat                      | Mitigation                                  | Status           |
| --------------------------- | ------------------------------------------- | ---------------- |
| Credential theft from disk  | OS-level encryption via safeStorage         | ✅ Implemented   |
| Cross-process access        | Encryption tied to app signature (macOS)    | ✅ Implemented   |
| Renderer process compromise | Credentials only accessible in main process | ✅ Implemented   |
| Memory scraping             | Values decrypted only when needed           | ✅ Implemented   |
| Missing keychain (Linux)    | Plaintext fallback with warning             | ⚠️ Warning shown |
| Network interception        | Credentials never sent over network         | ✅ By design     |

### Linux Security Warning

On Linux systems without a running keyring daemon (GNOME Keyring, KWallet, etc.), safeStorage falls back to `basic_text` backend which provides **NO SECURITY**.

Detection:

```typescript
if (safeStorage.getSelectedStorageBackend() === 'basic_text') {
  // CRITICAL: Show security warning to user
}
```

Recommendation for users: Install and configure libsecret:

```bash
sudo apt install libsecret-1-0 gnome-keyring
```

---

## Integration Points

### Environment Variable Migration

The credential service supports migrating from environment variables:

```typescript
credentialService.migrateFromEnv({
  PGPASSWORD: 'postgresql.password',
  ANTHROPIC_API_KEY: 'anthropic.apiKey',
  GITHUB_TOKEN: 'github.token',
})
```

### Fallback Chain

For database connections, the system follows this precedence:

1. Secure storage (credentials.retrieve)
2. Environment variable (process.env)
3. Configuration file (legacy)

```typescript
const password = credentialService.getWithFallback('postgresql.password', 'PGPASSWORD')
```

---

## Phase 2: Pass Integration (Planned)

### Motivation

The system `pass` (password-store) provides GPG-encrypted credential storage already used by Claude Code CLI. Integration would allow:

- Sharing credentials between Claude Pilot and Claude Code CLI
- Leveraging existing GPG key infrastructure
- Command-line credential management

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Pilot (Electron)                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  CredentialService (Enhanced)                ││
│  │  ┌─────────────────┐    ┌─────────────────┐                 ││
│  │  │ PassBackend     │    │ SafeStorageBack │                 ││
│  │  │ (system `pass`) │    │ (current impl)  │                 ││
│  │  └────────┬────────┘    └────────┬────────┘                 ││
│  │           │                      │                           ││
│  │           ▼                      ▼                           ││
│  │  ┌─────────────────────────────────────────┐                ││
│  │  │         Backend Selection Logic          │                ││
│  │  │  - Prefer pass if available              │                ││
│  │  │  - Fallback to safeStorage               │                ││
│  │  │  - Sync bidirectionally                  │                ││
│  │  └─────────────────────────────────────────┘                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Pass Backend API

```typescript
interface PassBackend {
  isAvailable(): Promise<boolean>
  get(path: string): Promise<string | null>
  set(path: string, value: string): Promise<void>
  delete(path: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}
```

Implementation uses `pass` CLI via child_process:

```typescript
async get(path: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`pass show claude/${path}`)
    return stdout.trim()
  } catch {
    return null
  }
}
```

### Migration Strategy

1. Detect if `pass` is available (`which pass`)
2. Check for existing `claude/*` entries
3. Offer to import into safeStorage OR use pass directly
4. Maintain sync for changed credentials

---

## Phase 3: OAuth Integration (Planned)

### Supported Providers

| Provider  | Use Case                           | Status  |
| --------- | ---------------------------------- | ------- |
| GitHub    | Repository access, PR management   | Planned |
| Google    | Gmail, Calendar, Drive integration | Planned |
| Microsoft | Azure, M365 integration            | Planned |
| Anthropic | Claude API authentication          | Planned |

### OAuth Flow Architecture

Following RFC 8252 (OAuth 2.0 for Native Apps):

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Claude Pilot │────▶│ System       │────▶│ Identity     │
│              │     │ Browser      │     │ Provider     │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │  1. Generate       │                    │
       │     PKCE verifier  │                    │
       │                    │                    │
       │  2. Open auth URL ─┼───────────────────▶│
       │     with challenge │                    │
       │                    │  3. User login     │
       │                    │◀───────────────────│
       │                    │                    │
       │  4. Redirect to    │                    │
       │     localhost:port │◀───────────────────│
       │                    │                    │
       │  5. Extract code ──┼────────────────────│
       │                    │                    │
       │  6. Exchange code ─┼───────────────────▶│
       │     + verifier     │                    │
       │                    │                    │
       │  7. Receive tokens◀┼────────────────────│
       │                    │                    │
       │  8. Store securely │                    │
       │     (safeStorage)  │                    │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Token Storage

OAuth tokens stored using same credential service:

```
github.accessToken
github.refreshToken
github.tokenExpiry
google.accessToken
google.refreshToken
google.tokenExpiry
```

### Token Refresh Strategy

```typescript
interface TokenManager {
  getValidToken(provider: string): Promise<string>
  refreshToken(provider: string): Promise<void>
  isTokenExpired(provider: string): boolean
  revokeToken(provider: string): Promise<void>
}
```

Automatic refresh triggered when:

- Token expires within 5 minutes of request
- API returns 401 Unauthorized
- App starts with expired token

---

## Testing Strategy

### Unit Tests

Located in: `src/main/services/__tests__/credentials.test.ts`

| Test Case               | Coverage |
| ----------------------- | -------- |
| Store and retrieve      | ✅       |
| Delete credential       | ✅       |
| Has check               | ✅       |
| List keys               | ✅       |
| Encryption availability | ✅       |
| Plaintext fallback      | ✅       |
| Migration from env      | ✅       |

### Integration Tests

Located in: `src/main/controllers/security/__tests__/credentials.controller.test.ts`

| Test Case                | Coverage |
| ------------------------ | -------- |
| tRPC endpoint validation | ✅       |
| Zod schema enforcement   | ✅       |
| Error handling           | ✅       |

### Manual Testing Checklist

- [ ] Store credential on Windows
- [ ] Store credential on macOS
- [ ] Store credential on Linux (with keyring)
- [ ] Verify encryption warning on Linux (without keyring)
- [ ] Migrate from environment variable
- [ ] Retrieve in database connection

---

## Audit Trail

All credential operations are logged via the audit system:

```typescript
// auditedProcedure automatically logs:
// - Timestamp
// - Operation (store/delete)
// - Key (not value!)
// - Success/failure
```

Audit logs: `~/.config/claude-pilot/audit.log`

---

## Related Documentation

- [Electron OAuth 2.0/OIDC Best Practices](../Research/Electron%20OAuth%202.0_OIDC%20Best%20Practices.md)
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [RFC 8252 - OAuth 2.0 for Native Apps](https://tools.ietf.org/html/rfc8252)

---

## Changelog

| Date       | Version | Changes                                   |
| ---------- | ------- | ----------------------------------------- |
| 2026-01-21 | 1.0     | Initial design document                   |
| 2026-01-XX | 1.1     | Phase 2 implementation (pass integration) |
| 2026-01-XX | 1.2     | Phase 3 implementation (OAuth)            |
