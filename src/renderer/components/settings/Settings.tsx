import { useEffect, useState, useCallback } from 'react'
import {
  Settings as SettingsIcon,
  Palette,
  Terminal,
  Database,
  Bell,
  Shield,
  Save,
  RotateCcw,
  Check,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore, type AppSettings } from '@/stores/settings'

type SettingsSection = 'appearance' | 'terminal' | 'memory' | 'notifications' | 'security'

export function Settings() {
  const { settings, loading, saving, loaded, loadSettings, saveSettings, setSettings } =
    useSettingsStore()
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Load settings on mount
  useEffect(() => {
    if (!loaded) {
      loadSettings()
    }
  }, [loaded, loadSettings])

  // Sync local settings when store settings change
  useEffect(() => {
    setLocalSettings(settings)
    setHasChanges(false)
  }, [settings])

  // Detect changes
  useEffect(() => {
    const changed = JSON.stringify(localSettings) !== JSON.stringify(settings)
    setHasChanges(changed)
  }, [localSettings, settings])

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSettings(localSettings)
    const success = await saveSettings()
    if (success) {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    }
  }

  const handleReset = () => {
    setLocalSettings(settings)
    setHasChanges(false)
  }

  const sections: { id: SettingsSection; icon: typeof SettingsIcon; label: string }[] = [
    { id: 'appearance', icon: Palette, label: 'Appearance' },
    { id: 'terminal', icon: Terminal, label: 'Terminal' },
    { id: 'memory', icon: Database, label: 'Memory' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'security', icon: Shield, label: 'Security' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-purple" />
      </div>
    )
  }

  return (
    <div className="flex gap-6 animate-in">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0">
        <nav className="space-y-1">
          {sections.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                activeSection === id
                  ? 'bg-accent-purple/10 text-accent-purple'
                  : 'text-text-secondary hover:bg-surface hover:text-text-primary'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">
              {sections.find((s) => s.id === activeSection)?.label}
            </h2>
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <span className="text-sm text-accent-green flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
              {hasChanges && (
                <>
                  <button onClick={handleReset} className="btn btn-secondary btn-sm">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
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
            {activeSection === 'appearance' && (
              <AppearanceSettings settings={localSettings} onChange={handleChange} />
            )}
            {activeSection === 'terminal' && (
              <TerminalSettings settings={localSettings} onChange={handleChange} />
            )}
            {activeSection === 'memory' && (
              <MemorySettings settings={localSettings} onChange={handleChange} />
            )}
            {activeSection === 'notifications' && (
              <NotificationSettings settings={localSettings} onChange={handleChange} />
            )}
            {activeSection === 'security' && (
              <SecuritySettings settings={localSettings} onChange={handleChange} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface SettingsProps {
  settings: AppSettings
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

function AppearanceSettings({ settings, onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Theme">
        <SettingRow label="Color Scheme" description="Choose your preferred color scheme">
          <select
            className="input w-40"
            value={settings.theme}
            onChange={(e) => onChange('theme', e.target.value as AppSettings['theme'])}
          >
            <option value="dark">Dark</option>
            <option value="light">Light (Coming Soon)</option>
            <option value="auto">System</option>
          </select>
        </SettingRow>
        <SettingRow label="Accent Color" description="Primary accent color">
          <div className="flex items-center gap-2">
            {(['purple', 'blue', 'green', 'teal'] as const).map((color) => (
              <button
                key={color}
                onClick={() => onChange('accentColor', color)}
                className={cn(
                  'w-6 h-6 rounded-full transition-all',
                  settings.accentColor === color && 'ring-2 ring-offset-2 ring-offset-background',
                  color === 'purple' && 'bg-accent-purple',
                  color === 'blue' && 'bg-accent-blue',
                  color === 'green' && 'bg-accent-green',
                  color === 'teal' && 'bg-accent-teal',
                  settings.accentColor === color &&
                    (color === 'purple'
                      ? 'ring-accent-purple'
                      : color === 'blue'
                        ? 'ring-accent-blue'
                        : color === 'green'
                          ? 'ring-accent-green'
                          : 'ring-accent-teal')
                )}
              />
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Layout">
        <SettingRow label="Sidebar Default" description="Sidebar state on startup">
          <select
            className="input w-40"
            value={settings.sidebarCollapsed ? 'collapsed' : 'expanded'}
            onChange={(e) => onChange('sidebarCollapsed', e.target.value === 'collapsed')}
          >
            <option value="expanded">Expanded</option>
            <option value="collapsed">Collapsed</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function TerminalSettings({ settings, onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Font">
        <SettingRow label="Font Family" description="Terminal font">
          <select
            className="input w-48"
            value={settings.terminalFont}
            onChange={(e) => onChange('terminalFont', e.target.value as AppSettings['terminalFont'])}
          >
            <option value="jetbrains">JetBrains Mono</option>
            <option value="fira">Fira Code</option>
            <option value="cascadia">Cascadia Code</option>
          </select>
        </SettingRow>
        <SettingRow label="Font Size" description="Terminal font size in pixels">
          <input
            type="number"
            className="input w-24"
            value={settings.terminalFontSize}
            min={10}
            max={24}
            onChange={(e) => onChange('terminalFontSize', parseInt(e.target.value) || 14)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Behavior">
        <SettingRow label="Scrollback Lines" description="Number of lines to keep in history">
          <input
            type="number"
            className="input w-32"
            value={settings.terminalScrollback}
            min={1000}
            max={100000}
            onChange={(e) => onChange('terminalScrollback', parseInt(e.target.value) || 10000)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function MemorySettings({ settings, onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="PostgreSQL">
        <SettingRow label="Host" description="Database host">
          <input
            type="text"
            className="input w-48"
            value={settings.postgresHost}
            onChange={(e) => onChange('postgresHost', e.target.value)}
          />
        </SettingRow>
        <SettingRow label="Port" description="Database port">
          <input
            type="number"
            className="input w-24"
            value={settings.postgresPort}
            onChange={(e) => onChange('postgresPort', parseInt(e.target.value) || 5433)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Memgraph">
        <SettingRow label="Host" description="Graph database host">
          <input
            type="text"
            className="input w-48"
            value={settings.memgraphHost}
            onChange={(e) => onChange('memgraphHost', e.target.value)}
          />
        </SettingRow>
        <SettingRow label="Port" description="Graph database port">
          <input
            type="number"
            className="input w-24"
            value={settings.memgraphPort}
            onChange={(e) => onChange('memgraphPort', parseInt(e.target.value) || 7687)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function NotificationSettings({ settings, onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Notifications">
        <SettingRow label="System Notifications" description="Show desktop notifications">
          <Toggle
            checked={settings.systemNotifications}
            onChange={(checked) => onChange('systemNotifications', checked)}
          />
        </SettingRow>
        <SettingRow label="Sound" description="Play sound for notifications">
          <Toggle
            checked={settings.soundEnabled}
            onChange={(checked) => onChange('soundEnabled', checked)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

// Credential key definitions
const CREDENTIAL_KEYS = [
  { key: 'postgresql.password', label: 'PostgreSQL Password', description: 'Database password for claude_memory' },
  { key: 'memgraph.password', label: 'Memgraph Password', description: 'Graph database password' },
  { key: 'qdrant.apiKey', label: 'Qdrant API Key', description: 'Vector database API key' },
  { key: 'anthropic.apiKey', label: 'Anthropic API Key', description: 'Claude API key for direct chat' },
  { key: 'github.token', label: 'GitHub Token', description: 'Personal access token' },
] as const

type CredentialKey = typeof CREDENTIAL_KEYS[number]['key']

interface CredentialState {
  [key: string]: {
    hasValue: boolean
    editing: boolean
    value: string
    showValue: boolean
    saving: boolean
  }
}

function SecuritySettings({ settings, onChange }: SettingsProps) {
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null)
  const [credentials, setCredentials] = useState<CredentialState>({})
  const [loading, setLoading] = useState(true)

  // Load credential status on mount
  useEffect(() => {
    const loadCredentials = async () => {
      try {
        const [available, keys] = await Promise.all([
          window.electron.invoke('credentials:isEncryptionAvailable'),
          window.electron.invoke('credentials:list'),
        ])
        setEncryptionAvailable(available)

        // Check which credentials exist
        const state: CredentialState = {}
        for (const { key } of CREDENTIAL_KEYS) {
          const hasValue = keys.includes(key)
          state[key] = {
            hasValue,
            editing: false,
            value: '',
            showValue: false,
            saving: false,
          }
        }
        setCredentials(state)
      } catch (error) {
        console.error('Failed to load credentials:', error)
      } finally {
        setLoading(false)
      }
    }
    loadCredentials()
  }, [])

  const handleCredentialChange = useCallback((key: string, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [key]: { ...prev[key], value, editing: true },
    }))
  }, [])

  const handleCredentialSave = useCallback(async (key: string) => {
    const cred = credentials[key]
    if (!cred || !cred.value) return

    setCredentials((prev) => ({
      ...prev,
      [key]: { ...prev[key], saving: true },
    }))

    try {
      await window.electron.invoke('credentials:store', key, cred.value)
      setCredentials((prev) => ({
        ...prev,
        [key]: { ...prev[key], hasValue: true, editing: false, value: '', saving: false },
      }))
    } catch (error) {
      console.error(`Failed to save credential ${key}:`, error)
      setCredentials((prev) => ({
        ...prev,
        [key]: { ...prev[key], saving: false },
      }))
    }
  }, [credentials])

  const handleCredentialDelete = useCallback(async (key: string) => {
    try {
      await window.electron.invoke('credentials:delete', key)
      setCredentials((prev) => ({
        ...prev,
        [key]: { ...prev[key], hasValue: false, editing: false, value: '' },
      }))
    } catch (error) {
      console.error(`Failed to delete credential ${key}:`, error)
    }
  }, [])

  const toggleShowValue = useCallback((key: string) => {
    setCredentials((prev) => ({
      ...prev,
      [key]: { ...prev[key], showValue: !prev[key]?.showValue },
    }))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encryption Status */}
      <SettingGroup title="Encryption Status">
        <div className={cn(
          'flex items-center gap-3 p-3 rounded-lg',
          encryptionAvailable ? 'bg-accent-green/10' : 'bg-accent-yellow/10'
        )}>
          {encryptionAvailable ? (
            <Lock className="w-5 h-5 text-accent-green" />
          ) : (
            <Unlock className="w-5 h-5 text-accent-yellow" />
          )}
          <div className="flex-1">
            <p className={cn(
              'font-medium',
              encryptionAvailable ? 'text-accent-green' : 'text-accent-yellow'
            )}>
              {encryptionAvailable ? 'OS Keychain Encryption Active' : 'Encryption Unavailable'}
            </p>
            <p className="text-sm text-text-muted">
              {encryptionAvailable
                ? 'Credentials are encrypted using your OS keychain'
                : 'Install libsecret on Linux for secure storage'}
            </p>
          </div>
        </div>
      </SettingGroup>

      {/* Credentials */}
      <SettingGroup title="Stored Credentials">
        <div className="space-y-3">
          {CREDENTIAL_KEYS.map(({ key, label, description }) => {
            const cred = credentials[key]
            if (!cred) return null

            return (
              <div key={key} className="p-3 bg-surface rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-text-muted" />
                    <span className="font-medium text-text-primary">{label}</span>
                    {cred.hasValue && (
                      <span className="px-1.5 py-0.5 text-xs bg-accent-green/10 text-accent-green rounded">
                        Stored
                      </span>
                    )}
                  </div>
                  {cred.hasValue && !cred.editing && (
                    <button
                      onClick={() => handleCredentialDelete(key)}
                      className="p-1 text-text-muted hover:text-accent-red transition-colors"
                      title="Delete credential"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-text-muted mb-2">{description}</p>

                {cred.hasValue && !cred.editing ? (
                  <button
                    onClick={() => setCredentials((prev) => ({
                      ...prev,
                      [key]: { ...prev[key], editing: true },
                    }))}
                    className="text-sm text-accent-blue hover:underline"
                  >
                    Update credential
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={cred.showValue ? 'text' : 'password'}
                        className="input w-full pr-10"
                        placeholder={cred.hasValue ? 'Enter new value' : 'Enter value'}
                        value={cred.value}
                        onChange={(e) => handleCredentialChange(key, e.target.value)}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShowValue(key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
                      >
                        {cred.showValue ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <button
                      onClick={() => handleCredentialSave(key)}
                      disabled={!cred.value || cred.saving}
                      className="btn btn-primary btn-sm"
                    >
                      {cred.saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </button>
                    {cred.hasValue && cred.editing && (
                      <button
                        onClick={() => setCredentials((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], editing: false, value: '' },
                        }))}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!encryptionAvailable && (
          <div className="flex items-start gap-2 mt-4 p-3 bg-accent-yellow/10 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-accent-yellow flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-accent-yellow">Security Warning</p>
              <p className="text-sm text-text-muted">
                Without OS keychain integration, credentials are stored with reduced security.
                Consider setting environment variables instead.
              </p>
            </div>
          </div>
        )}
      </SettingGroup>

      {/* General Security */}
      <SettingGroup title="General Security">
        <SettingRow label="Auto-lock" description="Lock app after inactivity">
          <Toggle
            checked={settings.autoLock}
            onChange={(checked) => onChange('autoLock', checked)}
          />
        </SettingRow>
        <SettingRow label="Clear on Exit" description="Clear sensitive data on app exit">
          <Toggle
            checked={settings.clearOnExit}
            onChange={(checked) => onChange('clearOnExit', checked)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

interface SettingGroupProps {
  title: string
  children: React.ReactNode
}

function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-text-muted mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

interface SettingRowProps {
  label: string
  description: string
  children: React.ReactNode
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium text-text-primary">{label}</p>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'w-11 h-6 rounded-full transition-colors relative',
        checked ? 'bg-accent-purple' : 'bg-border'
      )}
    >
      <span
        className={cn(
          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}
