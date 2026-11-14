import { SETTINGS_STRINGS as T } from '@shared/settings/strings'
import { Icon } from '../../app/Icon'
import { registerShellIntegration } from '../project/integration'
import { updateBadge, useAbout } from '../app-info/store'
import { useSettings } from './store'
import './settings.css'

/**
 * Bottom-left entry of the navigation, as in ChatGPT Desktop (FR-SET-001; SET-Q1). A known newer release adds a badge
 * and the entry then opens Settings › 关于 (FR-SET-003).
 */
export function SettingsEntry() {
  const open = useSettings((state) => state.openDialog)
  const badge = useAbout((state) => updateBadge(state.update))
  const label = badge === 'ready' ? T.badgeReady : badge ? T.badgeAvailable : null
  return <button className="navigation__view settings-entry" aria-label={label ? `${T.entry}（${label}）` : undefined} onClick={() => open(badge ? 'about' : undefined)}>
    <Icon name="settings" /><span>{T.entry}</span>
    {label && <span className="settings-entry__badge" data-badge={badge}>{label}</span>}
  </button>
}

/**
 * Registers the navigation entry and settings events once, before the first
 * render. `ready` settles when the saved appearance is applied to <html>.
 */
export function installSettingsIntegration(): { ready: Promise<void>; dispose(): void } {
  const unregister = registerShellIntegration({ NavigationFooter: SettingsEntry })
  const unwatch = useSettings.getState().watchEvents()
  const unwatchUpdates = useAbout.getState().watch(() => useSettings.getState().openDialog('about'))
  void useAbout.getState().load()
  return { ready: useSettings.getState().load(), dispose: () => { unwatch(); unwatchUpdates(); unregister() } }
}
