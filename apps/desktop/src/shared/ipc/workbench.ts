import { defineContract, event, invoke } from './contract'
import type { JsonValue, WorkbenchCatalog, WorkbenchDraft, WorkbenchInstance, WorkbenchSnapshot, WorkbenchTarget } from '../workbench/types'

export const workbenchContract = defineContract('workbench', {
  invoke: {
    list: invoke<{ projectId: string }, WorkbenchCatalog>('workbench:list'),
    createDraft: invoke<{ projectId: string; source: 'template' | 'ai'; instanceId?: string }, WorkbenchDraft>('workbench:create-draft'),
    getSnapshot: invoke<WorkbenchTarget, WorkbenchSnapshot>('workbench:get-snapshot'),
    applyDraft: invoke<{ projectId: string; draftId: string; expectedPackageRevision: string }, WorkbenchInstance>('workbench:apply-draft'),
    updateState: invoke<{ target: WorkbenchTarget; state: JsonValue; expectedRevision: number }, WorkbenchSnapshot>('workbench:update-state'),
    setEnabled: invoke<{ projectId: string; instanceId: string; enabled: boolean }, WorkbenchInstance>('workbench:set-enabled')
  },
  events: { changed: event<{ projectId: string; target: WorkbenchTarget }>('workbench:changed') }
})
