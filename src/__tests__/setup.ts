import '@testing-library/jest-dom'
import { vi, beforeEach, beforeAll, afterAll } from 'vitest'

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

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
})

// Suppress console.error for expected errors in tests
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Suppress React-related expected errors
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
global.WebGLRenderingContext = MockWebGL2RenderingContext as unknown as typeof WebGLRenderingContext
