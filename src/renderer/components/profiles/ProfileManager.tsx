import { useCallback, useEffect, useState } from 'react'
import {
  User,
  Settings,
  FileText,
  BookOpen,
  Save,
  RefreshCw,
  Plus,
  Check,
  X,
  ChevronRight,
  Edit3,
  Trash2,
  Zap,
  Brain,
  AlertCircle,
  Copy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProfileStore, type ClaudeRule } from '@/stores/profile'

export function ProfileManager() {
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

  const [activeTab, setActiveTab] = useState<'settings' | 'claudemd' | 'rules'>('settings')
  const [saving, setSaving] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    model: '',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
  })

  // Load settings and rules
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [settings, rulesData, claudeMd] = await Promise.all([
        window.electron.invoke('profile:settings'),
        window.electron.invoke('profile:rules'),
        window.electron.invoke('profile:claudemd'),
      ])
      setGlobalSettings(settings)
      setRules(rulesData)
      setClaudeMdContent(claudeMd || '')
      setLocalSettings({
        model: settings.model || 'claude-sonnet-4-20250514',
        maxTokens: settings.maxTokens || 64000,
        thinkingEnabled: settings.thinkingEnabled ?? true,
        thinkingBudget: settings.thinkingBudget || 32000,
      })
    } catch (error) {
      console.error('Failed to load profile data:', error)
    } finally {
      setLoading(false)
    }
  }, [setGlobalSettings, setRules, setClaudeMdContent, setLoading])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Save settings
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
      {/* Tab navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <TabButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={Settings}
          label="Global Settings"
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
        <div className="flex-1" />
        <button onClick={loadData} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'settings' && (
        <SettingsPanel
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
  icon: typeof Settings
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

interface SettingsPanelProps {
  settings: {
    model: string
    maxTokens: number
    thinkingEnabled: boolean
    thinkingBudget: number
  }
  onChange: (settings: SettingsPanelProps['settings']) => void
  onSave: () => void
  saving: boolean
}

function SettingsPanel({ settings, onChange, onSave, saving }: SettingsPanelProps) {
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
            Model Selection
          </h3>
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
    </div>
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
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div>
            <h3 className="font-medium text-text-primary">Global CLAUDE.md</h3>
            <p className="text-xs text-text-muted mt-1">~/.claude/CLAUDE.md</p>
          </div>
          {!editing ? (
            <button onClick={onEdit} className="btn btn-secondary">
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>
        <div className="card-body">
          {editing ? (
            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              className="input w-full h-96 font-mono text-sm resize-none"
              placeholder="# CLAUDE.md content..."
            />
          ) : (
            <pre className="bg-background rounded-lg p-4 overflow-auto max-h-96 font-mono text-sm text-text-primary whitespace-pre-wrap">
              {content || 'No CLAUDE.md content'}
            </pre>
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
              Changes take effect immediately for new conversations.
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
        <div className="card-header">
          <h3 className="font-medium text-text-primary">Custom Rules</h3>
          <p className="text-xs text-text-muted mt-1">~/.claude/rules/*.md</p>
        </div>
        <div className="card-body">
          {rules.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No custom rules found</p>
              <p className="text-xs text-text-muted mt-1">
                Add .md files to ~/.claude/rules/ to create rules
              </p>
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
                    <button
                      onClick={() => onToggle(rule.name, !rule.enabled)}
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
                  {expandedRule === rule.name && rule.content && (
                    <div className="px-3 pb-3 border-t border-border">
                      <pre className="mt-3 bg-background rounded-lg p-3 overflow-auto max-h-48 font-mono text-xs text-text-primary whitespace-pre-wrap">
                        {rule.content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
