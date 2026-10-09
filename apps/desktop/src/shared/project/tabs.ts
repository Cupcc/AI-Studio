// Tab rules (specs/project/spec.md §2.2; PROJ-Q2 confirmed, PROJ-Q9/Q10
// recommendations). Pure functions over WindowState; callers persist.
import type { ProjectId, ProjectRecord, WindowState, WindowTab } from './types'

export function projectTabId(projectId: ProjectId): string {
  return `project:${projectId}`
}

export function newLauncherTabId(): string {
  return `launcher:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export function initialWindowState(launcherId = newLauncherTabId()): WindowState {
  return { tabs: [{ id: launcherId, kind: 'launcher' }], currentTabId: launcherId, navCollapsed: false }
}

export function findProjectTab(state: WindowState, projectId: ProjectId): WindowTab | undefined {
  return state.tabs.find((t) => t.kind === 'project' && t.projectId === projectId)
}

export function currentTab(state: WindowState): WindowTab | undefined {
  return state.tabs.find((t) => t.id === state.currentTabId)
}

export function currentProjectId(state: WindowState): ProjectId | null {
  const tab = currentTab(state)
  return tab?.kind === 'project' ? tab.projectId : null
}

export function openProjectIds(state: WindowState): ProjectId[] {
  return state.tabs.flatMap((t) => (t.kind === 'project' ? [t.projectId] : []))
}

/**
 * Repairs a stored or received window state: drops unknown Projects and
 * duplicates, keeps at most one launcher tab, and guarantees a valid current
 * tab (a launcher when nothing else is left).
 */
export function normalizeWindowState(
  raw: unknown,
  isKnownProject: (id: ProjectId) => boolean,
  makeLauncherId: () => string = newLauncherTabId
): WindowState {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const rawTabs = Array.isArray(record.tabs) ? record.tabs : []
  const tabs: WindowTab[] = []
  const seenProjects = new Set<string>()
  const seenIds = new Set<string>()
  let hasLauncher = false
  for (const item of rawTabs) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>
    if (t.kind === 'project' && typeof t.projectId === 'string' && isKnownProject(t.projectId)) {
      if (seenProjects.has(t.projectId)) continue
      seenProjects.add(t.projectId)
      const id = projectTabId(t.projectId)
      seenIds.add(id)
      tabs.push({ id, kind: 'project', projectId: t.projectId })
    } else if (t.kind === 'launcher' && !hasLauncher && typeof t.id === 'string' && t.id.startsWith('launcher:')) {
      if (seenIds.has(t.id) || t.id.length > 100) continue
      hasLauncher = true
      seenIds.add(t.id)
      tabs.push({ id: t.id, kind: 'launcher' })
    }
  }
  if (tabs.length === 0) {
    const id = makeLauncherId()
    tabs.push({ id, kind: 'launcher' })
  }
  const requested = typeof record.currentTabId === 'string' ? record.currentTabId : ''
  const currentTabId = tabs.some((t) => t.id === requested) ? requested : tabs[0]!.id
  return { tabs, currentTabId, navCollapsed: record.navCollapsed === true }
}

export function activateTab(state: WindowState, tabId: string): WindowState {
  if (state.currentTabId === tabId || !state.tabs.some((t) => t.id === tabId)) return state
  return { ...state, currentTabId: tabId }
}

/** `+` / ⌘T: focus the existing launcher tab, otherwise append one (PROJ-Q2, PROJ-Q10). */
export function addLauncherTab(state: WindowState, makeLauncherId: () => string = newLauncherTabId): WindowState {
  const existing = state.tabs.find((t) => t.kind === 'launcher')
  if (existing) return activateTab(state, existing.id)
  const id = makeLauncherId()
  return { ...state, tabs: [...state.tabs, { id, kind: 'launcher' }], currentTabId: id }
}

/**
 * Places an opened Project (spec §2.1.4). Already open: switch to its tab and,
 * when the request came from a launcher tab, close that launcher (PROJ-Q2).
 * Otherwise a launcher origin turns into the Project tab in place; any other
 * origin appends the tab on the right.
 */
export function placeOpenedProject(state: WindowState, projectId: ProjectId, originTabId: string | null): WindowState {
  const origin = originTabId ? state.tabs.find((t) => t.id === originTabId) : undefined
  const existing = findProjectTab(state, projectId)
  if (existing) {
    const tabs = origin?.kind === 'launcher' ? state.tabs.filter((t) => t.id !== origin.id) : state.tabs
    return { ...state, tabs, currentTabId: existing.id }
  }
  const tab: WindowTab = { id: projectTabId(projectId), kind: 'project', projectId }
  if (origin?.kind === 'launcher') {
    return { ...state, tabs: state.tabs.map((t) => (t.id === origin.id ? tab : t)), currentTabId: tab.id }
  }
  return { ...state, tabs: [...state.tabs, tab], currentTabId: tab.id }
}

/** A sole launcher tab cannot be closed (PROJ-Q2). */
export function canCloseTab(state: WindowState, tabId: string): boolean {
  const tab = state.tabs.find((t) => t.id === tabId)
  if (!tab) return false
  return !(tab.kind === 'launcher' && state.tabs.length === 1)
}

/**
 * Removes a tab. Closing the current tab activates its right neighbour, else
 * the left one (PROJ-Q10); closing the last Project tab leaves a launcher.
 */
export function closeTab(state: WindowState, tabId: string, makeLauncherId: () => string = newLauncherTabId): WindowState {
  if (!canCloseTab(state, tabId)) return state
  const index = state.tabs.findIndex((t) => t.id === tabId)
  const tabs = state.tabs.filter((t) => t.id !== tabId)
  if (tabs.length === 0) {
    const id = makeLauncherId()
    return { ...state, tabs: [{ id, kind: 'launcher' }], currentTabId: id }
  }
  if (state.currentTabId !== tabId) return { ...state, tabs }
  const next = tabs[index] ?? tabs[index - 1]!
  return { ...state, tabs, currentTabId: next.id }
}

/** ⌃Tab / ⌃⇧Tab, wrapping around. */
export function cycleTab(state: WindowState, delta: 1 | -1): WindowState {
  if (state.tabs.length < 2) return state
  const index = state.tabs.findIndex((t) => t.id === state.currentTabId)
  const next = state.tabs[(index + delta + state.tabs.length) % state.tabs.length]!
  return activateTab(state, next.id)
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0)
}

/**
 * Tab titles with same-name disambiguation (PROJ-Q9): duplicates get the
 * shortest parent-path suffix that tells them apart, e.g. "app · work".
 */
export function tabLabels(projects: readonly ProjectRecord[]): Map<ProjectId, string> {
  const labels = new Map<ProjectId, string>()
  const byName = new Map<string, ProjectRecord[]>()
  for (const p of projects) {
    const group = byName.get(p.name) ?? []
    group.push(p)
    byName.set(p.name, group)
  }
  for (const [name, group] of byName) {
    if (group.length === 1) {
      labels.set(group[0]!.id, name)
      continue
    }
    const parents = group.map((p) => splitPath(p.localPath).slice(0, -1))
    const maxDepth = Math.max(...parents.map((s) => s.length))
    let depth = 1
    for (; depth <= maxDepth; depth++) {
      const suffixes = parents.map((s) => s.slice(-depth).join('/'))
      if (new Set(suffixes).size === suffixes.length) break
    }
    group.forEach((p, i) => {
      const suffix = parents[i]!.slice(-Math.min(depth, maxDepth)).join('/')
      labels.set(p.id, suffix ? `${name} · ${suffix}` : name)
    })
  }
  return labels
}
