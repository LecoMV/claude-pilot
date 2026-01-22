import { useState, useRef, useEffect } from 'react'
import {
  Folder,
  FileText,
  GitBranch,
  Clock,
  Search,
  Plus,
  FolderOpen,
  RefreshCw,
  Play,
  RotateCcw,
  User,
  List,
  ChevronDown,
  LayoutGrid,
  LayoutList,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/react'
import { cn } from '@/lib/utils'
import type { ClaudeProject, ClaudeCodeProfile } from '@shared/types'

interface ProjectsProps {
  onNavigate?: (view: string, params?: Record<string, string>) => void
}

export function Projects({ onNavigate }: ProjectsProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProject, setSelectedProject] = useState<ClaudeProject | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // tRPC queries
  const projectsQuery = trpc.claude.projects.useQuery(undefined, { refetchInterval: 30000 })
  const profilesQuery = trpc.profiles.list.useQuery()

  // tRPC mutations
  const openPathMutation = trpc.system.openPath.useMutation()
  const openAtMutation = trpc.terminal.openAt.useMutation()
  const openDirectoryMutation = trpc.system.openDirectory.useMutation()

  const projects = projectsQuery.data ?? []
  const loading = projectsQuery.isLoading

  const loadProjects = () => {
    projectsQuery.refetch()
  }

  const openInFileManager = (path: string) => {
    openPathMutation.mutate(
      { path },
      { onError: (error) => console.error('Failed to open folder:', error) }
    )
  }

  const launchClaude = (path: string, _options?: { continue?: boolean; profile?: string }) => {
    // TODO: Build and execute claude command with options
    // For now, open terminal at path - in the future we'd execute the command
    openAtMutation.mutate(
      { path },
      { onError: (error) => console.error('Failed to launch Claude:', error) }
    )
  }

  const profiles = profilesQuery.data ?? []

  const addProjectFolder = () => {
    openDirectoryMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result) {
          // Refresh projects list after adding
          projectsQuery.refetch()
        }
      },
      onError: (error) => console.error('Failed to add project:', error),
    })
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
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'grid'
                  ? 'bg-accent-purple/10 text-accent-purple'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
              )}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'list'
                  ? 'bg-accent-purple/10 text-accent-purple'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
              )}
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={loadProjects}
            className="btn btn-secondary"
            title="Refresh projects"
            aria-label="Refresh projects"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button onClick={addProjectFolder} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      {/* Projects grid/list */}
      <div
        className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'flex flex-col gap-2'
        )}
      >
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.path}
            project={project}
            viewMode={viewMode}
            profiles={profiles}
            isSelected={selectedProject?.path === project.path}
            onSelect={() =>
              setSelectedProject(selectedProject?.path === project.path ? null : project)
            }
            onOpenFolder={() => openInFileManager(project.path)}
            onLaunch={(options) => launchClaude(project.path, options)}
            onViewSessions={() => onNavigate?.('sessions', { project: project.path })}
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
  viewMode: 'grid' | 'list'
  profiles: ClaudeCodeProfile[]
  isSelected: boolean
  onSelect: () => void
  onOpenFolder: () => void
  onLaunch: (options?: { continue?: boolean; profile?: string }) => void
  onViewSessions: () => void
}

function ProjectCard({
  project,
  viewMode,
  profiles,
  isSelected,
  onSelect,
  onOpenFolder,
  onLaunch,
  onViewSessions,
}: ProjectCardProps) {
  const [showLaunchMenu, setShowLaunchMenu] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowLaunchMenu(false)
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'card p-3 flex items-center gap-4 transition-colors cursor-pointer',
          isSelected
            ? 'border-accent-purple ring-1 ring-accent-purple/30'
            : 'hover:border-accent-purple/50'
        )}
        onClick={onSelect}
      >
        <div className="p-2 rounded-lg bg-accent-purple/10">
          <Folder className="w-4 h-4 text-accent-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-text-primary truncate">{project.name}</h3>
          <p className="text-xs text-text-muted truncate">{project.path}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {project.hasCLAUDEMD && (
            <span className="px-2 py-0.5 rounded bg-accent-green/10 text-accent-green">
              CLAUDE.md
            </span>
          )}
          {project.hasBeads && (
            <span className="px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue">Beads</span>
          )}
          <span className="text-text-muted">{project.sessionCount} sessions</span>
        </div>
        <div className="flex items-center gap-1" ref={menuRef}>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowLaunchMenu(!showLaunchMenu)
              }}
              className="btn btn-sm btn-primary flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              Launch
              <ChevronDown className="w-3 h-3" />
            </button>
            {showLaunchMenu && (
              <LaunchMenu
                profiles={profiles}
                showProfileMenu={showProfileMenu}
                setShowProfileMenu={setShowProfileMenu}
                onLaunch={onLaunch}
                onViewSessions={onViewSessions}
                onClose={() => setShowLaunchMenu(false)}
              />
            )}
          </div>
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
    )
  }

  return (
    <div
      className={cn(
        'card transition-colors cursor-pointer',
        isSelected
          ? 'border-accent-purple ring-1 ring-accent-purple/30'
          : 'hover:border-accent-purple/50'
      )}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg bg-accent-purple/10">
            <Folder className="w-5 h-5 text-accent-purple" />
          </div>
          <div className="flex items-center gap-1" ref={menuRef}>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowLaunchMenu(!showLaunchMenu)
                }}
                className="p-1.5 rounded-lg text-text-muted hover:text-accent-purple hover:bg-surface-hover transition-colors flex items-center gap-0.5"
                title="Launch Claude"
              >
                <Play className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showLaunchMenu && (
                <LaunchMenu
                  profiles={profiles}
                  showProfileMenu={showProfileMenu}
                  setShowProfileMenu={setShowProfileMenu}
                  onLaunch={onLaunch}
                  onViewSessions={onViewSessions}
                  onClose={() => setShowLaunchMenu(false)}
                />
              )}
            </div>
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

        <h3 className="font-medium text-text-primary truncate mb-1">{project.name}</h3>
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

interface LaunchMenuProps {
  profiles: ClaudeCodeProfile[]
  showProfileMenu: boolean
  setShowProfileMenu: (show: boolean) => void
  onLaunch: (options?: { continue?: boolean; profile?: string }) => void
  onViewSessions: () => void
  onClose: () => void
}

function LaunchMenu({
  profiles,
  showProfileMenu,
  setShowProfileMenu,
  onLaunch,
  onViewSessions,
  onClose,
}: LaunchMenuProps) {
  return (
    <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onLaunch()
          onClose()
        }}
        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
      >
        <Play className="w-4 h-4 text-accent-green" />
        New Session
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onLaunch({ continue: true })
          onClose()
        }}
        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
      >
        <RotateCcw className="w-4 h-4 text-accent-blue" />
        Continue Last
      </button>
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowProfileMenu(!showProfileMenu)
          }}
          className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <User className="w-4 h-4 text-accent-purple" />
            Choose Profile
          </span>
          <ChevronDown
            className={cn('w-3 h-3 transition-transform', showProfileMenu && 'rotate-180')}
          />
        </button>
        {showProfileMenu && profiles.length > 0 && (
          <div className="absolute left-full top-0 ml-1 w-40 bg-surface border border-border rounded-lg shadow-lg py-1">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onLaunch({ profile: profile.id })
                  onClose()
                }}
                className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover truncate"
              >
                {profile.name}
              </button>
            ))}
          </div>
        )}
        {showProfileMenu && profiles.length === 0 && (
          <div className="absolute left-full top-0 ml-1 w-40 bg-surface border border-border rounded-lg shadow-lg p-3">
            <p className="text-xs text-text-muted">No profiles configured</p>
          </div>
        )}
      </div>
      <div className="border-t border-border my-1" />
      <button
        onClick={(e) => {
          e.stopPropagation()
          onViewSessions()
          onClose()
        }}
        className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2"
      >
        <List className="w-4 h-4 text-text-muted" />
        View Sessions
      </button>
    </div>
  )
}

export default Projects
