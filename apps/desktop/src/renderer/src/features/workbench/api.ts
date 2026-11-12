import { ipcErrorText } from '../../lib/ipc-error'
import { studio } from '../../lib/studio'
export const workbenchApi = () => studio().workbench

export function describeWorkbenchError(error: unknown): string {
  return ipcErrorText(error)
}
