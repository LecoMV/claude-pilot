# Enterprise Auditing Quick Start

**TL;DR for Claude Pilot Production Readiness**

---

## Install Essential Tools (5 minutes)

```bash
# Security scanning
npm install -D @doyensec/electronegativity @semgrep/cli snyk

# Testing
npm install -D vitest @vitest/coverage-v8 @playwright/test axe-playwright

# Monitoring
npm install @sentry/electron

# Build tools
npm install -D @cyclonedx/cyclonedx-npm

# Run first scans
npx @doyensec/electronegativity --input ./src
npx semgrep --config=p/security-audit src/
npx snyk test
```

---

## Critical Security Fixes (30 minutes)

### 1. Verify Sandbox Configuration

```typescript
// src/main/index.ts - MUST have these settings
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false, // ✅ Must be false
    contextIsolation: true, // ✅ Must be true
    sandbox: true, // ✅ Must be true (Electron 20+ default)
    webSecurity: true, // ✅ Must be true
  },
})
```

**Check**: Run `npx @doyensec/electronegativity --checks ELECTRON_SECURITY_CONFIG`

### 2. Add CSP Headers

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' ws://localhost:*",
      ].join('; '),
    },
  })
})
```

### 3. Validate All IPC Handlers

```typescript
// Add to EVERY ipcMain.handle
ipcMain.handle('some:action', async (event, args) => {
  // 1. Validate origin
  const url = event.sender.getURL()
  if (!url.startsWith('file://')) throw new Error('Unauthorized')

  // 2. Validate args with Zod
  const schema = z.object({
    /* ... */
  })
  const validated = schema.parse(args)

  // 3. Execute safely
  return doSomething(validated)
})
```

---

## Setup CI/CD Security (15 minutes)

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci

      # Dependency scanning
      - run: npm audit --audit-level=high
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

      # SAST
      - run: npx @doyensec/electronegativity --input ./src --output report.sarif
      - uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: report.sarif

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:coverage

      # Enforce 80% coverage
      - run: |
          COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            exit 1
          fi
```

---

## Add Crash Reporting (10 minutes)

```bash
npm install @sentry/electron
```

```typescript
// src/main/index.ts
import * as Sentry from '@sentry/electron/main'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `claude-pilot@${app.getVersion()}`,
  beforeSend(event) {
    // Filter PII
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
    }
    return event
  },
})

// src/renderer/main.tsx
import * as Sentry from '@sentry/electron/renderer'
Sentry.init({
  /* same config */
})
```

---

## Code Signing Setup (Platform-Specific)

### macOS

```bash
# 1. Get Apple Developer ID ($99/year)
# 2. Create entitlements.plist
# 3. Configure electron-builder

# electron-builder.yml
mac:
  hardenedRuntime: true
  notarize:
    teamId: YOUR_TEAM_ID
```

### Windows

```bash
# 1. Get EV Code Signing Certificate ($400/year)
# 2. Use cloud HSM (DigiCert/Sectigo)
# 3. Configure electron-builder

# electron-builder.yml
win:
  certificateSubjectName: 'Your Company Inc'
  sign: './scripts/sign-windows.js'
```

---

## Generate SBOM (2 minutes)

```bash
# Add to build script
npx @cyclonedx/cyclonedx-npm --output-file sbom.json

# Attach to GitHub releases
# Upload to Dependency-Track (optional)
```

---

## Compliance Checklist

### SOC 2 (Minimum Requirements)

- [ ] Credentials stored in GPG-encrypted `pass` (already done ✅)
- [ ] All network calls use HTTPS
- [ ] Input validation on all IPC handlers (use Zod)
- [ ] Crash reporting enabled (Sentry)
- [ ] Vulnerability scanning in CI (Snyk)
- [ ] Audit logging for sensitive operations
- [ ] MFA for cloud services

### GDPR

- [ ] Privacy policy visible in app
- [ ] Consent dialog on first run
- [ ] User data export feature
- [ ] User data deletion feature
- [ ] No PII collection without consent
- [ ] Analytics opt-out mechanism

```typescript
// First-run consent
if (!settings.get('gdpr-consent')) {
  const result = await dialog.showMessageBox({
    type: 'question',
    message: 'We collect anonymized usage data. Allow?',
    buttons: ['Accept', 'Decline'],
  })
  settings.set('gdpr-consent', result.response === 0)
}
```

---

## Testing Requirements

| Type          | Tool              | Coverage Target                    |
| ------------- | ----------------- | ---------------------------------- |
| Unit          | Vitest            | 80%+                               |
| E2E           | Playwright        | 70%+ critical paths                |
| Accessibility | Pa11y + axe-core  | Zero violations (WCAG AA)          |
| Security      | Electronegativity | Zero high/critical issues          |
| Dependencies  | Snyk              | Zero high/critical vulnerabilities |

```bash
# Run all tests
npm run test              # Unit tests
npm run test:e2e          # E2E tests
npx pa11y-ci              # Accessibility
npx @doyensec/electronegativity --input ./src  # Security
npx snyk test             # Dependencies
```

---

## Daily/Weekly/Monthly Tasks

### Daily

- Check Sentry for new crashes
- Review CI/CD status

### Weekly

- Run `npm audit` and fix issues
- Review Snyk reports
- Check test coverage

### Monthly

- Update dependencies (patch versions)
- Run full security scan
- Review performance metrics

### Quarterly

- SOC 2 audit prep
- Penetration testing
- Update policies

---

## Emergency Fixes

### If Electronegativity finds critical issues:

```bash
# 1. Run scan
npx @doyensec/electronegativity --input ./src --severity high,critical

# 2. Fix immediately:
# - nodeIntegration: true → false
# - contextIsolation: false → true
# - sandbox: false → true
# - Missing IPC validation → add Zod schemas

# 3. Re-scan
npx @doyensec/electronegativity --input ./src
```

### If Snyk finds critical vulnerabilities:

```bash
# 1. Scan
npx snyk test

# 2. Auto-fix
npx snyk fix

# 3. Manual fix if needed
npm update <package> --depth=10

# 4. Re-scan
npx snyk test
```

---

## Key Metrics Dashboard

Track these in Grafana/custom dashboard:

| Metric                   | Target  | Current | Alert Threshold |
| ------------------------ | ------- | ------- | --------------- |
| Test Coverage            | 80%+    | TBD     | < 75%           |
| Critical Vulnerabilities | 0       | TBD     | > 0             |
| High Vulnerabilities     | 0       | TBD     | > 2             |
| SAST Issues (High)       | 0       | TBD     | > 0             |
| Crash Rate               | < 0.1%  | TBD     | > 0.5%          |
| Startup Time             | < 2s    | TBD     | > 3s            |
| Memory Usage (Idle)      | < 300MB | TBD     | > 500MB         |

---

## Tools Cost Summary

| Tool                   | Cost (Annual) | Required?       |
| ---------------------- | ------------- | --------------- |
| Electronegativity      | Free          | Yes             |
| Snyk (Open Source)     | Free          | Yes             |
| Sentry Team            | $312          | Yes             |
| Code Signing (Win)     | $400          | Yes             |
| Code Signing (Mac)     | $99           | Yes             |
| SOC 2 Audit            | $15k-30k      | Enterprise only |
| **Total (Startup)**    | **~$811**     |                 |
| **Total (Enterprise)** | **~$16k-31k** |                 |

---

## Next Steps

1. **Immediate (Today)**:
   - [ ] Run `npx @doyensec/electronegativity --input ./src`
   - [ ] Fix all critical/high security issues
   - [ ] Setup Sentry crash reporting

2. **This Week**:
   - [ ] Add security scanning to CI/CD
   - [ ] Achieve 80% test coverage
   - [ ] Setup code signing

3. **This Month**:
   - [ ] Migrate E2E tests to Playwright
   - [ ] Add accessibility auditing
   - [ ] Generate SBOM
   - [ ] Document SOC 2 controls

4. **This Quarter**:
   - [ ] Complete SOC 2 audit (if enterprise)
   - [ ] Penetration testing
   - [ ] GDPR compliance review

---

## Resources

- **Full Guide**: See `ENTERPRISE_AUDITING_GUIDE.md`
- **Electron Security**: https://www.electronjs.org/docs/latest/tutorial/security
- **Electronegativity**: https://github.com/doyensec/electronegativity
- **Snyk**: https://snyk.io/
- **Sentry**: https://docs.sentry.io/platforms/javascript/guides/electron/

---

**Questions? See the full Enterprise Auditing Guide for detailed implementation steps.**
