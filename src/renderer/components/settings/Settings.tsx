import { useEffect, useState } from 'react'
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

function SecuritySettings({ settings, onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Security">
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
