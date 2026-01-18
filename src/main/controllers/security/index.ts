/**
 * Security Controllers - Index
 *
 * Exports all security-related tRPC routers:
 * - credentials: Secure credential storage via OS keychain
 * - audit: OCSF-compliant audit logging with SIEM integration
 * - watchdog: Service health monitoring and auto-recovery
 */

export { credentialsRouter } from './credentials.controller'
export { auditRouter } from './audit.controller'
export { watchdogRouter } from './watchdog.controller'
