import { useEffect, useState } from 'react'
import {
  Folder,
  FileText,
  GitBranch,
  Clock,
  Search,
  Plus,
  ExternalLink,
  FolderOpen,
  Terminal,
  RefreshCw,
} from 'lucide-react'
import type { ClaudeProject } from '@shared/types'

export function Projects() {
  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<ClaudeProject | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    setLoading(true)
    try {
      const result = await window.electron.invoke('claude:projects')
      setProjects(result)
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const openInFileManager = async (path: string) => {
    try {
      await window.electron.invoke('shell:openPath', path)
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }

  const openInTerminal = async (path: string) => {
    try {
      await window.electron.invoke('terminal:openAt', path)
    } catch (error) {
      console.error('Failed to open terminal:', error)
    }
  }

  const addProjectFolder = async () => {
    try {
      const result = await window.electron.invoke('dialog:openDirectory')
      if (result) {
        // Refresh projects list after adding
        await loadProjects()
      }
    } catch (error) {
      console.error('Failed to add project:', error)
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
        <div className="flex items-center gap-2">
          <button
            onClick={loadProjects}
            className="btn btn-secondary"
            title="Refresh projects"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={addProjectFolder} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      {/* Projects grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.path}
            project={project}
            isSelected={selectedProject?.path === project.path}
            onSelect={() => setSelectedProject(selectedProject?.path === project.path ? null : project)}
            onOpenFolder={() => openInFileManager(project.path)}
            onOpenTerminal={() => openInTerminal(project.path)}
          />
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
  isSelected: boolean
  onSelect: () => void
  onOpenFolder: () => void
  onOpenTerminal: () => void
}

function ProjectCard({ project, isSelected, onSelect, onOpenFolder, onOpenTerminal }: ProjectCardProps) {
  return (
    <div
      className={`card transition-colors cursor-pointer ${
        isSelected ? 'border-accent-purple ring-1 ring-accent-purple/30' : 'hover:border-accent-purple/50'
      }`}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg bg-accent-purple/10">
            <Folder className="w-5 h-5 text-accent-purple" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenTerminal()
              }}
              className="p-1.5 rounded-lg text-text-muted hover:text-accent-blue hover:bg-surface-hover transition-colors"
              title="Open in Terminal"
            >
              <Terminal className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenFolder()
              }}
              className="p-1.5 rounded-lg text-text-muted hover:text-accent-green hover:bg-surface-hover transition-colors"
              title="Open in File Manager"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
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
