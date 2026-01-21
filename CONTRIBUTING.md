# Contributing to Claude Pilot

Thank you for your interest in contributing to Claude Pilot! This document provides guidelines and information for contributors.

## Code of Conduct

Be respectful, inclusive, and constructive. We're building professional software together.

## Getting Started

### Prerequisites

- Node.js 20.0.0 or higher
- npm 10.0.0 or higher
- Git
- Linux/macOS/Windows

### Development Setup

```bash
# Clone the repository
git clone https://github.com/LecoMV/claude-pilot.git
cd claude-pilot

# Install dependencies
npm install

# Start development server
npm run dev
```

### Verifying Setup

```bash
# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm run test:run

# Check test coverage
npm run test:coverage
```

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions or fixes
- `chore/description` - Maintenance tasks

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code formatting (no logic change)
- `refactor` - Code refactoring
- `test` - Adding/fixing tests
- `chore` - Maintenance

Examples:

```
feat(sessions): add ghost session detector
fix(credentials): handle missing keychain gracefully
docs(readme): update installation instructions
test(mcp): add proxy controller tests
```

### Pull Request Process

1. **Create a branch** from `master`
2. **Make changes** following our code style
3. **Write tests** for new functionality
4. **Run checks** before pushing:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:run
   ```
5. **Push** and create a Pull Request
6. **Respond** to review feedback
7. **Squash merge** once approved

## Architecture Guidelines

### Process Model

Claude Pilot follows Electron's multi-process architecture:

```
Main Process (Node.js)
├── tRPC Controllers (IPC handlers)
├── Services (business logic)
└── Utils (shared utilities)

Renderer Process (Chromium + React)
├── Components (UI)
├── Hooks (React logic)
├── Stores (Zustand state)
└── tRPC Client (typed IPC calls)

Preload Script (Bridge)
└── Context Bridge API
```

### IPC Communication

**Always use tRPC** for main-renderer communication:

```typescript
// Main process - controller
export const myRouter = router({
  getData: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return await myService.get(input.id)
  }),
})

// Renderer - hook
const { data } = trpc.my.getData.useQuery({ id })
```

**Never use** raw `ipcMain.handle` or `ipcRenderer.invoke`.

### File Size Limits

Keep files focused and small:

| File Type         | Max Lines | Action if exceeded        |
| ----------------- | --------- | ------------------------- |
| React Component   | 250       | Extract sub-components    |
| TypeScript Module | 400       | Split by responsibility   |
| Controller        | 300       | One controller per domain |
| Type Definitions  | 200       | Split by domain           |

### Security Requirements

**Non-negotiable:**

- `contextIsolation: true` - Always
- `nodeIntegration: false` - Always
- `sandbox: true` - Always
- Zod validation on ALL tRPC handlers
- No secrets in renderer process

## Code Style

### TypeScript

- Explicit return types on public functions
- Use `type` over `interface` for simple types
- Prefer `const` over `let`
- No implicit `any` (strict mode enabled)
- Named exports over default exports

```typescript
// Good
export function processData(input: string): ProcessResult {
  const result = transform(input)
  return result
}

// Bad
export default function (input) {
  let result = transform(input)
  return result
}
```

### React Components

- Function components only (no class components)
- Custom hooks for shared logic
- Colocate styles with components
- Use `'use client'` sparingly

```tsx
// Good - small, focused component
export function UserCard({ user }: UserCardProps) {
  const { status, isLoading } = useUserStatus(user.id)

  if (isLoading) return <UserCardSkeleton />

  return (
    <Card>
      <CardHeader>{user.name}</CardHeader>
      <CardContent>
        <StatusBadge status={status} />
      </CardContent>
    </Card>
  )
}
```

### CSS/Tailwind

- Use Tailwind utility classes
- Extract common patterns to components
- Follow design system colors in `tailwind.config.js`

## Testing Guidelines

### Test Structure

```
src/
├── main/
│   ├── services/
│   │   ├── my-service.ts
│   │   └── __tests__/
│   │       └── my-service.test.ts
│   └── controllers/
│       ├── my-controller.ts
│       └── __tests__/
│           └── my-controller.test.ts
└── renderer/
    └── components/
        ├── MyComponent.tsx
        └── __tests__/
            └── MyComponent.test.tsx
```

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('MyService', () => {
  describe('getData', () => {
    it('should return data for valid ID', async () => {
      const result = await myService.getData('123')
      expect(result).toMatchObject({ id: '123' })
    })

    it('should throw for invalid ID', async () => {
      await expect(myService.getData('')).rejects.toThrow()
    })
  })
})
```

### Coverage Requirements

- **Global threshold**: 80% (lines, branches, functions)
- **Critical modules**: 90%+ coverage
- All new features must include tests

## Documentation

### Code Comments

- Document the "why", not the "what"
- Use JSDoc for public APIs
- No commented-out code

```typescript
/**
 * Detects stale sessions without active Claude processes.
 * Sessions older than threshold are marked for potential cleanup.
 *
 * @param staleThresholdDays - Days after which a session is considered stale
 * @returns Array of ghost sessions with cleanup recommendations
 */
export async function detectGhostSessions(staleThresholdDays = 7): Promise<GhostSessionInfo[]> {
  // Use Set for O(1) lookup instead of array includes
  const activeIds = new Set(activeSessions.map((s) => s.id))
  // ...
}
```

### Documentation Files

- `README.md` - Project overview and quick start
- `CHANGELOG.md` - Release history (keep-a-changelog format)
- `docs/` - Detailed documentation and design docs

## Issue Tracking

We use **Beads** (`bd` command) for issue tracking:

```bash
# View available work
bd ready

# Create new issue
bd create --title="Fix X" --type=bug --priority=2

# Start work
bd update <id> --status=in_progress

# Complete work
bd close <id> --reason="Fixed by implementing Y"
```

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Create an issue with reproduction steps
- **Features**: Create an issue describing the use case
- **Security**: Report privately via GitHub Security Advisories

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
