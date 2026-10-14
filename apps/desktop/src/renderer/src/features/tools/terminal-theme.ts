import type { ITheme } from '@xterm/xterm'

/**
 * Explicit xterm.js colours per colour scheme (W5-F4 / W5-F8; FR-TOOL-004).
 *
 * Why a fixed table instead of CSS tokens:
 * - xterm derives reverse video, the cursor glyph and the selection from `theme.background`. Reading the glass
 *   `--color-pane` (transparent) produced a black selection and black-on-black reverse video, so `background`
 *   here is an OPAQUE nominal pane colour (the solid theme's `--color-surface`). It is only the base xterm blends
 *   against; `tools.css` keeps the viewport / scrollable element visually transparent so glass still shows through.
 * - The contrast criteria below must hold on the solid pane AND on the worst measured glass background, which
 *   depends on the scheme only, not on the theme (glass / solid) or the wallpaper. One table per scheme is enough.
 * - `selectionForeground` is deliberately unset: the DOM renderer would then write an inline `style="color:#rrggbb"` on
 *   every selected span. Selected text keeps its own colour (xterm's minimum contrast still adjusts coloured cells).
 * - The CSP allows `style-src-attr` since 2026-10-14 (user), so `minimumContrastRatio` is used for arbitrary program
 *   colours; the palette itself is still designed to be legible without any adjustment.
 *
 * Criteria (computed from these values in `terminal-theme.test.ts`, WCAG 2.x relative luminance):
 * - ANSI 0-15 >= 4.5:1 and the default foreground, cursor >= 7:1 / 3:1 against the nominal background and the worst
 *   glass background; reverse video (background glyph on a foreground / ANSI block) >= 4.5:1.
 * - Default text on the (inactive) selection >= 4.5:1 and the selection >= 3:1 against the nominal background.
 *   Against the worst glass background both cannot hold at once (about 2.2-2.3:1 is the best a readable selection gets).
 * - Scrollbar thumb (all three states) >= 3:1 against both backgrounds.
 *
 * Sources: the ANSI colours start from GitHub Primer (@primer/primitives 7.10.0 `ansi`, as used by primer/github-vscode-theme
 * 6.3.5). The dark table is Primer dark unchanged except ANSI 0 and 8 (Primer's greys give 1.9:1 and 3.5:1 on the pane).
 * Primer light cannot be used as is: its blue, magenta, cyan and bright colours are far lighter than 4.5:1 allows on the
 * worst glass background. ANSI 1-6 and 9-14 keep Primer's hues, re-targeted to relative luminance 0.061-0.072 (normal) and
 * 0.091-0.095 (bright); ANSI 0 is Primer's, 7 / 8 / 15 are neutral greys on the same ramp.
 * ANSI 0 / 7 / 8 / 15 are legible text colours, not black and white: in the light scheme "white" is a dark grey and in
 * the dark scheme "black" is a light grey, so classic black-on-white pairs (`30;47`) have low contrast by construction.
 * ANSI 16-255 are not part of this table (xterm defaults).
 */
export type TerminalScheme = 'light' | 'dark'

/** Index order of the 16 base ANSI colours (SGR 30-37, 90-97). */
export const TERMINAL_ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
] as const

type AnsiKey = typeof TERMINAL_ANSI_KEYS[number]
type ThemeKey =
  | 'foreground' | 'background' | 'cursor' | 'cursorAccent' | 'selectionBackground' | 'selectionInactiveBackground'
  | 'scrollbarSliderBackground' | 'scrollbarSliderHoverBackground' | 'scrollbarSliderActiveBackground'
export type TerminalPalette = Readonly<Record<ThemeKey | AnsiKey, string>>

const light: TerminalPalette = {
  // Text and nominal pane colour equal the glass `--color-text` and the solid `--color-surface` tokens (styles/tokens.css).
  // If those tokens change, re-derive this table: the contrast tests only see these values, not the CSS.
  foreground: '#0d0d0d', background: '#ffffff', cursor: '#0d0d0d', cursorAccent: '#ffffff',
  selectionBackground: '#698eb3', selectionInactiveBackground: '#868e96',
  scrollbarSliderBackground: '#6a7279', scrollbarSliderHoverBackground: '#575e66', scrollbarSliderActiveBackground: '#484f56',
  black: '#24292f', red: '#980416', green: '#01521d', yellow: '#5d4303', blue: '#024797', magenta: '#6724ad', cyan: '#045158', white: '#484f56',
  brightBlack: '#3a4047', brightRed: '#af0a27', brightGreen: '#046325', brightYellow: '#6e5104', brightBlue: '#0556a7', brightMagenta: '#7132ba', brightCyan: '#04606c', brightWhite: '#51575f'
}

const dark: TerminalPalette = {
  foreground: '#f2f2f2', background: '#212121', cursor: '#f2f2f2', cursorAccent: '#212121',
  selectionBackground: '#516e95', selectionInactiveBackground: '#696d71',
  scrollbarSliderBackground: '#838a92', scrollbarSliderHoverBackground: '#989fa7', scrollbarSliderActiveBackground: '#acb4bc',
  black: '#9fa6af', red: '#ff7b72', green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
  brightBlack: '#a8afb8', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#ffffff'
}

/**
 * xterm adjusts a cell's foreground until it reaches this ratio against its own background (text on ANSI / 24-bit
 * colour backgrounds, W5-F9). It measures against the OPAQUE nominal background (white in the light scheme), while
 * glass shows darker real pixels (measured luminance 0.80-0.87 on the five glass backgrounds of one machine; a much
 * darker desktop behind the glass would need about 6.75 at 0.65), so 4.5 only gave 3.7-4.3:1 on light glass (W5-F12).
 * 5.5 raises the worst measured span to about 4.45-4.5:1; solid and dark glass are unaffected. Reverse-video text
 * is adjusted too and reads about 5.4-6:1 (W5-F13).
 */
export const TERMINAL_MINIMUM_CONTRAST_RATIO = 5.5

export const TERMINAL_PALETTES: Readonly<Record<TerminalScheme, TerminalPalette>> = { light, dark }

/** A fresh xterm theme object; xterm applies an `options.theme` assignment only when the object identity changes. */
export function terminalTheme(scheme: TerminalScheme): ITheme {
  return { ...TERMINAL_PALETTES[scheme] }
}

/** The app's colour scheme, written to `<html data-scheme>` by the settings store (dark when the effective mode is dark). */
export function terminalSchemeOf(root: { dataset: DOMStringMap } = document.documentElement): TerminalScheme {
  return root.dataset.scheme === 'dark' ? 'dark' : 'light'
}
