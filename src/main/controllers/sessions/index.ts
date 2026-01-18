/**
 * Sessions Controllers Index
 *
 * Re-exports all session-related tRPC routers:
 * - sessionRouter: Session discovery and management
 * - transcriptRouter: Transcript parsing and watching
 * - beadsRouter: Issue/work tracking
 *
 * @module sessions
 */

export { sessionRouter, sessionWatchManager, type SessionRouter } from './session.controller'
export { transcriptRouter, type TranscriptRouter } from './transcript.controller'
export { beadsRouter, type BeadsRouter } from './beads.controller'
