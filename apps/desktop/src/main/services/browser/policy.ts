import type { BrowserBounds } from '@shared/tools/browser'

/** A top-level http(s) destination. `local`: loopback or private network (address inference uses http:// for these). */
export type BrowserDestination = { url: string; local: boolean }

const INVALID = '请输入有效的网址'
const SCHEME = /^[a-z][a-z\d+.-]*:/i
// Control characters, spaces and DEL are never part of a typed or navigated address.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000- \u007f]/u

function ipv4(host: string): number[] | null {
  const parts = host.split('.')
  if (parts.length !== 4 || !parts.every(part => /^\d{1,3}$/.test(part))) return null
  const numbers = parts.map(Number)
  return numbers.every(value => value <= 255) ? numbers : null
}

/**
 * Loopback, unspecified, private (RFC 1918), link-local and special-use local names. These are typical development
 * hosts, so a typed address without a scheme gets http:// for them (as VS Code's integrated browser and Chrome do).
 */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '[::]') return true
  if (/\.(local|test|internal|lan|home\.arpa)$/.test(host)) return true
  if (host.startsWith('[')) return /^\[f[cd][0-9a-f]{2}:/.test(host) || host.startsWith('[fe80:')
  const v4 = ipv4(host)
  if (v4) {
    const [a, b] = v4 as [number, number, number, number]
    return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  // A single-label name (e.g. `devbox:8080`) can only be a local or intranet host.
  return !host.includes('.')
}

/** Validates a top-level navigation target: http or https only, no credentials. Throws a user-facing message. */
export function browserDestination(raw: string): BrowserDestination {
  const input = raw.trim()
  if (!input || input.length > 8192 || FORBIDDEN.test(input)) throw new Error(INVALID)
  let url: URL
  try { url = new URL(input) } catch { throw new Error(INVALID) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Browser 仅支持 HTTP / HTTPS 网址')
  if (url.username || url.password) throw new Error('网址不能包含用户名或密码')
  if (!url.hostname) throw new Error(INVALID)
  return { url: url.href, local: isLocalHost(url.hostname) }
}

/**
 * What the user typed in the address bar. Without a scheme the address is completed like VS Code's integrated browser:
 * local and private-network hosts get http://, every other host https://. A bare word is not an address (no search).
 */
export function browserAddress(raw: string): BrowserDestination {
  const input = raw.trim()
  if (!input || input.length > 8192 || FORBIDDEN.test(input)) throw new Error(INVALID)
  // `localhost:3000` parses as the scheme `localhost:`; only `scheme://` or a known non-hierarchical scheme counts.
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) || (SCHEME.test(input) && /^(mailto|tel|javascript|data|file|about|blob):/i.test(input))) {
    return browserDestination(input)
  }
  let probe: URL
  try { probe = new URL(`http://${input}`) } catch { throw new Error(INVALID) }
  const host = probe.hostname
  const local = isLocalHost(host)
  // `foo` alone is neither a domain nor a host:port; `foo:8080` and `foo/` with a path are accepted as intranet hosts.
  if (!host || (!host.includes('.') && !host.startsWith('[') && host !== 'localhost' && !probe.port && !/^[^/?#]+[/?#]/.test(input))) {
    throw new Error(INVALID)
  }
  return browserDestination(`${local ? 'http' : 'https'}://${input}`)
}

/** Non-web links a page may ask the system to handle, after the user agrees. Every other scheme is refused. */
export function externalProtocolUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'mailto:' || url.protocol === 'tel:' ? url.href : null
  } catch { return null }
}

/** Native bounds use integer device-independent pixels, clipped to content. */
export function clampBrowserBounds(bounds: BrowserBounds, size: readonly number[]): BrowserBounds {
  if (Object.values(bounds).some(value => !Number.isFinite(value))) throw new Error('Invalid Browser bounds')
  const width = Math.max(0, Math.floor(size[0] ?? 0))
  const height = Math.max(0, Math.floor(size[1] ?? 0))
  const left = Math.min(width, Math.max(0, Math.floor(bounds.x)))
  const top = Math.min(height, Math.max(0, Math.floor(bounds.y)))
  const right = Math.min(width, Math.max(left, Math.floor(bounds.x + Math.max(0, bounds.width))))
  const bottom = Math.min(height, Math.max(top, Math.floor(bounds.y + Math.max(0, bounds.height))))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
