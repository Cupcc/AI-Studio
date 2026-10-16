import type { MainCanvas } from '@shared/project/types'
import { isReferenceablePath, projectPathName } from '@shared/tools/files'
import type { ProjectPath } from '@shared/tools/files'
import { addFileReference } from '../../input/add-file-reference'
import { filesApi } from './api'
import { addRejectionText, displayName, FILES_TEXT, nameUnsupported, referenceFailureText } from './strings'

export interface AddOutcome { tone: 'ok' | 'warn'; text: string }

/**
 * The "添加到对话" action. A name that cannot be written into a textual reference is refused before any call; otherwise
 * the service gives early feedback (`resolveReference`; the authoritative check runs again at send time) and the
 * Input module adds the tag to the conversation the Project's main canvas displays. Never throws.
 */
export async function addToConversation(request: { projectId: string; canvas: MainCanvas; path: ProjectPath }): Promise<AddOutcome> {
  const { projectId, canvas, path } = request, name = displayName(projectPathName(path))
  if (!isReferenceablePath(path)) return { tone: 'warn', text: nameUnsupported }
  try {
    const resolved = await filesApi().resolveReference({ projectId, paths: [path] })
    if (resolved.status === 'rejected') return { tone: 'warn', text: referenceFailureText(resolved.failures[0]?.reason ?? 'unreadable') }
    const result = await addFileReference({ projectId, canvas, path })
    if (result.status === 'rejected') return { tone: 'warn', text: addRejectionText(result.reason) }
    return { tone: 'ok', text: result.status === 'added' ? FILES_TEXT.added(name) : FILES_TEXT.duplicate(name) }
  } catch {
    return { tone: 'warn', text: FILES_TEXT.addFailed }
  }
}
