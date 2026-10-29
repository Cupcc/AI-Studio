import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { COLOR_MODES, DEFAULT_THEME, GLASS_COLORS, THEME_PREFERENCES, type ColorMode, type GlassColor, type ThemePreference } from '@shared/ipc/settings'
import type { SessionCli } from '@shared/session/types'
import { SETTINGS_STRINGS as T } from '@shared/settings/strings'
import { Icon } from '../../app/Icon'
import { cliName, useSessions } from '../session/store'
import { sessionApi } from '../session/api'
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

function CliSettings() {
  const panel = useRef<HTMLElement>(null)
  const providers = useSessions((state) => state.providers)
  const providersError = useSessions((state) => state.providersError)
  const [selected, setSelected] = useState<SessionCli | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<SessionCli | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [details, setDetails] = useState<SessionCli | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all([useSessions.getState().loadProviders(), sessionApi().getGlobalDefaultCli()]).then(([, cli]) => {
      if (active) setSelected(cli)
    }).catch((reason) => { if (active) setError(String(reason)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const refresh = async () => {
    setChecking(true); setError(null); setSaved(false)
    try {
      await useSessions.getState().loadProviders(true)
      setSelected(await sessionApi().getGlobalDefaultCli())
    } catch (reason) { setError(String(reason)) }
    finally { setChecking(false) }
  }
  const toggle = async (cli: SessionCli, enabled: boolean) => {
    setPending(cli); setError(null); setSaved(false)
    try {
      const next = await sessionApi().setCliEnabled({ cli, enabled })
      useSessions.getState().acceptProviders(next)
      setSaved(true)
      requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`[data-cli-action="${cli}"]`)?.focus())
    } catch (reason) { setError(String(reason)) }
    finally { setPending(null) }
  }
  const choose = async (cli: SessionCli) => {
    setPending(cli); setError(null); setSaved(false)
    try {
      await sessionApi().setGlobalDefaultCli({ cli })
      setSelected(cli)
      useSessions.getState().applyGlobalDefault(cli)
      setSaved(true)
    } catch (reason) { setError(String(reason)) }
    finally { setPending(null) }
  }
  const enabled = providers.filter(provider => provider.status !== 'disabled')
  const notAdded = providers.filter(provider => provider.status === 'disabled')
  const available = providers.filter(provider => provider.status === 'available')
  const effectiveDefault = available.find(provider => provider.cli === selected)?.cli ?? available[0]?.cli ?? null
  const statusLabels = { disabled: '未添加', checking: '待检测', available: '可用', not_installed: '未安装', not_logged_in: '未登录', unsupported_version: '版本不兼容', error: '检测失败' }
  return <section className="settings-dialog__content cli-settings" aria-label={T.cli} ref={panel}>
    <div className="cli-settings__header">
      <h3>{T.cli}</h3>
      <button className="secondary-button button--small cli-settings__refresh" disabled={loading || checking || pending !== null || !enabled.length} onClick={() => void refresh()}>{loading || checking ? '正在检测…' : '重新检测'}</button>
    </div>
    <div className="cli-settings__scroll">
      <section aria-labelledby="cli-added-title">
        <h4 id="cli-added-title">已添加</h4>
        <p className="settings-note settings-note--intro">点击可用的 CLI 设为默认，所有项目共用。</p>
        <div className="cli-settings__list" role="radiogroup" aria-label="默认 CLI">
          {enabled.map(provider => {
            const failed = provider.status !== 'checking' && provider.status !== 'available'
            const name = provider.displayName || cliName(provider.cli)
            const isDefault = effectiveDefault === provider.cli
            return <div className="cli-settings__entry" key={provider.cli}>
              <div className="cli-settings__row">
                <button className="cli-settings__select" role="radio" aria-label={name} aria-checked={isDefault}
                  tabIndex={isDefault ? 0 : -1} disabled={loading || pending !== null || provider.status !== 'available'}
                  onClick={() => void choose(provider.cli)} onKeyDown={event => {
                    const step = arrowStep(event)
                    if (step && available.length > 1) {
                      const next = wrap(available, available.findIndex(item => item.cli === provider.cli) + step)
                      panel.current?.querySelector<HTMLButtonElement>(`[data-cli-default="${next.cli}"]`)?.focus()
                      void choose(next.cli)
                    }
                  }} data-cli-default={provider.cli}>
                  <span className="cli-settings__check" aria-hidden="true">{isDefault && <Icon name="check" size={14} />}</span>
                  <span>{name}</span>
                </button>
                <span className="cli-settings__status">{checking ? '检测中…' : statusLabels[provider.status]}</span>
                <button className="text-button cli-settings__action" aria-label={`移除 ${name}`} data-cli-action={provider.cli}
                  disabled={loading || pending !== null} onClick={() => void toggle(provider.cli, false)}>移除</button>
              </div>
              {failed && <div className="cli-settings__failure">
                <button className="text-button cli-settings__help" aria-expanded={details === provider.cli} onClick={() => setDetails(details === provider.cli ? null : provider.cli)}>处理方法</button>
                {details === provider.cli && <p className="cli-settings__recovery">{provider.reason}<br />{provider.status === 'not_installed' ? `安装 ${name} 后点击右上角“重新检测”。` : provider.status === 'not_logged_in' ? `在终端完成 ${name} 登录后，点击右上角“重新检测”。` : '确认 CLI 在终端中可正常运行后，点击右上角“重新检测”。'}</p>}
              </div>}
            </div>
          })}
        </div>
        {!loading && !enabled.length && <p className="settings-note">尚未添加 CLI，请从下方添加。</p>}
      </section>
      <section className="cli-settings__not-added" aria-labelledby="cli-not-added-title">
        <h4 id="cli-not-added-title">未添加</h4>
        <p className="settings-note settings-note--intro">未添加的 CLI 不检测，也不出现在新建对话中。</p>
        <div className="cli-settings__list">
          {notAdded.map(provider => {
            const name = provider.displayName || cliName(provider.cli)
            return <div className="cli-settings__entry cli-settings__row" key={provider.cli}>
              <span className="cli-settings__name">{name}</span>
              <button className="text-button cli-settings__action" aria-label={`添加 ${name}`} data-cli-action={provider.cli}
                disabled={loading || pending !== null} onClick={() => void toggle(provider.cli, true)}>添加</button>
            </div>
          })}
        </div>
        {!loading && !notAdded.length && <p className="settings-note">已添加全部支持的 CLI。</p>}
      </section>
      {(providersError || error) && <p className="error-message" role="alert">{error || providersError}</p>}
      {saved && !error && <p className="settings-note" role="status">{T.cliSaved}</p>}
    </div>
  </section>
}

/** FR-SET-001 / FR-SET-002: one "外观" category with mode, theme and glass-colour radio groups; choices apply at once. */
export function SettingsDialog() {
  const { appearance, saveFailed, closeDialog, setTheme, setGlassColor, setMode } = useSettings()
  const dialog = useRef<HTMLDivElement>(null)
  const category = useSettings(state => state.category)
  const setCategory = (category: 'appearance' | 'cli') => useSettings.setState({ category })
  const radios = useRef<Partial<Record<ThemePreference, HTMLButtonElement | null>>>({})
  const swatches = useRef<Partial<Record<GlassColor, HTMLButtonElement | null>>>({})
  const modes = useRef<Partial<Record<ColorMode, HTMLButtonElement | null>>>({})
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // First control in reading order: the checked colour mode.
    if (useSettings.getState().category === 'appearance') modes.current[useSettings.getState().appearance.mode]?.focus()
    else dialog.current?.querySelector<HTMLButtonElement>('.settings-category[aria-current="page"]')?.focus()
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
          <button className={`settings-category ${category === 'appearance' ? 'is-selected' : ''}`} aria-current={category === 'appearance' ? 'page' : undefined} onClick={() => setCategory('appearance')}><Icon name="appearance" /><span>{T.appearance}</span></button>
          <button className={`settings-category ${category === 'cli' ? 'is-selected' : ''}`} aria-current={category === 'cli' ? 'page' : undefined} onClick={() => setCategory('cli')}><Icon name="terminal" /><span>{T.cli}</span></button>
        </nav>
        {category === 'cli' ? <CliSettings /> : <section className="settings-dialog__content" aria-label={T.appearance}>
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
        </section>}
      </div>
    </div>
  </div>
}
