# **Comprehensive Engineering Report: Integrating Teleport Secure Access into Desktop Applications**

## **1\. Executive Summary**

The transition from perimeter-based security models to identity-based Zero Trust architectures represents a fundamental shift in infrastructure access management. As organizations deprecate long-lived static credentials—such as SSH keys, database passwords, and kubeconfig tokens—in favor of ephemeral, cryptographically verifiable identities, the complexity of the client-side tooling required to facilitate this access increases commensurately. Teleport, operating as a consolidated Access Plane, addresses this challenge by unifying connectivity, authentication, authorization, and audit into a single platform protocol. However, for organizations tasked with building custom desktop applications—ranging from Internal Developer Platforms (IDPs) and specialized administrative consoles to commercial tools requiring secure remote access—the integration of Teleport’s cryptographic capabilities presents a distinct set of architectural challenges.

This report provides an exhaustive technical analysis of the methodologies for integrating Teleport into desktop environments. It evaluates the tripartite architectural divergence between wrapping the tsh Command Line Interface (CLI), embedding the native Go SDK, and interacting directly with the gRPC API. The analysis suggests that while the Go SDK offers superior type safety and granular control, the "Sidecar" architecture—typified by Teleport’s own "Teleport Connect" application—remains the most resilient pattern for long-term maintainability. This approach effectively decouples the user interface lifecycle from the complex networking logic required to maintain mutual TLS (mTLS) tunnels and SSH connections.

Furthermore, this document explores the critical subsystems required for a production-grade integration: the implementation of RFC 8252-compliant authentication flows using system browsers and Proof Key for Code Exchange (PKCE); the secure storage of short-lived X.509 and SSH certificates using OS-level cryptographic primitives; the implementation of Human-in-the-loop (HITL) access request workflows via API watchers; and the ingestion and playback of session recordings using Protocol Buffers. By synthesizing data from technical documentation, architectural decision records, and community implementation patterns, this report serves as a definitive guide for engineering teams architecting secure desktop experiences on top of the Teleport Access Plane.

## **2\. The Architecture of Secure Access: Integration Patterns**

When architecting a desktop application that interfaces with a Teleport cluster, developers face a foundational decision regarding the integration "seam"—the boundary where the application’s custom logic meets Teleport’s protocol stack. This choice dictates the application's binary complexity, update cadence, stability, and security posture. The industry currently exhibits three primary integration patterns: the CLI Wrapper (Sidecar) model, the Embedded Go SDK strategy, and Direct API Interaction.

### **2.1 The CLI Wrapper (Sidecar) Model**

This pattern involves bundling the tsh binary (or a specialized daemonized version, tshd) alongside the desktop application. The application functions primarily as a frontend, spawning tsh subprocesses to handle authentication, certificate retrieval, and tunnel establishment. This is the reference architecture employed by **Teleport Connect**, the official GUI client developed by Gravitational.1

#### **2.1.1 Architectural Mechanics**

In this model, the desktop application—often built on frameworks like Electron or Tauri—acts as a UI layer that delegates heavy networking and cryptographic lifting to a background process. In the specific case of Teleport Connect, the architecture is tri-fold, consisting of the Electron Main Process, the Electron Renderer Process, and a Shared Process that manages the tshd daemon.3

The communication between the UI and the Teleport logic occurs over an Inter-Process Communication (IPC) channel. Teleport Connect utilizes gRPC over Unix domain sockets (on macOS and Linux) or named pipes (on Windows) to facilitate this exchange.5 The tshd binary is a specialized mode of the standard tsh client that keeps a gRPC server running, allowing the UI to make persistent requests (like "List Nodes" or "Connect to Database") without incurring the overhead of spawning a new process for every action.3

#### **2.1.2 The Role of tshd and IPC**

The tshd daemon addresses the latency issues inherent in a naive CLI wrapper. A simple wrapper that executes tsh ls for every refresh cycle would suffer from the "cold start" penalty of initializing the Go runtime and performing TLS handshakes repeatedly. By keeping tshd resident in memory, the application maintains persistent connections to the Teleport Proxy, enabling near-instantaneous state updates.

The IPC mechanism is critical here. Research indicates that utilizing gRPC over Unix sockets is preferred for local IPC due to lower latency compared to TCP loopback connections, although Windows support for Unix sockets in Node.js has historically been a blocking issue, necessitating the use of named pipes or TCP with mTLS as a fallback.6 The tshd process exposes services such as TerminalService and TshdEventsService, defined via Protocol Buffers, which the Electron app consumes to render terminal tabs and update cluster resource lists.8

#### **2.1.3 Advantages and Trade-offs**

The primary advantage of the Sidecar model is **loose coupling**. The UI is isolated from the networking core; a crash in the tunnel manager does not necessarily crash the UI, and vice versa. Furthermore, it guarantees **feature parity**. Since tsh is the primary reference client for Teleport, using it ensures day-one support for new protocol features (e.g., new Multi-Factor Authentication (MFA) modes, FIDO2 hardware key support, or hardware-accelerated cryptography) without waiting for SDK updates or re-implementing complex logic.2

However, this comes with the cost of **distribution complexity**. The distribution package must include binaries for all target architectures (Darwin AMD64/ARM64, Linux, Windows), significantly increasing the bundle size. Additionally, the application developer must manage the tsh version lifecycle, ensuring the bundled binary is compatible with the target Teleport cluster version, although the CLI generally maintains backward compatibility for one major version.2

### **2.2 The Embedded Go SDK Strategy**

Teleport is written in Go, and its codebase is modular. The platform provides a public Go library, github.com/gravitational/teleport/api/client, which allows developers to instantiate a Teleport client directly within Go applications.9

#### **2.2.1 Architectural Mechanics**

In this pattern, the application imports the Teleport code libraries and instantiates a client.Client object. This client connects directly to the Teleport Auth and Proxy services via gRPC. The application logic interacts with Teleport using native Go structs and interfaces rather than parsing text output.

Go

// Conceptual instantiation of a Teleport Client via SDK  
import (  
 "context"  
 "github.com/gravitational/teleport/api/client"  
)

func main() {  
 ctx := context.Background()  
 clt, err := client.New(ctx, client.Config{  
 Addrs:string{"teleport.example.com:443"},  
 Credentials:client.Credentials{  
 client.LoadProfile("", ""), // Loads certificates from \~/.tsh  
 },  
 })  
 if err\!= nil {  
 // Handle connection error  
 }  
 // Perform operations  
 pingResponse, err := clt.Ping(ctx)  
}

#### **2.2.2 Advantages and Trade-offs**

The embedded strategy offers the highest degree of **programmatic control**. Developers have direct access to internal data structures, error types, and events, enabling sophisticated logic that would be brittle to implement via CLI parsing (e.g., distinguishing between a network timeout and an authentication failure based on error types). It also provides **type safety**, leveraging Go’s strong typing for all API interactions.10

The downsides, however, are significant. The Teleport codebase moves rapidly, and the internal APIs (even those in the public api module) can experience breaking changes between major versions. Maintaining a custom application that imports the Teleport SDK requires keeping pace with the upstream repository's dependency graph. Furthermore, the Teleport client library is heavy; integrating it can bloat the application binary. Most critically, implementing complex authentication flows—such as those requiring FIDO2/WebAuthn ceremonies or OIDC browser redirects—programmatically requires significant boilerplate code that tsh already encapsulates.

### **2.3 Direct API Interaction (gRPC/HTTP)**

This approach involves generating gRPC clients from Teleport's Protobuf definitions 12 or using the limited HTTP/REST endpoints available.

#### **2.3.1 Architectural Mechanics**

The developer compiles the protobuf definitions found in the api/proto directory of the Teleport repository into their language of choice (e.g., Rust, Python, C++) and manually implements the gRPC client logic.13

#### **2.3.2 Analysis**

This path is fraught with difficulty and is generally **discouraged** for full-featured desktop clients. Teleport’s API relies heavily on mutual TLS (mTLS) with specific certificate layouts and extensions. Replicating the client-side certificate management logic—including parsing the intricate tsh profile directory structure, handling certificate expiration, and managing SSH agent forwarding—is error-prone and labor-intensive.14

While the API is suitable for server-side plugins or automation bots that use long-lived identity files (Machine ID), interactive desktop clients require dynamic handling of MFA challenges and SSO redirects, which are non-trivial to implement from scratch over raw gRPC.

### **2.4 Comparative Analysis Table**

| Integration Pattern       | Control Level | Maintenance Effort | Binary Size             | Feature Parity              | Recommended Use Case                        |
| :------------------------ | :------------ | :----------------- | :---------------------- | :-------------------------- | :------------------------------------------ |
| **CLI Wrapper (Sidecar)** | Medium        | Low                | High (Bundled Binaries) | Immediate                   | General Purpose Desktop Apps, Electron Apps |
| **Embedded Go SDK**       | High          | High               | Medium                  | Delayed (Requires Rebuild)  | Specialized CLI Tools, Custom Automation    |
| **Direct gRPC API**       | Low (Raw)     | Very High          | Low                     | Low (Manual Implementation) | Server-side Plugins, Non-Go Clients         |

### **2.5 Recommendation**

The analysis clearly indicates that the **CLI Wrapper/Daemon model** is the most robust implementation pattern for rich desktop applications. It aligns with the architecture of Teleport’s own engineering efforts (Teleport Connect), ensuring that the integration benefits from the stability and testing of the core CLI product while providing a responsive user experience through the daemonized process model.

## **3\. Authentication Engineering and Certificate Management**

At the core of Teleport’s security model is the issuance of short-lived X.509 and SSH certificates. A desktop integration must effectively manage the "Login Dance"—the complex orchestration of acquiring these certificates via various authentication providers—and their subsequent secure storage.

### **3.1 The Authentication Ceremony**

The authentication process in Teleport is multi-modal, supporting local users, OIDC, SAML, and GitHub connectors. The desktop application must be capable of handling these distinct flows, specifically the browser-based interaction required for Single Sign-On (SSO).

#### **3.1.1 OAuth 2.0 and RFC 8252 Compliance**

For SSO integrations (OIDC/SAML), Teleport acts as an Authorization Server or acts as a proxy to an upstream Identity Provider (IdP). Desktop applications fall under the category of **Public Clients** in OAuth terminology, meaning they cannot securely store a client_secret. Therefore, the integration must adhere to **RFC 8252 (OAuth 2.0 for Native Apps)**.16

**Key Requirements for RFC 8252 Compliance:**

1. **System Browser:** The application must strictly avoid using embedded WebViews for the login phase. Embedded WebViews are insecure as the host application could intercept credentials, and many IdPs (e.g., Google) actively block them.19 Instead, the app must launch the system default browser.
2. **PKCE (Proof Key for Code Exchange):** To prevent authorization code interception attacks, the application must utilize PKCE. This involves generating a code_verifier and a code_challenge passed during the authorization request.17
3. **Loopback Interface Redirection:** To receive the authorization code from the browser, the application should spawn a temporary local HTTP server on the loopback interface (e.g., http://127.0.0.1:port/callback). RFC 8252 dictates that authorization servers must allow dynamic ports for loopback redirects to accommodate ephemeral port allocation.22

#### **3.1.2 Handling the Callback**

When tsh login is invoked with an SSO connector (e.g., \--auth=okta), it automatically handles the loopback server orchestration. The wrapper application must simply ensure it does not suppress the opening of the browser.

- **CLI wrapper:** The app executes tsh login. tsh prints a URL to stdout. The app parses this and calls the OS "open" command (e.g., shell.openExternal in Electron) to launch the browser. tsh waits for the callback on its internal loopback listener.
- **Custom Protocol Handlers:** Alternatively, the application can register a custom URI scheme (e.g., teleport-connect://). However, relying solely on this can be fragile due to varying OS support for protocol registration and browser security warnings. The loopback method remains the most reliable for desktop contexts.24

### **3.2 Certificate Lifecycle and Structure**

Upon successful authentication, the Teleport Auth Service issues a set of credentials. Understanding the anatomy of these artifacts is crucial for the application to utilize them correctly.

#### **3.2.1 The \~/.tsh Directory Structure**

Teleport stores session state in a standardized directory structure, typically located at \~/.tsh (Linux/macOS) or %USERPROFILE%\\.tsh (Windows).26

| File/Directory                   | Content Description                             | Use Case                                            |
| :------------------------------- | :---------------------------------------------- | :-------------------------------------------------- |
| keys/\<proxy\>/\<user\>-cert.pub | SSH Certificate signed by the Cluster User CA.  | Authenticating ssh connections to nodes.            |
| keys/\<proxy\>/\<user\>          | Private Key (RSA or Ed25519).                   | Identifying the user in cryptographic exchanges.    |
| keys/\<proxy\>/\<user\>-x509.pem | X.509 Certificate signed by the Cluster TLS CA. | Authenticating to K8s, Databases, and Web Apps.     |
| keys/\<proxy\>/root              | Trusted Root CA certificates for the cluster.   | Verifying the identity of the Teleport Proxy/Nodes. |

**Integration Insight:** Desktop apps should generally preserve this directory structure to maintain interoperability with other tools (e.g., a user running tsh in their terminal). If isolation is required, the TELEPORT_HOME environment variable can be used to redirect tsh to a sandboxed directory within the application's data path.26

#### **3.2.2 Expiration and Refresh Patterns**

Teleport certificates are short-lived by design (typically expiring in 8-12 hours, or even 30 minutes for sensitive roles).28 The desktop application must monitor the validity of these certificates.

- **Monitoring:** The application should parse the X.509 certificate (NotAfter field) or the SSH certificate metadata to determine the time remaining.
- **Refresh Token Rotation:** To avoid forcing the user to re-authenticate frequently, Teleport supports "Refresh Token" flows. If the user's role allows it, the tsh client can use a stored refresh token to request new certificates.
- **Secure Storage of Refresh Tokens:** Unlike certificates, refresh tokens are long-lived secrets. They must **never** be stored in plaintext. Electron applications should leverage the safeStorage API, which encrypts data using the OS keychain (Keychain on macOS, DPAPI on Windows, Libsecret on Linux).29 Storing these tokens in localStorage or unencrypted files renders them vulnerable to exfiltration by malware.

### **3.3 Security Hardening for Electron Applications**

If the desktop application is built using Electron, specific security controls are mandatory to prevent the compromise of the Teleport credentials it manages.

#### **3.3.1 Context Isolation and Node Integration**

The application must enable **Context Isolation** (contextIsolation: true) and disable **Node Integration** (nodeIntegration: false) in all renderer processes.30 This ensures that if the application renders untrusted content (e.g., a message from a compromised Teleport node or a malicious MOTD), the renderer process cannot access Node.js primitives to read the file system or execute shell commands.

#### **3.3.2 Vulnerability Management: "Allow Popups"**

A known vulnerability class in Electron apps involves the indiscriminate enabling of popups (allow-popups permission) or the navigation of the main window to untrusted URLs.32 An attacker could theoretically trigger an OAuth flow in a popup that mimics a legitimate login but redirects the authorization code to an attacker-controlled listener. The desktop app should implement strict navigation guards (webContents.on('will-navigate')) to whitelist only the specific IdP URLs and the Teleport Proxy address.34

## **4\. Human-in-the-Loop: Governance via Access Requests**

One of Teleport's most powerful governance features is Just-in-Time (JIT) access via **Access Requests**. Integrating this workflow transforms the desktop application from a passive connectivity tool into an active governance interface.

### **4.1 The Access Request Workflow**

The workflow involves four distinct stages:

1. **Request Creation:** A user requests elevated roles (e.g., db-admin) or access to specific resource IDs.35
2. **Review:** A delegated approver (or an automated plugin) reviews the request.
3. **Decision:** The request is transitioning to APPROVED or DENIED.
4. **Assumption:** If approved, the requester must explicitly "assume" the request to issue new certificates containing the elevated privileges.

### **4.2 Implementation Strategies**

#### **4.2.1 The "Watcher" Pattern (Go SDK)**

The most efficient way to implement real-time updates for access requests is via the Teleport API's **Watcher** mechanism. This utilizes a gRPC stream to push events to the client, avoiding the latency and overhead of polling.36

Go

// Code Example: Watching for Access Request Events  
func watchRequests(ctx context.Context, clt \*client.Client) {  
 watcher, err := clt.NewWatcher(ctx, types.Watch{  
 Kinds:types.WatchKind{  
 {Kind: types.KindAccessRequest},  
 },  
 })  
 defer watcher.Close()

    for {
        select {
        case event := \<-watcher.Events():
            // Logic to update UI state based on event.Type (PUT/DELETE)
            // and event.Resource (The AccessRequest object)
            processEvent(event)
        case \<-watcher.Done():
            return
        }
    }

}

**UI Integration:** When the Watcher receives an event indicating a request has been APPROVED, the desktop application can display a system notification. Clicking the notification would trigger the tsh login \--request-id=\<id\> command to assume the role automatically.

#### **4.2.2 The CLI Polling Pattern**

If using the Sidecar model without a custom Go backend, the application must rely on polling.

- **Listing:** tsh request ls \--format=json provides a snapshot of current requests.
- **Reviewing:** tsh request review \--approve \<request_id\> allows approvers to action requests directly from the UI.
- **Latency Trade-off:** Polling introduces latency. For a collaborative "ChatOps"-like experience where approvals happen in seconds, the latency of polling (e.g., every 30 seconds) may be unacceptable. In such cases, the tshd gRPC service (as used in Teleport Connect) is preferred as it maintains a persistent connection.8

### **4.3 Plugin Architecture**

Teleport supports server-side plugins (Slack, Jira, PagerDuty) that also listen for these events. A desktop app effectively acts as a "Client-Side Plugin." It is crucial that the desktop app handles the AccessRequest resource structure correctly, specifically the spec.reviews field, which contains the approvals. The app must validate that the _threshold_ of approvals (e.g., "requires 2 approvers") has been met before enabling the "Assume" button in the UI, mirroring the logic enforced by the Auth Service.

## **5\. Telemetry and Audit: Session Recording**

Teleport provides deep observability by recording interactive sessions (SSH, Kubernetes exec, Database queries). A comprehensive desktop integration allows users to review these sessions directly within the application.

### **5.1 Protocol Buffers and the Audit Log**

Historically, Teleport used a JSON-based audit log. However, to support high-throughput streaming and efficient storage, session recordings have transitioned to a **Protocol Buffers (Protobuf)** stream format.37

- **Event Structure:** The recording is a linear sequence of events. Key event types include:
  - session.start: Metadata about the session (user, node, timestamp).
  - print: The raw byte stream sent to the Pseudo-Terminal (PTY). This is the payload that allows "replay."
  - resize: Terminal window resize events (rows/cols), critical for correct playback rendering.
  - session.end: Summary statistics and exit code.

### **5.2 The "Upload Completer" and Consistency**

Session recordings are uploaded in chunks. In asynchronous recording modes (where the node records to local disk first), there can be a delay before the session is available for playback. The **Upload Completer** service in Teleport scans for abandoned or incomplete chunks (e.g., from a node crash) and finalizes the recording to make it playable.37 The desktop player must be resilient to "in-progress" sessions where the stream might pause while waiting for the next chunk to arrive from the node.

### **5.3 Building a Session Player**

To implement playback in a desktop app:

1. **Fetch the Stream:** The application uses the API (or tsh play \--format=json) to fetch the session events.39
   - tsh play \<session_id\> \--format=json outputs a stream of JSON objects, where the bytes field is Base64-encoded.
2. **Rendering Engine:** The standard approach is to feed these decoded bytes into a web-based terminal emulator component like **xterm.js** or **hterm**.
3. **Timing and Synchronization:** The player loop must respect the time or delay field of each event. A naive "while loop" will dump the entire text instantly. The player must use setTimeout or a requestAnimationFrame delta-time loop to render the bytes at the recorded speed, preserving the "movie" capability.
4. **BFP Enhanced Recording:** For Linux nodes with BPF enabled, the recording stream contains additional, high-fidelity data (obfuscated commands, script execution) that standard PTY recording misses.37 The player needs to decide whether to render just the visual output or expose the "Enhanced" audit events in a side panel.

## **6\. Connectivity Patterns: Kubernetes and Databases**

Connecting third-party local tools (like kubectl, psql, mysql, mongo) through Teleport is the most operationally complex aspect of desktop integration. It requires bridging standard TCP/HTTP protocols with Teleport's mTLS-enforced tunnels.

### **6.1 Kubernetes Access: The Local Proxy**

Direct access to the Teleport Proxy via kubectl is not possible because Teleport uses a custom authentication handshake involving ALPN (Application-Layer Protocol Negotiation) and specific headers to route requests to the correct downstream cluster.

#### **6.1.1 Implementation Pattern: tsh proxy kube**

The robust solution for desktop apps is the **Local Proxy** pattern.41

1. **Process:** The desktop app spawns tsh proxy kube \<cluster_name\> \--port=\<local_port\>.
2. **Listener:** tsh starts a local HTTP/TLS server (e.g., 127.0.0.1:8080).
3. **Config Generation:** The app generates a temporary kubeconfig file.
   - server: https://127.0.0.1:8080
   - user: No certs required (or simple self-signed), as the authentication is handled by the tsh proxy process.
4. **Tooling Compatibility:** The user points their tool (Lens, k9s, kubectl) to this config. The tool sees a standard Kubernetes API endpoint.

This pattern decouples the external tool from Teleport's specific authentication idiosyncrasies, ensuring compatibility with the widest range of K8s ecosystem tools.

#### **6.1.2 Alternative: Exec Plugins**

An alternative is updating the \~/.kube/config to use tsh as an exec credential plugin.43

YAML

users:  
\- name: teleport-user  
 user:  
 exec:  
 command: tsh  
 args: \["kube", "credentials"\]

While cleaner (no background proxy process), this fails with GUI tools that do not support the K8s exec plugin specification or have embedded kubectl clients (e.g., some older IDEs). The Local Proxy pattern is therefore safer for a general-purpose desktop app.

### **6.2 Database Access: Authenticated Tunnels**

Database protocols (Postgres, MySQL, MongoDB) present similar challenges. They require mTLS with specific Subject Alternative Names (SANs) that match the Teleport routing logic.

#### **6.2.1 Implementation Pattern: tsh proxy db**

The **Authenticated Tunnel** is the standard solution.26

- **Command:** tsh proxy db \--db-user=alice \--db-name=prod \--tunnel \--port=\<local_port\> \<db_service_name\>
- **Mechanism:** tsh establishes a persistent connection to the Teleport Proxy. It listens on localhost:\<local_port\>.
- **Protocol Translation:**
  - **Client Side:** The user's DB client connects to localhost. It typically disables SSL or accepts a self-signed cert from tsh.
  - **Tunnel:** tsh wraps the traffic in the user's valid mTLS certificate and forwards it.
  - **Server Side:** The Teleport Proxy unwraps the mTLS, validates the identity, and forwards the traffic to the database.

#### **6.2.2 Port Allocation Strategy**

A desktop app managing multiple connections must handle port allocation intelligently.

- **Random:** Allow tsh to pick a random port (by passing port 0 or leaving it blank) and parsing the "Started proxy on..." output.
- **Registry:** The app should maintain a registry of active tunnels to prevent port collisions and allow users to "reconnect" to the same port if their DB client configuration is static.

## **7\. Deep Dive: Teleport Connect Source Analysis**

Analyzing the architecture of **Teleport Connect** (the Electron app) provides the blueprint for a production-grade implementation. The source code reveals a sophisticated multi-process architecture designed for resilience.1

### **7.1 Process Architecture**

Teleport Connect does not run as a single monolithic process. It utilizes:

1. **Main Process (Electron):** Handles window management, native menus, and OS integration.
2. **Shared Process:** A hidden background window or worker that acts as the "backend for the frontend." It spawns and manages the tshd daemon.
3. **tshd (Daemon):** As discussed in Section 2.1.2, this is the long-running CLI process.

### **7.2 The gRPC-over-IPC Layer**

The communication between the Shared Process and tshd is the nervous system of the application.

- **Proto Definition:** They utilize TerminalService and TshdEventsService protobuf definitions.
- **Transport:** The app creates a secure channel using Unix domain sockets (or named pipes).
- **State Management:** Instead of caching cluster state (nodes, apps, DBs) in a local SQLite database, Connect treats tshd as the single source of truth. When the UI renders the "Nodes" table, it streams the data directly from tshd via gRPC. This ensures the UI never displays "stale" state that contradicts the underlying cryptographic credentials stored in \~/.tsh.

### **7.3 Telemetry and Privacy**

Teleport Connect includes a telemetry system that anonymizes cluster IDs using HMAC-SHA256.2 The key for the HMAC is a random UUID generated for the cluster. This allows Gravitational to track usage metrics (e.g., "How many SSH sessions are launched?") without being able to reverse-engineer the specific cluster or user identity, preserving the privacy of on-premise deployments.

## **8\. Conclusion**

Integrating Teleport into a desktop application is a significant engineering undertaking that requires navigating the intersection of modern web technologies (Electron/React) and low-level systems programming (gRPC, mTLS, SSH, PTYs).

The analysis confirms that the **Sidecar/Daemon Architecture**—wrapping the tsh binary and communicating via gRPC—is the optimal path for most teams. It balances the need for a responsive, rich User Interface with the rigorous security and stability requirements of the Teleport Access Plane. By adhering to RFC 8252 for authentication, leveraging OS-level secure storage for credentials, and implementing the Local Proxy pattern for K8s and Database access, developers can build a desktop experience that is both secure by design and transparent to the end-user. The detailed examination of Teleport Connect’s internal architecture serves as the definitive reference model: decouple the UI from the protocol, enforce strict process isolation, and rely on the battle-tested CLI core for all cryptographic operations.

#### **Works cited**

1. gravitational/teleport: The easiest, and most secure way to access and protect all of your infrastructure. \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport](https://github.com/gravitational/teleport)
2. Using Teleport Connect, accessed January 17, 2026, [https://goteleport.com/docs/connect-your-client/teleport-clients/teleport-connect/](https://goteleport.com/docs/connect-your-client/teleport-clients/teleport-connect/)
3. Teleport Agent Architecture, accessed January 17, 2026, [https://goteleport.com/docs/reference/architecture/agents/](https://goteleport.com/docs/reference/architecture/agents/)
4. Teleport Core Concepts, accessed January 17, 2026, [https://goteleport.com/docs/core-concepts/](https://goteleport.com/docs/core-concepts/)
5. Inter-process communication with gRPC | Microsoft Learn, accessed January 17, 2026, [https://learn.microsoft.com/en-us/aspnet/core/grpc/interprocess?view=aspnetcore-10.0](https://learn.microsoft.com/en-us/aspnet/core/grpc/interprocess?view=aspnetcore-10.0)
6. Make tsh daemon gRPC server use Unix sockets on Windows · Issue \#33207 \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/issues/33207](https://github.com/gravitational/teleport/issues/33207)
7. Using gRPC for (local) inter-process communication | F. Werner's Research Page, accessed January 17, 2026, [https://www.mpi-hd.mpg.de/personalhomes/fwerner/research/2021/09/grpc-for-ipc/](https://www.mpi-hd.mpg.de/personalhomes/fwerner/research/2021/09/grpc-for-ipc/)
8. Add gRPC logging to Teleport Connect · Issue \#28642 \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/issues/28642](https://github.com/gravitational/teleport/issues/28642)
9. teleport package \- github.com/juser0719/teleport \- Go Packages, accessed January 17, 2026, [https://pkg.go.dev/github.com/juser0719/teleport](https://pkg.go.dev/github.com/juser0719/teleport)
10. client package \- github.com/gravitational/teleport/api/client \- Go Packages, accessed January 17, 2026, [https://pkg.go.dev/github.com/gravitational/teleport/api/client](https://pkg.go.dev/github.com/gravitational/teleport/api/client)
11. Using the Teleport API, accessed January 17, 2026, [https://goteleport.com/docs/zero-trust-access/api/](https://goteleport.com/docs/zero-trust-access/api/)
12. teleport/api/proto/README.md at master \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/blob/master/api/proto/README.md](https://github.com/gravitational/teleport/blob/master/api/proto/README.md)
13. Configuring gRPC connections to remote gRPC servers \- IBM, accessed January 17, 2026, [https://www.ibm.com/docs/en/datapower-gateway/10.6.x?topic=processing-configuring-grpc-connections-remote-grpc-servers](https://www.ibm.com/docs/en/datapower-gateway/10.6.x?topic=processing-configuring-grpc-connections-remote-grpc-servers)
14. Running Teleport with Self-Signed Certificates, accessed January 17, 2026, [https://goteleport.com/docs/zero-trust-access/deploy-a-cluster/self-signed-certs/](https://goteleport.com/docs/zero-trust-access/deploy-a-cluster/self-signed-certs/)
15. Implement SSH x509v3 certificates (RFC6187) · Issue \#8960 · gravitational/teleport \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/issues/8960](https://github.com/gravitational/teleport/issues/8960)
16. RFC 8252: OAuth 2.0 for Native Apps, accessed January 17, 2026, [https://www.rfc-editor.org/rfc/rfc8252.html](https://www.rfc-editor.org/rfc/rfc8252.html)
17. RFC 9700 \- Best Current Practice for OAuth 2.0 Security \- IETF Datatracker, accessed January 17, 2026, [https://datatracker.ietf.org/doc/rfc9700/](https://datatracker.ietf.org/doc/rfc9700/)
18. OAuth 2.0 for Browser-Based Apps \- IETF, accessed January 17, 2026, [https://www.ietf.org/archive/id/draft-ietf-oauth-browser-based-apps-17.html](https://www.ietf.org/archive/id/draft-ietf-oauth-browser-based-apps-17.html)
19. Use a System Browser \- OAuth 2.0 Simplified, accessed January 17, 2026, [https://www.oauth.com/oauth2-servers/oauth-native-apps/use-system-browser/](https://www.oauth.com/oauth2-servers/oauth-native-apps/use-system-browser/)
20. Personal opinion: login to social via Webview should be banned for security reasons. It has always been a bad practice. \- Reddit, accessed January 17, 2026, [https://www.reddit.com/r/androiddev/comments/ocujy9/personal_opinion_login_to_social_via_webview/](https://www.reddit.com/r/androiddev/comments/ocujy9/personal_opinion_login_to_social_via_webview/)
21. Using the AppAuth PKCE to Authenticate to your Electron Application, accessed January 17, 2026, [https://developers.onelogin.com/api-authorization/using-the-appauth-pkce-to-authenticate-to-your-electron-application](https://developers.onelogin.com/api-authorization/using-the-appauth-pkce-to-authenticate-to-your-electron-application)
22. Loopback Interface Redirection | by Takahiko Kawasaki \- Medium, accessed January 17, 2026, [https://darutk.medium.com/loopback-interface-redirection-53b7b0dbefcb](https://darutk.medium.com/loopback-interface-redirection-53b7b0dbefcb)
23. What redirect URI should I use for an authorization call used in an Electron app?, accessed January 17, 2026, [https://stackoverflow.com/questions/64530295/what-redirect-uri-should-i-use-for-an-authorization-call-used-in-an-electron-app](https://stackoverflow.com/questions/64530295/what-redirect-uri-should-i-use-for-an-authorization-call-used-in-an-electron-app)
24. Electron redirect URI scheme best practices \- \`http(s)\` vs custom protocol · Issue \#6798 · AzureAD/microsoft-authentication-library-for-js \- GitHub, accessed January 17, 2026, [https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/6798](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/6798)
25. How can i handle OAuth2 with Electron? : r/electronjs \- Reddit, accessed January 17, 2026, [https://www.reddit.com/r/electronjs/comments/1kq21fi/how_can_i_handle_oauth2_with_electron/](https://www.reddit.com/r/electronjs/comments/1kq21fi/how_can_i_handle_oauth2_with_electron/)
26. tsh CLI reference \- Teleport, accessed January 17, 2026, [https://goteleport.com/docs/reference/cli/tsh/](https://goteleport.com/docs/reference/cli/tsh/)
27. Database GUI client connection mode · gravitational teleport · Discussion \#21654 \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/discussions/21654](https://github.com/gravitational/teleport/discussions/21654)
28. Teleport Authentication, accessed January 17, 2026, [https://goteleport.com/docs/reference/architecture/authentication/](https://goteleport.com/docs/reference/architecture/authentication/)
29. safeStorage | Electron, accessed January 17, 2026, [https://electronjs.org/docs/latest/api/safe-storage](https://electronjs.org/docs/latest/api/safe-storage)
30. Security | Electron, accessed January 17, 2026, [https://electronjs.org/docs/latest/tutorial/security](https://electronjs.org/docs/latest/tutorial/security)
31. Security Implications in Electron as a Web Browser \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/59458233/security-implications-in-electron-as-a-web-browser](https://stackoverflow.com/questions/59458233/security-implications-in-electron-as-a-web-browser)
32. Pressing Buttons with Popups (on Twitch, LinkedIn and more) | Jorian Woltjer, accessed January 17, 2026, [https://jorianwoltjer.com/blog/p/hacking/pressing-buttons-with-popups](https://jorianwoltjer.com/blog/p/hacking/pressing-buttons-with-popups)
33. How to enable a pop up for authentication for electron? \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/44543664/how-to-enable-a-pop-up-for-authentication-for-electron](https://stackoverflow.com/questions/44543664/how-to-enable-a-pop-up-for-authentication-for-electron)
34. Connect: Allow tshd to bless arbitrary links for opening in browser · Issue \#62808 \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/issues/62808](https://github.com/gravitational/teleport/issues/62808)
35. Resource Access Requests | Teleport, accessed January 17, 2026, [https://goteleport.com/docs/identity-governance/access-requests/resource-requests/](https://goteleport.com/docs/identity-governance/access-requests/resource-requests/)
36. How to Build an Access Request Plugin \- Teleport, accessed January 17, 2026, [https://goteleport.com/docs/identity-governance/access-requests/plugins/how-to-build/](https://goteleport.com/docs/identity-governance/access-requests/plugins/how-to-build/)
37. Teleport Session Recording, accessed January 17, 2026, [https://goteleport.com/docs/reference/architecture/session-recording/](https://goteleport.com/docs/reference/architecture/session-recording/)
38. Issue \#3549 · gravitational/teleport \- Session streaming \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/issues/3549](https://github.com/gravitational/teleport/issues/3549)
39. How are the Session recordings supposed to work for Applications ? · gravitational teleport · Discussion \#11334 \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/discussions/11334](https://github.com/gravitational/teleport/discussions/11334)
40. Enhanced SSH Session Recording with BPF \- Teleport \- YouTube, accessed January 17, 2026, [https://www.youtube.com/watch?v=8uO5H-iYw5A](https://www.youtube.com/watch?v=8uO5H-iYw5A)
41. Teleport Connect: native support for \`tsh proxy kube\` · Issue \#28049 \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/issues/28049](https://github.com/gravitational/teleport/issues/28049)
42. Enrolled my EKS cluster in Teleport, but kubectl only works with tsh — how do I fix this?? : r/kubernetes \- Reddit, accessed January 17, 2026, [https://www.reddit.com/r/kubernetes/comments/1o5drg9/enrolled_my_eks_cluster_in_teleport_but_kubectl/](https://www.reddit.com/r/kubernetes/comments/1o5drg9/enrolled_my_eks_cluster_in_teleport_but_kubectl/)
43. Setting Up Access Controls for Kubernetes \- Teleport, accessed January 17, 2026, [https://goteleport.com/docs/enroll-resources/kubernetes-access/manage-access/](https://goteleport.com/docs/enroll-resources/kubernetes-access/manage-access/)
44. Database GUI Clients | Teleport, accessed January 17, 2026, [https://goteleport.com/docs/connect-your-client/third-party/gui-clients/](https://goteleport.com/docs/connect-your-client/third-party/gui-clients/)
45. Database Access CLI Reference | Teleport, accessed January 17, 2026, [https://goteleport.com/docs/enroll-resources/database-access/reference/cli/](https://goteleport.com/docs/enroll-resources/database-access/reference/cli/)
46. 0097-teleport-connect-usage-metrics.md \- GitHub, accessed January 17, 2026, [https://github.com/gravitational/teleport/blob/master/rfd/0097-teleport-connect-usage-metrics.md](https://github.com/gravitational/teleport/blob/master/rfd/0097-teleport-connect-usage-metrics.md)
