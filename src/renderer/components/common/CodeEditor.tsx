import { useRef } from 'react'
import Editor, { OnMount, OnChange } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'

// Monaco loader is configured globally in main.tsx to use local bundle
// This prevents CSP issues with CDN loading

export interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: 'markdown' | 'json' | 'yaml' | 'javascript' | 'typescript'
  readOnly?: boolean
  height?: string | number
  className?: string
  minimap?: boolean
  lineNumbers?: boolean
  wordWrap?: 'on' | 'off' | 'wordWrapColumn'
}

export function CodeEditor({
  value,
  onChange,
  language = 'markdown',
  readOnly = false,
  height = '400px',
  className = '',
  minimap = false,
  lineNumbers = true,
  wordWrap = 'on',
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const handleChange: OnChange = (value) => {
    if (onChange && value !== undefined) {
      onChange(value)
    }
  }

  // Define custom dark theme matching our app
  const handleBeforeMount = (monaco: typeof import('monaco-editor')) => {
    monaco.editor.defineTheme('claude-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cba6f7' },
        { token: 'string', foreground: 'a6e3a1' },
        { token: 'number', foreground: 'fab387' },
        { token: 'type', foreground: '89b4fa' },
        { token: 'function', foreground: '89dceb' },
        { token: 'variable', foreground: 'cdd6f4' },
        // Markdown specific
        { token: 'keyword.md', foreground: 'cba6f7', fontStyle: 'bold' },
        { token: 'string.link.md', foreground: '89b4fa' },
        { token: 'markup.heading', foreground: 'cba6f7', fontStyle: 'bold' },
      ],
      colors: {
        'editor.background': '#1e1e2e',
        'editor.foreground': '#cdd6f4',
        'editor.lineHighlightBackground': '#2a2a3d',
        'editor.selectionBackground': '#45475a80',
        'editorCursor.foreground': '#cba6f7',
        'editorLineNumber.foreground': '#6c7086',
        'editorLineNumber.activeForeground': '#cdd6f4',
        'editorWidget.background': '#2a2a3d',
        'editorWidget.border': '#3d3d5c',
        'input.background': '#1e1e2e',
        'input.border': '#3d3d5c',
        'input.foreground': '#cdd6f4',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#6c708633',
        'scrollbarSlider.hoverBackground': '#6c708666',
        'scrollbarSlider.activeBackground': '#6c708699',
      },
    })
  }

  return (
    <div className={`rounded-lg overflow-hidden border border-border ${className}`}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleEditorMount}
        beforeMount={handleBeforeMount}
        theme="claude-dark"
        options={{
          readOnly,
          minimap: { enabled: minimap },
          lineNumbers: lineNumbers ? 'on' : 'off',
          wordWrap,
          scrollBeyondLastLine: false,
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          folding: true,
          foldingHighlight: true,
          suggest: {
            showKeywords: true,
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-background">
            <div className="animate-spin w-6 h-6 border-2 border-accent-purple border-t-transparent rounded-full" />
          </div>
        }
      />
    </div>
  )
}

// Simple viewer component for read-only content with syntax highlighting
export function CodeViewer({
  value,
  language = 'markdown',
  height = '300px',
  className = '',
}: Omit<CodeEditorProps, 'onChange' | 'readOnly'>) {
  return (
    <CodeEditor
      value={value}
      language={language}
      readOnly
      height={height}
      className={className}
      lineNumbers={false}
      minimap={false}
    />
  )
}

export default CodeEditor
