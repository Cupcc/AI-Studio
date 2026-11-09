// Turns validated Files references into Provider input (FR-TOOL-001 item 4, Tools spec §4.1; FR-INPUT-001).
// Pure: the resolver has already re-validated every path, so this module only decides how the CLI is told about them.
import type { InputAttachment, UserInput } from '@ai-studio/agent-adapter'
import { FILES_LIMITS, type FileReferenceFailureReason, type ProjectPath, type ResolvedFileReference } from '@shared/tools/files'
import type { SessionCli } from '@shared/session/types'

/**
 * `text`: a path list in the prompt. `attachments`: the Adapter's structured input contract;
 * Codex serializes file name/path as text and image/skill as native inputs; Claude throws `unsupported`.
 */
export type FileReferenceStrategy = 'text' | 'attachments'

/**
 * File serialization belongs to the Adapter, including cache paths outside the Project root.
 * Evidence: T20261031-inline-attachments (2026-11-01); earlier mention tests did not prove cache-only delivery.
 */
export const FILE_REFERENCE_STRATEGY: Record<SessionCli, FileReferenceStrategy> = { codex: 'attachments', 'claude-code': 'text' }

export const FILE_REFERENCE_HEADER = 'Referenced files (paths relative to the Project root; these are references, not file contents):'

export interface BuildUserInputOptions {
  /** Project View context, already rendered; prefixed exactly as before file references existed. */
  viewContextText?: string
  skills?: readonly InputAttachment[]
  images?: readonly string[]
  filePaths?: readonly string[]
  files: readonly ResolvedFileReference[]
  uploads?: readonly InputAttachment[]
  text: string
  strategy: FileReferenceStrategy
}

// JSON.stringify keeps U+0085 / U+2028 / U+2029 literal, but a reader may treat them as line breaks and see a forged list line.
const LINE_SEPARATORS = /[\u0085\u2028\u2029]/g
const quote = (path: ProjectPath): string => JSON.stringify(path).replace(LINE_SEPARATORS, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)

/**
 * `text`: `[viewContext\n\n]HEADER\n- "path"…\n\nuser text`. Paths are JSON-quoted so spaces, quotes and unicode survive and
 * one file is always one line. Without files the result is exactly what was sent before references existed.
 */
export function buildUserInput({ viewContextText, files, skills = [], uploads = [], images = [], filePaths, text, strategy }: BuildUserInputOptions): UserInput {
  const body = viewContextText ? `${viewContextText}\n\n${text}` : text
  if ((images.length || skills.length || uploads.length) && strategy !== 'attachments') throw new Error('当前 CLI 未接入原生附件，消息未发送')
  if (!files.length && !skills.length && !uploads.length) return { text: body }
  if (strategy === 'attachments') return { text: body, attachments: [...skills, ...uploads, ...files.flatMap(file => {
    const aliases = [file.path, ...(file.aliases ?? [])]
    const image = aliases.some(path => images.includes(path))
    const mention = filePaths ? aliases.some(path => filePaths.includes(path)) : !image
    return [...(mention ? [{ kind: 'file' as const, path: file.absolutePath, name: file.name }] : []), ...(image ? [{ kind: 'image' as const, path: file.absolutePath }] : [])]
  })] }
  if (!files.length) return { text: body }
  const list = [FILE_REFERENCE_HEADER, ...files.map(file => `- ${quote(file.path)}`)].join('\n')
  return { text: `${viewContextText ? `${viewContextText}\n\n` : ''}${list}\n\n${text}` }
}

/** Inverse of the `text` strategy: the paths of the first reference list in `text`. The simulated Providers use it. */
export function parseReferencedFiles(text: string): ProjectPath[] {
  const lines = text.split('\n')
  const start = lines.indexOf(FILE_REFERENCE_HEADER)
  if (start < 0) return []
  const paths: ProjectPath[] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('- "')) break
    try { paths.push(JSON.parse(line.slice(2)) as string) } catch { break }
  }
  return paths
}

const REASON_TEXT: Record<FileReferenceFailureReason, string> = {
  invalid_path: '路径无效',
  project_unavailable: 'Project 目录不可用',
  project_closing: 'Project 正在关闭',
  missing: '文件已不存在',
  not_file: '不是普通文件',
  symlink_refused: '符号链接不能引用',
  excluded: '该路径不能引用',
  permission_denied: '没有读取权限',
  unreadable: '无法读取',
  timeout: '读取超时',
  name_unsupported: '文件名含控制字符，无法引用',
  too_many: `一条消息最多引用 ${FILES_LIMITS.referencesPerMessage} 个文件`
}

/** The message shown when a send or retry is refused; it names every path and its reason. */
export function describeFileReferenceFailures(failures: readonly { path: ProjectPath; reason: FileReferenceFailureReason }[]): string {
  const named = failures.map(({ path, reason }) => `${path}（${REASON_TEXT[reason]}）`).join('；')
  return `文件引用失败，消息未发送：${named || '未能确认文件'}`
}
