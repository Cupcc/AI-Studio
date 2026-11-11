import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { packagePath, parseJsonState, parseTarget } from '@shared/workbench/schema'
import { isWorkbenchId, workbenchTarget, type JsonValue, type WorkbenchDraft, type WorkbenchInstance, type WorkbenchPageSnapshot, type WorkbenchTarget } from '@shared/workbench/types'
import type { WorkbenchContext } from '@shared/workbench/types'
import { isPresetWorkbenchId, presetWorkbench } from '@shared/workbench/presets'
import manifestSchema from '@shared/workbench/resources/manifest.schema.json'
import { AUTHORING_GUIDE } from '@shared/workbench/resources/guide'
import { PAGE_SDK, SDK_TYPES } from '@shared/workbench/resources/sdk'
import { TEMPLATE_HTML } from '@shared/workbench/resources/template'
import { assertInside, readPackage, writePackage, type PackageFiles } from './package'

interface InstanceRow {
  id: string; project_id: string; plugin_id: string; package_revision: string; title: string
  enabled: number; state: string; state_revision: number
}
interface DraftRow {
  id: string; project_id: string; source: 'template' | 'ai'; target_instance_id: string | null
  base_package_revision: string | null; directory: string; title: string; state: string; state_revision: number
}
function columnText(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new Error(`工作台记录损坏：${key}`)
  return value
}
function columnNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`工作台记录损坏：${key}`)
  return value
}
function storedInstance(row: Record<string, unknown>): InstanceRow {
  return { id: columnText(row, 'id'), project_id: columnText(row, 'project_id'), plugin_id: columnText(row, 'plugin_id'), package_revision: columnText(row, 'package_revision'), title: columnText(row, 'title'), enabled: columnNumber(row, 'enabled'), state: columnText(row, 'state'), state_revision: columnNumber(row, 'state_revision') }
}
function storedDraft(row: Record<string, unknown>): DraftRow {
  const source = row.source
  if (source !== 'template' && source !== 'ai') throw new Error('工作台草稿来源损坏')
  return { id: columnText(row, 'id'), project_id: columnText(row, 'project_id'), source, target_instance_id: row.target_instance_id === null ? null : columnText(row, 'target_instance_id'), base_package_revision: row.base_package_revision === null ? null : columnText(row, 'base_package_revision'), directory: columnText(row, 'directory'), title: columnText(row, 'title'), state: columnText(row, 'state'), state_revision: columnNumber(row, 'state_revision') }
}
export interface PackageRuntimeOptions {
  database(): DatabaseSync
  presetRoot: string
  projectPath(projectId: string): string
  changed(target: WorkbenchTarget, catalog: boolean, snapshot?: WorkbenchPageSnapshot): void
}
const ROOT = '.ai-studio/workbench'
const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8'
}
function instance(row: InstanceRow): WorkbenchInstance {
  return { id: row.id, projectId: row.project_id, pluginId: row.plugin_id, packageRevision: row.package_revision, title: row.title, enabled: row.enabled === 1 }
}
function draft(row: DraftRow): WorkbenchDraft {
  return { id: row.id, projectId: row.project_id, source: row.source, targetInstanceId: row.target_instance_id, directory: row.directory, title: row.title }
}

export class PackageRuntime {
  constructor(private readonly options: PackageRuntimeOptions) {}
  private db() { return this.options.database() }
  private root(projectId: string) { return this.options.projectPath(projectId) }
  private draftRow(projectId: string, id: string): DraftRow {
    this.root(projectId)
    const row = this.db().prepare('SELECT * FROM workbench_drafts WHERE id=? AND project_id=?').get(id, projectId)
    if (!row) throw new Error('找不到当前 Project 的工作台草稿，请从导航重新打开')
    return storedDraft(row)
  }
  private instanceRow(projectId: string, id: string): InstanceRow {
    this.root(projectId)
    const row = this.db().prepare('SELECT * FROM workbench_instances WHERE id=? AND project_id=?').get(id, projectId)
    if (!row) throw new Error('找不到当前 Project 的工作台实例，请从导航重新打开')
    return storedInstance(row)
  }
  list(projectId: string): { instances: WorkbenchInstance[]; drafts: WorkbenchDraft[] } {
    this.root(projectId)
    const instances = this.db().prepare('SELECT * FROM workbench_instances WHERE project_id=? ORDER BY created_at,id').all(projectId)
    const drafts = this.db().prepare('SELECT * FROM workbench_drafts WHERE project_id=? ORDER BY created_at,id').all(projectId)
    return { instances: instances.map(row => instance(storedInstance(row))), drafts: drafts.map(row => draft(storedDraft(row))) }
  }
  describe(target: WorkbenchTarget): { kind: 'draft'; draft: WorkbenchDraft } | { kind: 'instance'; instance: WorkbenchInstance } {
    return target.kind === 'draft'
      ? { kind: 'draft', draft: draft(this.draftRow(target.projectId, target.id)) }
      : { kind: 'instance', instance: instance(this.instanceRow(target.projectId, target.id)) }
  }
  private writeDocs(projectId: string): void {
    const root = this.root(projectId), folder = join(root, ROOT, 'sdk')
    assertInside(root, folder); mkdirSync(folder, { recursive: true })
    for (const [name, text] of Object.entries({ 'GUIDE.md': AUTHORING_GUIDE, 'sdk.d.ts': SDK_TYPES, 'manifest.schema.json': JSON.stringify(manifestSchema, null, 2), 'template.html': TEMPLATE_HTML })) {
      const path = join(folder, name); assertInside(root, path); writeFileSync(path, text)
    }
  }
  createDraft(projectId: string, source: 'template' | 'ai', instanceId?: string, templateId?: 'product-selection'): WorkbenchDraft {
    const root = this.root(projectId), id = randomUUID(), directory = `${ROOT}/drafts/${id}`
    const original = instanceId ? this.instanceRow(projectId, instanceId) : null
    const files = original ? readPackage(root, join(root, ROOT, 'packages', original.package_revision)).files : templateId ? readPackage(this.options.presetRoot, join(this.options.presetRoot, templateId)).files : new Map([
      ['manifest.json', Buffer.from(JSON.stringify({ schemaVersion: 1, pluginId: `workbench-${id}`, version: '1.0.0', sdkVersion: 1, title: source === 'ai' ? '新的工作台' : '随手记', entry: 'index.html', capabilities: ['state.read', 'state.write', 'conversation.draft'] }, null, 2))],
      ['index.html', Buffer.from(TEMPLATE_HTML)]
    ])
    this.writeDocs(projectId)
    writePackage(root, join(root, directory), files)
    try {
      this.db().prepare('INSERT INTO workbench_drafts(id,project_id,source,target_instance_id,base_package_revision,directory,title,state,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, projectId, source, instanceId ?? null, original?.package_revision ?? null, directory, original?.title ?? (templateId ? '选品工作台' : source === 'ai' ? '新的工作台' : '随手记'), original?.state ?? '{}', Date.now())
    } catch (error) { rmSync(join(root, directory), { recursive: true, force: true }); throw error }
    const target: WorkbenchTarget = { projectId, kind: 'draft', id }
    this.options.changed(target, true)
    return draft(this.draftRow(projectId, id))
  }
  private package(target: WorkbenchTarget): { row: DraftRow | InstanceRow | { state: string; state_revision: number; enabled: number }; package: PackageFiles } {
    this.root(target.projectId)
    if (target.kind === 'instance' && isPresetWorkbenchId(target.id)) {
      const pkg = readPackage(this.options.presetRoot, join(this.options.presetRoot, target.id))
      if (pkg.manifest.pluginId !== presetWorkbench(target.id).pluginId) throw new Error('App 工作台包标识不匹配，请重新构建应用')
      return { row: { state: '{}', state_revision: 0, enabled: 1 }, package: pkg }
    }
    const row = target.kind === 'draft' ? this.draftRow(target.projectId, target.id) : this.instanceRow(target.projectId, target.id)
    const directory = 'directory' in row ? row.directory : `${ROOT}/packages/${row.package_revision}`
    const pkg = readPackage(this.root(target.projectId), join(this.root(target.projectId), directory))
    if ('package_revision' in row && pkg.revision !== row.package_revision) throw new Error('已应用的包文件被外部修改，请从草稿重新预览并应用')
    return { row, package: pkg }
  }
  getSnapshot(target: WorkbenchTarget): WorkbenchPageSnapshot {
    const result = this.package(target)
    return this.snapshot(target, result.row, result.package)
  }
  private snapshot(target: WorkbenchTarget, row: { state: string; state_revision: number; enabled?: number }, pkg: PackageFiles): WorkbenchPageSnapshot {
    const pageUrl = `app://workbench/${target.projectId}/${target.kind}/${target.id}/${pkg.revision}/${pkg.manifest.entry.split('/').map(encodeURIComponent).join('/')}`
    return { target, manifest: pkg.manifest, packageRevision: pkg.revision, state: parseJsonState(JSON.parse(row.state)), stateRevision: row.state_revision, pageUrl, enabled: 'enabled' in row ? row.enabled === 1 : true }
  }
  applyDraft(projectId: string, draftId: string, expectedPackageRevision: string): WorkbenchInstance {
    const root = this.root(projectId), row = this.draftRow(projectId, draftId)
    const pkg = readPackage(root, join(root, row.directory))
    if (pkg.revision !== expectedPackageRevision) throw new Error('草稿已变化，请刷新预览并检查页面后再应用')
    const original = row.target_instance_id ? this.instanceRow(projectId, row.target_instance_id) : null
    if (original && original.package_revision !== row.base_package_revision) throw new Error('此工作台已应用其他版本，请从当前实例重新编辑，避免覆盖新版本')
    if (original && original.plugin_id !== pkg.manifest.pluginId) throw new Error('编辑工作台时不能修改 pluginId，请恢复原标识')
    const destination = join(root, ROOT, 'packages', pkg.revision)
    assertInside(root, destination)
    if (!existsSync(destination)) {
      const staging = `${destination}-${randomUUID()}`
      try { writePackage(root, staging, pkg.files); renameSync(staging, destination) }
      finally { rmSync(staging, { recursive: true, force: true }) }
    } else if (readPackage(root, destination).revision !== pkg.revision) throw new Error('已保存的包版本不完整，请修复包目录后重试')
    const id = original?.id ?? randomUUID()
    this.db().exec('SAVEPOINT workbench_apply')
    try {
      if (original) this.db().prepare('UPDATE workbench_instances SET package_revision=?, title=? WHERE id=? AND project_id=?').run(pkg.revision, pkg.manifest.title, id, projectId)
      else this.db().prepare('INSERT INTO workbench_instances(id,project_id,plugin_id,package_revision,title,state,created_at) VALUES (?,?,?,?,?,?,?)').run(id, projectId, pkg.manifest.pluginId, pkg.revision, pkg.manifest.title, row.state, Date.now())
      this.db().prepare('UPDATE workbench_drafts SET target_instance_id=?,base_package_revision=?,title=? WHERE id=?').run(id, pkg.revision, pkg.manifest.title, draftId)
      this.db().exec('RELEASE workbench_apply')
    } catch (error) { this.db().exec('ROLLBACK TO workbench_apply; RELEASE workbench_apply'); throw error }
    this.options.changed({ projectId, kind: 'draft', id: draftId }, true)
    this.options.changed({ projectId, kind: 'instance', id }, true)
    return instance(this.instanceRow(projectId, id))
  }
  updateState(target: WorkbenchTarget, state: JsonValue, expectedRevision: number): WorkbenchPageSnapshot {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('状态版本无效')
    const result = this.package(target)
    if ('enabled' in result.row && !result.row.enabled) throw new Error('工作台已停用，请先启用')
    if (!result.package.manifest.capabilities.includes('state.write')) throw new Error('此工作台未声明 state.write 能力')
    const encoded = JSON.stringify(parseJsonState(state))
    const table = target.kind === 'draft' ? 'workbench_drafts' : 'workbench_instances'
    const updated = this.db().prepare(`UPDATE ${table} SET state=?,state_revision=state_revision+1 WHERE id=? AND project_id=? AND state_revision=?`).run(encoded, target.id, target.projectId, expectedRevision)
    if (!updated.changes) throw new Error('工作台内容已变化，请重新读取后再保存')
    const snapshot = this.snapshot(target, { ...result.row, state: encoded, state_revision: expectedRevision + 1 }, result.package)
    this.options.changed(target, false, snapshot)
    return snapshot
  }
  setEnabled(projectId: string, instanceId: string, enabled: boolean): WorkbenchInstance {
    this.instanceRow(projectId, instanceId)
    this.db().prepare('UPDATE workbench_instances SET enabled=? WHERE id=? AND project_id=?').run(enabled ? 1 : 0, instanceId, projectId)
    this.options.changed({ projectId, kind: 'instance', id: instanceId }, true)
    return instance(this.instanceRow(projectId, instanceId))
  }
  deleteDraft(projectId: string, draftId: string): void {
    this.draftRow(projectId, draftId)
    this.db().prepare('DELETE FROM workbench_drafts WHERE project_id=? AND id=?').run(projectId, draftId)
  }
  buildContext(projectId: string, viewId: string): WorkbenchContext {
    if (!isWorkbenchId(viewId)) throw new Error('工作台 View 标识无效')
    const target = workbenchTarget(projectId, viewId)
    if (target.kind === 'draft') {
      const row = this.draftRow(projectId, target.id)
      this.writeDocs(projectId)
      const paths = [`${ROOT}/sdk/GUIDE.md`, `${ROOT}/sdk/manifest.schema.json`, `${ROOT}/sdk/sdk.d.ts`, `${ROOT}/sdk/template.html`, row.directory]
      return { originViewId: viewId, paths, text: `当前任务是创建或编辑 AI Studio 工作台页面。先读取 ${paths.slice(0, 3).join('、')}，参考 ${paths[3]}。只在草稿目录 ${row.directory} 中创建或修改插件包，入口由 manifest.json 指定。开发指南与宿主 SDK 1 对应，不要猜测接口。宿主“刷新预览”会检查包并显示错误，修正错误后让用户再次预览并实际操作；只有用户“添加至当前项目”或“应用更新”才生效。不要修改 packages、数据库或其他实例；不要自动安装依赖或启动模型任务。当前是草稿预览，不能宣称已添加或已验收。` }
    }
    const snapshot = this.getSnapshot(target)
    return { originViewId: viewId, paths: [], text: `当前工作台：${snapshot.manifest.title}；实例 ${target.id}；包版本 ${snapshot.manifest.version}；状态版本 ${snapshot.stateRevision}。当前已保存状态：${JSON.stringify(snapshot.state)}。这是工作台使用对话，不是页面结构编辑。不要改插件包、草稿、packages 或数据库；结构变化应由用户进入“编辑工作台”。SDK 1 不提供 AI 状态提交或图片产物通道，不能声称已写回内容。` }
  }
  async handleRequest(request: Request): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
    try {
      const url = new URL(request.url)
      if (url.protocol !== 'app:' || url.host !== 'workbench' || request.method !== 'GET') return new Response('Not found', { status: 404, headers })
      const parts = url.pathname.split('/').slice(1).map(decodeURIComponent)
      const [projectId, kind, id, revision, ...assets] = parts
      const target = parseTarget({ projectId, kind, id })
      const path = packagePath(assets.join('/'))
      const result = this.package(target)
      if ('enabled' in result.row && !result.row.enabled) return new Response('工作台已停用', { status: 403, headers })
      if (revision !== result.package.revision) return new Response('草稿已变化，请刷新预览', { status: 409, headers })
      if (path === '__studio_sdk.js') return new Response(PAGE_SDK, { headers: { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' } })
      const content = result.package.files.get(path)
      if (!content) return new Response(`找不到资源 ${path}`, { status: 404, headers })
      const type = TYPES[path.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream'
      if (path === result.package.manifest.entry) {
        const sdkPath = `app://workbench/${target.projectId}/${target.kind}/${target.id}/${revision}/__studio_sdk.js`
        const script = `<script src="${sdkPath}"></script>`
        const original = content.toString('utf8')
        const html = /<head(?:\s[^>]*)?>/i.test(original) ? original.replace(/<head(?:\s[^>]*)?>/i, match => `${match}${script}`) : script + original
        return new Response(html, { headers: { ...headers, 'Content-Type': type, 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'none'; object-src 'none'" } })
      }
      return new Response(new Uint8Array(content), { headers: { ...headers, 'Content-Type': type } })
    } catch (error) { return new Response(error instanceof Error ? error.message : '工作台资源加载失败', { status: 400, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } }) }
  }
  dispose(): void {}
}
