export const VIEW_CATALOG = [
  { id: 'overview', title: 'Overview', kind: 'builtin', order: 0 },
  { id: 'progress', title: 'Progress', kind: 'builtin', order: 1 },
  { id: 'architecture', title: 'Architecture', kind: 'builtin', order: 2 },
  { id: 'agent-team', title: 'Agent Team', kind: 'builtin', order: 3 },
  { id: 'business-flow', title: 'Business Flow', kind: 'builtin', order: 4 }
] as const
export type ViewCatalogEntry = { id: string; title: string; kind: 'builtin' | 'custom'; order: number }
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface KnowledgeDocument { schemaVersion: 1; viewId: string; data: Record<string, Json>; example?: boolean }
export const COMPONENTS = ['stack', 'grid', 'section', 'text', 'metric', 'badge', 'list', 'table', 'timeline', 'diagram', 'callout', 'empty'] as const
export interface ViewNode {
  type: typeof COMPONENTS[number]
  bind?: string
  props?: { title?: string; variant?: 'default' | 'muted' | 'accent'; direction?: 'horizontal' | 'vertical'; columns?: string[] }
  children?: ViewNode[]
}
export interface ViewDefinition { schemaVersion: 1; viewId: string; root: ViewNode; bindings: Record<string, string> }
export interface ViewSnapshot {
  projectId: string; viewId: string; catalog: ViewCatalogEntry
  knowledge: KnowledgeDocument | null; definition: ViewDefinition
  revision: number; updatedAt: number
}
export interface ViewState {
  projectId: string; viewId: string; revision: number
  status: 'empty' | 'loading' | 'ready' | 'stale' | 'error'
  snapshot: ViewSnapshot | null
  error: string | null
}
export interface ViewContext { originViewId: string; paths: string[]; text: string }
