import { useState } from 'react'
import {
  Settings as SettingsIcon,
  Palette,
  Terminal,
  Database,
  Bell,
  Shield,
  Save,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SettingsSection = 'appearance' | 'terminal' | 'memory' | 'notifications' | 'security'

export function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance')
  const [hasChanges, setHasChanges] = useState(false)

  const sections: { id: SettingsSection; icon: typeof SettingsIcon; label: string }[] = [
    { id: 'appearance', icon: Palette, label: 'Appearance' },
    { id: 'terminal', icon: Terminal, label: 'Terminal' },
    { id: 'memory', icon: Database, label: 'Memory' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'security', icon: Shield, label: 'Security' },
  ]

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
            {hasChanges && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHasChanges(false)}
                  className="btn btn-secondary btn-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={() => setHasChanges(false)}
                  className="btn btn-primary btn-sm"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            )}
          </div>
          <div className="card-body">
            {activeSection === 'appearance' && (
              <AppearanceSettings onChange={() => setHasChanges(true)} />
            )}
            {activeSection === 'terminal' && (
              <TerminalSettings onChange={() => setHasChanges(true)} />
            )}
            {activeSection === 'memory' && (
              <MemorySettings onChange={() => setHasChanges(true)} />
            )}
            {activeSection === 'notifications' && (
              <NotificationSettings onChange={() => setHasChanges(true)} />
            )}
            {activeSection === 'security' && (
              <SecuritySettings onChange={() => setHasChanges(true)} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface SettingsProps {
  onChange: () => void
}

function AppearanceSettings({ onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Theme">
        <SettingRow label="Color Scheme" description="Choose your preferred color scheme">
          <select
            className="input w-40"
            onChange={onChange}
            defaultValue="dark"
          >
            <option value="dark">Dark</option>
            <option value="light">Light (Coming Soon)</option>
            <option value="auto">System</option>
          </select>
        </SettingRow>
        <SettingRow label="Accent Color" description="Primary accent color">
          <div className="flex items-center gap-2">
            {['purple', 'blue', 'green', 'teal'].map((color) => (
              <button
                key={color}
                onClick={onChange}
                className={cn(
                  'w-6 h-6 rounded-full',
                  color === 'purple' && 'bg-accent-purple ring-2 ring-offset-2 ring-offset-background ring-accent-purple',
                  color === 'blue' && 'bg-accent-blue',
                  color === 'green' && 'bg-accent-green',
                  color === 'teal' && 'bg-accent-teal'
                )}
              />
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Layout">
        <SettingRow label="Sidebar Default" description="Sidebar state on startup">
          <select className="input w-40" onChange={onChange} defaultValue="expanded">
            <option value="expanded">Expanded</option>
            <option value="collapsed">Collapsed</option>
          </select>
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function TerminalSettings({ onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Font">
        <SettingRow label="Font Family" description="Terminal font">
          <select className="input w-48" onChange={onChange} defaultValue="jetbrains">
            <option value="jetbrains">JetBrains Mono</option>
            <option value="fira">Fira Code</option>
            <option value="cascadia">Cascadia Code</option>
          </select>
        </SettingRow>
        <SettingRow label="Font Size" description="Terminal font size in pixels">
          <input
            type="number"
            className="input w-24"
            defaultValue={14}
            min={10}
            max={24}
            onChange={onChange}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Behavior">
        <SettingRow label="Scrollback Lines" description="Number of lines to keep in history">
          <input
            type="number"
            className="input w-32"
            defaultValue={10000}
            min={1000}
            max={100000}
            onChange={onChange}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function MemorySettings({ onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="PostgreSQL">
        <SettingRow label="Host" description="Database host">
          <input
            type="text"
            className="input w-48"
            defaultValue="localhost"
            onChange={onChange}
          />
        </SettingRow>
        <SettingRow label="Port" description="Database port">
          <input
            type="number"
            className="input w-24"
            defaultValue={5433}
            onChange={onChange}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Memgraph">
        <SettingRow label="Host" description="Graph database host">
          <input
            type="text"
            className="input w-48"
            defaultValue="localhost"
            onChange={onChange}
          />
        </SettingRow>
        <SettingRow label="Port" description="Graph database port">
          <input
            type="number"
            className="input w-24"
            defaultValue={7687}
            onChange={onChange}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function NotificationSettings({ onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Notifications">
        <SettingRow label="System Notifications" description="Show desktop notifications">
          <Toggle defaultChecked onChange={onChange} />
        </SettingRow>
        <SettingRow label="Sound" description="Play sound for notifications">
          <Toggle defaultChecked={false} onChange={onChange} />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function SecuritySettings({ onChange }: SettingsProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Security">
        <SettingRow label="Auto-lock" description="Lock app after inactivity">
          <Toggle defaultChecked={false} onChange={onChange} />
        </SettingRow>
        <SettingRow label="Clear on Exit" description="Clear sensitive data on app exit">
          <Toggle defaultChecked onChange={onChange} />
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
  defaultChecked?: boolean
  onChange?: () => void
}

function Toggle({ defaultChecked = false, onChange }: ToggleProps) {
  const [checked, setChecked] = useState(defaultChecked)

  const handleToggle = () => {
    setChecked(!checked)
    onChange?.()
  }

  return (
    <button
      onClick={handleToggle}
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
