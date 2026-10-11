import { COMPONENTS, type Json, type KnowledgeDocument, type ViewDefinition, type ViewNode } from './types'

export const MAX_FILE_BYTES = 256 * 1024
export const MAX_NODES = 500
const forbidden = new Set(['__proto__', 'prototype', 'constructor', 'script', 'html', 'style', 'css', 'onClick', 'onload'])
const segment = /^[a-zA-Z0-9_-]+$/
export function isSafeRelativePath(path: string): boolean {
  return !!path && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') &&
    !/[\u0000-\u001f]/.test(path) && !path.split('/').some(part => part === '..' || part === '')
}
function fail(message: string): never { throw new Error(message) }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected JSON object')
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Unsupported field')
}
function json(value: unknown, depth = 0, field = ''): void {
  if (depth > 32) fail('Data nesting exceeds limit')
  if (typeof value === 'string') {
    if (/^(path|file|codePath|configPath|sourcePath)$/i.test(field) && !isSafeRelativePath(value)) fail('Path must stay inside Project')
    return
  }
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return
  if (Array.isArray(value)) { value.forEach(item => json(item, depth + 1, field)); return }
  for (const [key, item] of Object.entries(record(value))) {
    if (forbidden.has(key) || /^on[A-Z]/.test(key)) fail('Executable or unsafe field is not allowed')
    json(item, depth + 1, key)
  }
}
export function parseKnowledge(value: unknown, viewId: string): KnowledgeDocument {
  const doc = record(value)
  keys(doc, ['schemaVersion', 'viewId', 'data', 'example'])
  if (doc.schemaVersion !== 1) fail('Unsupported schemaVersion')
  if (doc.viewId !== viewId) fail('viewId does not match file')
  if (doc.example !== undefined && typeof doc.example !== 'boolean') fail('Invalid example flag')
  record(doc.data); json(doc.data)
  return doc as unknown as KnowledgeDocument
}
export function parseDefinition(value: unknown, viewId: string): ViewDefinition {
  const doc = record(value)
  keys(doc, ['schemaVersion', 'viewId', 'root', 'bindings'])
  if (doc.schemaVersion !== 1) fail('Unsupported schemaVersion')
  if (doc.viewId !== viewId) fail('viewId does not match file')
  const bindings = record(doc.bindings)
  for (const [name, path] of Object.entries(bindings)) {
    if (!segment.test(name) || forbidden.has(name) || typeof path !== 'string' ||
      !path.startsWith('data.') || path.split('.').some(part => !segment.test(part) || forbidden.has(part))) fail('Invalid Knowledge binding')
  }
  let count = 0
  function node(value: unknown, depth: number): void {
    if (++count > MAX_NODES || depth > 32) fail('Component tree exceeds limit')
    const item = record(value)
    keys(item, ['type', 'bind', 'props', 'children'])
    if (!COMPONENTS.includes(item.type as ViewNode['type'])) fail('Unknown component')
    if (item.bind !== undefined && (typeof item.bind !== 'string' || !Object.hasOwn(bindings, item.bind))) fail('Unknown binding')
    if (item.props !== undefined) {
      const props = record(item.props)
      keys(props, ['title', 'variant', 'direction', 'columns'])
      if (props.title !== undefined && (typeof props.title !== 'string' || props.title.length > 160 || /[<>]/.test(props.title))) fail('Invalid component title')
      if (props.variant !== undefined && (typeof props.variant !== 'string' || !['default', 'muted', 'accent'].includes(props.variant))) fail('Invalid variant')
      if (props.direction !== undefined && (typeof props.direction !== 'string' || !['horizontal', 'vertical'].includes(props.direction))) fail('Invalid direction')
      if (props.columns !== undefined && (!Array.isArray(props.columns) || props.columns.length > 20 || props.columns.some(col => typeof col !== 'string' || !segment.test(col) || forbidden.has(col)))) fail('Invalid columns')
    }
    if (item.children !== undefined) {
      if (!Array.isArray(item.children)) fail('Invalid children')
      item.children.forEach(child => node(child, depth + 1))
    }
  }
  node(doc.root, 0)
  return doc as unknown as ViewDefinition
}
export function bindingValue(knowledge: KnowledgeDocument | null, definition: ViewDefinition, node: ViewNode): Json | undefined {
  if (!knowledge || !node.bind) return undefined
  const path = definition.bindings[node.bind]
  if (!path) return undefined
  let current: unknown = knowledge
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current as Json
}
export function hasContent(value: Json | undefined): boolean {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.some(hasContent)
  if (typeof value === 'object') return Object.values(value).some(hasContent)
  return true
}
export function hasRenderableContent(knowledge: KnowledgeDocument | null, definition: ViewDefinition): boolean {
  function visit(node: ViewNode): boolean {
    return hasContent(bindingValue(knowledge, definition, node)) || !!node.children?.some(visit)
  }
  return visit(definition.root)
}

/** Validate bound diagram payloads before publishing; never silently truncate nodes. */
export function validateBoundContent(knowledge: KnowledgeDocument | null, definition: ViewDefinition): void {
  function visit(node: ViewNode): void {
    const value = bindingValue(knowledge, definition, node)
    if (node.type === 'diagram' && value && typeof value === 'object' && !Array.isArray(value)) {
      if (Array.isArray(value.nodes) && value.nodes.length > MAX_NODES) fail('Diagram exceeds 500 nodes')
    }
    node.children?.forEach(visit)
  }
  visit(definition.root)
}
