import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type StudioDatabase } from '../database/database'
import { migrations } from '../database/migrations'
import { createProjectService, type ProjectService } from './project-service'
import { placeOpenedProject } from '@shared/project/tabs'

let dir: string, database: StudioDatabase, projects: ProjectService
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio project '))
  database = openDatabase({ userDataDir: join(dir, 'data'), migrations })
  projects = createProjectService(() => database.db)
})
afterEach(() => { database.close(); rmSync(dir, { recursive: true, force: true }) })

function open(name = 'project') {
  const path = join(dir, name); mkdirSync(path)
  const result = projects.openPath(path)
  if (!result.ok) throw new Error(result.reason)
  return result
}
describe('Project persistence and identity · FR-PROJ-001/003 · AC-01', () => {
  it('reuses symlinks and equivalent paths without writing into a Project', () => {
    const a = open('Project With Spaces')
    symlinkSync(a.project.canonicalPath, join(dir, 'alias'))
    const alias = projects.openPath(join(dir, 'alias'))
    const equivalent = projects.openPath(join(dir, 'Project With Spaces', '..', 'Project With Spaces') + '/')
    expect(alias.ok && alias.project.id).toBe(a.project.id)
    expect(equivalent.ok && equivalent.project.id).toBe(a.project.id)
    expect(projects.listRecent()).toHaveLength(1)
    const child = open('another')
    expect(child.project.id).not.toBe(a.project.id)
  })
  it('rejects absent, file and unreadable paths without creating records', () => {
    expect(projects.openPath(join(dir, 'absent'))).toMatchObject({ ok: false, reason: 'not_found' })
    const file = join(dir, 'file'); writeFileSync(file, 'x')
    expect(projects.openPath(file)).toMatchObject({ ok: false, reason: 'not_directory' })
    const locked = join(dir, 'locked'); mkdirSync(locked); chmodSync(locked, 0)
    try { expect(projects.openPath(locked)).toMatchObject({ ok: false, reason: 'unreadable' }) }
    finally { chmodSync(locked, 0o700) }
    expect(projects.listRecent()).toHaveLength(0)
  })
  it.skipIf(process.platform !== 'darwin')('recognizes macOS case, Unicode and Data-volume aliases when the volume supports them', () => {
    const a = open('MiXeD Café')
    const aliases = [join(dir, 'mixed café'), join(dir, 'MiXeD Café'.normalize('NFD')), `/System/Volumes/Data${a.project.canonicalPath}`]
    for (const alias of aliases.filter(existsSync)) {
      const result = projects.openPath(alias)
      expect(result.ok && result.project.id).toBe(a.project.id)
    }
    expect(projects.listRecent()).toHaveLength(1)
  })
  it('restores independent canvases, tools, widths, tab order and current tab after database reopen', () => {
    const a = open('a'), b = open('b'), c = open('c')
    projects.updateUiState(a.project.id, { mainCanvas: { mode: 'session', sessionId: 's1' }, sidebarOpen: true, lastTool: 'diff', sidebarWidth: 510 })
    projects.updateUiState(b.project.id, { mainCanvas: { mode: 'draft' }, sidebarOpen: false, lastTool: 'terminal' })
    projects.updateUiState(c.project.id, { mainCanvas: { mode: 'view', viewId: 'architecture', conversation: { kind: 'session', sessionId: 's3' } }, viewRightArea: 'browser', viewConversationWidth: 480 })
    let window = projects.loadWindowState()
    window = placeOpenedProject(window, a.project.id, window.currentTabId)
    window = placeOpenedProject(window, b.project.id, null)
    window = placeOpenedProject(window, c.project.id, null)
    window.navCollapsed = true
    projects.saveWindowState(window)
    database.close(); database = openDatabase({ userDataDir: join(dir, 'data'), migrations })
    const boot = projects.bootstrap()
    expect(boot.windowState).toEqual(window)
    expect(boot.uiStates[a.project.id]).toMatchObject({ sidebarOpen: true, lastTool: 'diff', sidebarWidth: 510, mainCanvas: { mode: 'session', sessionId: 's1' } })
    expect(boot.uiStates[b.project.id]).toMatchObject({ mainCanvas: { mode: 'draft' }, sidebarOpen: false, lastTool: 'terminal' })
    expect(boot.uiStates[c.project.id]).toMatchObject({ viewRightArea: 'browser', viewConversationWidth: 480, mainCanvas: { mode: 'view', viewId: 'architecture' } })
  })
  it('hides recent entries without deleting records and reopens with saved state', () => {
    const a = open()
    projects.updateUiState(a.project.id, { lastTool: 'terminal' })
    projects.removeRecent(a.project.id)
    expect(projects.listRecent()).toEqual([])
    const again = projects.openPath(a.project.localPath)
    expect(again).toMatchObject({ ok: true, created: false, project: { id: a.project.id }, uiState: { lastTool: 'terminal' } })
    rmSync(a.project.localPath, { recursive: true })
    expect(projects.listRecent()[0]?.status).toBe('not_found')
  })
  it('falls back on corrupt UI blobs and repairs unknown/duplicate window tabs', () => {
    const a = open()
    database.db.prepare('UPDATE projects SET ui_state = ? WHERE id = ?').run('{corrupt', a.project.id)
    expect(projects.getUiState(a.project.id).mainCanvas).toMatchObject({ mode: 'view', viewId: 'overview' })
    const state = projects.saveWindowState({ tabs: [{ kind: 'project', projectId: a.project.id }, { kind: 'project', projectId: a.project.id }, { kind: 'project', projectId: 'gone' }], currentTabId: 'gone' })
    expect(state.tabs).toHaveLength(1)
    expect(state.currentTabId).toBe(state.tabs[0]!.id)
  })
})
