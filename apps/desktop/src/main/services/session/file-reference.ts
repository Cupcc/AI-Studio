// Turns validated Files references into Provider input (FR-TOOL-001 item 4, Tools spec §4.1; FR-INPUT-001).
// Pure: the resolver has already re-validated every path, so this module only decides how the CLI is told about them.
import type { UserInput } from '@ai-studio/agent-adapter'
import { FILES_LIMITS, type FileReferenceFailureReason, type ProjectPath, type ResolvedFileReference } from '@shared/tools/files'
import type { SessionCli } from '@shared/session/types'

/**
 * `text`: a path list in the prompt, which both CLIs accept today. `attachments`: the Adapter's structured file
 * attachment (Codex `mention`; Claude throws `unsupported`). Codex mention was verified on 0.163.0 (2026-10-18).
 */
export type FileReferenceStrategy = 'text' | 'attachments'

/**
 * Codex uses its verified native mention input; Claude keeps the textual path reference until separately verified.
 * Evidence: T20261009-context-tools/evidence/W0-codex-adapter-live.json (2026-10-18).
 */
export const FILE_REFERENCE_STRATEGY: Record<SessionCli, FileReferenceStrategy> = { codex: 'attachments', 'claude-code': 'text' }

export const FILE_REFERENCE_HEADER = 'Referenced files (paths relative to the Project root; these are references, not file contents):'

export interface BuildUserInputOptions {
  /** Project View context, already rendered; prefixed exactly as before file references existed. */
  viewContextText?: string
  files: readonly ResolvedFileReference[]
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
export function buildUserInput({ viewContextText, files, text, strategy }: BuildUserInputOptions): UserInput {
  const body = viewContextText ? `${viewContextText}\n\n${text}` : text
  if (!files.length) return { text: body }
  if (strategy === 'attachments') return { text: body, attachments: files.map(file => ({ kind: 'file' as const, path: file.absolutePath, name: file.name })) }
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
