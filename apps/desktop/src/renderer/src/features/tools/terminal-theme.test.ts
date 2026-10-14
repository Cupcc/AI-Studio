import { describe, expect, it } from 'vitest'
import { TERMINAL_ANSI_KEYS, TERMINAL_PALETTES, terminalSchemeOf, terminalTheme, type TerminalScheme, TERMINAL_MINIMUM_CONTRAST_RATIO } from './terminal-theme'

// WCAG 2.x relative luminance and contrast ratio.
const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}
const contrast = (a: string | number, b: string | number) => {
  const [x, y] = [a, b].map((v) => typeof v === 'number' ? v : luminance(v)) as [number, number]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/*
 * Worst measured glass pane background (relative luminance) per colour scheme, derived from the W5 measurement of the
 * real built app: tasks/T20261009-context-tools/evidence/W5-theme-measurements-r3.json, `plainRowWorstBg.min` of each
 * cell (contrast of the default text against the worst background pixel of a text row):
 *   light: 12.99:1 for #0d0d0d (glass + aurora)  -> L = 12.99 * (0.0040 + 0.05) - 0.05 = 0.6518  (glass, no wallpaper: 13.32 -> 0.6696)
 *   dark:  10.71:1 for #f2f2f2 (glass, no wallpaper) -> L = (0.8879 + 0.05) / 10.71 - 0.05 = 0.0376  (aurora 11.37 -> 0.0325, system dark 11.23 -> 0.0335)
 * The light scheme's worst case is its darkest background, the dark scheme's its lightest.
 */
const GLASS_WORST: Record<TerminalScheme, number> = { light: 0.6518, dark: 0.0376 }
const SCHEMES: TerminalScheme[] = ['light', 'dark']
const ansi = (scheme: TerminalScheme) => TERMINAL_ANSI_KEYS.map((key) => ({ key, color: TERMINAL_PALETTES[scheme][key] }))

describe.each(SCHEMES)('terminal palette (%s)', (scheme) => {
  const palette = TERMINAL_PALETTES[scheme]
  // Nominal pane background: what the solid theme paints (also xterm's derived-colour base).
  const backgrounds = { nominal: luminance(palette.background), 'worst glass': GLASS_WORST[scheme] }

  it('is a full theme of opaque 6-digit colours', () => {
    const theme = terminalTheme(scheme)
    for (const key of ['foreground', 'background', 'cursor', 'cursorAccent', 'selectionBackground', 'selectionInactiveBackground', ...TERMINAL_ANSI_KEYS] as const) {
      expect(theme[key], key).toMatch(/^#[0-9a-f]{6}$/)
    }
    // A new object every time: xterm re-applies options.theme only when the identity changes.
    expect(terminalTheme(scheme)).not.toBe(theme)
    expect(theme.selectionForeground).toBeUndefined()
  })

  it.each(Object.entries(backgrounds))('keeps every ANSI foreground 0-15 >= 4.5:1 against the %s background', (_name, background) => {
    for (const { key, color } of ansi(scheme)) expect(contrast(color, background), `${key} ${color}`).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(backgrounds))('keeps the default text >= 7:1 and the cursor >= 3:1 against the %s background', (_name, background) => {
    expect(contrast(palette.foreground, background)).toBeGreaterThanOrEqual(7)
    expect(contrast(palette.cursor, background)).toBeGreaterThanOrEqual(3)
  })

  it('keeps the glyph under a block cursor legible', () => {
    expect(contrast(palette.cursorAccent, palette.cursor)).toBeGreaterThanOrEqual(4.5)
  })

  it('renders reverse video legibly: the background colour is the glyph, the foreground or ANSI colour the block', () => {
    expect(contrast(palette.background, palette.foreground)).toBeGreaterThanOrEqual(4.5)
    for (const { key, color } of ansi(scheme)) expect(contrast(palette.background, color), `reverse ${key}`).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['selectionBackground', 'selectionInactiveBackground'] as const)('makes %s readable and visible', (key) => {
    const selection = palette[key]
    expect(contrast(palette.foreground, selection), 'default text on the selection').toBeGreaterThanOrEqual(4.5)
    expect(contrast(selection, palette.background), 'selection against the nominal pane').toBeGreaterThanOrEqual(3)
    // Both bounds cannot hold on the worst glass background (text readability wins); about 2.2:1 is what a readable selection gets there.
    expect(contrast(selection, GLASS_WORST[scheme]), 'selection against the worst glass').toBeGreaterThanOrEqual(2.2)
  })

  it('keeps the scrollbar thumb >= 3:1 against both backgrounds and stronger in the hover and drag states', () => {
    const thumbs = ['scrollbarSliderBackground', 'scrollbarSliderHoverBackground', 'scrollbarSliderActiveBackground'] as const
    for (const key of thumbs) {
      for (const [name, background] of Object.entries(backgrounds)) expect(contrast(palette[key], background), `${key} on ${name}`).toBeGreaterThanOrEqual(3)
    }
    const [rest, hover, active] = thumbs.map((key) => contrast(palette[key], palette.background)) as [number, number, number]
    expect(hover).toBeGreaterThan(rest)
    expect(active).toBeGreaterThan(hover)
  })

  it('keeps ANSI black and white legible instead of mapping them to the page colours', () => {
    for (const key of ['black', 'white', 'brightBlack', 'brightWhite'] as const) {
      for (const [name, background] of Object.entries(backgrounds)) expect(contrast(palette[key], background), `${key} on ${name}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('terminal palette hues', () => {
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (h * 60 + 360) % 360
  }
  // HSL hue ranges per colour name; keeps ANSI red recognisably red after the lightness is adjusted.
  const ranges: Record<string, [number, number]> = { red: [-20, 15], yellow: [35, 65], green: [100, 170], cyan: [170, 205], blue: [205, 255], magenta: [255, 330] }
  it.each(SCHEMES)('keeps the %s colours in their named hue family', (scheme) => {
    for (const [name, [from, to]] of Object.entries(ranges)) {
      for (const key of [name, `bright${name[0]!.toUpperCase()}${name.slice(1)}`] as (keyof typeof TERMINAL_PALETTES.light)[]) {
        const value = hue(TERMINAL_PALETTES[scheme][key])
        expect(value >= from && value <= to || value - 360 >= from && value - 360 <= to, `${scheme} ${key} hue ${value.toFixed(0)}`).toBe(true)
      }
    }
  })
})

describe('terminalSchemeOf', () => {
  it('reads <html data-scheme> and defaults to light', () => {
    expect(terminalSchemeOf({ dataset: { scheme: 'dark' } })).toBe('dark')
    expect(terminalSchemeOf({ dataset: { scheme: 'light' } })).toBe('light')
    expect(terminalSchemeOf({ dataset: {} })).toBe('light')
  })
})

// W5-F9 / W5-F12: text on coloured backgrounds is readable only because xterm adjusts the foreground per cell, and xterm
// measures against the opaque nominal background, so the request must exceed the 4.5:1 that glass pixels need.
it('asks xterm for more than the contrast the glass pixels need', () => {
  expect(TERMINAL_MINIMUM_CONTRAST_RATIO).toBe(5.5)
  expect(TERMINAL_MINIMUM_CONTRAST_RATIO).toBeGreaterThan(4.5)
})
