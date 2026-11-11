import { isWorkbenchId, isCustomWorkbenchId, WORKBENCH_CAPABILITIES, type DraftWorkbenchRef, type InstanceWorkbenchRef, type JsonValue, type PluginManifest, type CustomWorkbenchRef, type WorkbenchCapability, type WorkbenchRef, type WorkbenchTarget } from './types'
import { isPresetWorkbenchId } from './presets'

export const MAX_STATE_BYTES = 1024 * 1024

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} 必须是对象`)
  return Object.fromEntries(Object.entries(value))
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label} 必须是 1–${maximum} 个字符`)
  return value
}

export function packagePath(value: unknown): string {
  const path = text(value, '包内路径', 512)
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => !part || part === '.' || part === '..') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) throw new Error('路径必须位于插件包内，不能包含 .. 或绝对路径')
  return path
}

export function parseManifest(value: unknown): PluginManifest {
  const input = record(value, 'manifest.json')
  const keys = ['schemaVersion', 'pluginId', 'version', 'sdkVersion', 'title', 'entry', 'capabilities', 'knowledgeViewId']
  for (const key of Object.keys(input)) if (!keys.includes(key)) throw new Error(`manifest.json 不支持字段 ${key}`)
  if (input.schemaVersion !== 1) throw new Error('manifest.json 的 schemaVersion 必须为 1')
  if (input.sdkVersion !== 1) throw new Error('不支持此 SDK 版本，请使用 sdkVersion: 1')
  const pluginId = text(input.pluginId, 'pluginId', 80)
  if (!/^[a-z][a-z0-9-]*$/.test(pluginId)) throw new Error('pluginId 必须以小写字母开头，只含小写字母、数字和连字符')
  const version = text(input.version, 'version', 64)
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw new Error('version 请使用例如 1.0.0 的版本号')
  const title = text(input.title, 'title', 80)
  const entry = packagePath(input.entry)
  if (!/\.html?$/i.test(entry)) throw new Error('entry 必须指向包内 HTML 文件')
  if (!Array.isArray(input.capabilities)) throw new Error('capabilities 必须是数组')
  const capabilities: WorkbenchCapability[] = []
  for (const capability of input.capabilities) {
    const known = WORKBENCH_CAPABILITIES.find(item => item === capability)
    if (!known) throw new Error(`不支持能力 ${String(capability)}；可用能力：${WORKBENCH_CAPABILITIES.join(', ')}`)
    if (capabilities.includes(known)) throw new Error(`重复能力 ${known}`)
    capabilities.push(known)
  }
  const knowledgeViewId = input.knowledgeViewId
  if (knowledgeViewId !== undefined && !isPresetWorkbenchId(knowledgeViewId)) throw new Error('knowledgeViewId 必须指向受支持的项目知识')
  if (capabilities.includes('project.knowledge.read') !== (knowledgeViewId !== undefined)) throw new Error('project.knowledge.read 能力必须与 knowledgeViewId 一起声明')
  return { schemaVersion: 1, pluginId, version, sdkVersion: 1, title, entry, capabilities, ...(knowledgeViewId !== undefined ? { knowledgeViewId } : {}) }
}

export function parseJsonState(value: unknown): JsonValue {
  const ancestors = new Set<object>()
  function parse(current: unknown, depth: number): JsonValue {
    if (depth > 64) throw new Error('状态嵌套过深')
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current
    if (typeof current === 'number' && Number.isFinite(current)) return current
    if (typeof current !== 'object' || current === null || ancestors.has(current)) throw new Error('状态必须是有限、无循环的 JSON 值')
    if (!Array.isArray(current) && Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) throw new Error('状态只支持普通 JSON 对象，不能保存 Date、Map 或其他对象')
    ancestors.add(current)
    const parsed = Array.isArray(current)
      ? current.map(item => parse(item, depth + 1))
      : Object.fromEntries(Object.entries(current).map(([key, item]) => [key, parse(item, depth + 1)]))
    ancestors.delete(current)
    return parsed
  }
  const state = parse(value, 0)
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_STATE_BYTES) throw new Error('工作台状态超过 1 MiB，请减少内容')
  return state
}

export function parseTarget(value: unknown): WorkbenchTarget {
  const input = record(value, '工作台目标')
  for (const key of Object.keys(input)) if (!['projectId', 'kind', 'id'].includes(key)) throw new Error(`不支持字段 ${key}`)
  const projectId = text(input.projectId, 'projectId', 100)
  const id = text(input.id, 'id', 100)
  if (!/^[a-zA-Z0-9-]+$/.test(projectId) || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('工作台标识无效')
  if (input.kind !== 'draft' && input.kind !== 'instance') throw new Error('工作台目标必须是 draft 或 instance')
  return { projectId, kind: input.kind, id }
}

export function parseWorkbenchRef(value: unknown): WorkbenchRef {
  const input = record(value, '工作台引用')
  for (const key of Object.keys(input)) if (!['projectId', 'viewId'].includes(key)) throw new Error(`不支持字段 ${key}`)
  const projectId = text(input.projectId, 'projectId', 100)
  if (!/^[a-zA-Z0-9-]+$/.test(projectId) || !isWorkbenchId(input.viewId)) throw new Error('工作台引用无效')
  return { projectId, viewId: input.viewId }
}

export function parseCustomWorkbenchRef(value: unknown): CustomWorkbenchRef {
  const ref = parseWorkbenchRef(value)
  if (!isCustomWorkbenchId(ref.viewId)) throw new Error('此操作只适用于自定义工作台')
  return { projectId: ref.projectId, viewId: ref.viewId }
}

export function parseDraftWorkbenchRef(value: unknown): DraftWorkbenchRef {
  const ref = parseCustomWorkbenchRef(value)
  if (!ref.viewId.startsWith('workbench-draft:')) throw new Error('此操作需要工作台设计草稿')
  return { projectId: ref.projectId, viewId: `workbench-draft:${ref.viewId.slice('workbench-draft:'.length)}` }
}

export function parseInstanceWorkbenchRef(value: unknown): InstanceWorkbenchRef {
  const ref = parseCustomWorkbenchRef(value)
  if (!ref.viewId.startsWith('workbench:')) throw new Error('此操作需要已添加的工作台实例')
  return { projectId: ref.projectId, viewId: `workbench:${ref.viewId.slice('workbench:'.length)}` }
}
