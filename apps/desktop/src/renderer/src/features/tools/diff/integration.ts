import { useProjectShell } from '../../project/store'
import { diffApi } from './api'
import { useDiff } from './diff-store'

/**
 * Routes the service events into the store and forgets a Project when its tab closes. The events arrive only for
 * Projects whose panel holds a subscription, so this stays cheap while Diff is not open. Returns the uninstaller.
 */
export function installDiffIntegration(): () => void {
  const api = diffApi()
  const unsubscribeInvalidated = api.onInvalidated(event => useDiff.getState().handleInvalidated(event))
  const unsubscribeWatch = api.onWatchChanged(event => useDiff.getState().handleWatchChanged(event))
  const unsubscribeTabs = useProjectShell.subscribe((state, previous) => {
    const open = new Set(state.windowState.tabs.filter(tab => tab.kind === 'project').map(tab => tab.projectId))
    for (const tab of previous.windowState.tabs) if (tab.kind === 'project' && !open.has(tab.projectId)) useDiff.getState().forget(tab.projectId)
  })
  return () => { unsubscribeInvalidated(); unsubscribeWatch(); unsubscribeTabs() }
}
