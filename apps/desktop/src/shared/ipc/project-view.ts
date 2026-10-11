import { defineContract, event, invoke } from './contract'
import type { ViewCatalogEntry, ViewContext, ViewState } from '../project-view/types'
export interface ViewRef { projectId: string; viewId: string }
export const projectViewContract = defineContract('projectView', {
  invoke: {
    list: invoke<{ projectId: string }, readonly ViewCatalogEntry[]>('projectView:list'),
    getSnapshot: invoke<ViewRef, ViewState>('projectView:get-snapshot'),
    getContext: invoke<ViewRef, ViewContext>('projectView:get-context')
  },
  events: {
    snapshotChanged: event<ViewState>('projectView:snapshot-changed'),
    error: event<ViewState>('projectView:error')
  }
})
