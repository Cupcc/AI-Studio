import type { WorkbenchRef } from '@shared/workbench/types'
import { displayedDraftKey } from '../input/add-file-reference'
import { useProjectShell } from '../project/store'
import { draftId, useSessions } from '../session/store'

export async function appendWorkbenchDraft(ref: WorkbenchRef, text: string, isActive: () => boolean, target: 'current' | 'new' = 'current'): Promise<void> {
  const { projectId } = ref
  const canvas = useProjectShell.getState().uiStates[projectId]?.mainCanvas
  if (!canvas || canvas.mode !== 'view' || canvas.viewId !== ref.viewId) throw new Error('工作台页面已切换')
  const displayedKey = displayedDraftKey(projectId, canvas)
  const key = target === 'new' ? { projectId, kind: 'new_chat' as const, viewId: ref.viewId } : displayedKey
  await useSessions.getState().loadDraft(key)
  const nextCanvas = useProjectShell.getState().uiStates[projectId]?.mainCanvas
  if (!isActive() || !nextCanvas || draftId(displayedDraftKey(projectId, nextCanvas)) !== draftId(displayedKey)) throw new Error('对话已切换，请重新操作')
  const previous = useSessions.getState().drafts[draftId(key)]
  if (!previous) throw new Error('对话草稿尚未加载')
  useSessions.getState().updateDraft(key, target === 'new'
    ? { text, contextItems: [{ type: 'view', viewId: ref.viewId }] }
    : { text: previous.text.trim() ? `${previous.text}\n${text}` : text })
  if (target === 'new') useProjectShell.getState().setViewConversation(projectId, { kind: 'draft' })
}

export async function openWorkbenchSession(ref: WorkbenchRef, sessionId: string, isActive: () => boolean): Promise<void> {
  const canvas = useProjectShell.getState().uiStates[ref.projectId]?.mainCanvas
  if (!isActive() || !canvas || canvas.mode !== 'view' || canvas.viewId !== ref.viewId) throw new Error('工作台页面已切换')
  const session = useSessions.getState().summaries[sessionId]
  if (!session || session.projectId !== ref.projectId) throw new Error('找不到当前 Project 的对话')
  useProjectShell.getState().setViewConversation(ref.projectId, { kind: 'session', sessionId })
}
