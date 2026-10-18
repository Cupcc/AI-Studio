import type { MainCanvas } from '@shared/project/types'
import type { DraftKey } from '@shared/session/types'
import { FILES_LIMITS, isReferenceablePath, type ProjectPath } from '@shared/tools/files'
import { useProjectShell } from '../project/store'
import { draftId, useSessions } from '../session/store'

export type AddFileReferenceResult =
  | { status: 'added' | 'duplicate' }
  | { status: 'rejected'; reason: 'limit' | 'conversation_changed' | 'draft_unavailable' | 'invalid_path' }

/** The draft or Session a Project's main canvas displays: the Conversation, or the View's left column. */
export function displayedDraftKey(projectId: string, canvas: MainCanvas): DraftKey {
  if (canvas.mode === 'session') return { projectId, kind: 'session', sessionId: canvas.sessionId }
  if (canvas.mode === 'draft') return { projectId, kind: 'new_chat' }
  return canvas.conversation.kind === 'session'
    ? { projectId, kind: 'session', sessionId: canvas.conversation.sessionId }
    : { projectId, kind: 'new_chat', viewId: canvas.viewId }
}

/**
 * Adds a Files-tool reference to the draft or Session that the Project's main canvas displays (Tools §4.1). Only an
 * explicit user action calls this; the tag is data in the draft, so removing it and sending go through Input as usual.
 */
export async function addFileReference({ projectId, canvas, path, type = 'file' }: { type?: 'file' | 'image'; projectId: string; canvas: MainCanvas; path: ProjectPath }): Promise<AddFileReferenceResult> {
  if (!isReferenceablePath(path)) return { status: 'rejected', reason: 'invalid_path' }
  const displayed = (): string | null => {
    const current = useProjectShell.getState().uiStates[projectId]?.mainCanvas
    return current ? draftId(displayedDraftKey(projectId, current)) : null
  }
  const key = displayedDraftKey(projectId, canvas), id = draftId(key)
  // The caller's canvas can already be stale by a render; refuse before touching any draft.
  if (displayed() !== id) return { status: 'rejected', reason: 'conversation_changed' }
  // updateDraft on an unloaded draft would overwrite the stored text and CLI with an empty draft.
  await useSessions.getState().loadDraft(key)
  // The user may have switched conversation while the draft loaded: the reference belongs to the one they clicked in.
  if (displayed() !== id) return { status: 'rejected', reason: 'conversation_changed' }
  const draft = useSessions.getState().drafts[id]
  if (!draft) return { status: 'rejected', reason: 'draft_unavailable' }
  const files = draft.contextItems.filter((item) => item.type === 'file' || item.type === 'image')
  if (files.some((item) => item.path === path && item.type === type)) return { status: 'duplicate' }
  if (files.length >= FILES_LIMITS.referencesPerMessage) return { status: 'rejected', reason: 'limit' }
  useSessions.getState().updateDraft(key, { contextItems: [...draft.contextItems, { type, path }] })
  return { status: 'added' }
}
