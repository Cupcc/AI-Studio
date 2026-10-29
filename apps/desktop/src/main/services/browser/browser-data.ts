// Browsing history, favorites and per-site permission decisions (FR-TOOL-003 step 3, DEC-25). Like the cookies they
// are shared by every Project (TOOLS-Q10) and kept across restarts; the storage is injected (app_meta in production).
import type { BrowserSuggestion } from '@shared/tools/browser'

export const BROWSER_DATA_LIMITS = { history: 200, favorites: 200, suggestions: 8, title: 200 } as const

/** Permissions a page may ask for with a per-site prompt; everything else stays denied. */
export const PROMPTED_PERMISSIONS = ['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture', 'midiSysex', 'idle-detection'] as const
export type PromptedPermission = (typeof PROMPTED_PERMISSIONS)[number]
/** Low-risk permissions granted without a prompt (a site's own copy button). */
export const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

export interface BrowserDataStorage {
  read(key: string): string | undefined
  write(key: string, value: string): void
}

interface Entry { url: string; title: string; at: number }

function parseList(raw: string | undefined): Entry[] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap(item => typeof item === 'object' && item && typeof (item as Entry).url === 'string'
      ? [{ url: (item as Entry).url, title: typeof (item as Entry).title === 'string' ? (item as Entry).title : '', at: typeof (item as Entry).at === 'number' ? (item as Entry).at : 0 }] : [])
  } catch { return [] }
}

export class BrowserData {
  constructor(private readonly storage: BrowserDataStorage, private readonly now: () => number = Date.now) {}

  private list(key: 'browser.history' | 'browser.favorites'): Entry[] { return parseList(this.storage.read(key)) }
  private save(key: 'browser.history' | 'browser.favorites', entries: Entry[]): void { this.storage.write(key, JSON.stringify(entries)) }

  /** The newest visit first; a repeated URL moves to the top. */
  visit(url: string, title: string): void {
    const entries = this.list('browser.history').filter(entry => entry.url !== url)
    entries.unshift({ url, title: title.slice(0, BROWSER_DATA_LIMITS.title), at: this.now() })
    this.save('browser.history', entries.slice(0, BROWSER_DATA_LIMITS.history))
  }
  retitle(url: string, title: string): void {
    const entries = this.list('browser.history')
    const entry = entries.find(item => item.url === url)
    if (!entry || entry.title === title) return
    entry.title = title.slice(0, BROWSER_DATA_LIMITS.title)
    this.save('browser.history', entries)
  }
  clearHistory(): void { this.save('browser.history', []) }

  isFavorite(url: string): boolean { return !!url && this.list('browser.favorites').some(entry => entry.url === url) }
  /** Adds or removes; returns whether the page is now a favorite. */
  toggleFavorite(url: string, title: string): boolean {
    const entries = this.list('browser.favorites')
    if (entries.some(entry => entry.url === url)) { this.save('browser.favorites', entries.filter(entry => entry.url !== url)); return false }
    this.save('browser.favorites', [{ url, title: title.slice(0, BROWSER_DATA_LIMITS.title), at: this.now() }, ...entries].slice(0, BROWSER_DATA_LIMITS.favorites))
    return true
  }

  /** Favorites first, then history, matching the text in the address or the title (VS Code's address suggestions). */
  suggest(query: string): BrowserSuggestion[] {
    const text = query.trim().toLowerCase()
    const matches = (entry: Entry) => !text || entry.url.toLowerCase().includes(text) || entry.title.toLowerCase().includes(text)
    const seen = new Set<string>()
    const pick = (entries: Entry[], kind: BrowserSuggestion['kind']) => entries.filter(entry => matches(entry) && !seen.has(entry.url) && seen.add(entry.url)).map(entry => ({ kind, url: entry.url, title: entry.title }))
    return [...pick(this.list('browser.favorites'), 'favorite'), ...pick(this.list('browser.history'), 'history')].slice(0, BROWSER_DATA_LIMITS.suggestions)
  }

  private decisions(): Record<string, Record<string, boolean>> {
    try {
      const value = JSON.parse(this.storage.read('browser.permissions') ?? '{}') as unknown
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Record<string, boolean>> : {}
    } catch { return {} }
  }
  /** The remembered answer for this site and permission, if any. */
  decision(origin: string, permission: string): boolean | undefined {
    const value = this.decisions()[origin]?.[permission]
    return typeof value === 'boolean' ? value : undefined
  }
  remember(origin: string, permission: string, allow: boolean): void {
    const all = this.decisions()
    all[origin] = { ...(all[origin] ?? {}), [permission]: allow }
    this.storage.write('browser.permissions', JSON.stringify(all))
  }
  resetPermissions(): void { this.storage.write('browser.permissions', '{}') }
}
