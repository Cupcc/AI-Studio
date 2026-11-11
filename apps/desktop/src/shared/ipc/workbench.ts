import { defineContract, event, invoke } from './contract'
import type { DraftWorkbenchRef, InstanceWorkbenchRef, JsonValue, CustomDraftEntry, CustomInstanceEntry, CustomWorkbenchRef, WorkbenchSnapshot, WorkbenchCatalog, WorkbenchChange, WorkbenchContext, WorkbenchRef } from '../workbench/types'

export const workbenchContract = defineContract('workbench', {
  invoke: {
    list: invoke<{ projectId: string }, WorkbenchCatalog>('workbench:list'),
    createDraft: invoke<{ projectId: string; source: 'template' | 'ai'; instanceId?: string }, CustomDraftEntry>('workbench:create-draft'),
    getSnapshot: invoke<WorkbenchRef, WorkbenchSnapshot>('workbench:get-snapshot'),
    getContext: invoke<WorkbenchRef, WorkbenchContext>('workbench:get-context'),
    applyDraft: invoke<{ ref: DraftWorkbenchRef; expectedPackageRevision: string }, CustomInstanceEntry>('workbench:apply-draft'),
    updateState: invoke<{ ref: CustomWorkbenchRef; state: JsonValue; expectedRevision: number }, WorkbenchSnapshot>('workbench:update-state'),
    setEnabled: invoke<{ ref: InstanceWorkbenchRef; enabled: boolean }, CustomInstanceEntry>('workbench:set-enabled')
  },
  events: { changed: event<WorkbenchChange>('workbench:changed') }
})
