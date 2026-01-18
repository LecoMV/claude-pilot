# Claude Pilot Enterprise Roadmap

> **Vision**: Transform Claude Pilot from a developer tool into an Enterprise AI Operating System
> **Timeline**: 10 weeks to production-ready enterprise features
> **Epic**: `deploy-qu36` - Gemini Deep Research Audit Implementation

---

## Strategic Architecture Overview

### Current State (v0.1.x)

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Pilot                          │
├─────────────────────────────────────────────────────────┤
│  Renderer (React)  │  Main Process  │  MCP Servers      │
│  ┌──────────────┐  │  ┌───────────┐ │  ┌─────────────┐  │
│  │ Dashboard    │  │  │ Handlers  │ │  │ Memory      │  │
│  │ Projects     │←→│  │ (IPC)     │←→│  │ Keeper      │  │
│  │ Sessions     │  │  │           │ │  │             │  │
│  │ MCP UI       │  │  │ Services  │ │  │ File System │  │
│  │ Memory       │  │  └───────────┘ │  │             │  │
│  └──────────────┘  │                │  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Target State (v1.0.0 Enterprise)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Claude Pilot Enterprise                          │
├──────────────────────────────────────────────────────────────────────┤
│                           Control Plane (tRPC)                        │
├──────────────────────────────────────────────────────────────────────┤
│   OAuth/OIDC    │   Config      │   Audit      │   Access            │
│   Service       │   Resolver    │   Logger     │   Control           │
│   (RFC 8252)    │   (5-tier)    │   (OCSF)     │   (RBAC)            │
├──────────────────────────────────────────────────────────────────────┤
│                           Data Plane (MessagePorts)                   │
├──────────────────────────────────────────────────────────────────────┤
│   Streaming     │   Worker      │   Embedding   │   File             │
│   Service       │   Pool        │   Pipeline    │   Transfer         │
│   (Zero-copy)   │   (Piscina)   │   (SAB)       │   (Transferable)   │
├──────────────────────────────────────────────────────────────────────┤
│                           Security Boundary                           │
├──────────────────────────────────────────────────────────────────────┤
│   TEE Vector    │   WebAuthn    │   Teleport    │   Credential       │
│   Search        │   PRF Keys    │   Gateway     │   Vault            │
│   (Nitro)       │   (Hardware)  │   (mTLS)      │   (safeStorage)    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation (Weeks 1-2)

### Week 1: Core Infrastructure

| Day | Task                                      | Bead          | Deliverable               |
| --- | ----------------------------------------- | ------------- | ------------------------- |
| 1   | Add COOP/COEP headers                     | `deploy-scb9` | SharedArrayBuffer enabled |
| 2   | Install Piscina, create pool architecture | `deploy-scb9` | Worker pool service       |
| 3   | Complete tRPC controller migration (50%)  | `deploy-482i` | 5+ controllers migrated   |
| 4   | Implement MessagePort streaming           | `deploy-482i` | File transfer service     |
| 5   | Integration testing                       | -             | CI green                  |

**Milestone**: Hybrid IPC architecture operational

### Week 2: Performance Optimization

| Day | Task                                | Bead          | Deliverable                |
| --- | ----------------------------------- | ------------- | -------------------------- |
| 1-2 | Direct Renderer→Worker MessagePorts | `deploy-scb9` | Bypass topology            |
| 3-4 | SuperJSON error serialization       | `deploy-482i` | Custom error classes       |
| 5   | Subscription memory safety audit    | `deploy-482i` | AbortController everywhere |

**Milestone**: 60fps UI under heavy computational load

---

## Phase 2: Security (Weeks 3-4)

### Week 3: Authentication

| Day | Task                            | Bead          | Deliverable         |
| --- | ------------------------------- | ------------- | ------------------- |
| 1-2 | Implement RFC 8252 auth service | `deploy-skn3` | System browser flow |
| 3   | Add PKCE challenge generation   | `deploy-skn3` | Crypto utilities    |
| 4   | Create loopback callback server | `deploy-skn3` | Ephemeral listener  |
| 5   | Migrate tokens to safeStorage   | `deploy-skn3` | Encrypted storage   |

**Milestone**: OAuth/OIDC flow working with test IdP

### Week 4: Enterprise SSO

| Day | Task                     | Bead          | Deliverable           |
| --- | ------------------------ | ------------- | --------------------- |
| 1-2 | Okta connector           | `deploy-skn3` | Production IdP        |
| 3   | Azure AD connector       | `deploy-skn3` | Microsoft integration |
| 4   | Token refresh automation | `deploy-skn3` | Silent renewal        |
| 5   | Audit logging (OCSF)     | -             | Compliance logs       |

**Milestone**: Enterprise SSO certified

---

## Phase 3: Zero-Knowledge (Weeks 5-6)

### Week 5: Encryption Foundation

| Day | Task                          | Bead          | Deliverable           |
| --- | ----------------------------- | ------------- | --------------------- |
| 1   | WebAuthn PRF key derivation   | `deploy-q6dz` | Hardware-backed keys  |
| 2   | HKDF key expansion service    | `deploy-q6dz` | Key derivation        |
| 3   | Envelope encryption           | `deploy-q6dz` | Multi-device support  |
| 4   | PBKDF2 fallback (no WebAuthn) | `deploy-q6dz` | Browser compatibility |
| 5   | Key rotation mechanism        | `deploy-q6dz` | Security lifecycle    |

**Milestone**: Client-side encryption operational

### Week 6: TEE Deployment

| Day | Task                         | Bead          | Deliverable          |
| --- | ---------------------------- | ------------- | -------------------- |
| 1-2 | Nitro Enclave image (Qdrant) | `deploy-q6dz` | EIF build            |
| 3   | PCR hash generation          | `deploy-q6dz` | Attestation baseline |
| 4   | Client attestation verifier  | `deploy-q6dz` | Trust verification   |
| 5   | Encrypted index sync         | `deploy-q6dz` | Secure vector DB     |

**Milestone**: Zero-knowledge vector search operational

---

## Phase 4: Teleport Integration (Weeks 7-8)

### Week 7: Core Integration

| Day | Task                           | Bead          | Deliverable         |
| --- | ------------------------------ | ------------- | ------------------- |
| 1-2 | Bundle tsh/tshd binaries       | `deploy-reky` | Platform installers |
| 3   | Create tshd gRPC client        | `deploy-reky` | IPC layer           |
| 4   | Implement auth flow delegation | `deploy-reky` | SSO handoff         |
| 5   | Certificate monitoring         | `deploy-reky` | Expiration alerts   |

**Milestone**: Teleport login working

### Week 8: Advanced Features

| Day | Task                               | Bead          | Deliverable           |
| --- | ---------------------------------- | ------------- | --------------------- |
| 1-2 | K8s local proxy (`tsh proxy kube`) | `deploy-reky` | kubectl compatibility |
| 3   | Database tunnel management         | `deploy-reky` | psql/mysql access     |
| 4   | Access request UI                  | `deploy-reky` | JIT approval workflow |
| 5   | Session recording player           | `deploy-reky` | Audit playback        |

**Milestone**: Full Teleport feature parity

---

## Phase 5: Enterprise Polish (Weeks 9-10)

### Week 9: Configuration & Governance

| Day | Task                     | Bead          | Deliverable          |
| --- | ------------------------ | ------------- | -------------------- |
| 1-2 | 5-tier config system     | `deploy-ji2e` | Merge resolver       |
| 3   | Admin policy locking     | `deploy-ji2e` | Governance controls  |
| 4   | MCP discovery resolution | `deploy-ji2e` | Multi-source MCP     |
| 5   | Project-level overrides  | `deploy-ji2e` | `.claude/pilot.json` |

**Milestone**: Enterprise configuration complete

### Week 10: Observability & QA

| Day | Task                      | Bead | Deliverable         |
| --- | ------------------------- | ---- | ------------------- |
| 1-2 | OpenTelemetry integration | -    | Distributed tracing |
| 3   | E2E test suite expansion  | -    | 80%+ coverage       |
| 4   | Security audit            | -    | Penetration test    |
| 5   | Documentation & release   | -    | v1.0.0 Enterprise   |

**Milestone**: Production release

---

## Key Metrics & Success Criteria

### Performance

| Metric                | Current | Target         |
| --------------------- | ------- | -------------- |
| Cold start            | ~3s     | <2s            |
| IPC latency (p99)     | ~100ms  | <50ms          |
| File transfer (100MB) | ~5s     | <1s            |
| Embedding generation  | ~500ms  | <200ms         |
| UI responsiveness     | 45fps   | 60fps constant |

### Security

| Metric             | Current    | Target                     |
| ------------------ | ---------- | -------------------------- |
| Token encryption   | None       | safeStorage + WebAuthn PRF |
| Vector privacy     | Plaintext  | TEE (zero-knowledge)       |
| Credential storage | File-based | Hardware-backed            |
| Audit coverage     | 0%         | 100% (OCSF)                |

### Enterprise Features

| Feature            | Current | Target                   |
| ------------------ | ------- | ------------------------ |
| SSO providers      | 0       | 3+ (Okta, Azure, Google) |
| Config tiers       | 1       | 5 (installation→session) |
| Teleport resources | 0       | SSH, K8s, Databases      |
| Access governance  | None    | JIT access requests      |

---

## Risk Mitigation

### Technical Risks

| Risk                      | Probability | Impact | Mitigation                   |
| ------------------------- | ----------- | ------ | ---------------------------- |
| WebAuthn PRF browser gaps | Medium      | High   | PBKDF2 fallback              |
| Nitro Enclave complexity  | High        | High   | Start with local TEE testing |
| tshd version drift        | Low         | Medium | Pin + monitor releases       |
| SharedArrayBuffer issues  | Low         | High   | Feature detection + fallback |

### Organizational Risks

| Risk               | Probability | Impact | Mitigation                         |
| ------------------ | ----------- | ------ | ---------------------------------- |
| Scope creep        | High        | Medium | Phase gates, strict prioritization |
| Testing gaps       | Medium      | High   | Dedicated QA cycles each phase     |
| Documentation debt | Medium      | Medium | Doc-as-you-go policy               |

---

## Resource Requirements

### Infrastructure

- [ ] AWS Account with Nitro Enclave support
- [ ] Test IdP instances (Okta, Azure AD dev tenants)
- [ ] Teleport Cloud or self-hosted cluster
- [ ] CI/CD with macOS, Linux, Windows runners

### Dependencies

```json
{
  "new_dependencies": {
    "piscina": "^4.7.0",
    "superjson": "^2.2.1",
    "@trpc/client": "^10.45.0",
    "@trpc/server": "^10.45.0",
    "electron-trpc": "^0.6.0",
    "zod": "^3.23.0",
    "@simplewebauthn/browser": "^10.0.0",
    "oidc-client-ts": "^3.0.0"
  },
  "dev_dependencies": {
    "@playwright/test": "^1.57.0",
    "vitest": "^2.1.8"
  }
}
```

---

## Appendix: Bead Dependency Graph

```
deploy-qu36 (EPIC: Gemini Research)
├── deploy-skn3 (OAuth/OIDC)
│   ├── RFC 8252 auth service
│   ├── PKCE utilities
│   ├── Loopback callback
│   └── safeStorage migration
├── deploy-482i (electron-trpc)
│   ├── Controller migration
│   ├── MessagePort streaming
│   ├── SuperJSON errors
│   └── Subscription safety
├── deploy-scb9 (Worker Threads)
│   ├── COOP/COEP headers
│   ├── Piscina pools
│   └── Direct MessagePorts
├── deploy-q6dz (Zero-Knowledge) [P0]
│   ├── WebAuthn PRF
│   ├── HKDF service
│   ├── Envelope encryption
│   └── Nitro Enclave
├── deploy-reky (Teleport)
│   ├── tshd bundling
│   ├── gRPC client
│   ├── Access request UI
│   └── Session player
└── deploy-ji2e (Configuration)
    ├── 5-tier resolver
    ├── Policy locking
    └── MCP discovery
```

---

**Document Version**: 1.0.0
**Created**: 2026-01-17
**Owner**: Claude Pilot Engineering
