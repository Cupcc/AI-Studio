import { _electron, expect, test, type ElectronApplication, type Locator } from '@playwright/test'

/**
 * Launch the app under test. Playwright's `trace` option covers only the browser contexts it creates, not Electron's,
 * so on CI every launch records its own trace. Closing the app keeps the trace in the test's output directory when the
 * test has already failed, so one CI run is enough to see what happened (`pnpm exec playwright show-trace <zip>`).
 */
export async function launchElectron(options: Parameters<typeof _electron.launch>[0]): Promise<ElectronApplication> {
  const app = await _electron.launch(options)
  if (!process.env.CI) return app
  const { tracing } = app.context()
  await tracing.start({ screenshots: true, snapshots: true, sources: true })
  const close = app.close.bind(app)
  app.close = async () => {
    let info: ReturnType<typeof test.info> | undefined
    try { info = test.info() } catch { info = undefined }
    // A restart inside a passing test also closes the app; only a test that has already failed keeps its trace.
    const path = info && info.status !== info.expectedStatus
      ? info.outputPath(`trace-${info.attachments.filter(item => item.name === 'trace').length + 1}.zip`)
      : undefined
    await tracing.stop({ path }).then(() => {
      if (path) info?.attachments.push({ name: 'trace', path, contentType: 'application/zip' })
    }, () => {})
    return close()
  }
  return app
}

/**
 * A workbench page runs in its own renderer process. Right after it loads, Chromium can still deliver the pointer to the
 * host's <iframe> element while Playwright reports the hover or click as done. Before the first click into a page that
 * just loaded, hover until the page itself sees the pointer.
 */
export async function hoverInPage(target: Locator): Promise<void> {
  await expect.poll(async () => { await target.hover(); return target.evaluate(element => element.matches(':hover')) }).toBe(true)
}
