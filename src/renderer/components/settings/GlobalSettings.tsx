import { useCallback, useEffect, useState } from 'react'
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
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProfileStore, type ClaudeRule } from '@/stores/profile'
import { CodeEditor, CodeViewer } from '@/components/common/CodeEditor'

export function GlobalSettings() {
  const {
    rules,
    globalSettings,
    loading,
    rulesLoading,
    editingClaudeMd,
    claudeMdContent,
    setRules,
    setGlobalSettings,
    setLoading,
    setRulesLoading,
    setEditingClaudeMd,
    setClaudeMdContent,
  } = useProfileStore()

  const [activeTab, setActiveTab] = useState<'model' | 'claudemd' | 'rules'>('model')
  const [saving, setSaving] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    model: '',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
  })

  // Load rules, CLAUDE.md, and settings
  const loadData = useCallback(async () => {
    console.log('[GlobalSettings] loadData called, setting loading=true')
    try {
      setLoading(true)
      console.log('[GlobalSettings] Calling IPC handlers...')
      const [rulesData, claudeMd, settings] = await Promise.all([
        window.electron.invoke('profile:rules'),
        window.electron.invoke('profile:claudemd'),
        window.electron.invoke('profile:settings'),
      ])
      console.log('[GlobalSettings] IPC handlers returned:', {
        rulesCount: rulesData?.length,
        claudeMdLength: claudeMd?.length,
        settingsKeys: Object.keys(settings || {}),
      })
      setRules(rulesData || [])
      setClaudeMdContent(claudeMd || '')
      const safeSettings = settings || {}
      setGlobalSettings(safeSettings)
      setLocalSettings({
        model: safeSettings.model || 'claude-sonnet-4-20250514',
        maxTokens: safeSettings.maxTokens || 64000,
        thinkingEnabled: safeSettings.thinkingEnabled ?? true,
        thinkingBudget: safeSettings.thinkingBudget || 32000,
      })
    } catch (error) {
      console.error('[GlobalSettings] Failed to load global settings data:', error)
    } finally {
      console.log('[GlobalSettings] Setting loading=false')
      setLoading(false)
    }
  }, [setRules, setClaudeMdContent, setGlobalSettings, setLoading])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Save model settings
  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await window.electron.invoke('profile:saveSettings', localSettings)
      setGlobalSettings(localSettings)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  // Save CLAUDE.md
  const handleSaveClaudeMd = async () => {
    setSaving(true)
    try {
      await window.electron.invoke('profile:saveClaudemd', claudeMdContent)
      setEditingClaudeMd(false)
    } catch (error) {
      console.error('Failed to save CLAUDE.md:', error)
    } finally {
      setSaving(false)
    }
  }

  // Toggle rule
  const handleToggleRule = async (ruleName: string, enabled: boolean) => {
    try {
      await window.electron.invoke('profile:toggleRule', ruleName, enabled)
      setRules(rules.map((r) => (r.name === ruleName ? { ...r, enabled } : r)))
    } catch (error) {
      console.error('Failed to toggle rule:', error)
    }
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
  const openClaudeFolder = async () => {
    try {
      const homePath = await window.electron.invoke('system:getHomePath')
      await window.electron.invoke('shell:openPath', `${homePath}/.claude`)
    } catch (error) {
      console.error('Failed to open .claude folder:', error)
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
              value={content || '# No CLAUDE.md content\n\nClick Edit to add your global instructions.'}
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

  const openRulesFolder = async () => {
    try {
      const homePath = await window.electron.invoke('system:getHomePath')
      await window.electron.invoke('shell:openPath', `${homePath}/.claude/rules`)
    } catch (error) {
      console.error('Failed to open rules folder:', error)
    }
  }

  const handleEditRule = (rule: ClaudeRule) => {
    setEditingRule(rule.name)
    setEditContent(rule.content || '')
    setExpandedRule(rule.name)
  }

  const handleSaveRule = async (rule: ClaudeRule) => {
    setSaving(true)
    try {
      await window.electron.invoke('profile:saveRule', rule.path, editContent)
      rule.content = editContent
      setEditingRule(null)
    } catch (error) {
      console.error('Failed to save rule:', error)
    } finally {
      setSaving(false)
    }
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
          <button
            onClick={openRulesFolder}
            className="btn btn-secondary"
            title="Open rules folder"
          >
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
                      onClick={() =>
                        setExpandedRule(expandedRule === rule.name ? null : rule.name)
                      }
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
                            <button
                              onClick={handleCancelEdit}
                              className="btn btn-secondary btn-sm"
                            >
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
              They can be enabled/disabled per session. Create new rules by adding .md files to
              the rules folder.
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
                  settings.model === model.id
                    ? 'border-accent-purple'
                    : 'border-text-muted'
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
            <label className="block text-sm text-text-secondary mb-2">
              Max Output Tokens
            </label>
            <input
              type="number"
              value={settings.maxTokens}
              onChange={(e) =>
                onChange({ ...settings, maxTokens: parseInt(e.target.value) || 0 })
              }
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
