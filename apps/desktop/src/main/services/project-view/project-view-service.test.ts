import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectViewService } from './project-view-service'
import type { ViewState } from '@shared/project-view/types'
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).reverse().forEach(fn => fn()))
function harness() {
  const root = mkdtempSync(join(tmpdir(), 'studio-view-'))
  const roots = { a: join(root, 'a'), b: join(root, 'b') }
  Object.values(roots).forEach(path => mkdirSync(path))
  const events: ViewState[] = []
  const service = new ProjectViewService({ projectPath: id => roots[id as keyof typeof roots], changed: state => events.push(state), settleMs: 5 })
  cleanups.push(() => { service.dispose(); rmSync(root, { recursive: true, force: true }) })
  function write(project = 'a', data: unknown = { summary: 'Payment architecture' }) {
    const dir = join(roots[project as keyof typeof roots], '.ai-studio/knowledge'); mkdirSync(dir, { recursive: true })
    const path = join(dir, 'architecture.json')
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, viewId: 'architecture', data }))
    return path
  }
  return { root, roots, service, events, write }
}
describe('Project View files, watcher, last-good and boundaries', () => {
  it('does not write on open or context lookup; initialization writes helpers only and is idempotent', async () => {
    const h = harness()
    expect(h.service.list('a')).toHaveLength(5)
    expect((await h.service.getSnapshot('a', 'architecture')).status).toBe('empty')
    h.service.buildContext('a', 'architecture')
    expect(existsSync(join(h.roots.a, '.ai-studio'))).toBe(false)
    const context = h.service.buildContext('a', 'architecture', true)
    h.service.buildContext('a', 'architecture', true)
    expect(context.text).toContain('Current Project View: Architecture')
    expect(readFileSync(join(h.roots.a, '.ai-studio/.gitignore'), 'utf8')).toBe('*\n')
    expect(existsSync(join(h.roots.a, '.ai-studio/knowledge'))).toBe(false)
    expect(existsSync(join(h.roots.a, '.ai-studio/views'))).toBe(false)
  })
  it('keeps last-good for partial JSON, unknown version and invalid definition, then recovers', async () => {
    const h = harness(), path = h.write()
    const first = await h.service.getSnapshot('a', 'architecture')
    expect(first.status).toBe('ready')
    for (const text of ['{"schemaVersion":', JSON.stringify({ schemaVersion: 2, viewId: 'architecture', data: {} })]) {
      writeFileSync(path, text)
      const bad = await h.service.getSnapshot('a', 'architecture')
      expect(bad.status).toBe('error'); expect(bad.snapshot).toEqual(first.snapshot)
    }
    h.write()
    const views = join(h.roots.a, '.ai-studio/views'); mkdirSync(views)
    const viewPath = join(views, 'architecture.view.json')
    writeFileSync(viewPath, JSON.stringify({ schemaVersion: 1, viewId: 'architecture', bindings: {}, root: { type: 'script' } }))
    expect((await h.service.getSnapshot('a', 'architecture')).snapshot).toEqual(first.snapshot)
    rmSync(viewPath)
    h.write('a', { summary: 'Recovered' })
    const recovered = await h.service.getSnapshot('a', 'architecture')
    expect(recovered.status).toBe('ready')
    expect(recovered.snapshot!.knowledge!.data.summary).toBe('Recovered')
    expect(recovered.revision).toBeGreaterThan(first.revision)
  })
  it('watches creation and external updates, isolates projects, closes and rescans on reopen', async () => {
    const h = harness()
    await h.service.getSnapshot('a', 'architecture')
    h.write()
    await expect.poll(() => h.events.findLast(e => e.projectId === 'a' && e.viewId === 'architecture')?.status).toBe('ready')
    h.write('b', { summary: 'Other project' })
    expect((await h.service.getSnapshot('b', 'architecture')).snapshot!.knowledge!.data.summary).toBe('Other project')
    h.service.close('a')
    const count = h.events.filter(e => e.projectId === 'a').length
    h.write('a', { summary: 'Reopened' })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(h.events.filter(e => e.projectId === 'a')).toHaveLength(count)
    expect((await h.service.getSnapshot('a', 'architecture')).snapshot!.knowledge!.data.summary).toBe('Reopened')
  })
  it('rejects oversized files without clearing last-good', async () => {
    const h = harness(), path = h.write()
    const first = await h.service.getSnapshot('a', 'architecture')
    writeFileSync(path, 'x'.repeat(256 * 1024 + 1))
    const bad = await h.service.getSnapshot('a', 'architecture')
    expect(bad.error).toContain('256 KiB'); expect(bad.snapshot).toEqual(first.snapshot)
  })
  it('rejects external symlinks on read and initialization without modifying their target', async () => {
    const h = harness()
    symlinkSync(h.roots.b, join(h.roots.a, '.ai-studio'))
    expect((await h.service.getSnapshot('a', 'architecture')).status).toBe('error')
    expect(() => h.service.buildContext('a', 'architecture', true)).toThrow('Symbolic')
    expect(existsSync(join(h.roots.b, 'GUIDE.md'))).toBe(false)
  })
  it('refuses client helper hardlinks before truncating', () => {
    const h = harness(), outside = join(h.roots.b, 'keep')
    writeFileSync(outside, 'preserve')
    mkdirSync(join(h.roots.a, '.ai-studio'))
    linkSync(outside, join(h.roots.a, '.ai-studio/.gitignore'))
    expect(() => h.service.buildContext('a', 'architecture', true)).toThrow('Unsafe')
    expect(readFileSync(outside, 'utf8')).toBe('preserve')
  })
  it('rejects oversized bound diagrams instead of silently truncating them', async () => {
    const h = harness()
    h.write('a', { graph: { nodes: Array.from({ length: 501 }, (_, index) => ({ id: String(index) })) } })
    expect((await h.service.getSnapshot('a', 'architecture')).error).toContain('500 nodes')
  })
})
