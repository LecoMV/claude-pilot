import { useEffect, useState, useMemo } from 'react'
import {
  FileText,
  BookOpen,
  Save,
  RefreshCw,
  ChevronRight,
  Edit3,
  X,
  FolderOpen,
  AlertCircle,
  Plus,
  Globe,
  Brain,
  Zap,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  Cpu,
  Play,
  Square,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { useProfileStore, type ClaudeRule } from '@/stores/profile'
import { CodeEditor, CodeViewer } from '@/components/common/CodeEditor'

export function GlobalSettings() {
  const {
    rules,
    rulesLoading,
    editingClaudeMd,
    claudeMdContent,
    setRules,
    setGlobalSettings,
    setEditingClaudeMd,
    setClaudeMdContent,
  } = useProfileStore()

  const [activeTab, setActiveTab] = useState<
    'model' | 'claude' | 'systemllm' | 'claudemd' | 'rules'
  >('model')
  const [saving, setSaving] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    model: '',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
  })

  // tRPC queries
  const rulesQuery = trpc.profiles.rules.useQuery(undefined, { refetchInterval: 30000 })
  const claudemdQuery = trpc.profiles.claudemd.useQuery(undefined, { refetchInterval: false })
  const settingsQuery = trpc.profiles.settings.useQuery(undefined, { refetchInterval: 30000 })

  const loading = rulesQuery.isLoading || claudemdQuery.isLoading || settingsQuery.isLoading

  // tRPC mutations
  const saveSettingsMutation = trpc.profiles.saveSettings.useMutation({
    onSuccess: () => {
      setGlobalSettings(localSettings)
    },
    onError: (error) => {
      console.error('Failed to save settings:', error)
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  const saveClaudemdMutation = trpc.profiles.saveClaudemd.useMutation({
    onSuccess: () => {
      setEditingClaudeMd(false)
    },
    onError: (error) => {
      console.error('Failed to save CLAUDE.md:', error)
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  const toggleRuleMutation = trpc.profiles.toggleRule.useMutation({
    onSuccess: () => {
      rulesQuery.refetch()
    },
    onError: (error) => {
      console.error('Failed to toggle rule:', error)
    },
  })

  // Sync tRPC data to store
  useEffect(() => {
    if (rulesQuery.data) {
      setRules(rulesQuery.data)
    }
  }, [rulesQuery.data, setRules])

  useEffect(() => {
    if (claudemdQuery.data !== undefined) {
      setClaudeMdContent(claudemdQuery.data)
    }
  }, [claudemdQuery.data, setClaudeMdContent])

  useEffect(() => {
    if (settingsQuery.data) {
      const safeSettings = settingsQuery.data
      setGlobalSettings(safeSettings)
      setLocalSettings({
        model: safeSettings.model || 'claude-sonnet-4-20250514',
        maxTokens: safeSettings.maxTokens || 64000,
        thinkingEnabled: safeSettings.thinkingEnabled ?? true,
        thinkingBudget: safeSettings.thinkingBudget || 32000,
      })
    }
  }, [settingsQuery.data, setGlobalSettings])

  const loadData = () => {
    rulesQuery.refetch()
    claudemdQuery.refetch()
    settingsQuery.refetch()
  }

  // Save model settings
  const handleSaveSettings = () => {
    setSaving(true)
    saveSettingsMutation.mutate(localSettings)
  }

  // Save CLAUDE.md
  const handleSaveClaudeMd = () => {
    setSaving(true)
    saveClaudemdMutation.mutate({ content: claudeMdContent })
  }

  // Toggle rule
  const handleToggleRule = (ruleName: string, enabled: boolean) => {
    setRules(rules.map((r) => (r.name === ruleName ? { ...r, enabled } : r)))
    toggleRuleMutation.mutate({ name: ruleName, enabled })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <Globe className="w-6 h-6 text-accent-purple" />
            Global Settings
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Configure CLAUDE.md and custom rules that apply to all Claude Code sessions
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <TabButton
          active={activeTab === 'model'}
          onClick={() => setActiveTab('model')}
          icon={Brain}
          label="Model Settings"
        />
        <TabButton
          active={activeTab === 'claude'}
          onClick={() => setActiveTab('claude')}
          icon={Terminal}
          label="Claude Code"
        />
        <TabButton
          active={activeTab === 'systemllm'}
          onClick={() => setActiveTab('systemllm')}
          icon={Cpu}
          label="System LLMs"
        />
        <TabButton
          active={activeTab === 'claudemd'}
          onClick={() => setActiveTab('claudemd')}
          icon={FileText}
          label="CLAUDE.md"
        />
        <TabButton
          active={activeTab === 'rules'}
          onClick={() => setActiveTab('rules')}
          icon={BookOpen}
          label="Rules"
        />
      </div>

      {/* Tab content */}
      {activeTab === 'model' && (
        <ModelSettingsPanel
          settings={localSettings}
          onChange={setLocalSettings}
          onSave={handleSaveSettings}
          saving={saving}
        />
      )}

      {activeTab === 'claude' && <ClaudeCodePanel />}

      {activeTab === 'systemllm' && <SystemLLMSettingsPanel />}

      {activeTab === 'claudemd' && (
        <ClaudeMdPanel
          content={claudeMdContent}
          editing={editingClaudeMd}
          onEdit={() => setEditingClaudeMd(true)}
          onCancel={() => {
            setEditingClaudeMd(false)
            loadData()
          }}
          onChange={setClaudeMdContent}
          onSave={handleSaveClaudeMd}
          saving={saving}
        />
      )}

      {activeTab === 'rules' && (
        <RulesPanel rules={rules} loading={rulesLoading} onToggle={handleToggleRule} />
      )}
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: typeof FileText
  label: string
}

function TabButton({ active, onClick, icon: Icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
        active
          ? 'bg-accent-purple/10 text-accent-purple'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

interface ClaudeMdPanelProps {
  content: string
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onChange: (content: string) => void
  onSave: () => void
  saving: boolean
}

function ClaudeMdPanel({
  content,
  editing,
  onEdit,
  onCancel,
  onChange,
  onSave,
  saving,
}: ClaudeMdPanelProps) {
  const homePathQuery = trpc.system.homePath.useQuery()
  const openPathMutation = trpc.system.openPath.useMutation()

  const openClaudeFolder = () => {
    if (homePathQuery.data) {
      openPathMutation.mutate(
        { path: `${homePathQuery.data}/.claude` },
        {
          onError: (error) => {
            console.error('Failed to open .claude folder:', error)
          },
        }
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div>
            <h3 className="font-medium text-text-primary">Global CLAUDE.md</h3>
            <p className="text-xs text-text-muted mt-1">~/.claude/CLAUDE.md</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openClaudeFolder}
              className="btn btn-secondary"
              title="Open .claude folder"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            {!editing ? (
              <button onClick={onEdit} className="btn btn-secondary">
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
            ) : (
              <>
                <button onClick={onCancel} className="btn btn-secondary">
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button onClick={onSave} className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card-body">
          {editing ? (
            <CodeEditor
              value={content}
              onChange={onChange}
              language="markdown"
              height="450px"
              minimap={true}
            />
          ) : (
            <CodeViewer
              value={
                content || '# No CLAUDE.md content\n\nClick Edit to add your global instructions.'
              }
              language="markdown"
              height="450px"
            />
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About CLAUDE.md</p>
            <p>
              CLAUDE.md contains your global instructions that Claude follows in every session.
              Changes take effect immediately for new conversations. Use markdown formatting for
              best results.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface RulesPanelProps {
  rules: ClaudeRule[]
  loading: boolean
  onToggle: (name: string, enabled: boolean) => void
}

function RulesPanel({ rules, loading, onToggle }: RulesPanelProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  const homePathQuery = trpc.system.homePath.useQuery()
  const openPathMutation = trpc.system.openPath.useMutation()
  const saveRuleMutation = trpc.profiles.saveRule.useMutation({
    onSuccess: () => {
      setEditingRule(null)
    },
    onError: (error) => {
      console.error('Failed to save rule:', error)
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  const openRulesFolder = () => {
    if (homePathQuery.data) {
      openPathMutation.mutate(
        { path: `${homePathQuery.data}/.claude/rules` },
        {
          onError: (error) => {
            console.error('Failed to open rules folder:', error)
          },
        }
      )
    }
  }

  const handleEditRule = (rule: ClaudeRule) => {
    setEditingRule(rule.name)
    setEditContent(rule.content || '')
    setExpandedRule(rule.name)
  }

  const handleSaveRule = (rule: ClaudeRule) => {
    setSaving(true)
    rule.content = editContent
    saveRuleMutation.mutate({ path: rule.path, content: editContent })
  }

  const handleCancelEdit = () => {
    setEditingRule(null)
    setEditContent('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div>
            <h3 className="font-medium text-text-primary">Custom Rules</h3>
            <p className="text-xs text-text-muted mt-1">~/.claude/rules/*.md</p>
          </div>
          <button onClick={openRulesFolder} className="btn btn-secondary" title="Open rules folder">
            <FolderOpen className="w-4 h-4" />
            Open Folder
          </button>
        </div>
        <div className="card-body">
          {rules.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No custom rules found</p>
              <p className="text-xs text-text-muted mt-1">
                Add .md files to ~/.claude/rules/ to create rules
              </p>
              <button onClick={openRulesFolder} className="btn btn-primary mt-4">
                <Plus className="w-4 h-4" />
                Create Rule
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.name}
                  className={cn(
                    'border border-border rounded-lg transition-colors',
                    expandedRule === rule.name && 'border-accent-purple'
                  )}
                >
                  <div className="flex items-center justify-between p-3">
                    <button
                      onClick={() => setExpandedRule(expandedRule === rule.name ? null : rule.name)}
                      className="flex items-center gap-3 text-left flex-1"
                    >
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 text-text-muted transition-transform',
                          expandedRule === rule.name && 'rotate-90'
                        )}
                      />
                      <div>
                        <p className="font-medium text-text-primary">{rule.name}</p>
                        <p className="text-xs text-text-muted">{rule.path}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      {editingRule !== rule.name && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditRule(rule)
                          }}
                          className="p-1.5 rounded text-text-muted hover:text-accent-blue hover:bg-surface-hover"
                          title="Edit rule"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggle(rule.name, !rule.enabled)
                        }}
                        className={cn(
                          'relative w-10 h-5 rounded-full transition-colors',
                          rule.enabled ? 'bg-accent-green' : 'bg-surface-hover'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                            rule.enabled ? 'left-5' : 'left-0.5'
                          )}
                        />
                      </button>
                    </div>
                  </div>
                  {expandedRule === rule.name && (
                    <div className="px-3 pb-3 border-t border-border">
                      {editingRule === rule.name ? (
                        <div className="mt-3 space-y-3">
                          <CodeEditor
                            value={editContent}
                            onChange={setEditContent}
                            language="markdown"
                            height="300px"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={handleCancelEdit} className="btn btn-secondary btn-sm">
                              <X className="w-4 h-4" />
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveRule(rule)}
                              disabled={saving}
                              className="btn btn-primary btn-sm"
                            >
                              {saving ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <CodeViewer
                            value={rule.content || '# Empty rule'}
                            language="markdown"
                            height="250px"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Rules</p>
            <p>
              Rules are markdown files that provide additional context and instructions to Claude.
              They can be enabled/disabled per session. Create new rules by adding .md files to the
              rules folder.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ModelSettingsPanelProps {
  settings: {
    model: string
    maxTokens: number
    thinkingEnabled: boolean
    thinkingBudget: number
  }
  onChange: (settings: ModelSettingsPanelProps['settings']) => void
  onSave: () => void
  saving: boolean
}

function ModelSettingsPanel({ settings, onChange, onSave, saving }: ModelSettingsPanelProps) {
  const models = [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Fast & capable' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', desc: 'Most powerful' },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', desc: 'Latest flagship' },
  ]

  return (
    <div className="space-y-6">
      {/* Model selection */}
      <section className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent-purple" />
            Default Model
          </h3>
          <p className="text-xs text-text-muted mt-1">
            This is the default model for new Claude Code sessions
          </p>
        </div>
        <div className="card-body space-y-3">
          {models.map((model) => (
            <label
              key={model.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                settings.model === model.id
                  ? 'border-accent-purple bg-accent-purple/5'
                  : 'border-border hover:border-border-hover'
              )}
            >
              <input
                type="radio"
                name="model"
                value={model.id}
                checked={settings.model === model.id}
                onChange={(e) => onChange({ ...settings, model: e.target.value })}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                  settings.model === model.id ? 'border-accent-purple' : 'border-text-muted'
                )}
              >
                {settings.model === model.id && (
                  <div className="w-2 h-2 rounded-full bg-accent-purple" />
                )}
              </div>
              <div>
                <p className="font-medium text-text-primary">{model.name}</p>
                <p className="text-xs text-text-muted">{model.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Token settings */}
      <section className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-yellow" />
            Token Configuration
          </h3>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-2">Max Output Tokens</label>
            <input
              type="number"
              value={settings.maxTokens}
              onChange={(e) => onChange({ ...settings, maxTokens: parseInt(e.target.value) || 0 })}
              className="input w-full"
              min={1000}
              max={128000}
              step={1000}
            />
            <p className="text-xs text-text-muted mt-1">
              Maximum tokens for model output (1,000 - 128,000)
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-medium text-text-primary">Extended Thinking</p>
                <p className="text-xs text-text-muted">Enable deep reasoning mode</p>
              </div>
              <button
                onClick={() =>
                  onChange({ ...settings, thinkingEnabled: !settings.thinkingEnabled })
                }
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors',
                  settings.thinkingEnabled ? 'bg-accent-purple' : 'bg-surface-hover'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                    settings.thinkingEnabled ? 'left-7' : 'left-1'
                  )}
                />
              </button>
            </div>

            {settings.thinkingEnabled && (
              <div>
                <label className="block text-sm text-text-secondary mb-2">
                  Thinking Budget (tokens)
                </label>
                <input
                  type="number"
                  value={settings.thinkingBudget}
                  onChange={(e) =>
                    onChange({ ...settings, thinkingBudget: parseInt(e.target.value) || 0 })
                  }
                  className="input w-full"
                  min={1000}
                  max={64000}
                  step={1000}
                />
                <p className="text-xs text-text-muted mt-1">
                  Token budget for extended thinking (1,000 - 64,000)
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={onSave} className="btn btn-primary" disabled={saving}>
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Model Settings</p>
            <p>
              These settings are the defaults for new Claude Code sessions. Work Profiles can
              override these settings with profile-specific configurations.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Claude Code Settings Panel
 * Configure binary path and projects directory
 */
function ClaudeCodePanel() {
  const [binaryPath, setBinaryPath] = useState('')
  const [projectsPath, setProjectsPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [testingBinary, setTestingBinary] = useState(false)
  const [testingProjects, setTestingProjects] = useState(false)
  const [binaryTestResult, setBinaryTestResult] = useState<{
    valid: boolean
    version?: string
    error?: string
  } | null>(null)
  const [projectsTestResult, setProjectsTestResult] = useState<{
    valid: boolean
    projectCount?: number
    error?: string
  } | null>(null)

  // Get Claude Code status
  const statusQuery = trpc.claude.status.useQuery(undefined, { refetchInterval: 30000 })

  // Get current settings
  const settingsQuery = trpc.settings.get.useQuery()

  // Mutations
  const setClaudeMutation = trpc.settings.setClaude.useMutation({
    onSuccess: () => {
      statusQuery.refetch()
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  const testBinaryQuery = trpc.claude.testBinary.useQuery(binaryPath, {
    enabled: false, // Manual trigger
  })

  const testProjectsQuery = trpc.claude.testProjectsPath.useQuery(projectsPath, {
    enabled: false, // Manual trigger
  })

  // Initialize form from settings
  useEffect(() => {
    if (settingsQuery.data?.claude) {
      setBinaryPath(settingsQuery.data.claude.binaryPath || '')
      setProjectsPath(settingsQuery.data.claude.projectsPath || '')
    }
  }, [settingsQuery.data])

  const handleTestBinary = async () => {
    if (!binaryPath) return
    setTestingBinary(true)
    setBinaryTestResult(null)
    try {
      const result = await testBinaryQuery.refetch()
      setBinaryTestResult(result.data || null)
    } finally {
      setTestingBinary(false)
    }
  }

  const handleTestProjects = async () => {
    if (!projectsPath) return
    setTestingProjects(true)
    setProjectsTestResult(null)
    try {
      const result = await testProjectsQuery.refetch()
      setProjectsTestResult(result.data || null)
    } finally {
      setTestingProjects(false)
    }
  }

  const handleSave = () => {
    setSaving(true)
    setClaudeMutation.mutate({
      binaryPath: binaryPath || undefined,
      projectsPath: projectsPath || undefined,
    })
  }

  const handleClear = () => {
    setBinaryPath('')
    setProjectsPath('')
    setBinaryTestResult(null)
    setProjectsTestResult(null)
    setSaving(true)
    setClaudeMutation.mutate({
      binaryPath: undefined,
      projectsPath: undefined,
    })
  }

  const status = statusQuery.data

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <section className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Terminal className="w-4 h-4 text-accent-purple" />
            Claude Code Status
          </h3>
          <p className="text-xs text-text-muted mt-1">Current detection status</p>
        </div>
        <div className="card-body space-y-3">
          {statusQuery.isLoading ? (
            <div className="flex items-center gap-2 text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Detecting Claude Code...
            </div>
          ) : statusQuery.error ? (
            <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded text-accent-red text-sm">
              Error: {statusQuery.error.message}
            </div>
          ) : status ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Installed</span>
                <span className="flex items-center gap-2">
                  {status.installed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-accent-green" />
                      <span className="text-accent-green">Yes</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-accent-red" />
                      <span className="text-accent-red">No</span>
                    </>
                  )}
                </span>
              </div>
              {status.version && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Version</span>
                  <span className="text-text-primary font-mono text-sm">{status.version}</span>
                </div>
              )}
              {status.binaryPath && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Binary Path</span>
                  <span className="text-text-muted font-mono text-xs truncate max-w-[250px]">
                    {status.binaryPath}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Projects Path</span>
                <span className="text-text-muted font-mono text-xs truncate max-w-[250px]">
                  {status.projectsPath}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Projects Found</span>
                <span className="text-text-primary">{status.projectCount}</span>
              </div>
              {status.error && (
                <div className="mt-2 p-2 bg-accent-red/10 border border-accent-red/20 rounded text-accent-red text-sm">
                  {status.error}
                </div>
              )}
            </div>
          ) : (
            <div className="text-text-muted">Unable to detect Claude Code status</div>
          )}
        </div>
      </section>

      {/* Path Overrides */}
      <section className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-accent-blue" />
            Path Overrides
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Override auto-detected paths (leave empty for auto-detection)
          </p>
        </div>
        <div className="card-body space-y-4">
          {/* Binary Path */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Claude Code Binary Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={binaryPath}
                onChange={(e) => {
                  setBinaryPath(e.target.value)
                  setBinaryTestResult(null)
                }}
                placeholder="/usr/local/bin/claude (auto-detect)"
                className="input flex-1 font-mono text-sm"
              />
              <button
                onClick={handleTestBinary}
                disabled={!binaryPath || testingBinary}
                className="btn btn-secondary"
              >
                {testingBinary ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
              </button>
            </div>
            {binaryTestResult && (
              <div
                className={cn(
                  'mt-2 p-2 rounded text-sm',
                  binaryTestResult.valid
                    ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
                    : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
                )}
              >
                {binaryTestResult.valid ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Valid - Version: {binaryTestResult.version}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {binaryTestResult.error}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Projects Path */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">
              Projects Directory Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectsPath}
                onChange={(e) => {
                  setProjectsPath(e.target.value)
                  setProjectsTestResult(null)
                }}
                placeholder="~/.claude/projects (default)"
                className="input flex-1 font-mono text-sm"
              />
              <button
                onClick={handleTestProjects}
                disabled={!projectsPath || testingProjects}
                className="btn btn-secondary"
              >
                {testingProjects ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test'}
              </button>
            </div>
            {projectsTestResult && (
              <div
                className={cn(
                  'mt-2 p-2 rounded text-sm',
                  projectsTestResult.valid
                    ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
                    : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
                )}
              >
                {projectsTestResult.valid ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Valid - {projectsTestResult.projectCount} projects found
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {projectsTestResult.error}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Save / Clear buttons */}
      <div className="flex justify-between">
        <button onClick={handleClear} className="btn btn-secondary" disabled={saving}>
          Clear Overrides
        </button>
        <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Claude Code Paths</p>
            <p>
              By default, Claude Pilot auto-detects the Claude Code binary from your PATH and uses
              ~/.claude/projects for session data. If your installation uses non-standard paths, you
              can override them here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * System LLM Settings Panel
 * Configure embedding models and view system LLM status
 */
function SystemLLMSettingsPanel() {
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [updating, setUpdating] = useState(false)

  // tRPC queries
  const ollamaStatusQuery = trpc.ollama.status.useQuery(undefined, { refetchInterval: 10000 })
  const ollamaModelsQuery = trpc.ollama.list.useQuery(undefined, { refetchInterval: 30000 })
  const runningModelsQuery = trpc.ollama.running.useQuery(undefined, { refetchInterval: 5000 })
  const embeddingStatusQuery = trpc.embedding.status.useQuery(undefined, { refetchInterval: 10000 })

  // tRPC mutations
  const warmupMutation = trpc.embedding.warmupModel.useMutation({
    onSuccess: () => {
      embeddingStatusQuery.refetch()
      runningModelsQuery.refetch()
    },
  })
  const unloadMutation = trpc.embedding.unloadModel.useMutation({
    onSuccess: () => {
      embeddingStatusQuery.refetch()
      runningModelsQuery.refetch()
    },
  })
  const updateConfigMutation = trpc.embedding.updateOllamaConfig.useMutation({
    onSuccess: () => {
      setUpdating(false)
      embeddingStatusQuery.refetch()
    },
    onError: () => {
      setUpdating(false)
    },
  })
  const runModelMutation = trpc.ollama.run.useMutation({
    onSuccess: () => {
      runningModelsQuery.refetch()
    },
  })
  const stopModelMutation = trpc.ollama.stop.useMutation({
    onSuccess: () => {
      runningModelsQuery.refetch()
    },
  })

  // Filter to embedding-capable models
  const embeddingModels = useMemo(() => {
    if (!ollamaModelsQuery.data) return []
    return ollamaModelsQuery.data.filter(
      (m) =>
        m.name.includes('embed') ||
        m.name.includes('nomic') ||
        m.name.includes('bge') ||
        m.name.includes('minilm') ||
        m.name.includes('mxbai')
    )
  }, [ollamaModelsQuery.data])

  // All other models (non-embedding)
  const otherModels = useMemo(() => {
    if (!ollamaModelsQuery.data) return []
    return ollamaModelsQuery.data.filter(
      (m) =>
        !m.name.includes('embed') &&
        !m.name.includes('nomic') &&
        !m.name.includes('bge') &&
        !m.name.includes('minilm') &&
        !m.name.includes('mxbai')
    )
  }, [ollamaModelsQuery.data])

  // Current embedding model from status
  const currentModel = embeddingStatusQuery.data?.ollamaModel || 'mxbai-embed-large'

  // Initialize selected model
  useEffect(() => {
    if (currentModel && !selectedModel) {
      setSelectedModel(currentModel)
    }
  }, [currentModel, selectedModel])

  // Check if model is running
  const isModelRunning = (modelName: string) => {
    return runningModelsQuery.data?.some((m) => m.name === modelName || m.model === modelName)
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
    return `${bytes} B`
  }

  const handleUpdateModel = () => {
    if (selectedModel === currentModel) return
    setUpdating(true)
    // Map model name to dimensions
    const dimensionMap: Record<string, number> = {
      'mxbai-embed-large': 1024,
      'nomic-embed-text': 768,
      'all-minilm': 384,
      'bge-large': 1024,
      'bge-base': 768,
      'bge-small': 384,
    }
    const dimensions =
      Object.entries(dimensionMap).find(([key]) => selectedModel.includes(key))?.[1] || 1024

    updateConfigMutation.mutate({
      model: selectedModel,
      dimensions,
    })
  }

  const ollamaOnline = ollamaStatusQuery.data?.online

  return (
    <div className="space-y-6">
      {/* Ollama Status */}
      <section className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-accent-purple" />
            Ollama Status
          </h3>
          <p className="text-xs text-text-muted mt-1">Local LLM inference server</p>
        </div>
        <div className="card-body">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Status</span>
            <span className="flex items-center gap-2">
              {ollamaStatusQuery.isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
              ) : ollamaOnline ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-accent-green" />
                  <span className="text-accent-green">Online</span>
                  {ollamaStatusQuery.data?.version && (
                    <span className="text-text-muted text-xs ml-2">
                      v{ollamaStatusQuery.data.version}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-accent-red" />
                  <span className="text-accent-red">Offline</span>
                </>
              )}
            </span>
          </div>
          {!ollamaOnline && (
            <p className="text-xs text-accent-yellow mt-2">
              Start Ollama with: <code className="bg-surface-hover px-1 rounded">ollama serve</code>
            </p>
          )}
        </div>
      </section>

      {/* Embedding Model Selection */}
      <section className="card">
        <div className="card-header">
          <h3 className="font-medium text-text-primary flex items-center gap-2">
            <Cpu className="w-4 h-4 text-accent-blue" />
            Embedding Model
          </h3>
          <p className="text-xs text-text-muted mt-1">
            Model used for vector embeddings in memory search
          </p>
        </div>
        <div className="card-body space-y-4">
          {/* Current model info */}
          <div className="p-3 bg-surface-hover rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">Current Model</p>
                <p className="font-medium text-text-primary">{currentModel}</p>
              </div>
              <div className="flex items-center gap-2">
                {embeddingStatusQuery.data?.ollamaStatus === 'connected' ? (
                  <span className="flex items-center gap-1.5 text-xs text-accent-green">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-accent-yellow">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {embeddingStatusQuery.data?.ollamaStatus || 'Unknown'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Model selector */}
          <div>
            <label className="block text-sm text-text-secondary mb-2">Change Embedding Model</label>
            <div className="flex gap-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="input flex-1"
                disabled={!ollamaOnline || embeddingModels.length === 0}
              >
                {embeddingModels.length === 0 ? (
                  <option value="">No embedding models installed</option>
                ) : (
                  embeddingModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name} ({formatSize(model.size)})
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={handleUpdateModel}
                disabled={!ollamaOnline || updating || selectedModel === currentModel}
                className="btn btn-primary"
              >
                {updating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Update
              </button>
            </div>
            {selectedModel !== currentModel && (
              <p className="text-xs text-accent-yellow mt-2">
                Changing embedding models may require re-embedding existing content if dimensions
                differ.
              </p>
            )}
          </div>

          {/* Warmup / Unload controls */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">Model Controls</p>
                <p className="text-xs text-text-muted">
                  Warmup loads the model into GPU memory for faster embeddings
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => warmupMutation.mutate()}
                  disabled={!ollamaOnline || warmupMutation.isPending}
                  className="btn btn-secondary btn-sm"
                >
                  {warmupMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Warmup
                </button>
                <button
                  onClick={() => unloadMutation.mutate()}
                  disabled={!ollamaOnline || unloadMutation.isPending}
                  className="btn btn-secondary btn-sm"
                >
                  {unloadMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  Unload
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Running Models */}
      {runningModelsQuery.data && runningModelsQuery.data.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h3 className="font-medium text-text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent-yellow" />
              Running Models
            </h3>
            <p className="text-xs text-text-muted mt-1">Models currently loaded in memory</p>
          </div>
          <div className="card-body">
            <div className="space-y-2">
              {runningModelsQuery.data.map((model) => (
                <div
                  key={model.name}
                  className="flex items-center justify-between p-2 bg-surface-hover rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green"></span>
                    </span>
                    <span className="font-medium text-text-primary">{model.name}</span>
                    <span className="text-xs text-text-muted">({formatSize(model.size)})</span>
                  </div>
                  <button
                    onClick={() => stopModelMutation.mutate({ model: model.name })}
                    disabled={stopModelMutation.isPending}
                    className="btn btn-secondary btn-sm"
                  >
                    {stopModelMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Square className="w-3 h-3" />
                    )}
                    Stop
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Other Installed Models */}
      {otherModels.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h3 className="font-medium text-text-primary flex items-center gap-2">
              <Brain className="w-4 h-4 text-accent-purple" />
              Other Installed Models
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Non-embedding models available on this system
            </p>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {otherModels.slice(0, 6).map((model) => (
                <div
                  key={model.name}
                  className="flex items-center justify-between p-2 bg-surface-hover rounded-lg"
                >
                  <div>
                    <p className="font-medium text-text-primary text-sm">{model.name}</p>
                    <p className="text-xs text-text-muted">{formatSize(model.size)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isModelRunning(model.name) ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-accent-green" />
                        <button
                          onClick={() => stopModelMutation.mutate({ model: model.name })}
                          className="btn btn-secondary btn-sm p-1"
                        >
                          <Square className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => runModelMutation.mutate({ model: model.name })}
                        className="btn btn-secondary btn-sm p-1"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {otherModels.length > 6 && (
              <p className="text-xs text-text-muted mt-2 text-center">
                +{otherModels.length - 6} more models installed
              </p>
            )}
          </div>
        </section>
      )}

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About System LLMs</p>
            <p>
              System LLMs are used by Claude Pilot for embeddings and other internal operations.
              Embedding models convert text into vectors for semantic search. The default model is
              mxbai-embed-large (1024 dimensions). Change models carefully as different dimensions
              require re-embedding all content.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
