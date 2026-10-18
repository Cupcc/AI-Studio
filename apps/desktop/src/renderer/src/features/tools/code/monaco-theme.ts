import type { editor } from 'monaco-editor/editor/editor.api.js'

/**
 * Monaco colours per colour scheme (FR-TOOL-001 / 002; FR-SET-002), one explicit table per scheme like the Terminal's
 * `terminal-theme.ts`, and for the same reason: the colours must hold on the solid pane AND on the worst measured glass
 * background, which depends on the scheme only (not on glass / solid or the wallpaper).
 *
 * - `editor.background` is fully transparent (`#00000000`), so the pane behind the viewer shows through: opaque white /
 *   `#212121` in the solid theme, the native material in glass. Nothing in the editor paints a background of its own
 *   except the widgets (find, context menu), which are opaque.
 * - Overlays (selection, find matches, diff lines) are translucent tints, so they follow whatever is behind them.
 * - Nominal backgrounds are the solid theme's `--color-surface` (`styles/tokens.css`; a test reads the CSS and fails if
 *   they drift). The worst glass backgrounds are the relative luminances measured on the real app for the Terminal
 *   (`tasks/archive/T20261009-context-tools/evidence/W5-theme-measurements-r3.json`), see `monaco-theme.test.ts`.
 * - Token colours start from the Terminal's validated ANSI hues (GitHub Primer) and keep every syntax colour >= 4.5:1 on
 *   both backgrounds and on the persistent line tints (line highlight, inserted / removed diff lines). Transient
 *   overlays (selection, find matches, word-level diff highlights) may lower syntax colours to >= 3:1 on the worst glass;
 *   the default text stays >= 7:1 (>= 4.5:1 on the strongest emphasis tints). The thresholds live in the test.
 * - The app loads IBM Plex Mono 400 and 500 only (upright): no rule uses italic, and `strong` renders in the 500 face.
 *
 * Only data and plain functions here: no Monaco runtime import, so the panels and tests can load it freely.
 */
export type CodeScheme = 'light' | 'dark'

export const CODE_THEME_IDS: Readonly<Record<CodeScheme, string>> = { light: 'studio-code-light', dark: 'studio-code-dark' }

export interface CodePalette {
  /** Syntax roles: every one is a foreground colour (#rrggbb). */
  text: string; comment: string; keyword: string; string: string; number: string; type: string; tag: string
  attribute: string; operator: string; regexp: string; escape: string; annotation: string; predefined: string
  /** Gutter and caret. */
  lineNumber: string; lineNumberActive: string; cursor: string; indentGuide: string; indentGuideActive: string
  /** Translucent tints (#rrggbbaa) painted behind the text. `*Text` tints are drawn on top of the matching `*Line` tint. */
  lineHighlight: string; selection: string; selectionInactive: string; findCurrent: string; findOther: string
  insertedLine: string; removedLine: string; insertedText: string; removedText: string; unchangedRegion: string
  /** Opaque widget surfaces (find widget, context menu). */
  widgetBackground: string; widgetForeground: string; widgetBorder: string; menuSelection: string
  focus: string
  scrollbar: string; scrollbarHover: string; scrollbarActive: string
}

const light: CodePalette = {
  text: '#0d0d0d', comment: '#454d56', keyword: '#6724ad', string: '#01521d', number: '#024797', type: '#045158', tag: '#980416',
  attribute: '#5d4303', operator: '#3a4047', regexp: '#980416', escape: '#0a4d9c', annotation: '#6b3a03', predefined: '#0a4d9c',
  lineNumber: '#454d56', lineNumberActive: '#0d0d0d', cursor: '#0d0d0d', indentGuide: '#00000014', indentGuideActive: '#00000033',
  lineHighlight: '#0000000a', selection: '#2563eb29', selectionInactive: '#6b728029', findCurrent: '#f59e0b66', findOther: '#f59e0b33',
  insertedLine: '#16a34a24', removedLine: '#dc262620', insertedText: '#16a34a33', removedText: '#dc262633', unchangedRegion: '#00000012',
  widgetBackground: '#ffffff', widgetForeground: '#0d0d0d', widgetBorder: '#d9d8d3', menuSelection: '#e6e5e0',
  focus: '#2563eb',
  // Same thumbs as the Terminal (>= 3:1 on both backgrounds, stronger on hover / drag).
  scrollbar: '#6a7279', scrollbarHover: '#575e66', scrollbarActive: '#484f56'
}

const dark: CodePalette = {
  text: '#f2f2f2', comment: '#b4bbc4', keyword: '#ff9d95', string: '#a5d6ff', number: '#79c0ff', type: '#ffa657', tag: '#7ee787',
  attribute: '#79c0ff', operator: '#c9d1d9', regexp: '#7ee787', escape: '#79c0ff', annotation: '#d2a8ff', predefined: '#d2a8ff',
  lineNumber: '#b4bbc4', lineNumberActive: '#f2f2f2', cursor: '#f2f2f2', indentGuide: '#ffffff14', indentGuideActive: '#ffffff33',
  lineHighlight: '#ffffff08', selection: '#58a6ff29', selectionInactive: '#8b949e29', findCurrent: '#e3b34140', findOther: '#e3b3411f',
  insertedLine: '#22c55e24', removedLine: '#f0525224', insertedText: '#22c55e2e', removedText: '#f052522e', unchangedRegion: '#ffffff12',
  widgetBackground: '#2b2b2b', widgetForeground: '#f2f2f2', widgetBorder: '#444444', menuSelection: '#343434',
  focus: '#4d8eff',
  scrollbar: '#838a92', scrollbarHover: '#989fa7', scrollbarActive: '#acb4bc'
}

export const CODE_PALETTES: Readonly<Record<CodeScheme, CodePalette>> = { light, dark }

/** The syntax roles checked for contrast (everything drawn as text inside the code area). */
export const CODE_TEXT_ROLES = [
  'text', 'comment', 'keyword', 'string', 'number', 'type', 'tag', 'attribute', 'operator', 'regexp', 'escape', 'annotation', 'predefined', 'lineNumber'
] as const

/** The app's colour scheme, written to `<html data-scheme>` by the settings store (dark when the effective mode is dark). */
export function codeSchemeOf(root: { dataset: DOMStringMap } = document.documentElement): CodeScheme {
  return root.dataset.scheme === 'dark' ? 'dark' : 'light'
}

/** Monaco's token rules take the colour without `#` (it prepends one itself). */
const hex = (color: string) => color.slice(1)

/** A fresh Monaco theme definition; `inherit: false` so no colour of the stock themes leaks in. */
export function codeThemeData(scheme: CodeScheme): editor.IStandaloneThemeData {
  const p = CODE_PALETTES[scheme]
  const rule = (token: string, color: string, fontStyle?: string): editor.ITokenThemeRule => ({ token, foreground: hex(color), ...(fontStyle ? { fontStyle } : {}) })
  return {
    base: scheme === 'dark' ? 'vs-dark' : 'vs',
    inherit: false,
    rules: [
      rule('', p.text),
      rule('comment', p.comment),
      rule('string', p.string),
      rule('string.escape', p.escape),
      rule('string.key', p.type),
      rule('string.link', p.number),
      rule('number', p.number),
      rule('constant', p.number),
      rule('keyword', p.keyword),
      rule('type', p.type),
      rule('namespace', p.type),
      rule('predefined', p.predefined),
      rule('variable.predefined', p.predefined),
      rule('tag', p.tag),
      rule('metatag', p.annotation),
      rule('attribute.name', p.attribute),
      rule('attribute.value', p.string),
      rule('regexp', p.regexp),
      rule('regexp.escape', p.escape),
      rule('annotation', p.annotation),
      rule('operator', p.operator),
      rule('delimiter', p.text),
      rule('invalid', p.tag),
      rule('strong', p.text, 'bold')
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': p.text,
      'editorGutter.background': '#00000000',
      'editorLineNumber.foreground': p.lineNumber,
      'editorLineNumber.activeForeground': p.lineNumberActive,
      'editorCursor.foreground': p.cursor,
      'editorIndentGuide.background1': p.indentGuide,
      'editorIndentGuide.activeBackground1': p.indentGuideActive,
      'editorWhitespace.foreground': p.indentGuide,
      'editor.lineHighlightBackground': p.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': p.selection,
      'editor.inactiveSelectionBackground': p.selectionInactive,
      'editor.findMatchBackground': p.findCurrent,
      'editor.findMatchHighlightBackground': p.findOther,
      'editor.findRangeHighlightBackground': '#00000000',
      'editorOverviewRuler.border': '#00000000',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': p.scrollbar,
      'scrollbarSlider.hoverBackground': p.scrollbarHover,
      'scrollbarSlider.activeBackground': p.scrollbarActive,
      'focusBorder': p.focus,
      'editorWidget.background': p.widgetBackground,
      'editorWidget.foreground': p.widgetForeground,
      'editorWidget.border': p.widgetBorder,
      'input.background': p.widgetBackground,
      'input.foreground': p.widgetForeground,
      'input.border': p.widgetBorder,
      'inputOption.activeBackground': p.menuSelection,
      'inputOption.activeBorder': p.focus,
      'inputOption.activeForeground': p.widgetForeground,
      'menu.background': p.widgetBackground,
      'menu.foreground': p.widgetForeground,
      'menu.selectionBackground': p.menuSelection,
      'menu.selectionForeground': p.widgetForeground,
      'menu.separatorBackground': p.widgetBorder,
      'menu.border': p.widgetBorder,
      'toolbar.hoverBackground': p.menuSelection,
      'diffEditor.insertedLineBackground': p.insertedLine,
      'diffEditor.removedLineBackground': p.removedLine,
      'diffEditor.insertedTextBackground': p.insertedText,
      'diffEditor.removedTextBackground': p.removedText,
      'diffEditor.insertedTextBorder': '#00000000',
      'diffEditor.removedTextBorder': '#00000000',
      'diffEditorGutter.insertedLineBackground': p.insertedText,
      'diffEditorGutter.removedLineBackground': p.removedText,
      'diffEditor.unchangedRegionBackground': p.unchangedRegion,
      'diffEditor.unchangedRegionForeground': p.comment,
      'diffEditor.unchangedRegionShadow': '#00000000',
      'diffEditor.unchangedCodeBackground': '#00000000',
      'diffEditor.diagonalFill': p.indentGuide,
      'diffEditor.border': p.widgetBorder
    }
  }
}

/** Registers both themes on a Monaco `editor` API (idempotent: redefining a theme replaces it). */
export function defineCodeThemes(api: { defineTheme(name: string, data: editor.IStandaloneThemeData): void }): void {
  for (const scheme of ['light', 'dark'] as const) api.defineTheme(CODE_THEME_IDS[scheme], codeThemeData(scheme))
}
