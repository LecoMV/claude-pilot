# **Claude Pilot: Enterprise Audit Remediation & Modernization Report**

## **1\. Executive Overview and Architectural State Analysis**

The modernization of enterprise-grade Electron applications represents a distinct class of software engineering challenge, one that sits at the volatile intersection of web technologies and operating system internals. This report serves as the comprehensive technical remediation plan for the "Claude Pilot" application, following the critical audit findings delivered by Antigravity (Google DeepMind) in January 2026\. The audit has exposed structural vulnerabilities that are not merely code quality issues but fundamental architectural liabilities threatening the application’s stability, security posture, and long-term maintainability.

The focus of this remediation effort is threefold: the immediate elimination of blocking I/O operations that degrade the main process event loop; the strategic migration from a brittle, string-based Inter-Process Communication (IPC) layer to a type-safe, contract-driven architecture using tRPC; and the rigorous excision of legacy code that increases the application's attack surface. The transition from legacy handlers to tRPC is not simply a syntactic refactor—it is a paradigm shift intended to enforce strict boundaries and predictable behavior across the Node.js/Chromium bridge.

Current analysis of the codebase reveals a "split-brain" architecture. While previous efforts have successfully migrated 201 handlers to tRPC controllers and eliminated 36 execSync calls, the remaining technical debt is concentrated in high-risk areas: the WatchdogService and the terminal emulation layer. The findings highlight a critical dissonance between the application's modern aspirations and its legacy foundations. The presence of execSync in a service designed for system monitoring is particularly egregious, as it renders the "watchdog" blind and deaf during the very operations it is meant to oversee. Furthermore, the 5,868 lines of code residing in src/main/ipc/handlers.ts represent a massive surface area for logical regressions and security exploits, necessitating a disciplined, phased deprecation strategy.

This document synthesizes findings from the provided audit summary and extensive external research into Electron design patterns, node-pty integration, and systemd security constraints. It provides a roadmap that is exhaustive in detail, addressing the "how" and "why" of every required change, from the low-level mechanics of Node.js streams to the high-level abstractions of React hooks.

## ---

**2\. Phase 1: WatchdogService Async Refactor (CRITICAL)**

The audit identified Blocking I/O in WatchdogService as a finding of CRITICAL severity. This classification is justified not only by the potential for user interface freezes but by the fundamental violation of the Node.js concurrency model. The file in question, src/main/services/watchdog.ts, contains five instances of execSync.1 In a monitoring service likely tasked with polling system status or managing container lifecycles via Podman, synchronous execution is functionally disastrous.

### **2.1. The Pathology of Blocking I/O in Electron**

To understand the necessity of the remediation, one must first dissect the failure mode of execSync within the Electron Main Process. Electron’s Main Process is a standard Node.js process responsible for managing application lifecycle, window creation, and native APIs. Node.js relies on a single-threaded event loop architecture, orchestrated by the libuv library, to handle non-blocking I/O operations efficiently.

When execSync is invoked, it bypasses the event loop's capability to offload work to the kernel or a thread pool. Instead, it halts the V8 JavaScript engine's execution thread entirely. It spawns a subshell, executes the command, and waits—synchronously—for the child process to terminate and flush its standard output (stdout) and standard error (stderr) buffers. During this blocking period, the Main Process is effectively comatose.

#### **2.1.1. Operational Consequences**

The ramifications of this "comatose" state extend beyond simple performance degradation:

- **IPC Deadlock:** The Renderer process communicates with the Main process via IPC. If the Renderer sends a synchronous message (though discouraged) or awaits an asynchronous invoke while the Main process is blocked on execSync, the Renderer will hang. In severe cases, this triggers the operating system's "Application Not Responding" (ANR) heuristics, prompting the user to force-quit the application.
- **Event Starvation:** A Watchdog service implies a duty to observe and react. However, while blocked on an execSync call—perhaps checking if a systemd unit is active—the event loop cannot process other incoming signals, timers, or I/O events. If the systemd call hangs due to a system lock, the Watchdog does not just fail to report; it drags the entire application down with it.2
- **UI Jitter and Freeze:** Electron applications rely on the Main process to coordinate window painting and state updates. Blocking the Main process severs the link to the GPU process and Renderer, resulting in visible stutters or complete interface freezes.

### **2.2. Remediation Architecture: The spawnAsync Pattern**

The required solution is to transition from synchronous shell execution to asynchronous process spawning using the spawnAsync utility. This utility, already verified in services.controller.ts, presumably wraps the core Node.js child_process.spawn API in a Promise-based interface.3

#### **2.2.1. spawn vs. exec: A Security and Performance Distinction**

The migration is not merely replacing execSync with exec. The audit explicitly mandates spawnAsync. The distinction between exec and spawn is critical for both performance and security:

- **Buffering vs. Streaming:** exec buffers the entire output of the child process in memory before returning it. If a command generates megabytes of log data, this can crash the Node.js process due to memory exhaustion (maxBuffer exceeded). spawn, conversely, returns stream objects (stdout and stderr) that consume data in chunks, offering far superior memory characteristics.4
- **Shell Injection Surface:** exec spawns a shell (e.g., /bin/sh \-c) and passes the command as a single string. This creates an immediate vulnerability to shell injection if any part of that string is user-controlled. spawn takes the command and its arguments as separate parameters (file and args array). It invokes the underlying system call (e.g., execvp on POSIX) directly, bypassing the shell. This renders most shell injection attacks (like appending ; rm \-rf /) inert, as the injection payload is treated as a literal argument rather than executable code.5

#### **2.2.2. Implementation Strategy for watchdog.ts**

The refactoring of src/main/services/watchdog.ts requires a disciplined transformation of control flow. The following steps detail the necessary code modifications and their architectural implications.

Step 1: Import Swap  
The first change is the immediate removal of the synchronous import to prevent regression.

TypeScript

// DELETE  
import { execSync } from 'child_process';  
// INSERT  
import { spawnAsync } from '../utils/spawn-async';

Step 2: Method Conversion (async/await Propagation)  
Each of the five methods currently using execSync must be converted to an async function. This change is viral; it fundamentally alters the method's signature from returning a value (e.g., boolean) to returning a Promise\<boolean\>.

- _Current (Blocking):_  
  TypeScript  
  public isServiceActive(serviceName: string): boolean {  
   try {  
   execSync(\`systemctl is-active ${serviceName}\`);  
   return true;  
   } catch {  
   return false;  
   }  
  }

- _Refactored (Non-Blocking):_  
  TypeScript  
  public async isServiceActive(serviceName: string): Promise\<boolean\> {  
   try {  
   await spawnAsync('systemctl', \['is-active', serviceName\]);  
   return true;  
   } catch (error) {  
   // Handle specific exit codes if necessary  
   return false;  
   }  
  }

Step 3: Call Site Updates  
Because the method signatures have changed, all upstream callers of the Watchdog service must be identified and updated to await the new Promises. If these callers are currently synchronous, they too must be converted to async, propagating the non-blocking pattern up the stack until it reaches the IPC handler boundary.  
Step 4: Input Sanitization and Validation  
The audit explicitly requires "Input Sanitization" (Point 5). While spawn protects against shell syntax injection, it does not protect against logical abuse of the target CLI. If the Watchdog accepts a service name from the frontend, an attacker might pass a valid but malicious unit name or flags.  
Research into systemd unit naming 6 reveals that unit names are essentially filenames and are subject to character restrictions. However, the @ symbol allows for templated units (e.g., user@1000.service), which introduces complexity.8

- **Sanitization Requirement:** Implement a strict allowlist or a regular expression validator that conforms to systemd specifications (alphanumeric, \_, ., \-, @) but strictly disallows path separators (/) or control characters.
- **Zod Schema:** If these inputs come via tRPC (in Phase 2), a Zod schema should enforce this validation at the network boundary.  
  TypeScript  
  const ServiceNameSchema \= z.string().regex(/^\[a-zA-Z0-9@.\_-\]+$/);

### **2.3. Deep Dive: Secure Execution of System Services**

The Watchdog likely interacts with podman or systemd. Research highlights specific nuances when spawning these processes from Node.js in an Electron context.

Podman and Systemd Context:  
Running systemctl \--user or interacting with rootless Podman requires the correct environment variables, specifically XDG_RUNTIME_DIR.9 spawn does not automatically inherit the parent process's environment if an env option is provided; it replaces it. The spawnAsync utility implementation must ensure it merges process.env with any custom variables to maintain the connection to the user's session bus.  
Handling Exit Codes:  
Unlike execSync which throws on non-zero exit codes, spawn behavior depends on the wrapper implementation. A robust spawnAsync should reject the Promise on non-zero exit codes (unless configured otherwise), mimicking the execSync control flow but asynchronously. This allows try/catch blocks to correctly interpret service failures (e.g., systemctl returning exit code 3 for "inactive").10

## ---

**3\. Phase 2: Frontend Migration to tRPC**

The migration of the frontend to tRPC addresses the "Medium" severity finding but serves as the linchpin for the entire modernization effort. The current state is characterized by extreme fragmentation: only 5 tRPC calls exist alongside 139 legacy IPC invocations. This phase aims to invert that ratio.

### **3.1. The IPC vs. tRPC Architectural Divergence**

The transition from standard Electron IPC to tRPC is not merely a change in syntax; it is a shift from loose, string-based coupling to a strongly typed, contract-based architecture.

- **Legacy IPC Pattern:** The legacy handlers.ts approach relies on ipcMain.handle('channel-name',...) and ipcRenderer.invoke('channel-name',...). This pattern effectively treats the IPC channel name as a "magic string." There is no compile-time guarantee that the payload sent by the renderer matches the handler's expectations, nor that the return type is correctly inferred. This leads to "any-typed" data flow and frequent runtime errors during refactoring.11
- **The tRPC Paradigm:** tRPC (TypeScript Remote Procedure Call) abstracts the transport layer entirely. The backend (Main process) defines a Router with Procedures, which are strictly typed using Zod. The frontend (Renderer) imports the _type definition_ (not the code) of this router. A call to trpc.watchdog.getStatus.query() is statically analyzed. If the backend schema changes, the frontend build fails immediately, enforcing strict synchronization between processes.12

### **3.2. Phase 2a: Core Hooks Migration Strategy**

The migration strategy prioritizes "Core Hooks" (Week 1). This is a high-leverage approach because React hooks often encapsulate the data fetching logic for multiple components.

Target: useSystemStatus hook.  
Research indicates this hook likely polls the Watchdog service.14

- **Current State:**  
  TypeScript  
  // Legacy Hook  
  const useSystemStatus \= () \=\> {  
   const \= useState(null);  
   useEffect(() \=\> {  
   ipcRenderer.invoke('system:status').then(setStatus);  
   },);  
   return status;  
  };

- **Target State (tRPC):**  
  TypeScript  
  // Modern Hook  
  const useSystemStatus \= () \=\> {  
   return trpc.watchdog.status.useQuery();  
  };

  This migration immediately leverages tanstack-query (bundled with tRPC), providing caching, deduplication, and background refetching without custom boilerplate.12

### **3.3. Technical Implementation: The ipcLink**

A critical technical detail for this migration is the transport link. Standard tRPC uses HTTP. Electron requires a specialized adapter. Research confirms that electron-trpc provides an ipcLink that tunnels tRPC requests over Electron's IPC channels.15

Configuration Requirement:  
The preload.ts must explicitly expose the tRPC mechanism using exposeElectronTRPC.

TypeScript

import { exposeElectronTRPC } from 'electron-trpc/main';  
process.once('loaded', async () \=\> {  
 exposeElectronTRPC();  
});

This function sets up a secured MessagePort or IPC channel specifically for tRPC traffic, isolating it from the legacy ipcRenderer.send allowing for the eventual removal of the legacy context bridge.15

### **3.4. Blocking Issue: Terminal Subscriptions and PTY Integration**

The audit identifies "Terminal Subscriptions" as a blocking issue for Phase 2\. The current implementation uses window.electron.on('terminal:data:${sessionId}'). The recommendation is "Option 3: Full migration separate effort." However, this report argues for a hybrid interim approach that prepares for full tRPC adoption.

#### **3.4.1. The Challenge of Real-Time Streams**

Terminal emulation generates high-frequency, non-deterministic data streams. node-pty emits data events whenever the underlying shell process writes to stdout.4

Research Topic 1 & 3: Real-Time Patterns and PTY Integration  
The standard tRPC pattern for real-time data is Subscriptions, powered by Observables.19

- **Mechanism:** The ipcLink in electron-trpc supports full bi-directional streaming. It does not require WebSockets; it tunnels subscription frames over IPC.13
- **The "Observable" Bridge:** To migrate the terminal, the engineering team must wrap the node-pty EventEmitter in a tRPC observable.

TypeScript

// Server-side (Main Process)  
import { observable } from '@trpc/server/observable';  
import { EventEmitter } from 'events';

export const terminalRouter \= t.router({  
 onData: t.procedure  
 .input(z.object({ sessionId: z.string() }))  
 .subscription(({ input }) \=\> {  
 return observable\<string\>((emit) \=\> {  
 const pty \= getPtySession(input.sessionId);  
 const onData \= (data: string) \=\> emit.next(data);  
 pty.on('data', onData);  
 // Teardown  
 return () \=\> {  
 pty.off('data', onData);  
 };  
 });  
 }),  
});

#### **3.4.2. Performance Implications and "The Tax"**

Research suggests a potential performance "tax" when using tRPC for high-throughput streams in Electron.21 The data must flow through:

1. node-pty (C++ native module)
2. Node.js Buffer \-\> String conversion
3. tRPC Router
4. SuperJSON serialization (if enabled)
5. Electron IPC boundary
6. SuperJSON deserialization
7. React Component \-\> xterm.js

For a terminal dumping megabytes of text (e.g., cat huge_file.log), the overhead of steps 3, 4, and 6 could introduce latency compared to raw IPC.  
Recommendation: For Phase 2, stick to the hybrid approach. Keep the raw data stream on a dedicated terminal:data channel (optimized for raw buffers) but migrate the control logic (resize, kill, spawn) to tRPC. This balances type safety for commands with raw performance for data.21

## ---

**4\. Phase 3: Legacy Cleanup and Security Hardening**

The existence of src/main/ipc/handlers.ts (5,868 lines) is a massive technical debt liability. Phase 3 focuses on the systematic elimination of this file.

### **4.1. Deprecation Lifecycle**

The cleanup must follow a rigorous lifecycle to prevent regression:

1. **Audit:** Use static analysis (grep or custom ESLint) to map every string channel in handlers.ts to its frontend usage.
2. **Parallel Implementation:** As tRPC procedures are created (e.g., watchdog.restart), the legacy handler ipcMain.handle('watchdog:restart') should be marked @deprecated.
3. **Cutover:** Once the frontend calls are updated, the legacy handler is removed.

### **4.2. Security Hardening: Context Bridge**

The audit notes the need to "Update preload to remove legacy channel allowlist."

- **Current Vulnerability:** Legacy preloads often expose ipcRenderer.send wrapped in a whitelist check: if (validChannels.includes(channel))....22 This still exposes a generic message passing interface.
- **Target State:** With tRPC, the only exposed API should be the tRPC client bridge. The goal is to remove window.electron.ipcRenderer entirely from the main world. This reduces the attack surface significantly: a compromised renderer cannot arbitrarily fuzz the main process IPC listeners if the generic transport mechanism is removed.23

## ---

**5\. Comprehensive Research Findings & Best Practices**

The audit requested research into three specific topics. The following analysis synthesizes the collected data into actionable guidance.

### **5.1. Topic 1: electron-trpc Real-Time Patterns**

**Insight:** The industry standard for real-time in tRPC is the **Subscription** procedure returning an **Observable**.19

- **Data Consistency:** tRPC subscriptions ensure that the types of data pushed from the server exactly match the types expected by the client callback.
- **Backpressure:** While tRPC observables are powerful, they do not natively handle backpressure (flow control) over IPC. If the server emits data faster than the renderer can render (a common issue in terminals), the IPC buffer can fill up.
- **Best Practice:** For standard logs, tRPC subscriptions are ideal. For high-volume streams, consider batching emissions or using a custom Link that supports flow control, though standard ipcLink is usually sufficient for non-binary streams.20

### **5.2. Topic 2: Incremental IPC Migration Strategies**

**Insight:** The **Strangler Fig** pattern is the only viable strategy for a 5,000+ line legacy codebase.26

- **Hybrid Preload:** It is technically safe to expose _both_ legacy and tRPC bridges simultaneously. contextBridge.exposeInMainWorld can be called multiple times with different keys (window.electron for legacy, implicit wiring for tRPC).27
- **Namespace collision:** Ensure the legacy API does not use the same global namespace as the tRPC client.
- **Order of Operations:**
  1. **Queries (Getters):** Lowest risk. Migrate useSystemStatus, getLogs, etc.
  2. **Mutations (Actions):** Higher risk. Migrate restartService, killProcess.
  3. **Subscriptions:** Highest complexity. Migrate terminal and file watchers last.

### **5.3. Topic 3: Terminal PTY \+ tRPC Integration**

**Insight:** The integration is heavily dependent on native module management.

- **Native Modules:** node-pty is a C++ addon. It must be recompiled against the specific Electron version ABI using @electron/rebuild or it will throw NODE_MODULE_VERSION errors at runtime.28
- **Data Flow Architecture:** The ideal architecture treats the PTY as an event source. The Main process binds listeners to the PTY's on('data') event and forwards them.
- **Security:** node-pty spawns a real shell. Input arguments to pty.spawn must be sanitized just as strictly as child_process.spawn.
- **Zombie Processes:** A common failure mode in Electron/PTY apps is "zombie" shells remaining active after the window closes. The Main process must hook into window.on('closed') to explicitly pty.kill() all active sessions.2

## ---

**6\. Implementation Roadmap**

### **Week 1: Foundation & Watchdog (Phase 1 & 2a)**

- **Task:** Implement spawnAsync utility with merged process environment.
- **Task:** Refactor WatchdogService to async/await, removing all execSync.
- **Task:** Define WatchdogRouter in tRPC backend.
- **Task:** Migrate useSystemStatus hook to trpc.watchdog.status.useQuery.
- **Validation:** Verify UI responsiveness during heavy polling.

### **Week 2: Stores & Mutations (Phase 2b)**

- **Task:** Identify global stores (Redux/Zustand) triggering IPC calls.
- **Task:** Replace IPC actions with trpc.procedure.mutateAsync.
- **Task:** Implement strict Zod schemas for all mutation inputs (especially service names).

### **Week 3: Terminal & Components (Phase 2c)**

- **Task:** Implement "Hybrid" Terminal: Control via tRPC, Data via legacy IPC (for now).
- **Task:** Prototype tRPC Subscription for terminal data (on a feature branch) to benchmark performance.
- **Task:** Recompile node-pty using @electron/rebuild.

### **Week 4-6: The Great Cleanup (Phase 3\)**

- **Task:** Systematically delete migrated handlers from handlers.ts.
- **Task:** Remove legacy channels from preload.ts allowlists.
- **Task:** Final security audit of exposeInMainWorld.

## ---

**7\. Technical Reference Data**

### **7.1. IPC vs. tRPC Architectural Comparison**

| Feature              | Legacy IPC (ipcMain / ipcRenderer)   | tRPC (electron-trpc)           | Implications for Remediation                                       |
| :------------------- | :----------------------------------- | :----------------------------- | :----------------------------------------------------------------- |
| **Type Safety**      | **None** (Implicit / Any)            | **Strict** (TypeScript \+ Zod) | Eliminates runtime contract errors; enables safe refactoring.      |
| **Transport**        | Manual Channel Strings ("svc:start") | Abstracted (ipcLink)           | Reduces cognitive load; prevents channel naming collisions.        |
| **Developer Exp.**   | High Friction (Boilerplate)          | High Velocity (Autocompletion) | Accelerates feature development once infrastructure is in place.   |
| **Runtime Overhead** | Low (Native Serialization)           | Moderate (SuperJSON \+ Layers) | **Risk:** High-frequency streams (terminal) may need optimization. |
| **Security**         | Manual Validation Required           | Schema Validation (Zod)        | Input sanitization is enforced by design at the boundary.          |

### **7.2. Systemd Service Name Validation Rules**

To prevent injection in Phase 1, the following constraints must be enforced on service name inputs 6:

| Constraint        | Rule / Regex                    | Rationale                                              |
| :---------------- | :------------------------------ | :----------------------------------------------------- |
| **Allowed Chars** | \[a-zA-Z0-9:.\_\\-\]            | Standard systemd unit alphabet.                        |
| **Templating**    | @ allowed (e.g., user@.service) | Essential for parameterized units (Watchdog use case). |
| **Length**        | Max 256 chars                   | systemd hard limit.                                    |
| **Prohibited**    | / (Path separators), ;, \`      | \`                                                     |

## **8\. Conclusion**

The audit remediation plan for Claude Pilot outlines a necessary evolution from a prototype-grade architecture to an enterprise-ready foundation. By eliminating blocking I/O in the Watchdog service, the application will achieve immediate stability gains. The migration to tRPC, while introducing a slight runtime abstraction cost, pays massive dividends in code safety, developer velocity, and security. The legacy handlers.ts file is a liability that must be dismantled. Through the disciplined execution of this roadmap, leveraging the specific patterns of spawnAsync and electron-trpc subscriptions, Claude Pilot will emerge as a robust, modern Electron application.

#### **Works cited**

1. accessed December 31, 1969, [https://github.com/LecoMV/claude-pilot/blob/master/src/main/services/watchdog.ts](https://github.com/LecoMV/claude-pilot/blob/master/src/main/services/watchdog.ts)
2. Node child processes: how to intercept signals like SIGINT \- Stack Overflow, accessed January 18, 2026, [https://stackoverflow.com/questions/44788013/node-child-processes-how-to-intercept-signals-like-sigint](https://stackoverflow.com/questions/44788013/node-child-processes-how-to-intercept-signals-like-sigint)
3. accessed December 31, 1969, [https://github.com/LecoMV/claude-pilot/blob/master/src/main/utils/spawn-async.ts](https://github.com/LecoMV/claude-pilot/blob/master/src/main/utils/spawn-async.ts)
4. Electron react listen to stdout from a terminal command \- Stack Overflow, accessed January 18, 2026, [https://stackoverflow.com/questions/67341654/electron-react-listen-to-stdout-from-a-terminal-command](https://stackoverflow.com/questions/67341654/electron-react-listen-to-stdout-from-a-terminal-command)
5. CVE-2025-55182: React2Shell Analysis, Proof-of-Concept Chaos, and In-the-Wild Exploitation \- Trend Micro, accessed January 18, 2026, [https://www.trendmicro.com/ru_ru/research/25/l/CVE-2025-55182-analysis-poc-itw.html](https://www.trendmicro.com/ru_ru/research/25/l/CVE-2025-55182-analysis-poc-itw.html)
6. systemd.unit \- Freedesktop.org, accessed January 18, 2026, [https://www.freedesktop.org/software/systemd/man/systemd.unit.html](https://www.freedesktop.org/software/systemd/man/systemd.unit.html)
7. Systemd service name with spaces \- Stack Overflow, accessed January 18, 2026, [https://stackoverflow.com/questions/58092818/systemd-service-name-with-spaces](https://stackoverflow.com/questions/58092818/systemd-service-name-with-spaces)
8. systemd \- ArchWiki, accessed January 18, 2026, [https://wiki.archlinux.org/title/Systemd](https://wiki.archlinux.org/title/Systemd)
9. podman-system-service, accessed January 18, 2026, [https://docs.podman.io/en/latest/markdown/podman-system-service.1.html](https://docs.podman.io/en/latest/markdown/podman-system-service.1.html)
10. Electron Adventures: Episode 16: Streaming Terminal Output \- DEV Community, accessed January 18, 2026, [https://dev.to/taw/electron-adventures-episode-16-streaming-terminal-output-431g](https://dev.to/taw/electron-adventures-episode-16-streaming-terminal-output-431g)
11. Inter-Process Communication \- Electron, accessed January 18, 2026, [https://electronjs.org/docs/latest/tutorial/ipc](https://electronjs.org/docs/latest/tutorial/ipc)
12. How to Implement Real-Time Functionality with React & TRPC.io \- Telerik.com, accessed January 18, 2026, [https://www.telerik.com/blogs/how-to-implement-real-time-functionality-react-trpc](https://www.telerik.com/blogs/how-to-implement-real-time-functionality-react-trpc)
13. jsonnull/electron-trpc: Build type-safe Electron inter-process communication using tRPC, accessed January 18, 2026, [https://github.com/jsonnull/electron-trpc](https://github.com/jsonnull/electron-trpc)
14. accessed December 31, 1969, [https://github.com/LecoMV/claude-pilot/blob/master/src/renderer/hooks/useSystemStatus.ts](https://github.com/LecoMV/claude-pilot/blob/master/src/renderer/hooks/useSystemStatus.ts)
15. Getting Started \- electron-trpc, accessed January 18, 2026, [https://electron-trpc.dev/getting-started/](https://electron-trpc.dev/getting-started/)
16. mat-sz/trpc-electron: Fork of electron-trpc for trpc 11.x.x \- GitHub, accessed January 18, 2026, [https://github.com/mat-sz/trpc-electron](https://github.com/mat-sz/trpc-electron)
17. Use isolated world API in electron renderer \- Stack Overflow, accessed January 18, 2026, [https://stackoverflow.com/questions/79345861/use-isolated-world-api-in-electron-renderer](https://stackoverflow.com/questions/79345861/use-isolated-world-api-in-electron-renderer)
18. Can't get node-pty to work in Electron · Issue \#1156 \- GitHub, accessed January 18, 2026, [https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/1156](https://github.com/nklayman/vue-cli-plugin-electron-builder/issues/1156)
19. Subscriptions \- tRPC, accessed January 18, 2026, [https://trpc.io/docs/server/subscriptions](https://trpc.io/docs/server/subscriptions)
20. HTTP Batch Stream Link \- tRPC, accessed January 18, 2026, [https://trpc.io/docs/client/links/httpBatchStreamLink](https://trpc.io/docs/client/links/httpBatchStreamLink)
21. The Case Against electron-trpc: When Type Safety Becomes a Performance Tax, accessed January 18, 2026, [https://ifebitcoin.org/hm/z6MkgisVMELvqnsCo3dYmtVpy8PiqPGMVwfAyBWFn84vebq4/z6EbFQ95f5gmnA](https://ifebitcoin.org/hm/z6MkgisVMELvqnsCo3dYmtVpy8PiqPGMVwfAyBWFn84vebq4/z6EbFQ95f5gmnA)
22. Electron 'contextBridge' \- javascript \- Stack Overflow, accessed January 18, 2026, [https://stackoverflow.com/questions/59993468/electron-contextbridge](https://stackoverflow.com/questions/59993468/electron-contextbridge)
23. contextBridge \- Electron, accessed January 18, 2026, [https://electronjs.org/docs/latest/api/context-bridge](https://electronjs.org/docs/latest/api/context-bridge)
24. Using Preload Scripts \- Electron, accessed January 18, 2026, [https://electronjs.org/docs/latest/tutorial/tutorial-preload](https://electronjs.org/docs/latest/tutorial/tutorial-preload)
25. feat: Streaming Mutations / Queries · Issue \#4477 · trpc/trpc \- GitHub, accessed January 18, 2026, [https://github.com/trpc/trpc/issues/4477](https://github.com/trpc/trpc/issues/4477)
26. Migrate from v9 to v10 \- tRPC, accessed January 18, 2026, [https://trpc.io/docs/v10/migrate-from-v9-to-v10](https://trpc.io/docs/v10/migrate-from-v9-to-v10)
27. Auto generate exposeInMainWorld typings for preload scripts exports · Issue \#141 · alex8088/electron-vite \- GitHub, accessed January 18, 2026, [https://github.com/alex8088/electron-vite/issues/141](https://github.com/alex8088/electron-vite/issues/141)
28. Native Node Modules | Electron, accessed January 18, 2026, [https://electronjs.org/docs/latest/tutorial/using-native-node-modules](https://electronjs.org/docs/latest/tutorial/using-native-node-modules)
29. How do I correctly launch a shell environment with node-pty in Electron? \- Stack Overflow, accessed January 18, 2026, [https://stackoverflow.com/questions/72051509/how-do-i-correctly-launch-a-shell-environment-with-node-pty-in-electron](https://stackoverflow.com/questions/72051509/how-do-i-correctly-launch-a-shell-environment-with-node-pty-in-electron)
