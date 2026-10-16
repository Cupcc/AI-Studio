import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { FILES_LIMITS, type FileReferenceResolver } from '@shared/tools/files'
import { createSessionFeature, isSessionWindowForeground } from '../../ipc/session'
import { runMigrations } from '../database/migrator'
import { coreAppMeta } from '../database/migrations/2026100901_core_app_meta'
import { projectCore } from '../database/migrations/2026100902_project_core'
import { sessionCore } from '../database/migrations/2026100903_session_core'
import { projectShellFor } from '../project'
import type { CoreServices } from '../core'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: vi.fn(() => []) } }))
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); vi.clearAllMocks() })

function feature(fileReferences?: FileReferenceResolver) {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, [coreAppMeta, projectCore, sessionCore])
  db.prepare('INSERT INTO projects(id,name,local_path,canonical_path,dev,ino,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('p', 'Project', '/tmp', '/tmp', '1', '1', '2026-10-09')
  const providers = [new FakeProvider('codex'), new FakeProvider('claude-code')]
  const core = {
    database: () => ({ db }), broadcast: vi.fn(), shellEnv: { get: async () => ({ env: { PATH: '/usr/bin' } }) }
  } as unknown as CoreServices
  const result = createSessionFeature(core, { providers, ...(fileReferences ? { fileReferences } : {}) })
  cleanups.push(async () => { await result.dispose?.(); db.close() })
  return { ...result, core, providers }
}

describe('Session IPC boundary · FR-STATE-004/005, S-Q1', () => {
  it('requires a matching live, focused, visible, non-minimized sender window', () => {
    const state = { destroyed: false, focused: true, visible: true, minimized: false }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{
      webContents: { id: 4 }, isDestroyed: () => state.destroyed, isFocused: () => state.focused,
      isVisible: () => state.visible, isMinimized: () => state.minimized
    } as unknown as BrowserWindow])
    expect(isSessionWindowForeground(4)).toBe(true)
    expect(isSessionWindowForeground(99)).toBe(false)
    for (const [key, value] of [['focused', false], ['visible', false], ['minimized', true], ['destroyed', true]] as const) {
      state[key] = value
      expect(isSessionWindowForeground(4)).toBe(false)
      state[key] = !value
    }
  })

  it('does not trust renderer foreground on completion and wires the Project close port', async () => {
    const f = feature()
    const ctx = { senderId: 99, senderUrl: 'app://studio' }
    const session = await f.handlers.create.handle({ projectId: 'p', cli: 'codex', text: 'hello' }, ctx)
    await new Promise(resolve => setTimeout(resolve, 0))
    await f.handlers.updateViewing.handle({ projectId: 'p', sessionId: session.id, foreground: true }, ctx)
    expect(await projectShellFor(f.core).sessionPort().getBlockingSessionCounts('p')).toEqual({ running: 1, needsInput: 0 })
    const runtime = f.providers[0]!.sessions[0]!.controller
    runtime.sink.nativeTurnEnded(runtime.activeTurn!.turnId, { status: 'completed' })
    await f.handlers.opened.handle({ projectId: 'p', sessionId: session.id }, ctx)
    const page = await f.handlers.getConversation.handle({ sessionId: session.id }, ctx)
    expect(page.session.completionUnread).toBe(true)
    expect(f.core.broadcast).toHaveBeenCalledWith(expect.objectContaining({ channel: 'session:summary-changed' }), expect.objectContaining({ session: expect.objectContaining({ status: 'completed_unread' }) }))
  })

  it('validates nested context, request responses and draft keys before handlers touch state', () => {
    const f = feature()
    expect(() => f.handlers.create.parse({ projectId: 'p', cli: 'bash', text: 'x' })).toThrow()
    expect(() => f.handlers.create.parse({ projectId: 'p', cli: 'codex', text: 'x', contextItems: [{ type: 'file', path: '/tmp', arbitrary: true }] })).toThrow()
    expect(() => f.handlers.create.parse({ projectId: 'p', cli: 'codex', text: 'x'.repeat(200_001) })).toThrow()
    expect(() => f.handlers.getConversation.parse({ sessionId: 's', beforeSequence: -1 })).toThrow()
    expect(() => f.handlers.getConversation.parse({ sessionId: 's', limit: 1.5 })).toThrow()
    expect(() => f.handlers.updateViewing.parse({ projectId: 'p', sessionId: 's', foreground: 'true' })).toThrow()
    expect(() => f.handlers.getDraft.parse({ projectId: 'p', kind: 'new_chat', sessionId: 's' })).toThrow()
    expect(() => f.handlers.answer.parse({ sessionId: 's', requestId: 'r', response: { kind: 'answers', answers: { q: { optionIds: 'not-array' } } } })).toThrow()
    expect(() => f.handlers.answer.parse({ sessionId: 's', requestId: 'r', response: { kind: 'approval', optionId: 'allow', shellCommand: 'ignored?' } })).toThrow()
  })

  describe('file context items · Tools §4.1', () => {
    const file = (path: unknown) => ({ type: 'file', path })
    const keys = { session: { projectId: 'p', kind: 'session', sessionId: 's' } }
    // Every entry point that accepts contextItems shares one parser; saveDraft is checked too because tags are persisted there.
    const entries = {
      create: (items: unknown[]) => (f: ReturnType<typeof feature>) => f.handlers.create.parse({ projectId: 'p', cli: 'codex', text: 'x', contextItems: items }),
      send: (items: unknown[]) => (f: ReturnType<typeof feature>) => f.handlers.send.parse({ sessionId: 's', text: 'x', contextItems: items }),
      saveDraft: (items: unknown[]) => (f: ReturnType<typeof feature>) => f.handlers.saveDraft.parse({ key: keys.session, draft: { cli: 'codex', model: null, text: 'x', contextItems: items } }).draft
    }

    it.each(Object.keys(entries) as (keyof typeof entries)[])('%s accepts Project-relative file paths and View items unchanged', name => {
      const f = feature()
      const items = [{ type: 'view', viewId: 'overview' }, file('src/a.ts'), file('docs/my file.md'), file('中文/文件.md'), file('a'.repeat(255))]
      expect(entries[name](items)(f).contextItems).toEqual(items)
    })

    it.each(Object.keys(entries) as (keyof typeof entries)[])('%s rejects paths that could leave the Project or break the reference', name => {
      const f = feature()
      const bad: [string, unknown][] = [
        ['absolute', file('/etc/passwd')], ['absolute project path', file('/tmp/p/a.ts')], ['dot-dot', file('../secret.txt')], ['nested dot-dot', file('a/../../b')],
        ['dot segment', file('./a.ts')], ['empty segment', file('a//b.ts')], ['trailing slash', file('dir/')], ['NUL', file('a\0b.ts')], ['empty', file('')],
        ['too long', file(`${'d'.repeat(200)}/`.repeat(6) + 'f')], ['name too long', file('x'.repeat(1021))], ['not a string', file(7)], ['missing path', { type: 'file' }],
        ['lone surrogate', file('a\uD800b')], ['extra key', { type: 'file', path: 'a.ts', absolutePath: '/tmp/a.ts' }], ['unknown type', { type: 'dir', path: 'a' }]
      ]
      for (const [why, item] of bad) expect(() => entries[name]([item])(f), why).toThrow()
    })

    it.each(Object.keys(entries) as (keyof typeof entries)[])(`%s allows at most ${FILES_LIMITS.referencesPerMessage} file references per message`, name => {
      const f = feature()
      const many = (count: number) => Array.from({ length: count }, (_, index) => file(`f${index}.ts`))
      expect(() => entries[name](many(FILES_LIMITS.referencesPerMessage))(f)).not.toThrow()
      expect(() => entries[name](many(FILES_LIMITS.referencesPerMessage + 1))(f)).toThrow('Too many file references')
      // View items do not count against the file limit.
      expect(() => entries[name]([{ type: 'view', viewId: 'overview' }, ...many(FILES_LIMITS.referencesPerMessage)])(f)).not.toThrow()
    })

    it('hands the injected resolver to the Session service: create reads it, and without one refuses explicitly', async () => {
      const ctx = { senderId: 99, senderUrl: 'app://studio' }
      const calls: unknown[] = []
      const resolver: FileReferenceResolver = {
        async resolve(projectId, paths) {
          calls.push({ projectId, paths: [...paths] })
          return { status: 'ok', files: paths.map(path => ({ path, name: path, size: 1, version: 'v', absolutePath: `/tmp/${path}` })) }
        }
      }
      const withResolver = feature(resolver)
      const session = await withResolver.handlers.create.handle({ projectId: 'p', cli: 'codex', text: 'hi', contextItems: [{ type: 'file', path: 'src/a.ts' }] }, ctx)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(calls).toEqual([{ projectId: 'p', paths: ['src/a.ts'] }])
      expect(withResolver.providers[0]!.sessions[0]!.driver.callsTo('startTurn')[0]!.args[1]).toMatchObject({ text: expect.stringContaining('- "src/a.ts"') })
      expect(session.activity).toBe('running')

      const bare = feature()
      await expect(bare.handlers.create.handle({ projectId: 'p', cli: 'codex', text: 'hi', contextItems: [{ type: 'file', path: 'src/a.ts' }] }, ctx)).rejects.toThrow('文件引用不可用')
      expect(bare.providers[0]!.sessions).toHaveLength(0)
    })
  })
})
