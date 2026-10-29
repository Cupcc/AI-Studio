// User actions of the Files tool that change files or leave the app (FR-TOOL-001 2026-10-26, TOOLS-Q11). Each returns
// a message for the panel's status line (or null when there is nothing to say) and never throws.
import { create } from 'zustand'
import {
  projectPathName, projectPathParent,
  type ExternalEditors, type FileOpenTarget, type FileOperationFailure, type FileOperationResult, type ProjectPath
} from '@shared/tools/files'
import { filesApi } from './api'
import { useFiles } from './files-store'
import { displayName } from './strings'

export interface ActionMessage { tone: 'ok' | 'warn'; text: string }

export function operationFailureText(reason: FileOperationFailure | 'app_missing', path: ProjectPath): string {
  const name = displayName(projectPathName(path) || path)
  switch (reason) {
    case 'exists': return `“${name}”已存在，未覆盖`
    case 'invalid_name': return '名称无效：不能为空，不能包含 / 或控制字符'
    case 'excluded': return '.git 目录受保护，不能操作'
    case 'missing': return `“${name}”已不存在`
    case 'not_directory': return '目标不是文件夹'
    case 'symlink_refused': return '路径经过符号链接，为避免写到 Project 外已拒绝'
    case 'permission_denied': return `无权限操作“${name}”`
    case 'into_itself': return '不能把文件夹移动或复制到它自己里面'
    case 'root': return '不能对 Project 根目录执行此操作'
    case 'project_unavailable': return 'Project 目录不可用'
    case 'project_closing': return 'Project 正在关闭，暂时无法操作'
    case 'app_missing': return '未找到该应用'
    case 'invalid_path': return '路径无效'
    case 'failed': return `操作“${name}”失败，请重试`
  }
}

/** After an operation, the affected folders are listed again; a failure keeps what already happened visible too. */
async function finish(projectId: string, result: FileOperationResult | null, dirs: ProjectPath[]): Promise<ActionMessage | null> {
  await useFiles.getState().relist(projectId, dirs)
  if (!result) return { tone: 'warn', text: '操作失败，请重试' }
  return result.status === 'ok' ? null : { tone: 'warn', text: operationFailureText(result.reason, result.path) }
}

async function call(work: () => Promise<FileOperationResult>): Promise<FileOperationResult | null> {
  try { return await work() } catch { return null }
}

export async function createEntry(projectId: string, parent: ProjectPath, name: string, kind: 'file' | 'directory'): Promise<ActionMessage | null> {
  const result = await call(() => filesApi().create({ projectId, parent, name, kind }))
  const message = await finish(projectId, result, [parent, ...(result?.status === 'ok' ? result.paths.map(projectPathParent) : [])])
  // VS Code opens a new file right away (pinned); a new folder is selected.
  if (result?.status === 'ok') {
    const created = result.paths[0]!
    if (kind === 'file') await useFiles.getState().open(projectId, created, { pin: true })
    else useFiles.getState().mark(projectId, created, 'replace', [])
  }
  return message
}

export async function renameEntry(projectId: string, path: ProjectPath, name: string): Promise<ActionMessage | null> {
  const result = await call(() => filesApi().rename({ projectId, path, name }))
  if (result?.status === 'ok') useFiles.getState().moved(projectId, path, result.paths[0]!)
  return finish(projectId, result, [projectPathParent(path)])
}

export async function moveEntries(projectId: string, paths: ProjectPath[], target: ProjectPath): Promise<ActionMessage | null> {
  const result = await call(() => filesApi().move({ projectId, paths, target }))
  const moved = result ? (result.status === 'ok' ? result.paths : result.done) : []
  paths.forEach((path, index) => { if (moved[index] && moved[index] !== path) useFiles.getState().moved(projectId, path, moved[index]!) })
  return finish(projectId, result, [target, ...paths.map(projectPathParent)])
}

export async function copyEntries(projectId: string, paths: ProjectPath[], target: ProjectPath): Promise<ActionMessage | null> {
  const result = await call(() => filesApi().copy({ projectId, paths, target }))
  return finish(projectId, result, [target])
}

export async function trashEntries(projectId: string, paths: ProjectPath[]): Promise<ActionMessage | null> {
  const result = await call(() => filesApi().trash({ projectId, paths }))
  const message = await finish(projectId, result, paths.map(projectPathParent))
  const removed = result ? (result.status === 'ok' ? result.paths : result.done) : []
  for (const path of removed) {
    const state = useFiles.getState().projects[projectId]
    for (const tab of state?.tabs ?? []) if (tab.path === path || tab.path.startsWith(`${path}/`)) useFiles.getState().closeTab(projectId, tab.path)
  }
  return message ?? { tone: 'ok', text: removed.length === 1 ? `已移到废纸篓：${displayName(projectPathName(removed[0]!))}` : `已将 ${removed.length} 项移到废纸篓` }
}

export async function openWith(projectId: string, path: ProjectPath, target: FileOpenTarget, line?: number): Promise<ActionMessage | null> {
  try {
    const result = await filesApi().open({ projectId, path, target, ...(line ? { line } : {}) })
    return result.status === 'ok' ? null : { tone: 'warn', text: result.detail ? `无法打开：${result.detail}` : operationFailureText(result.reason, path) }
  } catch { return { tone: 'warn', text: '无法打开，请重试' } }
}

export async function copyText(text: string, done: string): Promise<ActionMessage> {
  try { await navigator.clipboard.writeText(text); return { tone: 'ok', text: done } } catch { return { tone: 'warn', text: '无法写入剪贴板' } }
}

/** Absolute path for "复制路径": the Project's canonical directory joined with the Project path. */
export const absolutePath = (root: string, path: ProjectPath) => path === '' ? root : `${root}/${path}`

// ---- the Files clipboard (⌘C / ⌘X / ⌘V in the tree), as VS Code keeps its own for the explorer ----------------------

interface FilesClipboard { projectId: string | null; paths: ProjectPath[]; cut: boolean; set(projectId: string, paths: ProjectPath[], cut: boolean): void; clear(): void }
export const useFilesClipboard = create<FilesClipboard>((set) => ({
  projectId: null, paths: [], cut: false,
  set: (projectId, paths, cut) => set({ projectId, paths: [...paths], cut }),
  clear: () => set({ projectId: null, paths: [], cut: false })
}))

/** Pastes into `target`: a cut moves (once), a copy copies. Only within the same Project. */
export async function paste(projectId: string, target: ProjectPath): Promise<ActionMessage | null> {
  const clipboard = useFilesClipboard.getState()
  if (clipboard.projectId !== projectId || !clipboard.paths.length) return null
  if (clipboard.cut) {
    const message = await moveEntries(projectId, clipboard.paths, target)
    clipboard.clear()
    return message
  }
  return copyEntries(projectId, clipboard.paths, target)
}

// ---- installed editors (asked once per app run) ----------------------------------------------------------------------

let editors: Promise<ExternalEditors> | null = null
export function installedEditors(): Promise<ExternalEditors> {
  editors ??= filesApi().editors().catch(() => { editors = null; return { vscode: false, cursor: false } })
  return editors
}
