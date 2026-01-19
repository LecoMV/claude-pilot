/**
 * CodeEditor Component Tests
 *
 * Tests the Monaco-based code editor component including:
 * - Rendering with different languages
 * - Value display and onChange callback
 * - Read-only mode
 * - Editor options (minimap, line numbers, word wrap)
 * - Height configuration
 * - Custom theme application
 * - CodeViewer wrapper component
 * - Loading state
 *
 * @module CodeEditor.test
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeEditor, CodeViewer } from '../CodeEditor'

// ===========================================================================
// MOCK SETUP
// ===========================================================================

// Mock Monaco editor mount handler
let mockOnMount: ((editor: MockEditor) => void) | undefined
let mockOnChange: ((value: string | undefined) => void) | undefined
let mockBeforeMount: ((monaco: MockMonaco) => void) | undefined

interface MockEditor {
  getValue: () => string
  setValue: (value: string) => void
  dispose: () => void
}

interface MockMonaco {
  editor: {
    defineTheme: (name: string, theme: object) => void
  }
}

// Mock the @monaco-editor/react Editor component
vi.mock('@monaco-editor/react', () => ({
  default: ({
    value,
    onChange,
    onMount,
    beforeMount,
    language,
    height,
    theme,
    options,
    loading,
  }: {
    value: string
    onChange?: (value: string | undefined) => void
    onMount?: (editor: MockEditor) => void
    beforeMount?: (monaco: MockMonaco) => void
    language?: string
    height?: string | number
    theme?: string
    options?: object
    loading?: React.ReactNode
  }) => {
    // Capture the handlers for testing
    mockOnMount = onMount
    mockOnChange = onChange
    mockBeforeMount = beforeMount

    return (
      <div
        data-testid="monaco-editor"
        data-language={language}
        data-height={height}
        data-theme={theme}
        data-options={JSON.stringify(options)}
      >
        <div data-testid="editor-value">{value}</div>
        {loading && <div data-testid="editor-loading">{loading}</div>}
      </div>
    )
  },
  loader: {
    config: vi.fn(),
  },
}))

// Mock Monaco editor module
vi.mock('monaco-editor', () => ({
  default: {},
}))

// Mock Monaco workers
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({
  default: vi.fn(),
}))

vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({
  default: vi.fn(),
}))

vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({
  default: vi.fn(),
}))

// ===========================================================================
// TESTS
// ===========================================================================

describe('CodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnMount = undefined
    mockOnChange = undefined
    mockBeforeMount = undefined
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // RENDERING
  // =========================================================================

  describe('Rendering', () => {
    it('renders Monaco editor', () => {
      render(<CodeEditor value="test content" />)

      expect(screen.getByTestId('monaco-editor')).toBeDefined()
    })

    it('displays value in editor', () => {
      render(<CodeEditor value="Hello World" />)

      expect(screen.getByTestId('editor-value').textContent).toBe('Hello World')
    })

    it('renders with wrapper container', () => {
      render(<CodeEditor value="test" />)

      const wrapper = document.querySelector('.rounded-lg.overflow-hidden.border')
      expect(wrapper).not.toBeNull()
    })

    it('applies custom className', () => {
      render(<CodeEditor value="test" className="my-custom-class" />)

      const wrapper = document.querySelector('.my-custom-class')
      expect(wrapper).not.toBeNull()
    })
  })

  // =========================================================================
  // LANGUAGE SUPPORT
  // =========================================================================

  describe('Language Support', () => {
    it('defaults to markdown language', () => {
      render(<CodeEditor value="# Heading" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-language')).toBe('markdown')
    })

    it('accepts markdown language', () => {
      render(<CodeEditor value="# Heading" language="markdown" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-language')).toBe('markdown')
    })

    it('accepts json language', () => {
      render(<CodeEditor value='{"key": "value"}' language="json" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-language')).toBe('json')
    })

    it('accepts yaml language', () => {
      render(<CodeEditor value="key: value" language="yaml" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-language')).toBe('yaml')
    })

    it('accepts javascript language', () => {
      render(<CodeEditor value="const x = 1" language="javascript" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-language')).toBe('javascript')
    })

    it('accepts typescript language', () => {
      render(<CodeEditor value="const x: number = 1" language="typescript" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-language')).toBe('typescript')
    })
  })

  // =========================================================================
  // HEIGHT CONFIGURATION
  // =========================================================================

  describe('Height Configuration', () => {
    it('defaults to 400px height', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-height')).toBe('400px')
    })

    it('accepts custom height as string', () => {
      render(<CodeEditor value="test" height="200px" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-height')).toBe('200px')
    })

    it('accepts custom height as number', () => {
      render(<CodeEditor value="test" height={300} />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-height')).toBe('300')
    })
  })

  // =========================================================================
  // READ-ONLY MODE
  // =========================================================================

  describe('Read-Only Mode', () => {
    it('defaults to editable', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.readOnly).toBe(false)
    })

    it('enables read-only mode when specified', () => {
      render(<CodeEditor value="test" readOnly />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.readOnly).toBe(true)
    })
  })

  // =========================================================================
  // EDITOR OPTIONS
  // =========================================================================

  describe('Editor Options', () => {
    it('disables minimap by default', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.minimap.enabled).toBe(false)
    })

    it('enables minimap when specified', () => {
      render(<CodeEditor value="test" minimap />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.minimap.enabled).toBe(true)
    })

    it('enables line numbers by default', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.lineNumbers).toBe('on')
    })

    it('disables line numbers when specified', () => {
      render(<CodeEditor value="test" lineNumbers={false} />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.lineNumbers).toBe('off')
    })

    it('enables word wrap by default', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.wordWrap).toBe('on')
    })

    it('accepts custom word wrap setting', () => {
      render(<CodeEditor value="test" wordWrap="off" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.wordWrap).toBe('off')
    })

    it('sets correct font family', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.fontFamily).toContain('JetBrains Mono')
    })

    it('sets font size to 13', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.fontSize).toBe(13)
    })

    it('enables smooth cursor animation', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.cursorSmoothCaretAnimation).toBe('on')
    })

    it('sets tab size to 2', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.tabSize).toBe(2)
    })

    it('enables automatic layout', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.automaticLayout).toBe(true)
    })

    it('enables bracket pair colorization', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      const options = JSON.parse(editor.getAttribute('data-options') || '{}')
      expect(options.bracketPairColorization.enabled).toBe(true)
    })
  })

  // =========================================================================
  // THEME CONFIGURATION
  // =========================================================================

  describe('Theme Configuration', () => {
    it('uses claude-dark theme', () => {
      render(<CodeEditor value="test" />)

      const editor = screen.getByTestId('monaco-editor')
      expect(editor.getAttribute('data-theme')).toBe('claude-dark')
    })

    it('defines custom theme on beforeMount', () => {
      render(<CodeEditor value="test" />)

      const mockMonaco = {
        editor: {
          defineTheme: vi.fn(),
        },
      }

      // Trigger beforeMount callback
      if (mockBeforeMount) {
        mockBeforeMount(mockMonaco)
      }

      expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
        'claude-dark',
        expect.objectContaining({
          base: 'vs-dark',
          inherit: true,
          rules: expect.any(Array),
          colors: expect.objectContaining({
            'editor.background': '#1e1e2e',
          }),
        })
      )
    })
  })

  // =========================================================================
  // CHANGE HANDLING
  // =========================================================================

  describe('Change Handling', () => {
    it('calls onChange when editor value changes', () => {
      const handleChange = vi.fn()
      render(<CodeEditor value="test" onChange={handleChange} />)

      // Simulate editor change
      if (mockOnChange) {
        mockOnChange('new value')
      }

      expect(handleChange).toHaveBeenCalledWith('new value')
    })

    it('does not crash when onChange is not provided', () => {
      render(<CodeEditor value="test" />)

      // Simulate editor change - should not throw
      if (mockOnChange) {
        expect(() => mockOnChange('new value')).not.toThrow()
      }
    })

    it('does not call onChange for undefined values', () => {
      const handleChange = vi.fn()
      render(<CodeEditor value="test" onChange={handleChange} />)

      // Simulate editor change with undefined
      if (mockOnChange) {
        mockOnChange(undefined)
      }

      expect(handleChange).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // EDITOR MOUNT
  // =========================================================================

  describe('Editor Mount', () => {
    it('stores editor reference on mount', () => {
      render(<CodeEditor value="test" />)

      const mockEditor: MockEditor = {
        getValue: vi.fn(),
        setValue: vi.fn(),
        dispose: vi.fn(),
      }

      // Trigger onMount callback
      if (mockOnMount) {
        expect(() => mockOnMount(mockEditor)).not.toThrow()
      }
    })
  })

  // =========================================================================
  // LOADING STATE
  // =========================================================================

  describe('Loading State', () => {
    it('renders loading spinner while loading', () => {
      render(<CodeEditor value="test" />)

      // The mock renders the loading component
      const loadingContainer = screen.getByTestId('editor-loading')
      expect(loadingContainer).toBeDefined()
    })

    it('loading spinner has correct styling', () => {
      render(<CodeEditor value="test" />)

      const loadingContainer = screen.getByTestId('editor-loading')
      const spinner = loadingContainer.querySelector('.animate-spin')
      expect(spinner).not.toBeNull()
    })
  })
})

// ===========================================================================
// CodeViewer TESTS
// ===========================================================================

describe('CodeViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnMount = undefined
    mockOnChange = undefined
    mockBeforeMount = undefined
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders as read-only CodeEditor', () => {
    render(<CodeViewer value="test content" />)

    const editor = screen.getByTestId('monaco-editor')
    const options = JSON.parse(editor.getAttribute('data-options') || '{}')
    expect(options.readOnly).toBe(true)
  })

  it('defaults to markdown language', () => {
    render(<CodeViewer value="test" />)

    const editor = screen.getByTestId('monaco-editor')
    expect(editor.getAttribute('data-language')).toBe('markdown')
  })

  it('accepts custom language', () => {
    render(<CodeViewer value='{"key": "value"}' language="json" />)

    const editor = screen.getByTestId('monaco-editor')
    expect(editor.getAttribute('data-language')).toBe('json')
  })

  it('defaults to 300px height', () => {
    render(<CodeViewer value="test" />)

    const editor = screen.getByTestId('monaco-editor')
    expect(editor.getAttribute('data-height')).toBe('300px')
  })

  it('accepts custom height', () => {
    render(<CodeViewer value="test" height="500px" />)

    const editor = screen.getByTestId('monaco-editor')
    expect(editor.getAttribute('data-height')).toBe('500px')
  })

  it('disables line numbers', () => {
    render(<CodeViewer value="test" />)

    const editor = screen.getByTestId('monaco-editor')
    const options = JSON.parse(editor.getAttribute('data-options') || '{}')
    expect(options.lineNumbers).toBe('off')
  })

  it('disables minimap', () => {
    render(<CodeViewer value="test" />)

    const editor = screen.getByTestId('monaco-editor')
    const options = JSON.parse(editor.getAttribute('data-options') || '{}')
    expect(options.minimap.enabled).toBe(false)
  })

  it('applies custom className', () => {
    render(<CodeViewer value="test" className="viewer-class" />)

    const wrapper = document.querySelector('.viewer-class')
    expect(wrapper).not.toBeNull()
  })
})
