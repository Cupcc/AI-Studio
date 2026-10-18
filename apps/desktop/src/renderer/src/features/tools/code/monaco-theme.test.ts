import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  CODE_PALETTES, CODE_TEXT_ROLES, CODE_THEME_IDS, codeSchemeOf, codeThemeData, defineCodeThemes, type CodePalette, type CodeScheme
} from './monaco-theme'

// WCAG 2.x relative luminance and contrast ratio, with alpha compositing for the translucent tints.
type Rgb = { r: number; g: number; b: number }
const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const luminance = ({ r, g, b }: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const parse = (hex: string): Rgb & { a: number } => {
  const [r, g, b, a] = [1, 3, 5, 7].map((i) => (hex.length > i ? parseInt(hex.slice(i, i + 2), 16) : 255)) as [number, number, number, number]
  return { r, g, b, a: a / 255 }
}
const over = (tint: string, base: Rgb): Rgb => {
  const t = parse(tint)
  return { r: t.r * t.a + base.r * (1 - t.a), g: t.g * t.a + base.g * (1 - t.a), b: t.b * t.a + base.b * (1 - t.a) }
}
const contrast = (a: Rgb, b: Rgb) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const grey = (relativeLuminance: number): Rgb => {
  const c = relativeLuminance <= 0.0031308 ? relativeLuminance * 12.92 : 1.055 * relativeLuminance ** (1 / 2.4) - 0.055
  const v = Math.round(c * 255)
  return { r: v, g: v, b: v }
}

/*
 * Worst measured glass pane background (relative luminance) per colour scheme, the same measurement the Terminal palette
 * uses (tasks/archive/T20261009-context-tools/evidence/W5-theme-measurements-r3.json, `plainRowWorstBg.min`; derivation in
 * `terminal-theme.test.ts`). A neutral grey of that luminance stands in for it: only luminance enters the contrast ratio,
 * and the hue of a tint over it moves the result by far less than the margins below.
 */
const GLASS_WORST: Record<CodeScheme, number> = { light: 0.6518, dark: 0.0376 }
const SCHEMES: CodeScheme[] = ['light', 'dark']

/** The solid theme's pane colour, read from the design tokens so that drift fails a test. */
const tokensCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../styles/tokens.css'), 'utf8')
const nominalBackground = (scheme: CodeScheme): string => {
  const block = scheme === 'light' ? tokensCss.slice(tokensCss.indexOf(':root {')) : tokensCss.slice(tokensCss.indexOf(':root[data-scheme="dark"] {'))
  return /--color-surface:\s*(#[0-9a-fA-F]{6})/.exec(block)![1]!.toLowerCase()
}

const backgrounds = (scheme: CodeScheme): Record<string, Rgb> => ({ nominal: parse(nominalBackground(scheme)), 'worst glass': grey(GLASS_WORST[scheme]) })

/** Overlay name -> tints painted on top of each other (the word-level diff tints sit on the line tint). */
const overlays = (p: CodePalette): Record<string, { layers: string[]; kind: 'persistent' | 'transient' | 'emphasis' }> => ({
  'line highlight': { layers: [p.lineHighlight], kind: 'persistent' },
  'inserted line': { layers: [p.insertedLine], kind: 'persistent' },
  'removed line': { layers: [p.removedLine], kind: 'persistent' },
  selection: { layers: [p.selection], kind: 'transient' },
  'inactive selection': { layers: [p.selectionInactive], kind: 'transient' },
  'other find matches': { layers: [p.findOther], kind: 'transient' },
  'current find match': { layers: [p.findCurrent], kind: 'emphasis' },
  'inserted text': { layers: [p.insertedLine, p.insertedText], kind: 'emphasis' },
  'removed text': { layers: [p.removedLine, p.removedText], kind: 'emphasis' }
})
/** Minimum contrast of syntax colours / of the default text: persistent tints keep full WCAG AA, transient and emphasis tints trade it for visibility. */
const REQUIRED = {
  persistent: { nominal: { roles: 4.5, text: 7 }, 'worst glass': { roles: 4.5, text: 7 } },
  transient: { nominal: { roles: 4.5, text: 7 }, 'worst glass': { roles: 3, text: 7 } },
  emphasis: { nominal: { roles: 3, text: 4.5 }, 'worst glass': { roles: 3, text: 4.5 } }
} as const

describe.each(SCHEMES)('code theme palette (%s)', (scheme) => {
  const palette = CODE_PALETTES[scheme]
  const bgs = backgrounds(scheme)

  it('uses the pane colour of the solid theme as its nominal background (design tokens)', () => {
    expect(nominalBackground(scheme)).toBe(scheme === 'light' ? '#ffffff' : '#212121')
  })

  it.each(Object.entries(bgs))('keeps every syntax colour and the line numbers >= 4.5:1 and the text >= 7:1 on the %s background', (_name, background) => {
    for (const role of CODE_TEXT_ROLES) expect(contrast(parse(palette[role]), background), `${role} ${palette[role]}`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(parse(palette.text), background)).toBeGreaterThanOrEqual(7)
    expect(contrast(parse(palette.lineNumberActive), background)).toBeGreaterThanOrEqual(7)
  })

  describe.each(Object.entries(overlays(palette)))('over the %s tint', (_name, { layers, kind }) => {
    it.each(Object.entries(bgs))(`keeps text readable on the %s background (${kind} tint)`, (backgroundName, background) => {
      const need = REQUIRED[kind][backgroundName as 'nominal' | 'worst glass']
      const tinted = layers.reduce((base, layer) => over(layer, base), background)
      for (const role of CODE_TEXT_ROLES) {
        const minimum = role === 'text' ? need.text : need.roles
        expect(contrast(parse(palette[role]), tinted), `${role} ${palette[role]}`).toBeGreaterThanOrEqual(minimum)
      }
    })
  })

  it('makes selections and diff lines visible against the background without hiding the text', () => {
    const visible = (layers: string[], background: Rgb) => contrast(layers.reduce((base, layer) => over(layer, base), background), background)
    for (const [name, background] of Object.entries(bgs)) {
      expect(visible([palette.selection], background), `selection on ${name}`).toBeGreaterThanOrEqual(1.15)
      expect(visible([palette.selectionInactive], background), `inactive selection on ${name}`).toBeGreaterThanOrEqual(1.1)
      expect(visible([palette.insertedLine], background), `inserted line on ${name}`).toBeGreaterThanOrEqual(1.08)
      expect(visible([palette.removedLine], background), `removed line on ${name}`).toBeGreaterThanOrEqual(1.08)
      // Word-level highlights stand out from their own line tint.
      const insertedLine = over(palette.insertedLine, background), removedLine = over(palette.removedLine, background)
      expect(contrast(over(palette.insertedText, insertedLine), insertedLine), `inserted text on ${name}`).toBeGreaterThanOrEqual(1.1)
      expect(contrast(over(palette.removedText, removedLine), removedLine), `removed text on ${name}`).toBeGreaterThanOrEqual(1.1)
    }
  })

  it('keeps the cursor >= 3:1, the scrollbar thumb >= 3:1 (stronger on hover and drag) and the widgets readable', () => {
    for (const [name, background] of Object.entries(bgs)) {
      expect(contrast(parse(palette.cursor), background), `cursor on ${name}`).toBeGreaterThanOrEqual(3)
      for (const key of ['scrollbar', 'scrollbarHover', 'scrollbarActive'] as const) expect(contrast(parse(palette[key]), background), `${key} on ${name}`).toBeGreaterThanOrEqual(3)
    }
    const nominal = bgs.nominal!
    const [rest, hover, active] = (['scrollbar', 'scrollbarHover', 'scrollbarActive'] as const).map((key) => contrast(parse(palette[key]), nominal)) as [number, number, number]
    expect(hover).toBeGreaterThan(rest)
    expect(active).toBeGreaterThan(hover)
    // Widgets (find, context menu) are opaque, so their text is checked against their own surface.
    expect(palette.widgetBackground).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrast(parse(palette.widgetForeground), parse(palette.widgetBackground))).toBeGreaterThanOrEqual(7)
    expect(contrast(parse(palette.widgetForeground), parse(palette.menuSelection))).toBeGreaterThanOrEqual(7)
  })

  it('keeps the colour roles apart (a keyword is not a string is not a comment)', () => {
    const roles = ['comment', 'keyword', 'string', 'number', 'type', 'tag'] as const
    expect(new Set(roles.map((role) => palette[role])).size).toBe(roles.length)
    expect(palette.comment).not.toBe(palette.text)
  })
})

describe('code theme data', () => {
  it.each(SCHEMES)('(%s) is fully transparent over the pane and does not inherit stock colours', (scheme) => {
    const theme = codeThemeData(scheme)
    expect(theme.colors['editor.background']).toBe('#00000000')
    expect(theme.colors['editorGutter.background']).toBe('#00000000')
    expect(theme.inherit).toBe(false)
    expect(theme.base).toBe(scheme === 'light' ? 'vs' : 'vs-dark')
  })

  it.each(SCHEMES)('(%s) writes token rules without "#" (Monaco prepends it) and covers the Monarch token families', (scheme) => {
    const { rules } = codeThemeData(scheme)
    const palette = CODE_PALETTES[scheme]
    for (const rule of rules) expect(rule.foreground, rule.token).toMatch(/^[0-9a-f]{6}$/)
    const colourOf = (token: string) => rules.find((rule) => rule.token === token)?.foreground
    expect(colourOf('')).toBe(palette.text.slice(1))
    for (const token of ['comment', 'string', 'string.escape', 'string.key', 'number', 'keyword', 'type', 'tag', 'attribute.name', 'attribute.value', 'regexp', 'annotation', 'operator', 'predefined']) {
      expect(colourOf(token), token).toBeDefined()
    }
    expect(colourOf('comment')).toBe(palette.comment.slice(1))
    expect(colourOf('keyword')).toBe(palette.keyword.slice(1))
    // The app ships no italic face of IBM Plex Mono.
    expect(rules.some((rule) => rule.fontStyle?.includes('italic'))).toBe(false)
  })

  it.each(SCHEMES)('(%s) only uses #rrggbb / #rrggbbaa colours', (scheme) => {
    for (const [id, colour] of Object.entries(codeThemeData(scheme).colors)) expect(colour, id).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
  })

  it('returns a fresh object each time and registers both themes under their ids', () => {
    expect(codeThemeData('light')).not.toBe(codeThemeData('light'))
    const defineTheme = vi.fn()
    defineCodeThemes({ defineTheme })
    expect(defineTheme.mock.calls.map(([name]) => name)).toEqual([CODE_THEME_IDS.light, CODE_THEME_IDS.dark])
    expect(CODE_THEME_IDS.light).not.toBe(CODE_THEME_IDS.dark)
  })
})

describe('codeSchemeOf', () => {
  it('reads <html data-scheme> and defaults to light', () => {
    expect(codeSchemeOf({ dataset: { scheme: 'dark' } })).toBe('dark')
    expect(codeSchemeOf({ dataset: { scheme: 'light' } })).toBe('light')
    expect(codeSchemeOf({ dataset: {} })).toBe('light')
  })
})
