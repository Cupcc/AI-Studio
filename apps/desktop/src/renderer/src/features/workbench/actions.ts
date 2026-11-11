import type { CustomDraftEntry } from '@shared/workbench/types'
import { useProjectShell } from '../project/store'
import { draftId, useSessions } from '../session/store'
import { workbenchApi } from './api'
import { useWorkbenches } from './store'

export async function openWorkbenchDraft(projectId: string, source: 'template' | 'ai', instanceId?: string): Promise<CustomDraftEntry> {
  const draft = await workbenchApi().createDraft({ projectId, source, ...(instanceId ? { instanceId } : {}) })
  await useWorkbenches.getState().loadCatalog(projectId)
  const viewId = draft.viewId
  useProjectShell.getState().enterView(projectId, viewId)
  const key = { projectId, kind: 'new_chat' as const, viewId }
  await useSessions.getState().loadDraft(key)
  if (!useSessions.getState().drafts[draftId(key)]) throw new Error('对话草稿加载失败，请重新打开工作台草稿')
  if (source === 'ai') useSessions.getState().updateDraft(key, {
    text: instanceId ? '请按我接下来的要求修改这个工作台草稿，先阅读开发说明，完成后让我预览。\n修改要求：' : '请为我创建一个工作台，先阅读开发说明，完成后让我预览。\n我需要：',
    contextItems: [{ type: 'view', viewId }]
  })
  return draft
}
