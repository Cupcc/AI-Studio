import { create } from 'zustand'
import type { InlineReference, SessionCli } from '@shared/session/types'
import { filesApi } from '../tools/files/api'
import { fileReasonText } from '../tools/files/strings'
import { useFiles } from '../tools/files/files-store'
import { showTool } from '../tools/show-tool'
import { sessionApi } from '../session/api'

export type ReferenceItem = InlineReference['item']
export interface ReferenceContent { text: string; truncated: boolean }
interface SkillInspector { projectId: string; cli: SessionCli; item: Extract<ReferenceItem, { type: 'skill' }> }
export const useReferenceInspector = create<{ current: SkillInspector | null }>(() => ({ current: null }))

export async function readReference(projectId: string, cli: SessionCli, item: ReferenceItem): Promise<ReferenceContent> {
  if (item.type === 'skill') return sessionApi().getSkillContent({ projectId, cli, skillId: item.id })
  const result = await filesApi().read({ projectId, path: item.path })
  if (result.status !== 'ok') throw new Error(result.status === 'unavailable' ? fileReasonText(result.reason) : '请重新预览文件')
  return { text: result.text, truncated: false }
}

export function openReference(projectId: string, cli: SessionCli, item: ReferenceItem): void {
  showTool(projectId, 'files')
  useReferenceInspector.setState({ current: item.type === 'skill' ? { projectId, cli, item } : null })
  if (item.type === 'file') void useFiles.getState().open(projectId, item.path)
}
