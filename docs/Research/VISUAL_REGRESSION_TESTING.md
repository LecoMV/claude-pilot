# Visual Regression Testing with Playwright

> Research Summary - January 2026

## Overview

Playwright includes built-in visual comparison capabilities via `toHaveScreenshot()`. This allows capturing UI state as baseline screenshots and detecting unintended visual changes.

## Setup

Visual regression testing is available out-of-the-box with Playwright.

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

## Basic Usage

```typescript
// tests/visual.spec.ts
import { test, expect } from '@playwright/test'

test('homepage visual test', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveScreenshot('homepage.png')
})

test('button states', async ({ page }) => {
  await page.goto('/components/button')

  // Default state
  const button = page.locator('[data-testid="primary-button"]')
  await expect(button).toHaveScreenshot('button-default.png')

  // Hover state
  await button.hover()
  await expect(button).toHaveScreenshot('button-hover.png')

  // Disabled state
  await page.click('[data-testid="toggle-disabled"]')
  await expect(button).toHaveScreenshot('button-disabled.png')
})
```

## Configuration Options

```typescript
// Full-page screenshot with options
await expect(page).toHaveScreenshot('full-page.png', {
  fullPage: true,
  maxDiffPixels: 50,
  threshold: 0.3,
  animations: 'disabled',
  mask: [page.locator('.dynamic-content')],
})

// Element screenshot
const chart = page.locator('.chart-container')
await expect(chart).toHaveScreenshot('chart.png', {
  scale: 'css',
  caret: 'hide',
})
```

## Handling Dynamic Content

```typescript
// Mask dynamic elements
await expect(page).toHaveScreenshot('dashboard.png', {
  mask: [
    page.locator('[data-testid="timestamp"]'),
    page.locator('[data-testid="user-avatar"]'),
    page.locator('.loading-spinner'),
  ],
})

// Or use CSS to hide volatile elements
await page.addStyleTag({
  content: `
    .timestamp, .random-content { visibility: hidden !important; }
  `,
})
```

## Updating Baselines

```bash
# Update all snapshots
npx playwright test --update-snapshots

# Update specific test
npx playwright test visual.spec.ts --update-snapshots
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Visual Tests

on: [push, pull_request]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run visual tests
        run: npx playwright test tests/visual/

      - name: Upload failed snapshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-test-failures
          path: test-results/
```

### Consistent Environments

Visual tests must run in consistent environments:

1. **Same OS**: Fonts differ between Linux/Mac/Windows
2. **Same browser version**: Rendering changes between versions
3. **Same viewport**: Always specify dimensions
4. **Docker recommended**: Use Playwright's official Docker images

```yaml
# docker-compose.visual.yml
services:
  visual-tests:
    image: mcr.microsoft.com/playwright:v1.48.0-jammy
    volumes:
      - .:/app
    working_dir: /app
    command: npx playwright test tests/visual/
```

## Advanced: Visual Regression Tracker

For larger teams, consider [Visual Regression Tracker](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker):

- Web dashboard for reviewing differences
- Integration with multiple test frameworks
- Baseline management across branches
- Self-hosted via Docker

## Integration with Chromatic

For Storybook-based visual testing:

```bash
npm install -D chromatic
npx chromatic --project-token=<your-token>
```

## Best Practices

1. **Test stable states only**: Wait for animations/loading to complete
2. **Isolate tests**: Each test should set up its own state
3. **Use meaningful names**: `button-primary-hover.png` not `screenshot1.png`
4. **Review before updating**: Don't blindly update failed snapshots
5. **Separate visual from functional tests**: Run visual tests less frequently

## Claude Pilot Implementation Plan

1. Add visual tests for core components (Button, Modal, Input, etc.)
2. Create visual test suite for dashboard layouts
3. Integrate with GitHub Actions CI
4. Use Docker for consistent screenshots
5. Consider Chromatic for Storybook integration later

## Sources

- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [BrowserStack Playwright Snapshot Testing](https://www.browserstack.com/guide/playwright-snapshot-testing)
- [CSS-Tricks Visual Regression Testing](https://css-tricks.com/automated-visual-regression-testing-with-playwright/)
- [Chromatic Visual Testing](https://www.chromatic.com/blog/how-to-visual-test-ui-using-playwright/)
- [BrowserStack Playwright Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices)
