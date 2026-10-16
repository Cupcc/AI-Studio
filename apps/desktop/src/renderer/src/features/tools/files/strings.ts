import { FILES_LIMITS } from '@shared/tools/files'
import type { FileEncoding, FileReferenceFailureReason, FileUnavailableReason } from '@shared/tools/files'
import type { AddFileReferenceResult } from '../../input/add-file-reference'

// User-facing strings of the Files tool. Contracts carry reason codes only; every message is chosen here.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

const ENCODING_LABEL: Record<FileEncoding, string> = { 'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE' }
export const encodingLabel = (encoding: FileEncoding, bom: boolean) => `${ENCODING_LABEL[encoding]}${bom ? ' (BOM)' : ''}`
export const lineEndingLabel = (lineEnding: 'lf' | 'crlf' | 'mixed' | 'none') => ({ lf: 'LF', crlf: 'CRLF', mixed: '混合换行', none: '' })[lineEnding]

export { displayName } from '../../../lib/display-path'

/** Reasons of a file read (viewer). A thrown IPC error is shown as `unreadable`. */
export function fileReasonText(reason: FileUnavailableReason, size?: number): string {
  switch (reason) {
    case 'invalid_path': return '路径无效，无法读取'
    case 'project_unavailable': return 'Project 目录不可用'
    case 'project_closing': return 'Project 正在关闭，暂时无法读取'
    case 'missing': return '文件已不存在'
    case 'not_directory': return '路径不是目录'
    case 'not_file': return '不是普通文件，无法查看'
    case 'symlink_refused': return '符号链接未跟随，无法查看'
    case 'excluded': return '该路径已被排除，不予显示'
    case 'permission_denied': return '无权限读取此文件'
    case 'unreadable':
    case 'timeout': return '读取失败或超时，请稍后重试'
    case 'binary': return '二进制文件，不显示内容'
    case 'too_large': return size === undefined ? `文件过大，超过 ${formatBytes(FILES_LIMITS.readBytes)} 的查看上限` : `文件过大（${formatBytes(size)}），超过 ${formatBytes(FILES_LIMITS.readBytes)} 的查看上限`
    case 'unsupported_encoding': return '非 UTF-8 编码，无法显示'
    case 'changed_while_reading': return '文件在读取时发生变化，请稍后重试'
  }
}

/** Reasons of a directory listing (shown under the directory row). */
export function directoryReasonText(reason: FileUnavailableReason): string {
  switch (reason) {
    case 'invalid_path': return '路径无效，无法读取目录'
    case 'project_unavailable': return 'Project 目录不可用'
    case 'project_closing': return 'Project 正在关闭，暂时无法读取'
    case 'missing': return '目录已不存在'
    case 'not_directory': return '不是目录'
    case 'symlink_refused': return '符号链接未跟随'
    case 'excluded': return '该目录已被排除，不予显示'
    case 'permission_denied': return '无权限读取此目录'
    case 'unreadable':
    case 'timeout': return '读取失败或超时，请稍后重试'
    case 'not_file':
    case 'binary':
    case 'too_large':
    case 'unsupported_encoding':
    case 'changed_while_reading': return '无法读取此目录'
  }
}

/** Failures reported by `files.resolveReference`. */
export function referenceFailureText(reason: FileReferenceFailureReason): string {
  switch (reason) {
    case 'invalid_path': return '路径无效，无法添加到对话'
    case 'project_unavailable': return 'Project 目录不可用，无法添加到对话'
    case 'project_closing': return 'Project 正在关闭，无法添加到对话'
    case 'missing': return '文件已不存在，无法添加到对话'
    case 'not_file': return '不是普通文件，无法添加到对话'
    case 'symlink_refused': return '符号链接未跟随，无法添加到对话'
    case 'excluded': return '该路径已被排除，无法添加到对话'
    case 'permission_denied': return '无权限读取此文件，无法添加到对话'
    case 'unreadable':
    case 'timeout': return '读取失败或超时，暂时无法添加到对话，请稍后重试'
    case 'name_unsupported': return nameUnsupported
    case 'too_many': return `一条消息最多引用 ${FILES_LIMITS.referencesPerMessage} 个文件`
  }
}

/** Rejections of `addFileReference`. */
export function addRejectionText(reason: Extract<AddFileReferenceResult, { status: 'rejected' }>['reason']): string {
  switch (reason) {
    case 'limit': return `一条消息最多引用 ${FILES_LIMITS.referencesPerMessage} 个文件，未添加`
    case 'conversation_changed': return '当前对话已切换，未添加；请在目标对话中重新添加'
    case 'draft_unavailable': return '当前对话的草稿不可用，未添加'
    case 'invalid_path': return '路径无效，未添加'
  }
}

export const nameUnsupported = '文件名包含控制字符，无法添加到对话；仍可查看内容'

export const FILES_TEXT = {
  tree: '项目文件',
  viewer: '文件查看器',
  refresh: '刷新',
  watchLive: '自动刷新',
  watchLiveTip: '文件变化时自动刷新',
  watchUnavailable: '自动刷新不可用',
  watchUnavailableTip: '无法监听文件变化，可点击刷新或切回窗口时刷新',
  loading: '正在读取…',
  loadingFile: '正在读取文件…',
  loadingViewer: '正在加载查看器…',
  emptyDirectory: '空目录',
  omittedPaths: '部分条目路径过长，未显示；可将该目录单独打开为 Project。',
  truncated: `目录条目过多，仅显示前 ${FILES_LIMITS.listEntries} 项`,
  symlink: '链接',
  symlinkTip: (target?: string) => target ? `符号链接 → ${target}（未跟随）` : '符号链接（未跟随）',
  other: '特殊',
  otherTip: '特殊文件，无法查看',
  invalidName: '名称无效',
  addToConversation: '添加到对话',
  adding: '正在添加…',
  closeViewer: '关闭查看器',
  retry: '重试',
  splitter: '调整文件树与查看器的高度',
  codeFailed: '代码查看器不可用，以纯文本显示',
  added: (name: string) => `已添加到对话：${name}`,
  duplicate: (name: string) => `已在对话中：${name}`,
  addFailed: '无法确认该文件是否可引用，未添加，请稍后重试'
} as const
