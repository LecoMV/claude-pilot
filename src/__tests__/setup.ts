/**
 * Global Test Setup
 *
 * This setup file runs for all test environments.
 * Browser-specific mocks are conditionally applied when window exists.
 *
 * @module setup
 */

import { vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

// ===========================================================================
// COMMON SETUP (ALL ENVIRONMENTS)
// ===========================================================================

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})

// Suppress console.error for expected errors in tests
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0]
    if (
      typeof message === 'string' &&
      (message.includes('Warning:') || message.includes('Error boundary'))
    ) {
      return
    }
    originalConsoleError.apply(console, args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
})

// ===========================================================================
// BROWSER-SPECIFIC SETUP (RENDERER TESTS ONLY)
// ===========================================================================

// Only apply browser mocks when running in browser-like environment
if (typeof window !== 'undefined') {
  // Import jest-dom matchers for React testing
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@testing-library/jest-dom')

  // Import cleanup for explicit DOM cleanup between tests
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { configure, cleanup } = require('@testing-library/react')

  // Configure testing-library with shorter async timeout to prevent observer leaks
  configure({
    asyncUtilTimeout: 1000, // Reduce from default 1000ms to fail faster
    // Limit DOM debug output to prevent massive test logs
    getElementError: (message: string | null) => {
      const error = new Error(message ?? '')
      error.name = 'TestingLibraryElementError'
      return error
    },
  })

  // Ensure DOM cleanup after each test
  afterEach(async () => {
    // Cleanup testing-library (removes mounted React trees, cleans up observers)
    cleanup()
    // Clear any lingering test elements
    document.body.innerHTML = ''
    // Flush pending microtasks to allow MutationObserver callbacks to complete
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  // Mock window.electron API for renderer tests
  const mockElectronAPI = {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn().mockReturnValue(() => {}),
    send: vi.fn(),
  }

  Object.defineProperty(window, 'electron', {
    value: mockElectronAPI,
    writable: true,
  })

  // Mock matchMedia for responsive tests
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock scrollIntoView (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn()

  // Mock clipboard API
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
      writable: true,
    })
  }

  // Mock WebGL2RenderingContext for sigma.js / react-force-graph
  class MockWebGL2RenderingContext {
    canvas: HTMLCanvasElement

    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas
    }

    getExtension() {
      return null
    }
    getParameter() {
      return 0
    }
    createTexture() {
      return {}
    }
    bindTexture() {}
    texImage2D() {}
    texParameteri() {}
    generateMipmap() {}
    createBuffer() {
      return {}
    }
    bindBuffer() {}
    bufferData() {}
    enable() {}
    disable() {}
    blendFunc() {}
    createProgram() {
      return {}
    }
    createShader() {
      return {}
    }
    shaderSource() {}
    compileShader() {}
    attachShader() {}
    linkProgram() {}
    getProgramParameter() {
      return true
    }
    getShaderParameter() {
      return true
    }
    useProgram() {}
    getUniformLocation() {
      return {}
    }
    getAttribLocation() {
      return 0
    }
    enableVertexAttribArray() {}
    vertexAttribPointer() {}
    clearColor() {}
    clear() {}
    drawArrays() {}
    viewport() {}
  }

  // @ts-expect-error - Mocking global WebGL context for sigma.js tests
  global.WebGL2RenderingContext =
    MockWebGL2RenderingContext as unknown as typeof WebGL2RenderingContext
  // @ts-expect-error - Mocking global WebGL context for sigma.js tests
  global.WebGLRenderingContext =
    MockWebGL2RenderingContext as unknown as typeof WebGLRenderingContext
}

// ===========================================================================
// NODE-SPECIFIC GLOBALS (MAIN PROCESS TESTS)
// ===========================================================================

// Mock ResizeObserver (needed even in Node for some imports)
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
}

// Mock IntersectionObserver
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
}
