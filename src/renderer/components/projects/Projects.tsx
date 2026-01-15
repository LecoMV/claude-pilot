import { useEffect, useState } from 'react'
import {
  Folder,
  FileText,
  GitBranch,
  Clock,
  Search,
  Plus,
  ExternalLink,
} from 'lucide-react'
import type { ClaudeProject } from '@shared/types'

export function Projects() {
  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const result = await window.electron.invoke('claude:projects')
      setProjects(result)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in">
      {/* Search and actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button className="btn btn-primary">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Projects grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map((project) => (
          <ProjectCard key={project.path} project={project} />
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-12">
          <Folder className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            {searchQuery ? 'No projects found' : 'No Claude projects yet'}
          </h3>
          <p className="text-text-muted">
            {searchQuery
              ? 'Try a different search term'
              : 'Projects with .claude/CLAUDE.md will appear here'}
          </p>
        </div>
      )}
    </div>
  )
}

interface ProjectCardProps {
  project: ClaudeProject
}

function ProjectCard({ project }: ProjectCardProps) {
  return (
    <div className="card hover:border-accent-purple/50 transition-colors cursor-pointer">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg bg-accent-purple/10">
            <Folder className="w-5 h-5 text-accent-purple" />
          </div>
          <button className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors">
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        <h3 className="font-medium text-text-primary truncate mb-1">
          {project.name}
        </h3>
        <p className="text-sm text-text-muted truncate mb-3">{project.path}</p>

        <div className="flex items-center gap-3 text-sm">
          {project.hasCLAUDEMD && (
            <span className="flex items-center gap-1 text-accent-green">
              <FileText className="w-3.5 h-3.5" />
              CLAUDE.md
            </span>
          )}
          {project.hasBeads && (
            <span className="flex items-center gap-1 text-accent-blue">
              <GitBranch className="w-3.5 h-3.5" />
              Beads
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border bg-surface-hover/50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">
            {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-text-muted">
            <Clock className="w-3.5 h-3.5" />
            Recent
          </span>
        </div>
      </div>
    </div>
  )
}
