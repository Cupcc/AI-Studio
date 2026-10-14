import type { BrowserBounds } from '@shared/tools/browser'

export type BrowserDestination = { kind: 'local' | 'external'; url: string }

/** Top-level destinations only; normal page subresources are not filtered. */
export function browserDestination(raw: string, addressInput = false): BrowserDestination {
  const input = raw.trim()
  if (!input || input.length > 8192 || /[\u0000-\u0020\u007f]/u.test(input)) {
    throw new Error('请输入有效的 HTTP / HTTPS 地址')
  }
  const text = addressInput && !/^[a-z][a-z\d+.-]*:\/\//i.test(input)
    && /^(localhost(?::\d+)?(?:\/|$)|127(?:\.\d+){0,3}(?::\d+)?(?:\/|$)|\[::1\](?::\d+)?(?:\/|$))/i.test(input)
    ? `http://${input}` : input
  let url: URL
  try { url = new URL(text) } catch { throw new Error('请输入有效的 HTTP / HTTPS 地址') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('预览仅支持 HTTP / HTTPS 地址')
  }
  if (url.username || url.password) throw new Error('地址不能包含用户名或密码')
  const host = url.hostname.toLowerCase()
  const local = host === 'localhost' || host === 'localhost.' || host === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(host)
  return { kind: local ? 'local' : 'external', url: url.href }
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
