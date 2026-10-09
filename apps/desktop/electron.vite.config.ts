import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const shared = fileURLToPath(new URL('./src/shared', import.meta.url))
const renderer = fileURLToPath(new URL('./src/renderer/src', import.meta.url))

// Production CSP for the renderer (served from app://studio). The dev
// variant only adds what Vite HMR and React Refresh need.
export const CSP_PRODUCTION = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'"
].join('; ')

export const CSP_DEVELOPMENT = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'"
].join('; ')

function contentSecurityPolicy(): Plugin {
  let csp = CSP_PRODUCTION
  return {
    name: 'studio-csp',
    configResolved(config) {
      csp = config.command === 'serve' ? CSP_DEVELOPMENT : CSP_PRODUCTION
    },
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }
    ]
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    resolve: { alias: { '@shared': shared, '@renderer': renderer } },
    plugins: [react(), contentSecurityPolicy()]
  }
})
