import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'

// Force serial execution to avoid race conditions with shared Electron instance
test.describe.configure({ mode: 'serial' })

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
    try {
      // Force close with timeout to prevent hanging
      await Promise.race([
        electronApp.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 10000))
      ])
    } catch {
      // If normal close fails, the process will be killed by the test framework
      console.log('Warning: App close timed out, process will be terminated')
    }
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
    // Use heading role to specifically target the page title, not sidebar
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })

  test('should navigate to MCP Servers view', async () => {
    await page.click('button:has-text("MCP Servers")')
    // Use heading role to specifically target the page title
    await expect(page.getByRole('heading', { name: 'MCP Servers' })).toBeVisible()
  })

  test('should navigate to Memory view', async () => {
    await page.click('button:has-text("Memory")')
    await expect(page.getByRole('heading', { name: 'Memory Browser' })).toBeVisible()
  })

  test('should navigate to Settings view', async () => {
    await page.click('button:has-text("Settings")')
    // Use heading role to specifically target the page title
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
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

    // Find the collapse toggle button in the sidebar footer (border-t section)
    const toggleButton = sidebar.locator('.border-t button')
    await toggleButton.click()

    // Wait for transition
    await page.waitForTimeout(300)

    const expandedWidth = await sidebar.evaluate((el) => el.offsetWidth)
    // Expanded width should be w-56 = 224px (14rem)
    expect(expandedWidth).toBeGreaterThan(200)
  })
})

test.describe('Error Handling', () => {
  test('should not crash on navigation errors', async () => {
    // Navigate through core views to ensure none crash
    // Excluding views with async initialization that can timeout in tests:
    // - Agents (async canvas initialization)
    // - Chat (API connection checks)
    // - Terminal (PTY setup)
    const coreViews = ['Dashboard', 'Projects', 'Sessions', 'MCP Servers', 'Memory', 'Profiles', 'Context', 'Services', 'Logs', 'Ollama', 'Settings']

    for (const item of coreViews) {
      const button = page.locator(`aside button:has-text("${item}")`)
      await button.click({ timeout: 5000 })
      await page.waitForTimeout(200) // Allow view to render
      const isVisible = await page.isVisible('body')
      expect(isVisible).toBe(true)
    }

    // Return to Dashboard at end for clean state
    await page.click('aside button:has-text("Dashboard")')
    await page.waitForTimeout(200)
  })
})
