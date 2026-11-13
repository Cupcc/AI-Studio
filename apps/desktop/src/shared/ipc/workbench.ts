import type { ConversationPage } from '../session/types'
import type { WorkbenchAgentRequest, WorkbenchAgentRun } from '../workbench/types'
import { defineContract, event, invoke } from './contract'
import type { DraftWorkbenchRef, InstanceWorkbenchRef, JsonValue, CustomDraftEntry, CustomInstanceEntry, CustomWorkbenchRef, WorkbenchSnapshot, WorkbenchCatalog, WorkbenchChange, WorkbenchContext, WorkbenchRef, WorkbenchId } from '../workbench/types'

export const workbenchContract = defineContract('workbench', {
  invoke: {
    startAgent: invoke<{ ref: InstanceWorkbenchRef; request: WorkbenchAgentRequest }, WorkbenchAgentRun>('workbench:start-agent'),
    listAgents: invoke<InstanceWorkbenchRef, WorkbenchAgentRun[]>('workbench:list-agents'),
    getAgent: invoke<{ ref: InstanceWorkbenchRef; runId: string }, ConversationPage>('workbench:get-agent'),
    stopAgent: invoke<{ ref: InstanceWorkbenchRef; runId: string }, void>('workbench:stop-agent'),
    list: invoke<{ projectId: string }, WorkbenchCatalog>('workbench:list'),
    listRemoved: invoke<{ projectId: string }, WorkbenchCatalog>('workbench:list-removed'),
    rename: invoke<{ ref: WorkbenchRef; title: string }, WorkbenchCatalog>('workbench:rename'),
    move: invoke<{ ref: WorkbenchRef; before: WorkbenchId | null }, WorkbenchCatalog>('workbench:move'),
    setVisible: invoke<{ ref: WorkbenchRef; visible: boolean }, WorkbenchCatalog>('workbench:set-visible'),
    deleteDraft: invoke<DraftWorkbenchRef, WorkbenchCatalog>('workbench:delete-draft'),
    deleteInstance: invoke<InstanceWorkbenchRef, WorkbenchCatalog>('workbench:delete-instance'),
    addTemplate: invoke<{ projectId: string; templateId: 'product-selection' }, CustomInstanceEntry>('workbench:add-template'),
    createDraft: invoke<{ projectId: string; source: 'template' | 'ai'; instanceId?: string; templateId?: 'product-selection' }, CustomDraftEntry>('workbench:create-draft'),
    getSnapshot: invoke<WorkbenchRef, WorkbenchSnapshot>('workbench:get-snapshot'),
    getContext: invoke<WorkbenchRef, WorkbenchContext>('workbench:get-context'),
    applyDraft: invoke<{ ref: DraftWorkbenchRef; expectedPackageRevision: string }, CustomInstanceEntry>('workbench:apply-draft'),
    updateState: invoke<{ ref: CustomWorkbenchRef; state: JsonValue; expectedRevision: number }, WorkbenchSnapshot>('workbench:update-state')
  },
  events: { changed: event<WorkbenchChange>('workbench:changed') }
})
