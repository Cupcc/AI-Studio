import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openEditorAppearance } from './editor-appearance'
import { createFakeMonaco } from './fake-monaco'
import { CODE_THEME_IDS } from './monaco-theme'

class FakeFonts extends EventTarget {
  usable: boolean
  loading: (() => void) | null = null
  constructor(usable: boolean) { super(); this.usable = usable }
  check = vi.fn(() => this.usable)
  load = vi.fn(() => new Promise<FontFace[]>((resolve) => { this.loading = () => { this.usable = true; resolve([]) } }))
}
const installFonts = (fonts: FakeFonts) => Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

let host: HTMLElement
beforeEach(() => { host = document.createElement('div'); document.body.append(host) })
afterEach(() => {
  host.remove(); delete (document as { fonts?: unknown }).fonts
  delete document.documentElement.dataset.scheme
})

describe('openEditorAppearance', () => {
  it('reads the font family from the --font-mono token and falls back to monospace', async () => {
    const fake = createFakeMonaco()
    expect((await openEditorAppearance(fake.runtime.monaco, host)).fontFamily).toBe('monospace')
    host.style.setProperty('--font-mono', " 'IBM Plex Mono', monospace ")
    const appearance = await openEditorAppearance(fake.runtime.monaco, host)
    expect(appearance.fontFamily).toBe("'IBM Plex Mono', monospace")
    appearance.dispose()
  })

  it('waits for a font that is still loading, then clears Monaco\'s cached measurements once', async () => {
    const fonts = new FakeFonts(false); installFonts(fonts)
    const fake = createFakeMonaco()
    let resolved = false
    const opening = openEditorAppearance(fake.runtime.monaco, host).then((appearance) => { resolved = true; return appearance })
    await flush()
    expect(resolved).toBe(false)
    expect(fake.remeasures).toBe(0)
    fonts.loading!()
    const appearance = await opening
    expect(fake.remeasures).toBe(1)
    appearance.dispose()
  })

  it('does not wait or remeasure when the font is already usable, but remeasures when more fonts finish loading', async () => {
    const fonts = new FakeFonts(true); installFonts(fonts)
    const fake = createFakeMonaco()
    const appearance = await openEditorAppearance(fake.runtime.monaco, host)
    expect(fake.remeasures).toBe(0)
    fonts.dispatchEvent(new Event('loadingdone'))
    expect(fake.remeasures).toBe(1)
    appearance.dispose()
    fonts.dispatchEvent(new Event('loadingdone'))
    expect(fake.remeasures).toBe(1)
  })

  it('follows <html data-scheme> live through the global theme and stops after dispose', async () => {
    const fake = createFakeMonaco()
    document.documentElement.dataset.scheme = 'light'
    const appearance = await openEditorAppearance(fake.runtime.monaco, host)
    expect(appearance.theme).toBe(CODE_THEME_IDS.light)
    document.documentElement.dataset.scheme = 'dark'
    await flush()
    expect(fake.themes).toEqual([CODE_THEME_IDS.dark])
    expect(appearance.theme).toBe(CODE_THEME_IDS.dark)
    // Unrelated attribute changes and an unchanged scheme do nothing.
    document.documentElement.dataset.theme = 'glass'
    document.documentElement.dataset.scheme = 'dark'
    await flush()
    expect(fake.themes).toHaveLength(1)
    appearance.dispose()
    document.documentElement.dataset.scheme = 'light'
    await flush()
    expect(fake.themes).toHaveLength(1)
    delete document.documentElement.dataset.theme
  })
})
