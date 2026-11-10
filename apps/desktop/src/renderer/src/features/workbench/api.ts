import { studio } from '../../lib/studio'
export const workbenchApi = () => studio().workbench

export function describeWorkbenchError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}
