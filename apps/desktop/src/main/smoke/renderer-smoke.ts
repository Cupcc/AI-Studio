// Renderer part of the smoke check: loads the real window hidden and checks
// that the UI renders, Node globals are absent and the preload API works.
import type { BrowserWindow } from 'electron'

export interface RendererSmokeResult {
  ok: boolean
  origin: string
  topBarRendered: boolean
  nodeGlobalsAbsent: boolean
  preloadApiWorks: boolean
  error?: string
}

const PROBE = `(async () => {
  for (let i = 0; i < 50 && !document.querySelector('[data-testid="topbar"]'); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
  let api = false
  try {
    const info = await window.studio.app.getInfo()
    api = typeof info.versions.electron === 'string'
  } catch {}
  return {
    origin: location.origin === 'null' ? location.protocol + '//' + location.host : location.origin,
    topBarRendered: !!document.querySelector('[data-testid="topbar"]'),
    nodeGlobalsAbsent: [typeof require, typeof process, typeof module, typeof ipcRenderer].every((t) => t === 'undefined'),
    preloadApiWorks: api
  }
})()`

export async function runRendererSmoke(win: BrowserWindow, timeoutMs = 15_000): Promise<RendererSmokeResult> {
  const failed = (error: string): RendererSmokeResult => ({
    ok: false,
    origin: '',
    topBarRendered: false,
    nodeGlobalsAbsent: false,
    preloadApiWorks: false,
    error
  })
  try {
    if (win.webContents.isLoading()) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('renderer load timed out')), timeoutMs)
        win.webContents.once('did-finish-load', () => {
          clearTimeout(timer)
          resolve()
        })
        win.webContents.once('did-fail-load', (_e, code, description) => {
          clearTimeout(timer)
          reject(new Error(`renderer load failed: ${code} ${description}`))
        })
      })
    }
    const probe = (await win.webContents.executeJavaScript(PROBE)) as Omit<RendererSmokeResult, 'ok'>
    return { ...probe, ok: probe.topBarRendered && probe.nodeGlobalsAbsent && probe.preloadApiWorks }
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error))
  }
}
