/**
 * 5-Tier Configuration System
 *
 * Hierarchical configuration resolution with admin locking support.
 *
 * Priority (lowest to highest):
 * 1. Installation Defaults - Built into app bundle
 * 2. System Policies - /etc/claude-pilot/ (admin-controlled, can lock)
 * 3. User Preferences - ~/.config/claude-pilot/settings.json
 * 4. Project Config - .claude/pilot.json in project root
 * 5. Session Overrides - CLI flags, environment variables
 */

// Types
export * from './types'

// Resolver
export {
  ConfigResolver,
  getConfigResolver,
  resolveConfig,
  getConfigValue,
  isConfigLocked,
  setProjectPath,
} from './resolver'
