import { viewName } from '@shared/project/strings'
import { isWorkbenchViewId, workbenchTarget } from '@shared/workbench/types'
import type { WorkbenchCatalog } from '@shared/workbench/types'
import { useWorkbenches } from './store'

export function titleForView(projectId: string, viewId: string, catalog?: WorkbenchCatalog): string {
  if (!isWorkbenchViewId(viewId)) return viewName(viewId)
  const target = workbenchTarget(projectId, viewId)
  if (target.kind === 'draft') return catalog?.drafts.find(item => item.id === target.id)?.title ?? '工作台草稿'
  return catalog?.instances.find(item => item.id === target.id)?.title ?? '工作台'
}

export function useViewTitle(projectId: string, viewId: string): string {
  const catalog = useWorkbenches(s => s.catalogs[projectId])
  return titleForView(projectId, viewId, catalog)
}
