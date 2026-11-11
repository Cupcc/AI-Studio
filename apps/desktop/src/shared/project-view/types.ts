import { PRESET_WORKBENCHES } from '../workbench/presets'

export const VIEW_CATALOG = PRESET_WORKBENCHES.map((entry, order) => ({ id: entry.viewId, title: entry.title, kind: 'builtin', order } as const))
export type ViewCatalogEntry = typeof VIEW_CATALOG[number]
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
