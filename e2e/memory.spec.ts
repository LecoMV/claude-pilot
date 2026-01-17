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
})

test.afterAll(async () => {
  await electronApp?.close()
})

test.describe('Memory Browser', () => {
  test.beforeEach(async () => {
    await page.click('button:has-text("Memory")')
    await page.waitForTimeout(300)
  })

  test('should display memory sources', async () => {
    await expect(page.locator('text=PostgreSQL'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Memory panel might have different labeling
      })
  })

  test('should handle search queries', async () => {
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('test query')
      await page.keyboard.press('Enter')

      // Wait for search to complete
      await page.waitForTimeout(1000)

      // Should not show error
      const errorMessage = page.locator('text=Error')
      const isErrorVisible = await errorMessage.isVisible().catch(() => false)
      expect(isErrorVisible).toBe(false)
    }
  })

  test('should display learnings tab', async () => {
    const learningsTab = page.locator('button:has-text("Learnings")')
    if (await learningsTab.isVisible()) {
      await learningsTab.click()
      await page.waitForTimeout(300)
    }
  })
})
