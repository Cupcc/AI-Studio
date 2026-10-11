import { describe, expect, it } from 'vitest'
import { APP_ENTRY_URL, APP_ORIGIN, createSenderPolicy, externalLinkUrl, isPermissionAllowed, originOf, resolveAppAsset } from './policy'

describe('sender policy', () => {
  it('trusts only the app origin in production', () => {
    const trusted = createSenderPolicy()
    expect(trusted(APP_ENTRY_URL)).toBe(true)
    expect(trusted('app://studio/nested/page.html')).toBe(true)
    expect(trusted('app://other/index.html')).toBe(false)
    expect(trusted('file:///Users/x/index.html')).toBe(false)
    expect(trusted('https://example.com/')).toBe(false)
    expect(trusted('')).toBe(false)
  })

  it('also trusts the dev server origin when given', () => {
    const trusted = createSenderPolicy('http://localhost:5173/')
    expect(trusted('http://localhost:5173/index.html')).toBe(true)
    expect(trusted('http://localhost:5174/')).toBe(false)
  })

  it('computes origins for custom schemes', () => {
    expect(originOf('app://studio/a/b')).toBe('app://studio')
    expect(originOf('not a url')).toBeNull()
  })
})

describe('external links and permissions · Shell Spec v02 §6 · DEC-02', () => {
  it('hands only http(s) links to the system browser', () => {
    expect(externalLinkUrl('https://docs.stripe.com/billing?x=1#a')).toBe('https://docs.stripe.com/billing?x=1#a')
    expect(externalLinkUrl('HTTP://Example.com')).toBe('http://example.com/')
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'app://studio/index.html', 'mailto:a@b.c', 'src/a.ts', '']) {
      expect(externalLinkUrl(url)).toBeNull()
    }
  })

  it('grants only sanitized clipboard writes, and only to the renderer origin', () => {
    expect(isPermissionAllowed('clipboard-sanitized-write', APP_ENTRY_URL, APP_ORIGIN)).toBe(true)
    expect(isPermissionAllowed('clipboard-sanitized-write', APP_ORIGIN, APP_ORIGIN)).toBe(true)
    expect(isPermissionAllowed('clipboard-sanitized-write', 'https://example.com/', APP_ORIGIN)).toBe(false)
    for (const permission of ['clipboard-read', 'media', 'notifications', 'openExternal', 'geolocation']) {
      expect(isPermissionAllowed(permission, APP_ENTRY_URL, APP_ORIGIN)).toBe(false)
    }
  })
})

describe('resolveAppAsset', () => {
  const root = '/opt/app/out/renderer'

  it('maps paths under the renderer root', () => {
    expect(resolveAppAsset(root, '/')).toBe(`${root}/index.html`)
    expect(resolveAppAsset(root, '/assets/index.js')).toBe(`${root}/assets/index.js`)
    expect(resolveAppAsset(root, '/assets/a%20b.css')).toBe(`${root}/assets/a b.css`)
  })

  it('rejects traversal and malformed paths', () => {
    expect(resolveAppAsset(root, '/../main/index.js')).toBeNull()
    expect(resolveAppAsset(root, '/assets/%2e%2e/%2e%2e/secret')).toBeNull()
    expect(resolveAppAsset(root, '/a%5c..%5csecret')).toBeNull()
    expect(resolveAppAsset(root, '/%00')).toBeNull()
    expect(resolveAppAsset(root, '/%E0%A4%A')).toBeNull()
  })
})
