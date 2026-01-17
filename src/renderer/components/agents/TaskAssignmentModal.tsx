/**
 * Task Assignment Modal Component
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import { Send, X } from 'lucide-react'
import type { Agent } from '@/stores/agents'

interface TaskAssignmentModalProps {
  taskDescription: string
  targetAgentId: string | 'auto'
  agents: Agent[]
  onDescriptionChange: (description: string) => void
  onTargetChange: (target: string | 'auto') => void
  onSubmit: () => void
  onClose: () => void
}

export function TaskAssignmentModal({
  taskDescription,
  targetAgentId,
  agents,
  onDescriptionChange,
  onTargetChange,
  onSubmit,
  onClose,
}: TaskAssignmentModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Send className="w-5 h-5 text-accent-blue" />
            Assign Task
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-muted mb-2 block">Task Description</label>
            <textarea
              placeholder="Describe the task for the agent(s)..."
              value={taskDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className="input w-full h-32 resize-none"
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm text-text-muted mb-2 block">Target Agent</label>
            <select
              value={targetAgentId}
              onChange={(e) => onTargetChange(e.target.value)}
              className="input w-full"
            >
              <option value="auto">Auto-route (best fit)</option>
              {agents
                .filter((a) => a.status !== 'terminated')
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name || agent.id} ({agent.type})
                  </option>
                ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              {targetAgentId === 'auto'
                ? 'The system will automatically route to the most suitable agent'
                : 'Task will be assigned directly to the selected agent'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={!taskDescription.trim()} className="btn btn-primary">
            <Send className="w-4 h-4 mr-2" />
            Submit Task
          </button>
        </div>
      </div>
    </div>
  )
}
