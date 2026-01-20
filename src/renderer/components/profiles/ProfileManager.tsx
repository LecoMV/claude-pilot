import { useEffect, useState } from 'react'
import {
  User,
  Save,
  RefreshCw,
  Plus,
  Check,
  X,
  ChevronRight,
  Edit3,
  Trash2,
  AlertCircle,
  Copy,
  Users,
  Play,
  Square,
  Shield,
  Code,
  Brain,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/react'
import { useProfileStore } from '@/stores/profile'
import { useErrorStore } from '@/stores/errors'
import type { ClaudeCodeProfile } from '@shared/types'

export function ProfileManager() {
  const { setLoading } = useProfileStore()

  // tRPC queries
  const listQuery = trpc.profiles.list.useQuery(undefined, {
    refetchInterval: 30000,
  })
  const activeQuery = trpc.profiles.getActive.useQuery()

  // Sync loading state to store
  useEffect(() => {
    setLoading(listQuery.isLoading)
  }, [listQuery.isLoading, setLoading])

  // Derive data from queries
  const customProfiles = listQuery.data ?? []
  const activeProfileId = activeQuery.data ?? null
  const loading = listQuery.isLoading
  const profilesLoading = listQuery.isLoading

  const loadProfiles = () => {
    listQuery.refetch()
    activeQuery.refetch()
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
            <Users className="w-6 h-6 text-accent-purple" />
            Work Profiles
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Create and manage Claude Code profiles for different work contexts
          </p>
        </div>
        <button onClick={loadProfiles} className="btn btn-secondary">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Profiles content */}
      <CustomProfilesPanel
        profiles={customProfiles}
        activeProfileId={activeProfileId}
        loading={profilesLoading}
        onRefresh={loadProfiles}
        onProfilesChange={loadProfiles}
        onActiveChange={() => activeQuery.refetch()}
      />
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
  onProfilesChange,
  onActiveChange,
}: CustomProfilesPanelProps) {
  const { addError } = useErrorStore()
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
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)

  // tRPC mutations
  const createMutation = trpc.profiles.create.useMutation({
    onSuccess: () => onProfilesChange(),
  })
  const updateMutation = trpc.profiles.update.useMutation({
    onSuccess: () => onProfilesChange(),
  })
  const deleteMutation = trpc.profiles.delete.useMutation({
    onSuccess: () => onProfilesChange(),
  })
  const activateMutation = trpc.profiles.activate.useMutation({
    onSuccess: () => onProfilesChange(),
  })
  const deactivateMutation = trpc.profiles.deactivate.useMutation({
    onSuccess: () => onProfilesChange(),
  })
  const launchMutation = trpc.profiles.launch.useMutation()

  const saving = createMutation.isPending || updateMutation.isPending

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

  const handleCreate = () => {
    if (!formData.name.trim()) return
    createMutation.mutate(
      {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        settings: {
          model: formData.model,
          maxTokens: formData.maxTokens,
          thinkingEnabled: formData.thinkingEnabled,
          thinkingBudget: formData.thinkingBudget,
        },
        claudeMd: formData.claudeMd || undefined,
      },
      {
        onSuccess: () => {
          setCreating(false)
          resetForm()
        },
        onError: (error) => {
          console.error('Failed to create profile:', error)
        },
      }
    )
  }

  const handleUpdate = (id: string) => {
    updateMutation.mutate(
      {
        id,
        updates: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          settings: {
            model: formData.model,
            maxTokens: formData.maxTokens,
            thinkingEnabled: formData.thinkingEnabled,
            thinkingBudget: formData.thinkingBudget,
          },
          claudeMd: formData.claudeMd || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditing(null)
          resetForm()
        },
        onError: (error) => {
          console.error('Failed to update profile:', error)
        },
      }
    )
  }

  const handleDelete = (id: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Are you sure you want to delete this profile?')) return
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          if (activeProfileId === id) {
            onActiveChange(null)
          }
        },
        onError: (error) => {
          console.error('Failed to delete profile:', error)
        },
      }
    )
  }

  const handleActivate = (id: string) => {
    activateMutation.mutate(
      { id },
      {
        onSuccess: () => {
          onActiveChange(id)
        },
        onError: (error) => {
          console.error('Failed to activate profile:', error)
        },
      }
    )
  }

  const handleDeactivate = () => {
    deactivateMutation.mutate(undefined, {
      onSuccess: () => {
        onActiveChange(null)
      },
      onError: (error) => {
        console.error('Failed to deactivate profile:', error)
      },
    })
  }

  const launching = launchMutation.isPending ? launchMutation.variables?.id : null

  const handleLaunch = (id: string) => {
    const profile = profiles.find((p) => p.id === id)
    launchMutation.mutate(
      { id },
      {
        onSuccess: (result) => {
          if (result.success) {
            // Show success toast
            addError({
              code: 'PROFILE_LAUNCHED',
              message: `Launched Claude Code with profile: ${profile?.name || id}`,
              severity: 'info',
              category: 'ui',
              timestamp: Date.now(),
            })
          } else {
            addError({
              code: 'LAUNCH_FAILED',
              message: result.error || 'Failed to launch profile',
              severity: 'error',
              category: 'process',
              timestamp: Date.now(),
            })
          }
        },
        onError: (error) => {
          console.error('Failed to launch profile:', error)
          addError({
            code: 'LAUNCH_ERROR',
            message: 'Failed to launch profile',
            severity: 'error',
            category: 'process',
            timestamp: Date.now(),
          })
        },
      }
    )
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
            Create specialized profiles for different work contexts (engineering, security,
            research)
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
                  onChange={(e) =>
                    setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 64000 })
                  }
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
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        thinkingBudget: parseInt(e.target.value) || 32000,
                      })
                    }
                    className="input w-32"
                    min={1000}
                    max={64000}
                    step={1000}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1">
                Profile-Specific Instructions (CLAUDE.md)
              </label>
              <textarea
                value={formData.claudeMd}
                onChange={(e) => setFormData({ ...formData, claudeMd: e.target.value })}
                placeholder="# Profile Instructions\n\nCustom instructions for this profile..."
                className="input w-full h-32 font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setCreating(false)
                  resetForm()
                }}
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
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
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
            {profiles.length > 0
              ? `${profiles.length} Profile${profiles.length > 1 ? 's' : ''}`
              : 'No Profiles'}
          </h4>
          {activeProfileId && (
            <span className="text-sm text-accent-green flex items-center gap-1">
              <Check className="w-4 h-4" />
              Active: {profiles.find((p) => p.id === activeProfileId)?.name}
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
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            isActive ? 'bg-accent-green/20' : 'bg-surface-hover'
                          )}
                        >
                          <IconComponent
                            className={cn(
                              'w-5 h-5',
                              isActive ? 'text-accent-green' : 'text-text-muted'
                            )}
                          />
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
                        <button
                          onClick={() => handleLaunch(profile.id)}
                          disabled={launching === profile.id}
                          className="btn btn-primary btn-sm"
                          title="Launch Claude Code with this profile"
                        >
                          {launching === profile.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Terminal className="w-4 h-4" />
                          )}
                          Launch
                        </button>
                        {isActive ? (
                          <button
                            onClick={handleDeactivate}
                            className="btn btn-secondary btn-sm"
                            title="Remove this profile from active state. Your global Claude settings will remain unchanged until you activate another profile."
                          >
                            <Square className="w-4 h-4" />
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivate(profile.id)}
                            className="btn btn-secondary btn-sm"
                            title="Apply this profile's settings to your global Claude configuration (model, tokens, CLAUDE.md). Use Launch to open a new terminal with this profile."
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
                                <label className="block text-sm text-text-secondary mb-1">
                                  Profile Name
                                </label>
                                <input
                                  type="text"
                                  value={formData.name}
                                  onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                  }
                                  className="input w-full"
                                />
                              </div>
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">
                                  Description
                                </label>
                                <input
                                  type="text"
                                  value={formData.description}
                                  onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                  }
                                  className="input w-full"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">
                                  Model
                                </label>
                                <select
                                  value={formData.model}
                                  onChange={(e) =>
                                    setFormData({ ...formData, model: e.target.value })
                                  }
                                  className="input w-full"
                                >
                                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                                  <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm text-text-secondary mb-1">
                                  Max Tokens
                                </label>
                                <input
                                  type="number"
                                  value={formData.maxTokens}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      maxTokens: parseInt(e.target.value) || 64000,
                                    })
                                  }
                                  className="input w-full"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm text-text-secondary mb-1">
                                Profile Instructions
                              </label>
                              <textarea
                                value={formData.claudeMd}
                                onChange={(e) =>
                                  setFormData({ ...formData, claudeMd: e.target.value })
                                }
                                className="input w-full h-32 font-mono text-sm"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditing(null)
                                  resetForm()
                                }}
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
                                {saving ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
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
                                <p className="text-xs text-text-muted mb-2">
                                  Profile Instructions:
                                </p>
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
          <div className="text-sm text-text-secondary space-y-2">
            <p className="font-medium text-text-primary">About Work Profiles</p>
            <p>
              Work profiles let you quickly switch between different Claude configurations. Create
              profiles for specific contexts like{' '}
              <code className="text-accent-purple">claude-eng</code> for engineering work or{' '}
              <code className="text-accent-purple">claude-sec</code> for security research.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-2 pt-2 border-t border-border">
              <div>
                <p className="font-medium text-text-primary text-xs">Launch</p>
                <p className="text-xs">
                  Opens a new Claude Code terminal with this profile&apos;s settings.
                </p>
              </div>
              <div>
                <p className="font-medium text-text-primary text-xs">Activate</p>
                <p className="text-xs">
                  Applies profile settings to your global Claude config without opening a terminal.
                </p>
              </div>
              <div>
                <p className="font-medium text-text-primary text-xs">Deactivate</p>
                <p className="text-xs">
                  Clears the active profile state. Settings remain until another profile is
                  activated.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
