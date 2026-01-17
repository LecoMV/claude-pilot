/**
 * Agent Templates Modal Component
 * Extracted from AgentCanvas.tsx (deploy-9mtg refactor)
 */

import { Brain, Layers, X } from 'lucide-react'
import { agentTemplates, agentIcons, topologyOptions, type AgentTemplate } from './constants'

interface TemplatesModalProps {
  onSelectTemplate: (template: AgentTemplate) => void
  onClose: () => void
}

export function TemplatesModal({ onSelectTemplate, onClose }: TemplatesModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent-purple" />
            Agent Templates
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Quick-start with pre-configured agent teams. Select a template to spawn all agents and
          initialize the swarm.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {agentTemplates.map((template) => {
            const TopologyIcon =
              topologyOptions.find((t) => t.value === template.topology)?.icon || Layers
            return (
              <div
                key={template.name}
                className="card p-4 hover:bg-surface/80 cursor-pointer transition-colors border border-border hover:border-accent-purple/50"
                onClick={() => onSelectTemplate(template)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-text-primary">{template.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <TopologyIcon className="w-3 h-3" />
                    {template.topology}
                  </div>
                </div>
                <p className="text-sm text-text-muted mb-3">{template.description}</p>
                <div className="flex flex-wrap gap-1">
                  {template.agents.map((agent, i) => {
                    const Icon = agentIcons[agent.type] || Brain
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1 px-2 py-1 bg-surface rounded text-xs text-text-muted"
                      >
                        <Icon className="w-3 h-3" />
                        {agent.name}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
