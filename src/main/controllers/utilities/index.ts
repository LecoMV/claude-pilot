/**
 * Utility Controllers - Index
 *
 * Exports all utility-related tRPC routers:
 * - profiles: Claude profile and settings management
 * - services: Systemd and Podman service control
 * - logs: Log retrieval and streaming
 * - agents: Agent spawning and swarm management
 * - settings: Application settings and budget
 * - claude: Claude Code version and projects
 * - workers: Worker pool management
 * - stream: MessagePort streaming management
 * - update: Auto-update download and install
 * - terminal: Terminal path navigation
 */

export { profilesRouter } from './profiles.controller'
export { servicesRouter } from './services.controller'
export { logsRouter, logStreamManager } from './logs.controller'
export { agentsRouter } from './agents.controller'
export { settingsRouter } from './settings.controller'
export { claudeRouter } from './claude.controller'
export { workersRouter } from './workers.controller'
export { streamRouter } from './stream.controller'
export { updateRouter, updateState } from './update.controller'
export { terminalRouter } from './terminal.controller'
