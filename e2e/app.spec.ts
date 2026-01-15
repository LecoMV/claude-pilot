import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Note: These E2E tests require the app to be built first
  // Run: npm run build before running E2E tests

  electronApp = await electron.launch({
    args: ['./out/main/index.js'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Required for headless environments
      DISPLAY: process.env.DISPLAY || ':0',
    },
  })

  // Wait for first window
  page = await electronApp.firstWindow()

  // Wait for app to fully load
  await page.waitForLoadState('domcontentloaded')

  // Wait additional time for React to render
  await page.waitForTimeout(2000)

  // Wait for the main content to be visible
  try {
    await page.waitForSelector('body', { timeout: 10000 })
  } catch {
    // If body isn't visible, app might not have rendered
    console.log('Warning: Body element not found after 10 seconds')
  }
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test.describe('App Launch', () => {
  test('should launch and show main window', async () => {
    const isVisible = await page.isVisible('body')
    expect(isVisible).toBe(true)
  })

  test('should show sidebar navigation', async () => {
    // Check sidebar is visible
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
  })

  test('should show Dashboard by default', async () => {
    // Dashboard should be the default view
    const dashboardTitle = page.locator('text=Dashboard')
    await expect(dashboardTitle.first()).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('should navigate to Projects view', async () => {
    await page.click('button:has-text("Projects")')
    await expect(page.locator('text=Claude Projects')).toBeVisible()
  })

  test('should navigate to MCP Servers view', async () => {
    await page.click('button:has-text("MCP Servers")')
    await expect(page.locator('text=MCP Servers')).toBeVisible()
  })

  test('should navigate to Memory view', async () => {
    await page.click('button:has-text("Memory")')
    await expect(page.locator('text=Memory Browser')).toBeVisible()
  })

  test('should navigate to Settings view', async () => {
    await page.click('button:has-text("Settings")')
    await expect(page.locator('text=Settings')).toBeVisible()
  })

  test('should navigate back to Dashboard', async () => {
    await page.click('button:has-text("Dashboard")')
    await expect(page.locator('text=System Status').first()).toBeVisible()
  })
})

test.describe('Sidebar', () => {
  test('should collapse sidebar', async () => {
    const sidebar = page.locator('aside')
    const initialWidth = await sidebar.evaluate((el) => el.offsetWidth)

    // Click collapse button
    await page.click('button:has-text("Collapse")')

    // Wait for transition
    await page.waitForTimeout(300)

    const collapsedWidth = await sidebar.evaluate((el) => el.offsetWidth)
    expect(collapsedWidth).toBeLessThan(initialWidth)
  })

  test('should expand sidebar', async () => {
    const sidebar = page.locator('aside')

    // Click expand button (chevron right in collapsed state)
    await page.click('aside button:last-child')

    // Wait for transition
    await page.waitForTimeout(300)

    const expandedWidth = await sidebar.evaluate((el) => el.offsetWidth)
    expect(expandedWidth).toBeGreaterThan(100)
  })
})

test.describe('Error Handling', () => {
  test('should not crash on navigation errors', async () => {
    // Navigate through all views to ensure none crash
    const views = ['Dashboard', 'Projects', 'MCP Servers', 'Memory', 'Profiles', 'Context', 'Services', 'Logs', 'Ollama', 'Agents', 'Chat', 'Terminal', 'Settings']

    for (const view of views) {
      await page.click(`button:has-text("${view}")`)
      await page.waitForTimeout(100)
      const isVisible = await page.isVisible('body')
      expect(isVisible).toBe(true)
    }
  })
})
