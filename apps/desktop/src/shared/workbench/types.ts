export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

import type { ViewState } from '../project-view/types'
import type { SessionSummary, ConversationPage } from '../session/types'
import { isPresetWorkbenchId, type PresetWorkbenchEntry, type PresetWorkbenchId } from './presets'

export const WORKBENCH_CAPABILITIES = ['state.read', 'state.write', 'conversation.draft', 'project.knowledge.read', 'project.sessions.read', 'session.open', 'agent.execute'] as const
export type WorkbenchCapability = typeof WORKBENCH_CAPABILITIES[number]

export interface PluginManifest {
  schemaVersion: 1
  pluginId: string
  version: string
  sdkVersion: 1
  title: string
  entry: string
  capabilities: WorkbenchCapability[]
  knowledgeViewId?: PresetWorkbenchId
}

export type WorkbenchTarget = { projectId: string; kind: 'draft'; id: string } | { projectId: string; kind: 'instance'; id: string }
export type InstanceWorkbenchId = `workbench:${string}`
export type DraftWorkbenchId = `workbench-draft:${string}`
export type CustomWorkbenchId = InstanceWorkbenchId | DraftWorkbenchId
export type WorkbenchId = PresetWorkbenchId | CustomWorkbenchId

export function isCustomWorkbenchId(value: unknown): value is CustomWorkbenchId {
  return typeof value === 'string' && /^workbench(?:-draft)?:[a-zA-Z0-9-]{1,100}$/.test(value)
}

export function isWorkbenchId(value: unknown): value is WorkbenchId {
  return isPresetWorkbenchId(value) || isCustomWorkbenchId(value)
}

export function workbenchViewId(target: Pick<WorkbenchTarget, 'kind' | 'id'>): CustomWorkbenchId {
  return target.kind === 'draft' ? `workbench-draft:${target.id}` : `workbench:${target.id}`
}

export function workbenchTarget(projectId: string, viewId: WorkbenchId): WorkbenchTarget {
  if (isPresetWorkbenchId(viewId)) return { projectId, kind: 'instance', id: viewId }
  return { projectId, kind: viewId.startsWith('workbench-draft:') ? 'draft' : 'instance', id: viewId.slice(viewId.indexOf(':') + 1) }
}

export interface WorkbenchDraft {
  id: string
  projectId: string
  source: 'template' | 'ai'
  targetInstanceId: string | null
  directory: string
  title: string
}

export interface WorkbenchInstance {
  id: string
  projectId: string
  pluginId: string
  packageRevision: string
  title: string
}

/** SDK 1 page payload. The host envelope is separate from this stable page contract. */
export interface WorkbenchPageSnapshot {
  target: WorkbenchTarget
  manifest: PluginManifest
  packageRevision: string
  state: JsonValue
  stateRevision: number
  pageUrl: string
  resources?: WorkbenchPageResources
  appearance?: { dark: boolean; variables: Record<string, string> }
}

export type WorkbenchSessionLink = Pick<SessionSummary, 'id' | 'title' | 'activity' | 'status' | 'lastOutcome' | 'updatedAt' | 'lastUserMessageAt' | 'createdAt'>
export interface WorkbenchPageResources {
  knowledge?: ViewState
  sessions?: WorkbenchSessionLink[]
}

/** These methods are bound to one mounted page; pages never choose an instance ID. */
export interface WorkbenchPageApi {
  getInstance(): Promise<WorkbenchPageSnapshot>
  updateState(state: JsonValue, expectedRevision: number): Promise<WorkbenchPageSnapshot>
  subscribe(listener: (snapshot: WorkbenchPageSnapshot) => void): () => void
  setDraft(text: string, options?: { target: 'current' | 'new' }): Promise<void>
  openSession(sessionId: string): Promise<void>
  startAgent(request: WorkbenchAgentRequest): Promise<WorkbenchAgentRun>
  listAgents(): Promise<WorkbenchAgentRun[]>
  getAgent(runId: string): Promise<ConversationPage>
  stopAgent(runId: string): Promise<void>
}

export interface WorkbenchAgentRequest {
  requestId: string
  key: string
  title: string
  text: string
  model: string | null
}
export interface WorkbenchAgentRun {
  request: WorkbenchAgentRequest
  session: SessionSummary
}

export const WORKBENCH_MESSAGE = 'ai-studio-workbench-v1'


export interface WorkbenchRef { projectId: string; viewId: WorkbenchId }
export interface CustomWorkbenchRef extends WorkbenchRef { viewId: CustomWorkbenchId }
export interface PresetWorkbenchRef extends WorkbenchRef { viewId: PresetWorkbenchId }
export interface InstanceWorkbenchRef extends CustomWorkbenchRef { viewId: InstanceWorkbenchId }
export interface DraftWorkbenchRef extends CustomWorkbenchRef { viewId: DraftWorkbenchId }

export interface CustomInstanceEntry extends WorkbenchInstance {
  viewId: InstanceWorkbenchId
  origin: 'custom'
  kind: 'instance'
  icon: 'preview'
  editable: true
}
export interface CustomDraftEntry extends WorkbenchDraft {
  viewId: DraftWorkbenchId
  origin: 'custom'
  kind: 'draft'
  icon: 'pencil'
  editable: true
}
export type CustomWorkbenchEntry = CustomInstanceEntry | CustomDraftEntry
export type WorkbenchEntry = PresetWorkbenchEntry | CustomWorkbenchEntry
export type WorkbenchCatalog = readonly WorkbenchEntry[]

export interface WorkbenchSnapshot {
  ref: WorkbenchRef
  entry: WorkbenchEntry
  /** Host read/event ordering, independent of the page's stateRevision CAS token. */
  revision: number
  status: 'ready' | 'error'
  error: string | null
  page: WorkbenchPageSnapshot | null
}
export interface WorkbenchContext { originViewId: WorkbenchId; paths: string[]; text: string }
export type WorkbenchChange =
  | { kind: 'catalog'; projectId: string }
  | { kind: 'snapshot'; snapshot: WorkbenchSnapshot }
