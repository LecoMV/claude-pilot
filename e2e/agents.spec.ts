import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['./out/main/index.js'],
    env: { ...process.env, NODE_ENV: 'test' },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  // Navigate to Agents view
  await page.click('button:has-text("Agents")')
  await page.waitForTimeout(500)
})

test.afterAll(async () => {
  await electronApp?.close()
})

test.describe('Agent Canvas', () => {
  test('should render agent canvas', async () => {
    // Check for main canvas elements
    await expect(page.locator('text=No Agents Running').or(page.locator('//svg'))).toBeVisible()
    await expect(page.locator('button:has-text("Spawn Agent")')).toBeVisible()
  })

  test('should open spawn modal', async () => {
    await page.click('button:has-text("Spawn Agent")')
    await expect(page.locator('text=Spawn New Agent')).toBeVisible()
    await expect(page.getByPlaceholder('Agent Name')).toBeVisible()

    // Close modal
    await page.keyboard.press('Escape')
  })

  test('should show topology options', async () => {
    // Check if topology selector exists (only visible when swarm inactive)
    const select = page.locator('select')
    if (await select.isVisible()) {
      await expect(select).toHaveValue('mesh') // Default
      await select.selectOption('star')
      await expect(select).toHaveValue('star')
    }
  })
})
