// Independent regression: the filesystem, rather than platform/NFC guesses, proves reference aliases.
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import type { FileReferenceResolver, ResolvedFileReference } from '@shared/tools/files'
import { resolveFileReferences } from '../../../../apps/desktop/src/main/services/files/references'
import { createFilesService } from '../../../../apps/desktop/src/main/services/files/service'
import { SessionService } from '../../../../apps/desktop/src/main/services/session/session-service'
import { SessionStore } from '../../../../apps/desktop/src/main/services/session/store'
import { parseReferencedFiles } from '../../../../apps/desktop/src/main/services/session/file-reference'
import { createProjectService } from '../../../../apps/desktop/src/main/services/project/project-service'
import { runMigrations } from '../../../../apps/desktop/src/main/services/database/migrator'
import { coreAppMeta } from '../../../../apps/desktop/src/main/services/database/migrations/2026100901_core_app_meta'
import { projectCore } from '../../../../apps/desktop/src/main/services/database/migrations/2026100902_project_core'
import { sessionCore } from '../../../../apps/desktop/src/main/services/database/migrations/2026100903_session_core'

const fs = vi.hoisted(() => ({ targets: new Map<string, string>(), calls: [] as string[] }))
vi.mock('../../../../apps/desktop/src/main/services/files/safe-path', () => ({
  async openRegularFile(_root: string, path: string) {
    fs.calls.push(path)
    const real = fs.targets.get(path)
    if (real === undefined) return { ok: false, reason: 'missing' }
    return { ok: true, file: { handle: { close: async () => {} }, stats: { dev: 1n, ino: 2n, size: 3n, mtimeNs: 4n }, entry: { real } } }
  }
}))
const cleanup: (() => Promise<void>)[] = []
beforeEach(() => { fs.targets.clear(); fs.calls.length = 0 })
afterEach(async () => { for (const run of cleanup.splice(0).reverse()) await run() })
const reference = (path: string, aliases?: string[]): ResolvedFileReference => ({ path, name: path, size: 3, version: 'v', absolutePath: `/project/${path}`, ...(aliases ? { aliases } : {}) })

function session(resolver: FileReferenceResolver) {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, [coreAppMeta, projectCore, sessionCore])
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('p', 'p', '/project', '/project', '1', '1', '2026-10-17')
  const provider = new FakeProvider('codex')
  const service = new SessionService({ store: new SessionStore(db), projects: createProjectService(() => db), providers: [provider, new FakeProvider('claude-code')], environment: async () => ({ env: {} }), fileReferences: resolver })
  cleanup.push(async () => { await service.dispose(); db.close() })
  const create = (paths: string[]) => service.create({ projectId: 'p', cli: 'codex', text: 'read', contextItems: paths.map((path) => ({ type: 'file' as const, path })) })
  const delivered = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    const call = provider.sessions[0]!.driver.callsTo('startTurn')[0]!
    return parseReferencedFiles((call.args[1] as { text: string }).text)
  }
  return { create, delivered, service, provider }
}

describe('W21 filesystem identity and request coverage', () => {
  it.each([['Case.txt', 'case.txt'], ['caf\u00e9.txt', 'cafe\u0301.txt']])('preserves distinct real targets for %j', async (first, second) => {
    fs.targets.set(first, `/project/${first}`); fs.targets.set(second, `/project/${second}`)
    const result = await resolveFileReferences('/project', [first, second])
    expect(fs.calls).toEqual([first, second])
    expect(result.status === 'ok' && result.files.map((file) => file.path)).toEqual([first, second])
  })

  it('checks every alternate spelling and records the exact proven aliases', async () => {
    const paths = ['Case.txt', 'case.txt', 'CASE.txt']
    for (const path of paths) fs.targets.set(path, '/project/Case.txt')
    const result = await resolveFileReferences('/project', paths)
    expect(fs.calls).toEqual(paths)
    expect(result.status === 'ok' && result.files).toMatchObject([{ path: 'Case.txt', aliases: ['case.txt', 'CASE.txt'] }])
  })

  it('does not skip a missing NFC-equivalent request on a Unicode-sensitive filesystem', async () => {
    fs.targets.set('caf\u00e9.txt', '/project/caf\u00e9.txt')
    const result = await resolveFileReferences('/project', ['caf\u00e9.txt', 'cafe\u0301.txt'])
    expect(fs.calls).toEqual(['caf\u00e9.txt', 'cafe\u0301.txt'])
    expect(result).toEqual({ status: 'rejected', failures: [{ path: 'cafe\u0301.txt', reason: 'missing' }] })
  })

  it('passes case and Unicode-distinct requests intact to the resolver and Provider', async () => {
    const paths = ['Case.txt', 'case.txt', 'caf\u00e9.txt', 'cafe\u0301.txt']
    const received: string[][] = []
    const h = session({ async resolve(_id, input) { received.push([...input]); return { status: 'ok', files: input.map((path) => reference(path)) } } })
    await h.create(paths)
    expect(received).toEqual([paths])
    expect(await h.delivered()).toEqual(paths)
  })

  it('accepts a collapsed file only with an explicit alias for each remaining exact request', async () => {
    const h = session({ async resolve() { return { status: 'ok', files: [reference('Case.txt', ['case.txt'])] } } })
    const created = await h.create(['Case.txt', 'case.txt'])
    expect(await h.delivered()).toEqual(['Case.txt'])
    const transcript = JSON.stringify(h.service.getConversation(created.id))
    expect(transcript).not.toContain('"aliases"')
    expect(transcript).not.toContain('/project/')
  })

  it('strips filesystem aliases and absolute paths from the renderer reference result', async () => {
    fs.targets.set('Case.txt', '/project/Case.txt'); fs.targets.set('case.txt', '/project/Case.txt')
    const files = createFilesService({ projectRoot: () => '/project', changed: () => {}, watchChanged: () => {} })
    cleanup.push(() => files.dispose())
    const result = await files.resolveReference('p', ['Case.txt', 'case.txt'])
    expect(result).toEqual({ status: 'ok', files: [{ path: 'Case.txt', name: 'Case.txt', size: 3, version: '1:2:3:4' }] })
  })

  it.each([
    [reference('unrequested.txt'), reference('b.txt')],
    [reference('a.txt', ['b.txt']), reference('b.txt')],
    [reference('a.txt', ['b.txt', 'EXTRA.txt'])],
    [reference('a.txt', ['b.txt', 'b.txt'])],
    [reference('a.txt')]
  ])('rejects malformed resolver coverage before any Session or Provider state', async (...resolved) => {
    const h = session({ async resolve() { return { status: 'ok', files: resolved } } })
    await expect(h.create(['a.txt', 'b.txt'])).rejects.toThrow('返回的文件与请求不一致')
    expect(h.service.list('p')).toEqual([])
    expect(h.provider.sessions).toHaveLength(0)
  })
})
