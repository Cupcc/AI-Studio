import type { WorkbenchTarget } from '@shared/workbench/types'
import { workbenchViewId } from '@shared/workbench/types'
import { displayedDraftKey } from '../input/add-file-reference'
import { useProjectShell } from '../project/store'
import { draftId, useSessions } from '../session/store'

export async function appendWorkbenchDraft(target: WorkbenchTarget, text: string, isActive: () => boolean): Promise<void> {
  const { projectId } = target
  const canvas = useProjectShell.getState().uiStates[projectId]?.mainCanvas
  if (!canvas || canvas.mode !== 'view' || canvas.viewId !== workbenchViewId(target)) throw new Error('工作台页面已切换')
  const key = displayedDraftKey(projectId, canvas)
  await useSessions.getState().loadDraft(key)
  const nextCanvas = useProjectShell.getState().uiStates[projectId]?.mainCanvas
  if (!isActive() || !nextCanvas || draftId(displayedDraftKey(projectId, nextCanvas)) !== draftId(key)) throw new Error('对话已切换，请重新操作')
  const previous = useSessions.getState().drafts[draftId(key)]
  if (!previous) throw new Error('对话草稿尚未加载')
  useSessions.getState().updateDraft(key, { text: previous.text.trim() ? `${previous.text}\n${text}` : text })
}
