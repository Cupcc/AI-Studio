export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export const WORKBENCH_CAPABILITIES = ['state.read', 'state.write', 'conversation.draft'] as const
export type WorkbenchCapability = typeof WORKBENCH_CAPABILITIES[number]

export interface PluginManifest {
  schemaVersion: 1
  pluginId: string
  version: string
  sdkVersion: 1
  title: string
  entry: string
  capabilities: WorkbenchCapability[]
}

export type WorkbenchTarget = { projectId: string; kind: 'draft'; id: string } | { projectId: string; kind: 'instance'; id: string }
export type WorkbenchViewId = `workbench:${string}` | `workbench-draft:${string}`

export function isWorkbenchViewId(value: unknown): value is WorkbenchViewId {
  return typeof value === 'string' && /^workbench(?:-draft)?:[a-zA-Z0-9-]{1,100}$/.test(value)
}

export function workbenchViewId(target: Pick<WorkbenchTarget, 'kind' | 'id'>): WorkbenchViewId {
  return target.kind === 'draft' ? `workbench-draft:${target.id}` : `workbench:${target.id}`
}

export function workbenchTarget(projectId: string, viewId: WorkbenchViewId): WorkbenchTarget {
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
  enabled: boolean
}

export interface WorkbenchCatalog {
  instances: WorkbenchInstance[]
  drafts: WorkbenchDraft[]
}

export interface WorkbenchSnapshot {
  target: WorkbenchTarget
  manifest: PluginManifest
  packageRevision: string
  state: JsonValue
  stateRevision: number
  pageUrl: string
  enabled: boolean
}

/** These methods are bound to one mounted page; pages never choose an instance ID. */
export interface WorkbenchPageApi {
  getInstance(): Promise<WorkbenchSnapshot>
  updateState(state: JsonValue, expectedRevision: number): Promise<WorkbenchSnapshot>
  subscribe(listener: (snapshot: WorkbenchSnapshot) => void): () => void
  setDraft(text: string): Promise<void>
}

export const WORKBENCH_MESSAGE = 'ai-studio-workbench-v1'
