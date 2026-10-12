import { useEffect, useRef, type KeyboardEvent } from 'react'
import { COLOR_MODES, DEFAULT_THEME, GLASS_COLORS, THEME_PREFERENCES, type ColorMode, type GlassColor, type ThemePreference } from '@shared/ipc/settings'
import { SETTINGS_STRINGS as T } from '@shared/settings/strings'
import { Icon } from '../../app/Icon'
import { useSettings } from './store'

/** Static sketch of a theme, independent of the theme currently shown (Shell Spec v02 §12). */
function ThemePreview({ theme, glassColor }: { theme: ThemePreference; glassColor: GlassColor }) {
  return <span className={`theme-preview theme-preview--${theme}`} data-glass-color={theme === 'glass' ? glassColor : undefined} aria-hidden="true">
    <span className="theme-preview__bar" /><span className="theme-preview__nav" />
    <span className="theme-preview__canvas"><span className="theme-preview__bubble" /><span className="theme-preview__line" /><span className="theme-preview__input" /></span>
  </span>
}

/** Arrow keys move the checked option of a radio group, wrapping at the ends. */
function arrowStep(event: KeyboardEvent): number {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (step) event.preventDefault()
  return step
}
const wrap = <T,>(items: readonly T[], index: number) => items[(index + items.length) % items.length]!

/** FR-SET-001 / FR-SET-002: one "外观" category with mode, theme and glass-colour radio groups; choices apply at once. */
export function SettingsDialog() {
  const { appearance, saveFailed, closeDialog, setTheme, setGlassColor, setMode } = useSettings()
  const dialog = useRef<HTMLDivElement>(null)
  const radios = useRef<Partial<Record<ThemePreference, HTMLButtonElement | null>>>({})
  const swatches = useRef<Partial<Record<GlassColor, HTMLButtonElement | null>>>({})
  const modes = useRef<Partial<Record<ColorMode, HTMLButtonElement | null>>>({})
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // First control in reading order: the checked colour mode.
    modes.current[useSettings.getState().appearance.mode]?.focus()
    return () => previous?.focus()
  }, [])
  const choose = (theme: ThemePreference) => { radios.current[theme]?.focus(); void setTheme(theme) }
  const chooseColor = (color: GlassColor) => { swatches.current[color]?.focus(); void setGlassColor(color) }
  const chooseMode = (mode: ColorMode) => { modes.current[mode]?.focus(); void setMode(mode) }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); closeDialog() }
    if (event.key !== 'Tab') return
    const focusable = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"])')]
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
    <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={dialog} onKeyDown={onKeyDown}>
      <header className="settings-dialog__header">
        <h2 id="settings-title">{T.title}</h2>
        <button className="icon-button" aria-label={T.close} onClick={closeDialog}><Icon name="close" size={15} /></button>
      </header>
      <div className="settings-dialog__body">
        <nav className="settings-dialog__categories" aria-label={T.categories}>
          <button className="settings-category is-selected" aria-current="page"><Icon name="appearance" /><span>{T.appearance}</span></button>
        </nav>
        <section className="settings-dialog__content" aria-label={T.appearance}>
          <h3 id="settings-mode">{T.mode}</h3>
          <div className="mode-options" role="radiogroup" aria-labelledby="settings-mode">
            {COLOR_MODES.map((mode, index) => {
              const checked = appearance.mode === mode
              return <button key={mode} ref={(el) => { modes.current[mode] = el }} className={`mode-option ${checked ? 'is-checked' : ''}`}
                role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} data-mode={mode}
                onClick={() => chooseMode(mode)} onKeyDown={(event) => { const step = arrowStep(event); if (step) chooseMode(wrap(COLOR_MODES, index + step)) }}>
                {T.modeNames[mode]}
              </button>
            })}
          </div>
          <h3 id="settings-theme" className="settings-dialog__subheading">{T.theme}</h3>
          <div className="theme-options" role="radiogroup" aria-labelledby="settings-theme">
            {THEME_PREFERENCES.map((theme, index) => {
              const checked = appearance.theme === theme
              return <button key={theme} ref={(el) => { radios.current[theme] = el }} className={`theme-option ${checked ? 'is-checked' : ''}`}
                role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} data-theme-option={theme}
                onClick={() => choose(theme)} onKeyDown={(event) => { const step = arrowStep(event); if (step) choose(wrap(THEME_PREFERENCES, index + step)) }}>
                <ThemePreview theme={theme} glassColor={appearance.glassColor} />
                <span className="theme-option__name">{T.themeNames[theme]}{theme === DEFAULT_THEME && <span className="theme-option__badge">{T.defaultBadge}</span>}{checked && <span className="theme-option__check"><Icon name="check" size={14} /></span>}</span>
                <span className="theme-option__hint">{T.themeHints[theme]}</span>
              </button>
            })}
          </div>
          {appearance.theme === 'glass' && <>
            <h3 id="settings-glass-color" className="settings-dialog__subheading">{T.glassColor}</h3>
            <div className="glass-colors" role="radiogroup" aria-labelledby="settings-glass-color">
              {GLASS_COLORS.map((color, index) => {
                const checked = appearance.glassColor === color
                return <button key={color} ref={(el) => { swatches.current[color] = el }} className={`glass-color ${checked ? 'is-checked' : ''}`}
                  role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} data-glass-color={color}
                  title={color === 'none' ? T.glassColorNone : undefined}
                  onClick={() => chooseColor(color)} onKeyDown={(event) => { const step = arrowStep(event); if (step) chooseColor(wrap(GLASS_COLORS, index + step)) }}>
                  <span className="glass-color__swatch" aria-hidden="true" />
                  <span className="glass-color__name">{T.glassColorNames[color]}</span>
                </button>
              })}
            </div>
          </>}
          <p className="settings-note">{T.appliesImmediately}</p>
          {appearance.theme === 'glass' && appearance.reducedTransparency && <p className="settings-note settings-note--notice" role="status">{T.reducedTransparency}</p>}
          {saveFailed && <p className="error-message" role="alert">{T.saveFailed}</p>}
        </section>
      </div>
    </div>
  </div>
}
