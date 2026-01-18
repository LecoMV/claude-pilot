# Research-to-Implementation Task Mapping

> **Purpose**: Map Gemini research findings to specific implementation beads
> **Epic**: `deploy-qu36` - Gemini Deep Research Audit Implementation

---

## Research Beads Overview

| Bead ID       | Research Area                          | Priority | Status |
| ------------- | -------------------------------------- | -------- | ------ |
| `deploy-skn3` | Electron OAuth 2.0/OIDC                | P1       | Open   |
| `deploy-482i` | electron-trpc Production Patterns      | P1       | Open   |
| `deploy-scb9` | Worker Thread Optimization             | P1       | Open   |
| `deploy-q6dz` | Zero-Knowledge Encrypted Vector Search | P0       | Open   |
| `deploy-reky` | Teleport.dev Desktop Integration       | P1       | Open   |
| `deploy-ji2e` | Desktop Configuration Hierarchy        | P1       | Open   |

---

## 1. OAuth 2.0/OIDC Implementation (`deploy-skn3`)

### Research Findings → Tasks

| Finding                               | Implementation Task                              | Priority | New Bead? |
| ------------------------------------- | ------------------------------------------------ | -------- | --------- |
| RFC 8252 requires system browser      | Create `AuthService` with `shell.openExternal()` | P0       | Yes       |
| PKCE mandatory for public clients     | Implement PKCE challenge generation              | P0       | Yes       |
| Loopback redirect with ephemeral port | Build temporary HTTP callback server             | P0       | Yes       |
| safeStorage for refresh tokens        | Migrate token storage to encrypted store         | P0       | Yes       |
| Token stratification pattern          | Implement access/refresh/ID token tiers          | P1       | Yes       |
| Enterprise IdP config structure       | Create IdP configuration schema                  | P1       | Yes       |

### Suggested Sub-Tasks

```bash
# Create implementation beads
bd create --title="Implement RFC 8252 compliant auth service" --type=task --priority=0
bd create --title="Add PKCE challenge generation utilities" --type=task --priority=0
bd create --title="Create loopback HTTP callback server" --type=task --priority=0
bd create --title="Migrate tokens to safeStorage encryption" --type=task --priority=0
bd create --title="Implement token tier management (access/refresh/ID)" --type=task --priority=1
bd create --title="Create enterprise IdP configuration schema" --type=task --priority=1
```

---

## 2. electron-trpc Production Patterns (`deploy-482i`)

### Research Findings → Tasks

| Finding                           | Implementation Task                                        | Priority | Existing Bead? |
| --------------------------------- | ---------------------------------------------------------- | -------- | -------------- |
| Hybrid architecture required      | Implement Control Plane (tRPC) + Data Plane (MessagePorts) | P0       | Partially done |
| MessagePort for large payloads    | Create MessagePort streaming service                       | P0       | No             |
| Path-first file uploads           | Refactor file handlers to use path property                | P1       | No             |
| AbortController for subscriptions | Audit all subscriptions for memory safety                  | P1       | No             |
| SuperJSON for error preservation  | Configure custom error serialization                       | P1       | No             |
| Strangler Fig migration           | Complete controller migration plan                         | P1       | No             |

### Code Patterns to Implement

**MessagePort Streaming Service:**

```typescript
// src/main/services/streaming/messageport.ts
export class MessagePortStreamer {
  async createFileStream(fileId: string): Promise<MessagePort> {
    const { port1, port2 } = new MessageChannelMain()
    // ... implementation
  }
}
```

**Path-First Upload Handler:**

```typescript
// src/main/controllers/files.controller.ts
const filesRouter = router({
  analyze: procedure.input(z.object({ filePath: z.string() })).mutation(async ({ input }) => {
    // Read from disk directly - no IPC payload
    const content = await fs.readFile(input.filePath)
    return analyzeFile(content)
  }),
})
```

---

## 3. Worker Thread Optimization (`deploy-scb9`)

### Research Findings → Tasks

| Finding                       | Implementation Task                          | Priority | New Bead? |
| ----------------------------- | -------------------------------------------- | -------- | --------- |
| COOP/COEP headers required    | Add headers via webRequest.onHeadersReceived | P0       | Yes       |
| Piscina for worker pools      | Replace ad-hoc workers with Piscina pools    | P1       | Yes       |
| Direct MessagePort topology   | Create Renderer→Worker bypass channel        | P1       | Yes       |
| Ping-pong buffer reuse        | Implement buffer recycling pattern           | P2       | Yes       |
| Separate pools for priorities | Create Interactive + Background pools        | P1       | Yes       |

### Critical Configuration

```typescript
// src/main/index.ts - Add COOP/COEP headers
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Cross-Origin-Opener-Policy': ['same-origin'],
      'Cross-Origin-Embedder-Policy': ['credentialless'],
    },
  })
})
```

### Dependencies to Add

```json
{
  "dependencies": {
    "piscina": "^4.7.0"
  }
}
```

---

## 4. Zero-Knowledge Encrypted Vector Search (`deploy-q6dz`)

### Research Findings → Tasks

| Finding                          | Implementation Task                    | Priority | Complexity |
| -------------------------------- | -------------------------------------- | -------- | ---------- |
| TEE > FHE for interactive search | Design AWS Nitro Enclave architecture  | P0       | High       |
| WebAuthn PRF for key derivation  | Implement passkey-based key generation | P0       | Medium     |
| HKDF for key expansion           | Create key derivation service          | P0       | Low        |
| Envelope encryption              | Build multi-device key management      | P1       | Medium     |
| Attestation verification         | Create PCR hash verification client    | P1       | High       |
| FHE for secrets only             | Identify high-security secrets subset  | P2       | Low        |

### Architecture Decision Records Needed

1. **ADR-001**: TEE Provider Selection (Nitro vs SGX)
2. **ADR-002**: WebAuthn PRF Fallback Strategy
3. **ADR-003**: Enclave Image Build Process
4. **ADR-004**: Key Rotation Policy

### External Dependencies

- AWS Nitro Enclave AMI
- Qdrant Docker image (for enclave)
- WebAuthn PRF polyfill (for unsupported browsers)

---

## 5. Teleport.dev Integration (`deploy-reky`)

### Research Findings → Tasks

| Finding                       | Implementation Task                | Priority | Links To      |
| ----------------------------- | ---------------------------------- | -------- | ------------- |
| Sidecar pattern (tshd daemon) | Bundle tsh binary with installer   | P0       | `deploy-i0e2` |
| gRPC over Unix socket         | Create tshd gRPC client            | P0       | New           |
| Session recording playback    | Build xterm.js session player      | P2       | New           |
| Access request UI             | Create request/approval workflow   | P1       | New           |
| K8s local proxy               | Implement `tsh proxy kube` wrapper | P1       | New           |
| Certificate monitoring        | Add expiration alerts              | P2       | New           |

### Installer Considerations

```yaml
# electron-builder config addition
extraResources:
  - from: 'vendor/tsh/${platform}/'
    to: 'tsh/'
    filter:
      - 'tsh${ext}'
      - 'tshd${ext}'
```

### Platform-Specific Binaries

| Platform | Binary            | IPC Method  |
| -------- | ----------------- | ----------- |
| macOS    | tsh, tshd         | Unix socket |
| Linux    | tsh, tshd         | Unix socket |
| Windows  | tsh.exe, tshd.exe | Named pipe  |

---

## 6. Configuration Hierarchy (`deploy-ji2e`)

### Research Findings → Tasks

| Finding                 | Implementation Task            | Priority | Links To      |
| ----------------------- | ------------------------------ | -------- | ------------- |
| 5-tier config system    | Implement config merge service | P1       | `deploy-ein4` |
| System policy locking   | Add admin lock mechanism       | P1       | New           |
| MCP discovery priority  | Create MCP config resolver     | P1       | `deploy-toag` |
| Project-level overrides | Parse .claude/pilot.json       | P1       | `deploy-j0q8` |
| Session CLI overrides   | Handle env vars and flags      | P2       | New           |

### Config Resolution Order

```typescript
// src/main/services/config/resolver.ts
export async function resolveConfig(): Promise<EffectiveConfig> {
  const layers = [
    await loadInstallationDefaults(),
    await loadSystemPolicies('/etc/claude-pilot/'),
    await loadUserPreferences(),
    await loadProjectConfig(getCurrentProjectRoot()),
    parseSessionOverrides(process.argv, process.env),
  ]

  return deepMergeWithLocking(layers)
}
```

---

## Implementation Priority Matrix

### P0 (Critical Path)

| Task               | Bead          | Blocks            |
| ------------------ | ------------- | ----------------- |
| COOP/COEP headers  | `deploy-scb9` | SharedArrayBuffer |
| safeStorage tokens | `deploy-skn3` | Enterprise SSO    |
| TEE architecture   | `deploy-q6dz` | Squadron Mode     |
| tshd bundling      | `deploy-reky` | Teleport features |

### P1 (Important)

| Task                  | Bead          | Enables                 |
| --------------------- | ------------- | ----------------------- |
| MessagePort streaming | `deploy-482i` | Large file handling     |
| Piscina worker pools  | `deploy-scb9` | Embedding generation    |
| WebAuthn PRF          | `deploy-q6dz` | Passwordless encryption |
| Config resolver       | `deploy-ji2e` | Multi-project support   |

### P2 (Enhancement)

| Task                     | Bead          | Nice-to-have        |
| ------------------------ | ------------- | ------------------- |
| Session recording player | `deploy-reky` | Audit review        |
| Buffer recycling         | `deploy-scb9` | Memory optimization |
| FHE for secrets          | `deploy-q6dz` | Maximum security    |

---

## Dependency Graph

```
                    deploy-qu36 (EPIC)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   deploy-skn3       deploy-482i       deploy-scb9
   (OAuth)           (tRPC)            (Workers)
        │                 │                 │
        └────────┬────────┘                 │
                 │                          │
            deploy-q6dz ←──────────────────┘
            (Encryption)
                 │
                 ▼
            deploy-reky
            (Teleport)
                 │
                 ▼
            deploy-ji2e
            (Config)
```

---

## Testing Requirements

### Unit Tests Required

- [ ] PKCE challenge generation
- [ ] Token encryption/decryption
- [ ] Config layer merging
- [ ] MessagePort streaming
- [ ] Worker pool management

### Integration Tests Required

- [ ] OAuth flow with mock IdP
- [ ] tshd daemon communication
- [ ] Enclave attestation
- [ ] Cross-process SharedArrayBuffer

### E2E Tests Required

- [ ] Full SSO login flow
- [ ] File upload via MessagePort
- [ ] K8s connection via Teleport
- [ ] Multi-device key sync

---

## Next Steps

1. **Create all sub-beads** from this mapping
2. **Set dependencies** between beads
3. **Assign priorities** based on critical path
4. **Begin P0 implementation** starting with COOP/COEP headers

---

**Document Version**: 1.0.0
**Last Updated**: 2026-01-17
