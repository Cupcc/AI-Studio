import { SETTINGS_STRINGS as T } from '@shared/settings/strings'
import { Icon } from '../../app/Icon'
import { registerShellIntegration } from '../project/integration'
import { useSettings } from './store'
import './settings.css'

/** Bottom-left entry of the navigation, as in ChatGPT Desktop (FR-SET-001; SET-Q1). */
export function SettingsEntry() {
  const open = useSettings((state) => state.openDialog)
  return <button className="navigation__view settings-entry" onClick={open}><Icon name="settings" /><span>{T.entry}</span></button>
}

/**
 * Registers the navigation entry and settings events once, before the first
 * render. `ready` settles when the saved appearance is applied to <html>.
 */
export function installSettingsIntegration(): { ready: Promise<void>; dispose(): void } {
  const unregister = registerShellIntegration({ NavigationFooter: SettingsEntry })
  const unwatch = useSettings.getState().watchEvents()
  return { ready: useSettings.getState().load(), dispose: () => { unwatch(); unregister() } }
}
