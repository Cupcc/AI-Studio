import type { ElectronApplication, Page } from '@playwright/test'

/** Follow the real resource-confirmation flow before the test harness quits. */
export async function closeTestApp(app: ElectronApplication, page: Page): Promise<void> {
  if (page.isClosed()) return
  const closing = app.close()
  if (!page.isClosed()) {
    const confirm = page.getByRole('button', { name: '停止并退出', exact: true })
    await confirm.waitFor({ state: 'visible', timeout: 1500 })
      .then(() => confirm.click()).catch(() => {})
  }
  await closing
}
