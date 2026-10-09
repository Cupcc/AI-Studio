// Pure security policy helpers (no Electron imports, unit-tested).
import { isAbsolute, relative, resolve } from 'node:path'

/** Custom scheme serving the production renderer instead of file://. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'studio'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`

export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    // Non-special schemes (like app://) report origin "null"; build it ourselves.
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

/** Only frames loaded from the app's own origin may call IPC. */
export function createSenderPolicy(devServerUrl?: string): (url: string) => boolean {
  const allowed = new Set([APP_ORIGIN])
  if (devServerUrl) {
    const dev = originOf(devServerUrl)
    if (dev) allowed.add(dev)
  }
  return (url) => {
    const origin = originOf(url)
    return origin !== null && allowed.has(origin)
  }
}

/** Resolves a request path under `root`, or null if it would escape it. */
export function resolveAppAsset(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null
  if (decoded.split('/').includes('..')) return null
  const relativePath = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\/+/, '')
  const file = resolve(root, relativePath)
  const rel = relative(resolve(root), file)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return file
}
