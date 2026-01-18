# **Production-Ready Architectures for Electron-tRPC in Large-Scale Applications**

## **1\. Executive Summary and Architectural Context**

The evolution of the Electron framework has been characterized by a relentless march toward tighter security and process isolation, often at the expense of developer ergonomics. In the early days of Electron, the remote module permitted a seamless, albeit insecure, bridging of the JavaScript environment between the main and renderer processes. Its deprecation and the subsequent enforcement of **Context Isolation** fundamentally altered the architectural landscape, forcing developers to rely on explicit Inter-Process Communication (IPC) channels. While secure, this model reintroduced the fragility of loose typing: developers found themselves managing a sprawling web of string-based channel names ("get-user", "update-settings") and manually casting any types on payload reception.

The emergence of electron-trpc represents a significant attempt to reclaim the developer experience (DX) of the remote era without sacrificing the security guarantees of Context Isolation. By adapting the tRPC protocol—originally designed for type-safe client-server communication over HTTP—to the Electron IPC transport layer, it promises end-to-end type safety, autocompletion, and refactoring confidence. However, integrating electron-trpc into a large-scale, production-critical application like Claude Pilot requires a nuanced understanding of the trade-offs involved. The abstraction layer that provides type safety imposes a "performance tax" regarding serialization overhead, startup latency, and memory usage that can become prohibitive if not architected correctly.1

This research report provides a comprehensive analysis of production-ready patterns for deploying electron-trpc in large applications. It synthesizes data from technical documentation, performance benchmarks, and community discourse to address specific challenges: high-throughput binary streaming, robust error handling, memory-safe subscriptions, and the migration from legacy IPC patterns. The central thesis of this analysis is that a **Hybrid Architecture**—using electron-trpc for control logic and metadata while leveraging native MessagePorts or ephemeral IPC channels for heavy data transfer—is the only viable path for performance-critical Electron apps.

### **1.1 The Anatomy of the Abstraction Tax**

To optimize electron-trpc, one must first dissect the mechanical transformations that occur during a procedure call. In a raw Electron implementation, a data request traverses three layers: the UI Component triggers a function on the contextBridge, which calls ipcRenderer.invoke, which is caught by ipcMain.handle. In contrast, an electron-trpc call navigates a "seven-layer stack": the Component calls the tRPC Client, which passes data to the IPC Link, across the IPC boundary, to the Main Process Handler, through the Router, into the Procedure, and finally to the business logic.2

This added complexity manifests primarily as **Serialization Overhead**. Electron's IPC relies on the HTML standard Structured Clone Algorithm to serialize objects.3 While this algorithm is more capable than JSON.stringify (supporting Map, Set, Date, and Buffer), electron-trpc typically layers an additional serialization step (often using superjson) to preserve type fidelity across the wire. For a simple getter returning a boolean, this overhead is negligible. However, for a massive application transferring complex state or large files, the double-serialization cost—first by superjson, then by Electron's IPC—can introduce noticeable latency and garbage collection pauses.2

Furthermore, the initialization of the tRPC router on the main process and the client proxy on the renderer process contributes to the application's "Time to Interactive" (TTI). In large applications with hundreds of procedures, parsing the router definition and setting up the IPC listeners can delay the readiness of the application window. Reports from production deployments indicate that naive implementations can force users to wait significantly for the "daemon" to become ready before the window appears, a pattern described as "user-hostile".1 Production-ready patterns must therefore prioritize asynchronous, non-blocking initialization and lazy-loading of router segments.

## **2\. Large Payload Transfers and Binary Streaming**

A critical requirement for the Claude Pilot software is the efficient transfer of large payloads. The standard tRPC query/mutation model is fundamentally ill-suited for this task in an Electron environment. A standard tRPC request requires the entire payload to be loaded into memory, serialized into a string (or a JSON-compatible object), passed over the IPC bridge, deserialized, and then processed. For a 500MB file or a high-frequency stream of data, this approach leads to massive memory spikes, blocking the main thread, and rendering the UI unresponsive.

### **2.1 The Limits of Standard IPC for Binaries**

When electron-trpc processes a request, it treats the input and output as atomic units. If an application attempts to send a large file via a standard mutation:

1. The file is read into a Buffer in the Main process.
2. The Buffer is often converted to a base64 string or a plain array to satisfy JSON constraints if superjson is not perfectly tuned.
3. Even if passed as a Buffer (which Electron supports), the IPC mechanism copies the data from the Main process memory space to the Renderer process memory space.
4. This copying operation is CPU-intensive and synchronous regarding the event loop tick, causing frame drops (jank).6

Empirical evidence from the community highlights that attempting to chunk large files into multiple tRPC calls introduces significant overhead due to the repeated header processing and router traversal for each chunk.8 For high-frequency updates, such as a real-time sensor feed or a fast-moving log stream, the serialization latency of tRPC can throttle the throughput below acceptable levels.9

### **2.2 Pattern 1: The Hybrid MessagePort Architecture**

The superior architectural pattern for large data transfer in Electron is to bypass the standard IPC methods (send/invoke) entirely for the data payload, utilizing **MessagePorts** and **Transferable Objects**. MessagePorts are a web standard allowing two-way communication between contexts (e.g., workers, frames). Crucially, they support "transferring" ownership of specific data types (like ArrayBuffer) rather than copying them. When an ArrayBuffer is transferred, the memory reference is moved to the receiving process, and the original process loses access. This operation is effectively instantaneous, regardless of the data size.10

**Implementation Pattern:**

The recommended pattern decouples the "Control Plane" (tRPC) from the "Data Plane" (MessagePort):

1.  **Handshake via tRPC:** The Renderer initiates the transfer using a standard tRPC mutation. This request contains metadata (file ID, expected size, encoding) but _no binary data_.  
    TypeScript  
    // Renderer  
    const { port } \= await trpc.files.startDownload.mutate({ fileId: '123' });

    _Note:_ Standard tRPC links over IPC do not natively support returning a MessagePort because MessagePort is not JSON-serializable. Therefore, the handshake often requires a slight deviation or a custom link, or more commonly, a parallel raw IPC call.

2.  **Parallel Protocol Establishment:** A more robust implementation involves the Main process generating a MessageChannel and sending one port to the Renderer via ipcRenderer.postMessage, keyed by a request ID provided in the tRPC call.10  
    **Main Process:**  
    TypeScript  
    import { MessageChannelMain } from 'electron';

    export const appRouter \= t.router({  
     requestFileStream: t.procedure.input(z.string()).mutation(({ input, ctx }) \=\> {  
     const { port1, port2 } \= new MessageChannelMain();  
     // Send port1 to the renderer using raw IPC, correlated by the input ID  
     ctx.window.webContents.postMessage('stream-handshake', { id: input }, \[port1\]);

        // Start streaming data to port2
        startStreamingFile(input, port2);

        return { success: true };

    })  
    });

3.  **Streaming via Port:** The Main process reads the file using Node.js streams. As chunks are read, they are converted to ArrayBuffer and postMessaged through port2.  
    TypeScript  
    stream.on('data', (chunk) \=\> {  
     // Zero-copy transfer  
     const buffer \= chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset \+ chunk.byteLength);  
     port2.postMessage({ data: buffer }, \[buffer\]);  
    });

4.  **Reception:** The Renderer listens for the port, opens it, and processes incoming chunks directly. This bypasses the tRPC router, the serialization transformers, and the JSON parsing overhead entirely.10

### **2.3 Pattern 2: Ephemeral IPC Channels**

If MessagePorts introduce too much complexity regarding listener management, a "Reader/Writer" pattern using ephemeral IPC channels is a viable alternative for medium-sized payloads.

1. **Subscription:** The Renderer subscribes to a tRPC subscription fileProgress({ id: 'file-1' }).
2. **Chunking:** The Main process reads the file and emits events via mainWindow.webContents.send.
3. **Optimization:** To avoid locking the UI, the Main process should throttle chunks to match the Renderer's consumption rate (backpressure). However, true backpressure is difficult to achieve over IPC without MessagePorts.

Community benchmarks suggest that for simple "fire and forget" streams, raw ipcRenderer.send is significantly faster than ipcRenderer.invoke (which tRPC uses for queries/mutations) because it does not wait for a reply, allowing for higher throughput of chunk transmission.4

### **2.4 Upload Strategy: The "Path-First" Approach**

For the Claude Pilot software, file uploads (e.g., analyzing a local codebase) should generally _not_ involve transferring file contents from Renderer to Main. Since the Main process has full filesystem access (via Node.js fs), the most performant pattern is to pass the **file path** string instead of the file blob.1

In Electron, the DOM File object has a non-standard path property containing the absolute filesystem path.

**Anti-Pattern (Do not use):**

TypeScript

// Renderer reads file into memory \-\> passes to tRPC \-\> Main writes to disk  
const content \= await file.text();  
trpc.files.upload.mutate({ content }); // HUGE memory spike \+ serialization cost

**Recommended Pattern:**

TypeScript

// Renderer passes path \-\> Main reads from disk  
const path \= file.path;  
trpc.files.analyze.mutate({ filePath: path }); // Zero payload cost

This effectively reduces the IPC payload to a few bytes, regardless of the file size. If the file originates from a drag-and-drop operation or a file input, this path property is always available. If the content is generated in memory in the Renderer (e.g., a canvas export), use the MessagePort pattern to transfer the ArrayBuffer to Main for writing.

## **3\. Subscription Management and Real-Time Updates**

Real-time capabilities are essential for modern applications, powering features like operation progress bars, live log tailing, or collaborative state updates. electron-trpc supports subscriptions, typically built on top of EventEmitters or Observables. However, the lifecycle of an Electron window differs from a browser tab, leading to specific risks regarding memory leaks and "zombie" listeners.

### **3.1 The Zombie Listener Problem**

A common issue in Electron development occurs when a Renderer process reloads (e.g., during development or user-triggered refresh). The Main process, being persistent, may maintain active subscriptions for the now-defunct Renderer. If the subscription handler keeps a reference to the webContents or IpcMainInvokeEvent of the destroyed window, this creates a memory leak that grows with every refresh.13

Standard event listeners (ipcMain.on) do not automatically clean themselves up when the sender disconnects. While electron-trpc attempts to manage this, rigorous defensiveness is required in the procedure definition.

### **3.2 Best Practice: Async Generators with AbortController**

The most robust pattern for managing subscriptions in tRPC v10+ within Electron is the usage of **Async Generators** combined with an AbortController. This pattern ensures that cleanup logic is executed deterministically when the connection is severed.

**Code Pattern:**

TypeScript

import { on } from 'events';

export const appRouter \= t.router({  
 onLogUpdate: t.procedure.subscription(async function\* (opts) {  
 const ac \= new AbortController();

    // Using Node.js 'events.on' to create an async iterator
    // The 'signal' option automatically removes the listener when aborted
    const stream \= on(logEmitter, 'log', { signal: ac.signal });

    try {
      for await (const of stream) {
        // Yield data to the client
        yield eventData;
      }
    } finally {
      // This block runs when the client disconnects or the loop breaks
      ac.abort();
      console.log('Subscription Cleaned Up');
    }

}),  
});

This pattern leverages the finally block to guarantee resource release, preventing the accumulation of listeners in the Main process.15

### **3.3 Throttling and Batching Strategies**

In high-frequency scenarios (e.g., syncing mouse movements or fast logs), sending every single event over IPC will saturate the channel and starve the Renderer's main thread, leading to a frozen UI. The solution is **Server-Side Batching**.

Instead of yielding every event:

1. The Main process buffers events into an array.
2. A timer flushes this buffer every X milliseconds (e.g., 50ms or 100ms).
3. The tRPC subscription yields the _array_ of events.

This reduces the IPC overhead from N \* (Header \+ Payload) to (N/BatchSize) \* (Header \+ Payload). The reduced frequency allows the Renderer to perform layout and painting updates between message processing.4

**Implementation Logic:**

TypeScript

// Inside the subscription generator  
let buffer: LogEntry \=;  
const FLUSH_INTERVAL \= 100;

logEmitter.on('data', (entry) \=\> buffer.push(entry));

while (true) {  
 await new Promise(resolve \=\> setTimeout(resolve, FLUSH_INTERVAL));  
 if (buffer.length \> 0) {  
 yield buffer;  
 buffer \=;  
 }  
}

## **4\. Robust Error Handling and Type Safety**

One of the primary value propositions of electron-trpc is type-safe error handling. However, the serialization boundary often strips custom error classes of their identity, delivering generic Error objects to the client. This makes it difficult for the UI to distinguish between a "File Not Found" error (which might prompt a user action) and a "System Crash" (which should show a generic apology).

### **4.1 The SuperJSON Transformer**

To maintain the prototype chain of error objects across the IPC boundary, the integration of **SuperJSON** is mandatory. SuperJSON is a serialization library that supports custom class registration.16

**Configuration Steps:**

1. **Define Shared Errors:** Create a shared library of error classes extending Error.  
   TypeScript  
   export class FileSystemError extends Error {  
    constructor(public path: string, message: string) {  
    super(message);  
    this.name \= 'FileSystemError';  
    }  
   }

2. **Register Classes:** Both the Main process (server) and Renderer process (client) must import a configuration file that registers these classes with SuperJSON.  
   TypeScript  
   // shared/serialization.ts  
   import SuperJSON from 'superjson';  
   import { FileSystemError } from './errors';

   SuperJSON.registerClass(FileSystemError, { identifier: 'FileSystemError' });  
   SuperJSON.allowErrorProps('path'); // Whitelist custom properties

3. **Link Configuration:** Configure the tRPC router and client to use this specific SuperJSON instance as the transformer.

This setup allows the Renderer to use instanceof checks in try/catch blocks or React Error Boundaries:

TypeScript

try {  
 await trpc.files.read.query({ path: '...' });  
} catch (err) {  
 if (err.cause instanceof FileSystemError) {  
 // Handle specific file error  
 showToast(\`Could not read file at ${err.cause.path}\`);  
 }  
}

_Note:_ tRPC wraps application errors in a TRPCClientError. The actual custom error is typically found in the cause property or requires specific error formatting on the server to expose.18

### **4.2 Error Boundaries and Middleware**

For a large application, centralized error handling is preferred over localized try/catch. React Error Boundaries can catch errors thrown by tRPC hooks.

Additionally, **tRPC Middleware** on the Main process acts as a global safety net. It can capture all errors thrown by procedures, log them to an external observability service (like Sentry), and then re-throw them to the client. This ensures that the Main process never crashes silently due to an unhandled exception in a procedure.20

## **5\. Performance Profiling and Optimization**

Profiling an Electron app using tRPC is distinct from profiling a standard web app because the "backend" performance directly impacts the "frontend" responsiveness due to shared resource contention on the local machine.

### **5.1 Measuring Serialization Cost**

The "hidden" cost of electron-trpc is the serialization/deserialization time. To measure this:

1. Wrap the superjson serialize/deserialize functions with timing logs.
2. Monitor the payload size of IPC messages.
3. **Thresholds:** If a payload takes \>16ms (one frame) to serialize, it will cause dropped frames.

**Optimization Strategy:** If superjson proves too slow for specific high-volume procedures, consider using devalue (which is faster but supports fewer types) or reverting to raw buffers for those specific endpoints.16

### **5.2 The Chrome Performance Tab**

The Chrome DevTools Performance tab in Electron can record both the Renderer and Main process activity (if configured correctly). IPC calls show up as tasks. A specific pattern to look for is "Long Tasks" immediately following an IPC Message Received event. This indicates that the deserialization or the resulting React render cycle is too heavy.

Key Metrics to Watch:

- **IPC Latency:** The gap between ipcRenderer.send and the corresponding action in the Main process.
- **GC Pauses:** Frequent Garbage Collection spikes indicate excessive object creation during serialization (e.g., creating huge JSON strings).

### **5.3 Benchmarking Tools**

Tools like electron-bench can be used to establish a baseline latency for IPC calls on the target hardware.21 Comparisons show that while raw IPC allows for tens of thousands of messages per second, layering tRPC and Zod validation reduces this throughput. This is acceptable for "control" signals but reinforces the need for the "Hybrid Data Plane" for bulk data.22

## **6\. Testing Strategies**

Testing electron-trpc applications requires a bifurcated approach: Unit testing the logic in isolation and Integration testing the IPC layer.

### **6.1 Unit Testing Routers (Headless)**

Since tRPC routers are fundamentally functions that take a context and return a result, they can be tested entirely without Electron. This is critical for CI/CD pipelines where spawning a GUI is slow or impossible.

**Strategy:**

1. **Mock Context:** Create a helper to generate a mock Context object (mocking event.sender, database connections, etc.).23
2. **Create Caller:** Use appRouter.createCaller(mockContext) to obtain a direct interface to the procedures.
3. **Execute:** Call procedures like normal async functions.

TypeScript

// router.test.ts  
import { appRouter } from './router';  
import { createMockContext } from './test-utils';

test('getUser returns data', async () \=\> {  
 const ctx \= createMockContext();  
 const caller \= appRouter.createCaller(ctx);  
 const user \= await caller.users.getById('1');  
 expect(user.id).toBe('1');  
});

### **6.2 Integration Testing with Vitest**

For testing the Renderer components that consume tRPC, mocking the entire IPC chain is tedious. The recommended strategy is to use **Mock Service Worker (MSW)** patterns or explicit Vitest mocks for the trpc client hook.24

Instead of mocking ipcRenderer, mock the trpc react hook module. This allows you to assert that your components react correctly to isLoading, error, and data states without needing a running Main process.

TypeScript

// setupTests.ts  
vi.mock('../utils/trpc', () \=\> ({  
 trpc: {  
 users: {  
 getById: {  
 useQuery: vi.fn().mockReturnValue({ data: { id: '1' }, isLoading: false }),  
 }  
 }  
 }  
}));

## **7\. Migration Guide: From ipcMain.handle to electron-trpc**

Migrating a legacy application to electron-trpc should follow the **Strangler Fig Pattern**. It is not necessary (or recommended) to rewrite the entire IPC layer at once. electron-trpc is compatible with existing ipcMain handlers.

### **7.1 Phase 1: Coexistence**

Initialize the electron-trpc handler in the main process. It listens on specific channels (usually electron-trpc). Your existing ipcMain.handle('get-files',...) calls will continue to work uninterrupted.

### **7.2 Phase 2: Context Mapping**

Legacy handlers often rely on event.sender to identify the calling window. In tRPC, this must be abstracted into the Context.

TypeScript

// context.ts  
export const createContext \= ({ event }: { event: Electron.IpcMainInvokeEvent }) \=\> ({  
 window: BrowserWindow.fromWebContents(event.sender),  
 // other context...  
});

This ensures that migrated procedures still have access to the BrowserWindow instance required for OS-level operations.23

### **7.3 Phase 3: Incremental Refactoring**

Identify clusters of related functionality (e.g., "User Management").

1. Define the Zod schema for inputs/outputs.
2. Move the logic from the ipcMain.handle callback into a tRPC procedure.
3. Update the Renderer call site from ipcRenderer.invoke('get-user', id) to trpc.users.get.query(id).
4. Delete the legacy handler.

Repeat this process module by module. Complex, high-performance handlers (like the file streaming discussed in Section 2\) should likely remain as raw IPC or MessagePorts and should not be forced into tRPC if they don't fit the Request/Response model.1

## **8\. Conclusion**

The integration of electron-trpc into the Claude Pilot software offers a transformative improvement in code quality, maintainability, and developer confidence. The ability to share types seamlessly between the Main and Renderer processes eliminates an entire class of runtime errors common in Electron development.

However, this convenience comes with strict architectural boundaries. The analysis confirms that electron-trpc should act as the **Control Plane** of the application—handling state synchronization, configuration, and command logic. It should _not_ act as the **Data Plane** for high-volume binary transfers or file streaming. For those use cases, a hybrid approach utilizing native MessagePorts and direct file system paths remains the gold standard for performance.

**Actionable Recommendations:**

1. **Hybrid Architecture:** Implement the MessagePort pattern immediately for any file transfer operations larger than 1MB.
2. **Strict Serialization:** Enforce superjson for error handling but monitor its performance impact on large object trees.
3. **Defensive Subscriptions:** Mandate the use of AbortController in all subscription procedures to prevent memory leaks.
4. **Testing:** Adopt a headless unit testing strategy for Routers to ensure logic correctness without the overhead of UI tests.

By adhering to these patterns, the development team can leverage the ergonomic excellence of tRPC while respecting the unique performance constraints of the Electron environment.

### ---

**Data Tables and Comparisons**

**Table 1: Serialization Strategy Comparison**

| Feature           | Standard JSON (JSON.stringify) | Structured Clone (Raw IPC)     | SuperJSON (tRPC Transformer)       | MessagePort (Transferable) |
| :---------------- | :----------------------------- | :----------------------------- | :--------------------------------- | :------------------------- |
| **Speed**         | Fast                           | Moderate                       | Slow (Double Serialization)        | **Instant** (Zero Copy)    |
| **Type Support**  | Primitives, Arrays, Objects    | Date, Map, Set, Buffer, RegExp | **Custom Classes**, Date, Map, Set | ArrayBuffer, MessagePort   |
| **CPU Overhead**  | Low                            | Moderate                       | High                               | None                       |
| **Best Use Case** | Simple config data             | Raw Buffers via invoke         | Domain Objects, Errors             | **Large Files, Streams**   |

**Table 2: Communication Pattern Selection Guide**

| Requirement                                     | Recommended Pattern                 | Rationale                                            |
| :---------------------------------------------- | :---------------------------------- | :--------------------------------------------------- |
| **CRUD Operations** (Get settings, update user) | **tRPC Query/Mutation**             | Type safety is paramount; payload is small.          |
| **File Upload** (\>10MB)                        | **Path Transfer**                   | Avoids reading file into Renderer memory entirely.   |
| **File Download/Streaming**                     | **MessagePort**                     | Zero-copy transfer prevents UI freeze (jank).        |
| **Real-time Log Tailing**                       | **tRPC Subscription (Batched)**     | Type-safe stream; batching prevents IPC flooding.    |
| **Video/Audio Buffer**                          | **MessagePort / SharedArrayBuffer** | minimal latency required; serialization is too slow. |

This report provides the blueprint for a robust, scalable, and high-performance implementation of electron-trpc tailored to the specific needs of the Claude Pilot project.

#### **Works cited**

1. The Case Against electron-trpc: When Type Safety Becomes a Performance Tax, accessed January 17, 2026, [https://ifebitcoin.org/hm/z6MkgisVMELvqnsCo3dYmtVpy8PiqPGMVwfAyBWFn84vebq4/z6EbFQ95f5gmnA](https://ifebitcoin.org/hm/z6MkgisVMELvqnsCo3dYmtVpy8PiqPGMVwfAyBWFn84vebq4/z6EbFQ95f5gmnA)
2. The Case Against electron-trpc: When Type Safety Becomes a Performance Tax, accessed January 17, 2026, [https://ifebitcoin.org/hm/z6MkgisVMELvqnsCo3dYmtVpy8PiqPGMVwfAyBWFn84vebq4/z6EbF6uYy5LfCF](https://ifebitcoin.org/hm/z6MkgisVMELvqnsCo3dYmtVpy8PiqPGMVwfAyBWFn84vebq4/z6EbF6uYy5LfCF)
3. ipcRenderer \- Electron, accessed January 17, 2026, [https://electronjs.org/docs/latest/api/ipc-renderer](https://electronjs.org/docs/latest/api/ipc-renderer)
4. Inter-Process Communication \- Electron, accessed January 17, 2026, [https://electronjs.org/docs/latest/tutorial/ipc](https://electronjs.org/docs/latest/tutorial/ipc)
5. horacio \- Seed Hypermedia, accessed January 17, 2026, [https://seed.hyper.media/hm/profile/z6Mkvz9TgGtv9zsGsdrksfNk1ajbFancgHREJEz3Y2HsAVdk](https://seed.hyper.media/hm/profile/z6Mkvz9TgGtv9zsGsdrksfNk1ajbFancgHREJEz3Y2HsAVdk)
6. How to efficiently pass large array from main to render? · Issue \#1948 \- GitHub, accessed January 17, 2026, [https://github.com/electron/electron/issues/1948](https://github.com/electron/electron/issues/1948)
7. Best way to stream large local media files with electron main process and handle them in the renderer process \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/60906635/best-way-to-stream-large-local-media-files-with-electron-main-process-and-handle](https://stackoverflow.com/questions/60906635/best-way-to-stream-large-local-media-files-with-electron-main-process-and-handle)
8. HTTP 413 payload size error on large client streaming RPCs · Issue \#74 · tower-rs/tower-grpc \- GitHub, accessed January 17, 2026, [https://github.com/tower-rs/tower-grpc/issues/74](https://github.com/tower-rs/tower-grpc/issues/74)
9. Does anyone have experience streaming high-frequency data from a Node Native Addon to the Electron Renderer? : r/electronjs \- Reddit, accessed January 17, 2026, [https://www.reddit.com/r/electronjs/comments/1na0gab/does_anyone_have_experience_streaming/](https://www.reddit.com/r/electronjs/comments/1na0gab/does_anyone_have_experience_streaming/)
10. MessagePorts in Electron, accessed January 17, 2026, [https://electronjs.org/docs/latest/tutorial/message-ports](https://electronjs.org/docs/latest/tutorial/message-ports)
11. Transferable objects \- Web APIs | MDN, accessed January 17, 2026, [https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
12. Using MessagePorts (+ Transferables) over ContextBridge · Issue \#27024 \- GitHub, accessed January 17, 2026, [https://github.com/electron/electron/issues/27024](https://github.com/electron/electron/issues/27024)
13. TRPCClientError: Symbol.asyncDispose already exists · Issue \#2 · mat-sz/trpc-electron, accessed January 17, 2026, [https://github.com/mat-sz/trpc-electron/issues/2](https://github.com/mat-sz/trpc-electron/issues/2)
14. How to properly debug Electron memory issues? \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/69827243/how-to-properly-debug-electron-memory-issues](https://stackoverflow.com/questions/69827243/how-to-properly-debug-electron-memory-issues)
15. bug: Potential memory leak in streaming with v11 · Issue \#6533 · trpc/trpc \- GitHub, accessed January 17, 2026, [https://github.com/trpc/trpc/issues/6533](https://github.com/trpc/trpc/issues/6533)
16. Data Transformers \- tRPC, accessed January 17, 2026, [https://trpc.io/docs/server/data-transformers](https://trpc.io/docs/server/data-transformers)
17. Here comes SuperJSON. JSON serializer with support for custom… | by Nicholas Dobie | One Dead Pixel | Medium, accessed January 17, 2026, [https://medium.com/one-dead-pixel/here-comes-superjson-d7f7776f7e2a](https://medium.com/one-dead-pixel/here-comes-superjson-d7f7776f7e2a)
18. v11: tRPC server returns non-superjson error responses causing client 'Unable to transform response from server' · Issue \#7083 \- GitHub, accessed January 17, 2026, [https://github.com/trpc/trpc/issues/7083](https://github.com/trpc/trpc/issues/7083)
19. How to catch errors inside tRPC Middleware thrown in tRPC procedures? \- Stack Overflow, accessed January 17, 2026, [https://stackoverflow.com/questions/77489779/how-to-catch-errors-inside-trpc-middleware-thrown-in-trpc-procedures](https://stackoverflow.com/questions/77489779/how-to-catch-errors-inside-trpc-middleware-thrown-in-trpc-procedures)
20. trpcMiddleware | Sentry for Electron, accessed January 17, 2026, [https://docs.sentry.io/platforms/javascript/guides/electron/configuration/integrations/trpc/](https://docs.sentry.io/platforms/javascript/guides/electron/configuration/integrations/trpc/)
21. ZacWalk/electron-bench: An Electron app to to benchmarks IPC performance. \- GitHub, accessed January 17, 2026, [https://github.com/ZacWalk/electron-bench](https://github.com/ZacWalk/electron-bench)
22. Electron Adventures: Episode 20: IPC Benchmark \- DEV Community, accessed January 17, 2026, [https://dev.to/taw/electron-adventures-episode-20-ipc-benchmark-2b2d](https://dev.to/taw/electron-adventures-episode-20-ipc-benchmark-2b2d)
23. electron-notes/electron-trpc.md at main · geoff-davis/electron-notes \- GitHub, accessed January 17, 2026, [https://github.com/geoff-davis/electron-notes/blob/main/electron-trpc.md](https://github.com/geoff-davis/electron-notes/blob/main/electron-trpc.md)
24. Mocking with Vitests. I recently started using the T3 stack… | by Muhammad \- Medium, accessed January 17, 2026, [https://medium.com/@self.muhammad/mocking-your-vitests-6d90c768982f](https://medium.com/@self.muhammad/mocking-your-vitests-6d90c768982f)
25. How to mock tRPC procedures with vitest and vitest-mock-extended on client side, accessed January 17, 2026, [https://stackoverflow.com/questions/75923729/how-to-mock-trpc-procedures-with-vitest-and-vitest-mock-extended-on-client-side](https://stackoverflow.com/questions/75923729/how-to-mock-trpc-procedures-with-vitest-and-vitest-mock-extended-on-client-side)
