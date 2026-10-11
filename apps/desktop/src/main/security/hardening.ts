// Electron-level hardening: app:// protocol for the renderer, no new
// windows (http(s) links go to the system browser), no navigation away from
// the app, no webviews, and no permissions except sanitized clipboard writes.
import { app, net, protocol, session, shell } from 'electron'
import { pathToFileURL } from 'node:url'
import { APP_HOST, APP_SCHEME, externalLinkUrl, isPermissionAllowed, originOf, resolveAppAsset } from './policy'

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
    contents.setWindowOpenHandler(({ url }) => {
      const external = externalLinkUrl(url)
      if (external) void shell.openExternal(external)
      return { action: 'deny' }
    })
    const blockForeign = (event: { preventDefault(): void }, url: string): void => {
      if (originOf(url) !== allowedOrigin) event.preventDefault()
    }
    contents.on('will-navigate', blockForeign)
    contents.on('will-redirect', blockForeign)
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })
}

export function installPermissionPolicy(rendererOrigin: string): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(isPermissionAllowed(permission, details.requestingUrl, rendererOrigin))
  )
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    isPermissionAllowed(permission, requestingOrigin, rendererOrigin)
  )
}
