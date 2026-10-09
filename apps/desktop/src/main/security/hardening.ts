// Electron-level hardening: app:// protocol for the renderer, no new
// windows, no navigation away from the app, no webviews, no permissions.
import { app, net, protocol, session } from 'electron'
import { pathToFileURL } from 'node:url'
import { APP_HOST, APP_SCHEME, originOf, resolveAppAsset } from './policy'

/** Must run before `app.whenReady()`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Serves files from the built renderer directory on app://studio/. */
export function handleAppProtocol(rendererDir: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 })
    const file = resolveAppAsset(rendererDir, url.pathname)
    if (!file) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

export function installWebContentsGuards(allowedOrigin: string): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    const blockForeign = (event: { preventDefault(): void }, url: string): void => {
      if (originOf(url) !== allowedOrigin) event.preventDefault()
    }
    contents.on('will-navigate', blockForeign)
    contents.on('will-redirect', blockForeign)
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })
}

export function denyAllPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
}
