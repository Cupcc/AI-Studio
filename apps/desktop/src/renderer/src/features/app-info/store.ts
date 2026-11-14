// Settings › 关于: application info and the update state owned by the main process (specs/settings/spec.md "关于与更新").
import { create } from 'zustand'
import type { AppInfo } from '@shared/ipc/app'
import type { UpdateState } from '@shared/ipc/updates'
import { ipcErrorText } from '../../lib/ipc-error'
import { studio } from '../../lib/studio'

export interface AboutState {
  info: AppInfo | null
  infoFailed: boolean
  update: UpdateState | null
  /** Error of the last action started here (check, restart, toggle); the state's own error covers the rest. */
  actionError: string | null
  load(): Promise<void>
  /** Follows update changes; `onAboutRequested` runs for the menu bar "检查更新…". */
  watch(onAboutRequested: () => void): () => void
  check(): Promise<void>
  restartToUpdate(): Promise<void>
  setAutomatic(enabled: boolean): Promise<void>
}

export const useAbout = create<AboutState>()((set) => {
  const act = async (action: () => Promise<UpdateState>) => {
    set({ actionError: null })
    try { set({ update: await action() }) } catch (error) { set({ actionError: ipcErrorText(error) }) }
  }
  return {
    info: null,
    infoFailed: false,
    update: null,
    actionError: null,
    async load() {
      const [info, update] = await Promise.allSettled([studio().app.getInfo(), studio().updates.getState()])
      set({
        info: info.status === 'fulfilled' ? info.value : null,
        infoFailed: info.status === 'rejected',
        ...(update.status === 'fulfilled' ? { update: update.value } : {})
      })
    },
    watch(onAboutRequested) {
      const off = [
        studio().updates.onStateChanged(update => set({ update })),
        studio().updates.onAboutRequested(onAboutRequested)
      ]
      return () => off.forEach(unsubscribe => unsubscribe())
    },
    check: () => act(() => studio().updates.check()),
    restartToUpdate: () => act(() => studio().updates.restartToUpdate()),
    setAutomatic: (enabled) => act(() => studio().updates.setAutomatic({ enabled }))
  }
})

/** Navigation badge: a newer release is known (and not blocked by an error-free download in progress). */
export function updateBadge(update: UpdateState | null): 'available' | 'ready' | null {
  if (!update?.release) return null
  if (update.phase === 'ready') return 'ready'
  return update.phase === 'available' || update.phase === 'downloading' || update.phase === 'error' ? 'available' : null
}

/** Plain-text block for bug reports. */
export function versionReport(info: AppInfo): string {
  return [
    `${info.name} ${info.version}${info.isPackaged ? '' : ' (development)'}`,
    info.build.commit ? `Build: ${info.build.commit}${info.build.date ? ` (${info.build.date})` : ''}` : null,
    `Electron ${info.versions.electron} · Chromium ${info.versions.chrome} · Node.js ${info.versions.node}`,
    `macOS ${info.osVersion} (${info.arch})`
  ].filter(Boolean).join('\n')
}
