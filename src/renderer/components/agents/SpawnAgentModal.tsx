/**
 * Spawn Agent Modal Component
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import type { AgentType } from '@/stores/agents'

interface SpawnAgentModalProps {
  agentType: AgentType
  agentName: string
  onTypeChange: (type: AgentType) => void
  onNameChange: (name: string) => void
  onSpawn: () => void
  onClose: () => void
}

export function SpawnAgentModal({
  agentType,
  agentName,
  onTypeChange,
  onNameChange,
  onSpawn,
  onClose,
}: SpawnAgentModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Spawn Agent</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-muted mb-2 block">Agent Type</label>
            <select
              value={agentType}
              onChange={(e) => onTypeChange(e.target.value as AgentType)}
              className="input w-full"
            >
              <option value="coder">Coder</option>
              <option value="researcher">Researcher</option>
              <option value="tester">Tester</option>
              <option value="architect">Architect</option>
              <option value="coordinator">Coordinator</option>
              <option value="security">Security</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-text-muted mb-2 block">Agent Name</label>
            <input
              type="text"
              placeholder="e.g., code-assistant-1"
              value={agentName}
              onChange={(e) => onNameChange(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onSpawn} disabled={!agentName} className="btn btn-primary">
            Spawn
          </button>
        </div>
      </div>
    </div>
  )
}
