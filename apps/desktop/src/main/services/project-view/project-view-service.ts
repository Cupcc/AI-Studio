import { constants, closeSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { catalogEntry, DEFAULT_DEFINITIONS } from '@shared/project-view/defaults'
import { hasRenderableContent, MAX_FILE_BYTES, parseDefinition, parseKnowledge, validateBoundContent } from '@shared/project-view/schema'
import { VIEW_CATALOG, type ViewContext, type ViewState } from '@shared/project-view/types'
import knowledgeSchema from '@shared/project-view/resources/knowledge.schema.json'
import viewSchema from '@shared/project-view/resources/view.schema.json'

interface ProjectWatch {
  root: string; watchers: FSWatcher[]; directoryIdentity?: string
  timer?: ReturnType<typeof setTimeout>; pending?: Promise<void>; again: boolean
  states: Map<string, ViewState>; fingerprints: Map<string, string>
}
export interface ProjectViewOptions {
  projectPath(projectId: string): string
  changed(state: ViewState): void
  settleMs?: number
}
function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === 'ENOENT' }

/** Reject symlink components (including client-owned write targets), never follow a project escape. */
export function safePath(root: string, path: string): void {
  const rootInfo = lstatSync(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Project directory is unavailable')
  const canonicalRoot = realpathSync(root)
  const rel = relative(root, path)
  if (rel.startsWith('..' + sep) || rel === '..' || rel.startsWith(sep)) throw new Error('Project path boundary violation')
  let current = root
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not allowed in Project View files')
      const resolved = realpathSync(current)
      const inside = relative(canonicalRoot, resolved)
      if (inside === '..' || inside.startsWith('..' + sep)) throw new Error('Project path boundary violation')
    } catch (error) { if (missing(error)) return; throw error }
  }
}
function read(root: string, relativePath: string): string | null {
  const path = join(root, relativePath)
  safePath(root, path)
  let fd: number
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK) }
  catch (error) { if (missing(error)) return null; throw new Error('View file cannot be read') }
  try {
    const before = fstatSync(fd)
    if (!before.isFile()) throw new Error('View input must be a regular file')
    if (before.size > MAX_FILE_BYTES) throw new Error('View file exceeds 256 KiB')
    // Bound allocation/read even when another process grows the file after fstat.
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1)
    let length = 0, count = 0
    do { count = readSync(fd, bytes, length, bytes.length - length, length); length += count } while (count && length < bytes.length)
    if (length > MAX_FILE_BYTES) throw new Error('View file exceeds 256 KiB')
    const after = fstatSync(fd)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('View file is still being written')
    safePath(root, path)
    return bytes.subarray(0, length).toString('utf8')
  } finally { closeSync(fd) }
}
function parse(text: string): unknown {
  try { return JSON.parse(text) } catch { throw new Error('View file is not valid JSON') }
}
export class ProjectViewService {
  private projects = new Map<string, ProjectWatch>()
  private revision = 0
  constructor(private readonly options: ProjectViewOptions) {}
  list(projectId: string) { this.open(projectId); return VIEW_CATALOG }
  open(projectId: string): ProjectWatch {
    const current = this.projects.get(projectId)
    if (current) return current
    const root = this.options.projectPath(projectId)
    const state: ProjectWatch = { root, watchers: [], again: false, states: new Map(), fingerprints: new Map() }
    this.projects.set(projectId, state)
    try {
      const watcher = watch(root, (_event, name) => { if (!name || String(name) === '.ai-studio') this.schedule(projectId, state) })
      watcher.on('error', () => this.schedule(projectId, state))
      state.watchers.push(watcher)
    } catch { /* focus and turn-end scans remain available */ }
    this.watchDirectory(projectId, state)
    void this.refresh(projectId)
    return state
  }
  private watchDirectory(projectId: string, state: ProjectWatch): void {
    const path = join(state.root, '.ai-studio')
    try {
      safePath(state.root, path)
      const info = lstatSync(path)
      if (!info.isDirectory()) return
      const identity = String(info.ino)
      if (state.directoryIdentity === identity) return
      // Root watcher remains; replace the watcher when an atomic directory replacement occurred.
      while (state.watchers.length > 1) state.watchers.pop()!.close()
      state.directoryIdentity = identity
      const watcher = watch(path, { recursive: true }, () => this.schedule(projectId, state))
      watcher.on('error', () => { state.directoryIdentity = undefined; this.schedule(projectId, state) })
      state.watchers.push(watcher)
    } catch { state.directoryIdentity = undefined }
  }
  private schedule(projectId: string, state: ProjectWatch): void {
    clearTimeout(state.timer)
    state.timer = setTimeout(() => { if (this.projects.get(projectId) === state) void this.refresh(projectId) }, this.options.settleMs ?? 100)
  }
  async getSnapshot(projectId: string, viewId: string): Promise<ViewState> {
    catalogEntry(viewId)
    const state = this.open(projectId)
    await this.refresh(projectId)
    if (this.projects.get(projectId) !== state) throw new Error('Project closed during View read')
    return state.states.get(viewId)!
  }
  refresh(projectId: string): Promise<void> {
    const state = this.projects.get(projectId)
    if (!state) return Promise.resolve()
    if (state.pending) { state.again = true; return state.pending }
    state.pending = (async () => {
      do {
        state.again = false
        this.watchDirectory(projectId, state)
        await Promise.all(VIEW_CATALOG.map(entry => this.scan(projectId, entry.id, state)))
      } while (state.again && this.projects.get(projectId) === state)
    })().finally(() => { state.pending = undefined })
    return state.pending
  }
  refreshAll(): void { for (const id of this.projects.keys()) void this.refresh(id) }
  private publish(projectId: string, state: ProjectWatch, next: ViewState): void {
    if (this.projects.get(projectId) !== state) return
    state.states.set(next.viewId, next)
    this.options.changed(next)
  }
  private async scan(projectId: string, viewId: string, state: ProjectWatch): Promise<void> {
    const old = state.states.get(viewId)
    const snapshot = old?.snapshot ?? null
    const base = { projectId, viewId, snapshot }
    this.publish(projectId, state, { ...base, status: snapshot ? 'stale' : 'loading', error: null, revision: ++this.revision })
    let error = 'View refresh failed'
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const pair = () => [
          read(state.root, `.ai-studio/knowledge/${viewId}.json`),
          read(state.root, `.ai-studio/views/${viewId}.view.json`)
        ] as const
        const first = pair()
        await delay(this.options.settleMs ?? 100)
        if (this.projects.get(projectId) !== state) return
        const second = pair()
        if (first[0] !== second[0] || first[1] !== second[1]) throw new Error('View files are still being written')
        const knowledge = second[0] === null ? null : parseKnowledge(parse(second[0]), viewId)
        const definition = second[1] === null ? DEFAULT_DEFINITIONS.get(viewId)! : parseDefinition(parse(second[1]), viewId)
        validateBoundContent(knowledge, definition)
        const fingerprint = JSON.stringify(second)
        const revision = ++this.revision
        const next = state.fingerprints.get(viewId) === fingerprint && snapshot ? snapshot : {
          projectId, viewId, catalog: catalogEntry(viewId), knowledge, definition, revision, updatedAt: Date.now()
        }
        state.fingerprints.set(viewId, fingerprint)
        this.publish(projectId, state, { projectId, viewId, revision, snapshot: next, error: null, status: hasRenderableContent(knowledge, definition) ? 'ready' : 'empty' })
        return
      } catch (cause) {
        // No raw JSON or absolute path is exposed by diagnostics.
        error = cause instanceof Error && !('code' in cause) ? cause.message : 'View file cannot be read'
        if (attempt < 2) await delay(this.options.settleMs ?? 100)
      }
    }
    this.publish(projectId, state, { ...base, status: 'error', error, revision: ++this.revision })
  }
  buildContext(projectId: string, viewId: string, initialize = false): ViewContext {
    const entry = catalogEntry(viewId)
    const root = this.options.projectPath(projectId)
    const paths = [`.ai-studio/knowledge/${viewId}.json`, `.ai-studio/views/${viewId}.view.json`, '.ai-studio/GUIDE.md', '.ai-studio/schema/knowledge.schema.json', '.ai-studio/schema/view.schema.json']
    if (initialize) {
      for (const path of paths) safePath(root, join(root, path))
      const guide = [
        '# Project View authoring',
        'Keep facts in knowledge/<view-id>.json and presentation in views/<view-id>.view.json.',
        'Use schemaVersion: 1 and the matching viewId. Missing presentation uses the built-in definition.',
        'Knowledge data is a JSON object. example: true labels placeholder data.',
        'Bindings map names to data.field.subfield paths; node.bind selects a binding name.',
        'Diagram data: {nodes:[{id,name,path?}],edges:[{from,to,label?}]}. Tables bind arrays of objects.',
        'No expressions, executable HTML, CSS, scripts, network URLs or Session data. Paths must be Project-relative.',
        'Maximum 256 KiB per file, 500 components, nesting depth 32. Write complete JSON atomically.',
        'Default definitions (use these data fields, or author a matching definition):',
        ...[...DEFAULT_DEFINITIONS.values()].map(doc => JSON.stringify(doc))
      ].join('\n')
      for (const [path, content] of [
        ['.ai-studio/.gitignore', '*\n'], ['.ai-studio/GUIDE.md', guide],
        ['.ai-studio/schema/knowledge.schema.json', JSON.stringify(knowledgeSchema, null, 2)],
        ['.ai-studio/schema/view.schema.json', JSON.stringify(viewSchema, null, 2)]
      ]) {
        const target = join(root, path!)
        safePath(root, target)
        mkdirSync(dirname(target), { recursive: true })
        safePath(root, target)
        const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600)
        try {
          if (!fstatSync(fd).isFile() || fstatSync(fd).nlink !== 1) throw new Error('Unsafe View helper file')
          // Truncate only after checking the opened target, avoiding device/hardlink writes.
          ftruncateSync(fd, 0)
          writeFileSync(fd, content!)
        } finally { closeSync(fd) }
      }
    }
    return { originViewId: viewId, paths, text: `Current Project View: ${entry.title}\nRelevant files: ${paths.join(', ')}\nRules: update the relevant Knowledge and View Definition files when the user asks to change this view; keep facts separate from presentation; do not add executable HTML or scripts. Read GUIDE.md and the schemas before editing.` }
  }
  close(projectId: string): void {
    const state = this.projects.get(projectId)
    if (!state) return
    this.projects.delete(projectId)
    clearTimeout(state.timer)
    state.watchers.forEach(watcher => watcher.close())
  }
  dispose(): void { for (const id of this.projects.keys()) this.close(id) }
}
