import { viewName } from '@shared/project/strings'
import type { WorkbenchCatalog } from '@shared/workbench/types'
import { useWorkbenches } from './store'

export function titleForView(_projectId: string, viewId: string, catalog?: WorkbenchCatalog): string {
  return catalog?.find(item => item.viewId === viewId)?.title ?? viewName(viewId)
}

export function useViewTitle(projectId: string, viewId: string): string {
  const catalog = useWorkbenches(s => s.catalogs[projectId])
  return titleForView(projectId, viewId, catalog)
}
