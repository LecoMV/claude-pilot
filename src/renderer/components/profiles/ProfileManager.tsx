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
  FolderOpen,
  Users,
  Play,
  Shield,
  Code,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProfileStore, type ClaudeRule } from '@/stores/profile'
import { CodeEditor, CodeViewer } from '@/components/common/CodeEditor'
import type { ClaudeCodeProfile, ProfileSettings } from '@shared/types'

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

  const [activeTab, setActiveTab] = useState<'profiles' | 'settings' | 'claudemd' | 'rules'>('profiles')
  const [saving, setSaving] = useState(false)
  const [localSettings, setLocalSettings] = useState({
    model: '',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
  })

  // Custom profiles state
  const [customProfiles, setCustomProfiles] = useState<ClaudeCodeProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [profilesLoading, setProfilesLoading] = useState(false)

  // Load custom profiles
  const loadProfiles = useCallback(async () => {
    try {
      setProfilesLoading(true)
      const [profiles, activeId] = await Promise.all([
        window.electron.invoke('profiles:list'),
        window.electron.invoke('profiles:getActive'),
      ])
      setCustomProfiles(profiles)
      setActiveProfileId(activeId)
    } catch (error) {
      console.error('Failed to load profiles:', error)
    } finally {
      setProfilesLoading(false)
    }
  }, [])

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
    loadProfiles()
  }, [loadData, loadProfiles])

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
          active={activeTab === 'profiles'}
          onClick={() => setActiveTab('profiles')}
          icon={Users}
          label="Work Profiles"
        />
        <div className="w-px h-6 bg-border" />
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
        <button onClick={() => { loadData(); loadProfiles(); }} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'profiles' && (
        <CustomProfilesPanel
          profiles={customProfiles}
          activeProfileId={activeProfileId}
          loading={profilesLoading}
          onRefresh={loadProfiles}
          onProfilesChange={loadProfiles}
          onActiveChange={setActiveProfileId}
        />
      )}

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
      // Update local state
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

// Custom Profiles Panel for work contexts like claude-eng, claude-sec
interface CustomProfilesPanelProps {
  profiles: ClaudeCodeProfile[]
  activeProfileId: string | null
  loading: boolean
  onRefresh: () => void
  onProfilesChange: () => void
  onActiveChange: (id: string | null) => void
}

function CustomProfilesPanel({
  profiles,
  activeProfileId,
  loading,
  onRefresh,
  onProfilesChange,
  onActiveChange,
}: CustomProfilesPanelProps) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [formData, setFormData] = useState<{
    name: string
    description: string
    model: string
    maxTokens: number
    thinkingEnabled: boolean
    thinkingBudget: number
    claudeMd: string
  }>({
    name: '',
    description: '',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 64000,
    thinkingEnabled: true,
    thinkingBudget: 32000,
    claudeMd: '',
  })
  const [saving, setSaving] = useState(false)
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)

  const profileIcons: Record<string, typeof Code> = {
    'claude-eng': Code,
    'claude-sec': Shield,
    'claude-research': Brain,
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 64000,
      thinkingEnabled: true,
      thinkingBudget: 32000,
      claudeMd: '',
    })
  }

  const handleCreate = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      await window.electron.invoke('profiles:create', {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        settings: {
          model: formData.model,
          maxTokens: formData.maxTokens,
          thinkingEnabled: formData.thinkingEnabled,
          thinkingBudget: formData.thinkingBudget,
        },
        claudeMd: formData.claudeMd || undefined,
      })
      setCreating(false)
      resetForm()
      onProfilesChange()
    } catch (error) {
      console.error('Failed to create profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string) => {
    setSaving(true)
    try {
      await window.electron.invoke('profiles:update', id, {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        settings: {
          model: formData.model,
          maxTokens: formData.maxTokens,
          thinkingEnabled: formData.thinkingEnabled,
          thinkingBudget: formData.thinkingBudget,
        },
        claudeMd: formData.claudeMd || undefined,
      })
      setEditing(null)
      resetForm()
      onProfilesChange()
    } catch (error) {
      console.error('Failed to update profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this profile?')) return
    try {
      await window.electron.invoke('profiles:delete', id)
      if (activeProfileId === id) {
        onActiveChange(null)
      }
      onProfilesChange()
    } catch (error) {
      console.error('Failed to delete profile:', error)
    }
  }

  const handleActivate = async (id: string) => {
    try {
      await window.electron.invoke('profiles:activate', id)
      onActiveChange(id)
    } catch (error) {
      console.error('Failed to activate profile:', error)
    }
  }

  const startEdit = (profile: ClaudeCodeProfile) => {
    setEditing(profile.id)
    setFormData({
      name: profile.name,
      description: profile.description || '',
      model: profile.settings.model || 'claude-sonnet-4-20250514',
      maxTokens: profile.settings.maxTokens || 64000,
      thinkingEnabled: profile.settings.thinkingEnabled ?? true,
      thinkingBudget: profile.settings.thinkingBudget || 32000,
      claudeMd: profile.claudeMd || '',
    })
    setExpandedProfile(profile.id)
  }

  const copyProfile = (profile: ClaudeCodeProfile) => {
    setCreating(true)
    setFormData({
      name: `${profile.name}-copy`,
      description: profile.description || '',
      model: profile.settings.model || 'claude-sonnet-4-20250514',
      maxTokens: profile.settings.maxTokens || 64000,
      thinkingEnabled: profile.settings.thinkingEnabled ?? true,
      thinkingBudget: profile.settings.thinkingBudget || 32000,
      claudeMd: profile.claudeMd || '',
    })
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
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-text-primary">Work Profiles</h3>
          <p className="text-sm text-text-muted">
            Create specialized profiles for different work contexts (engineering, security, research)
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            New Profile
          </button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="card">
          <div className="card-header">
            <h4 className="font-medium text-text-primary">Create New Profile</h4>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Profile Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., claude-eng, claude-sec"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this profile"
                  className="input w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">Default Model</label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="input w-full"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">Max Output Tokens</label>
                <input
                  type="number"
                  value={formData.maxTokens}
                  onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 64000 })}
                  className="input w-full"
                  min={1000}
                  max={128000}
                  step={1000}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.thinkingEnabled}
                  onChange={(e) => setFormData({ ...formData, thinkingEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-text-secondary">Extended Thinking</span>
              </label>
              {formData.thinkingEnabled && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-text-secondary">Budget:</label>
                  <input
                    type="number"
                    value={formData.thinkingBudget}
                    onChange={(e) => setFormData({ ...formData, thinkingBudget: parseInt(e.target.value) || 32000 })}
                    className="input w-32"
                    min={1000}
                    max={64000}
                    step={1000}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">Profile-Specific Instructions (CLAUDE.md)</label>
              <textarea
                value={formData.claudeMd}
                onChange={(e) => setFormData({ ...formData, claudeMd: e.target.value })}
                placeholder="# Profile Instructions\n\nCustom instructions for this profile..."
                className="input w-full h-32 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => { setCreating(false); resetForm(); }}
                className="btn btn-secondary"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formData.name.trim()}
                className="btn btn-primary"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profiles list */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h4 className="font-medium text-text-primary">
            {profiles.length > 0 ? `${profiles.length} Profile${profiles.length > 1 ? 's' : ''}` : 'No Profiles'}
          </h4>
          {activeProfileId && (
            <span className="text-sm text-accent-green flex items-center gap-1">
              <Check className="w-4 h-4" />
              Active: {profiles.find(p => p.id === activeProfileId)?.name}
            </span>
          )}
        </div>
        <div className="card-body">
          {profiles.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-text-muted mb-4" />
              <p className="text-text-muted">No work profiles created yet</p>
              <p className="text-xs text-text-muted mt-1">
                Create profiles for different work contexts like engineering or security
              </p>
              <button onClick={() => setCreating(true)} className="btn btn-primary mt-4">
                <Plus className="w-4 h-4" />
                Create First Profile
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => {
                const IconComponent = profileIcons[profile.name] || User
                const isActive = activeProfileId === profile.id
                const isExpanded = expandedProfile === profile.id
                const isEditing = editing === profile.id

                return (
                  <div
                    key={profile.id}
                    className={cn(
                      'border rounded-lg transition-all',
                      isActive ? 'border-accent-green bg-accent-green/5' : 'border-border',
                      isExpanded && 'border-accent-purple'
                    )}
                  >
                    <div className="flex items-center justify-between p-3">
                      <button
                        onClick={() => setExpandedProfile(isExpanded ? null : profile.id)}
                        className="flex items-center gap-3 text-left flex-1"
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center',
                          isActive ? 'bg-accent-green/20' : 'bg-surface-hover'
                        )}>
                          <IconComponent className={cn(
                            'w-5 h-5',
                            isActive ? 'text-accent-green' : 'text-text-muted'
                          )} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-text-primary">{profile.name}</p>
                            {isActive && (
                              <span className="px-2 py-0.5 text-xs bg-accent-green/20 text-accent-green rounded">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            {profile.description || `${profile.settings.model || 'Default model'}`}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <button
                            onClick={() => handleActivate(profile.id)}
                            className="btn btn-secondary btn-sm"
                            title="Activate profile"
                          >
                            <Play className="w-4 h-4" />
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => copyProfile(profile)}
                          className="p-1.5 rounded text-text-muted hover:text-accent-blue hover:bg-surface-hover"
                          title="Duplicate profile"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => startEdit(profile)}
                          className="p-1.5 rounded text-text-muted hover:text-accent-purple hover:bg-surface-hover"
                          title="Edit profile"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(profile.id)}
                          className="p-1.5 rounded text-text-muted hover:text-accent-red hover:bg-surface-hover"
                          title="Delete profile"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight
                          className={cn(
                            'w-4 h-4 text-text-muted transition-transform',
                            isExpanded && 'rotate-90'
                          )}
                        />
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border">
                        {isEditing ? (
                          <div className="mt-3 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">Profile Name</label>
                                <input
                                  type="text"
                                  value={formData.name}
                                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                  className="input w-full"
                                />
                              </div>
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">Description</label>
                                <input
                                  type="text"
                                  value={formData.description}
                                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                  className="input w-full"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">Model</label>
                                <select
                                  value={formData.model}
                                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                  className="input w-full"
                                >
                                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                                  <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">Max Tokens</label>
                                <input
                                  type="number"
                                  value={formData.maxTokens}
                                  onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 64000 })}
                                  className="input w-full"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm text-text-secondary mb-1">Profile Instructions</label>
                              <textarea
                                value={formData.claudeMd}
                                onChange={(e) => setFormData({ ...formData, claudeMd: e.target.value })}
                                className="input w-full h-32 font-mono text-sm"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => { setEditing(null); resetForm(); }}
                                className="btn btn-secondary btn-sm"
                              >
                                <X className="w-4 h-4" />
                                Cancel
                              </button>
                              <button
                                onClick={() => handleUpdate(profile.id)}
                                disabled={saving}
                                className="btn btn-primary btn-sm"
                              >
                                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Changes
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-text-muted">Model</p>
                                <p className="text-text-primary font-medium">
                                  {profile.settings.model || 'Default'}
                                </p>
                              </div>
                              <div>
                                <p className="text-text-muted">Max Tokens</p>
                                <p className="text-text-primary font-medium">
                                  {profile.settings.maxTokens?.toLocaleString() || '64,000'}
                                </p>
                              </div>
                              <div>
                                <p className="text-text-muted">Thinking</p>
                                <p className="text-text-primary font-medium">
                                  {profile.settings.thinkingEnabled
                                    ? `Enabled (${(profile.settings.thinkingBudget || 32000).toLocaleString()})`
                                    : 'Disabled'}
                                </p>
                              </div>
                            </div>
                            {profile.claudeMd && (
                              <div className="p-3 bg-background rounded-lg">
                                <p className="text-xs text-text-muted mb-2">Profile Instructions:</p>
                                <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono">
                                  {profile.claudeMd.slice(0, 300)}
                                  {profile.claudeMd.length > 300 && '...'}
                                </pre>
                              </div>
                            )}
                            <div className="text-xs text-text-muted">
                              Created: {new Date(profile.createdAt).toLocaleDateString()}
                              {' • '}
                              Updated: {new Date(profile.updatedAt).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent-blue flex-shrink-0 mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary mb-1">About Work Profiles</p>
            <p>
              Work profiles let you quickly switch between different Claude configurations.
              Create profiles for specific contexts like <code className="text-accent-purple">claude-eng</code> for
              engineering work or <code className="text-accent-purple">claude-sec</code> for security research.
              Each profile can have its own model, token limits, and custom instructions.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
