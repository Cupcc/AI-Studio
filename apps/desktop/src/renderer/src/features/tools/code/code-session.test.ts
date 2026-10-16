import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { codeViewStates, openCodeSession, type CodeContent } from './code-session'
import { codeAriaLabel } from './editor-options'
import { createFakeMonaco } from './fake-monaco'

const never = () => false
const file = (path: string, text: string, key = `k:${path}`): CodeContent => ({ path, text, viewStateKey: key })
const FAKE_LANGUAGES = { typescript: {}, python: {}, json: {} }

let host: HTMLElement
beforeEach(() => { host = document.createElement('div'); document.body.append(host); codeViewStates.clear() })
afterEach(() => { host.remove(); delete document.documentElement.dataset.scheme })

describe('openCodeSession', () => {
  it('creates one read-only editor on one model, with the language of the path and an accessible name', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = await openCodeSession(fake.runtime, host, file('src/app.ts', 'const a = 1'), never)
    expect(session).not.toBeNull()
    expect(fake.liveEditors()).toHaveLength(1)
    expect(fake.liveModels()).toHaveLength(1)
    const [editor] = fake.liveEditors()
    expect(editor!.host).toBe(host)
    expect(editor!.model!.value).toBe('const a = 1')
    expect(editor!.model!.language).toBe('typescript')
    expect(editor!.options).toMatchObject({ readOnly: true, ariaLabel: codeAriaLabel('src/app.ts') })
    expect(fake.languageRequests).toEqual(['typescript'])
    session!.dispose()
  })

  it('shows plain text for unknown files and when the grammar fails to register', async () => {
    const fake = createFakeMonaco({ python: { ok: false } })
    const plain = await openCodeSession(fake.runtime, host, file('LICENSE', 'text'), never)
    expect(fake.models[0]!.language).toBe('plaintext')
    const failed = await openCodeSession(fake.runtime, host, file('tool.py', 'x = 1'), never)
    expect(fake.models[1]!.language).toBe('plaintext')
    plain!.dispose(); failed!.dispose()
  })

  it('switches off bracket colourisation after the editor exists (Monaco re-enables it on creation)', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = await openCodeSession(fake.runtime, host, file('a.ts', 'x'), never)
    expect(fake.models[0]!.getOptions().bracketPairColorizationOptions.enabled).toBe(false)
    fake.models[0]!.forceBracketColorization()
    expect(fake.models[0]!.getOptions().bracketPairColorizationOptions.enabled).toBe(false)
    session!.dispose()
  })

  it('restores the remembered scroll / selection of the key when the file is opened again', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    codeViewStates.set('k:a', { scrollTop: 500, line: 9 } as never)
    const session = await openCodeSession(fake.runtime, host, file('a.ts', 'x', 'k:a'), never)
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 500, line: 9 })
    session!.dispose()
  })

  it('creates nothing and returns null when cancelled while the font or grammar is loading', async () => {
    const fake = createFakeMonaco({ typescript: { pending: true } })
    let cancelled = false
    const opening = openCodeSession(fake.runtime, host, file('a.ts', 'x'), () => cancelled)
    await vi.waitFor(() => expect(fake.languageRequests).toContain('typescript'))
    cancelled = true
    fake.resolveLanguage('typescript')
    expect(await opening).toBeNull()
    expect(fake.editors).toHaveLength(0)
    expect(fake.models).toHaveLength(0)
  })

  it('frees the model and rethrows when the editor cannot be created', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    fake.failNextCreates(true)
    await expect(openCodeSession(fake.runtime, host, file('a.ts', 'x'), never)).rejects.toThrow('create failed')
    expect(fake.liveModels()).toHaveLength(0)
  })
})

describe('CodeSession.show', () => {
  it('keeps the position when the same file is read again: save, replace the text, restore (same editor, same model)', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'one', 'k:a'), never))!
    fake.editors[0]!.state = { scrollTop: 321, line: 7 }
    fake.log.length = 0
    session.show(file('a.ts', 'two', 'k:a'))
    expect(fake.log).toEqual(['code.saveViewState', 'model1.setValue', 'code.restoreViewState'])
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 321, line: 7 })
    expect(fake.models[0]!.value).toBe('two')
    expect(fake.liveEditors()).toHaveLength(1)
    expect(fake.liveModels()).toHaveLength(1)
    session.dispose()
  })

  it('parks the old file\'s position under its key and restores the new file\'s', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    codeViewStates.set('k:b', { scrollTop: 80, line: 3 } as never)
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    fake.editors[0]!.state = { scrollTop: 900, line: 40 }
    session.show(file('b.ts', 'B', 'k:b'))
    expect(codeViewStates.get('k:a')).toEqual({ scrollTop: 900, line: 40 })
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 80, line: 3 })
    expect(fake.models[0]!.value).toBe('B')
    expect(fake.editors[0]!.updates).toContainEqual({ ariaLabel: codeAriaLabel('b.ts') })
    session.show(file('a.ts', 'A', 'k:a'))
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 900, line: 40 })
    session.dispose()
  })

  it('starts a file without a remembered position at the top', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    fake.editors[0]!.state = { scrollTop: 700, line: 30 }
    session.show(file('fresh.ts', 'F', 'k:fresh'))
    expect(fake.editors[0]!.state.scrollTop).toBe(0)
    session.dispose()
  })

  it('does nothing for identical content', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    fake.log.length = 0
    session.show(file('a.ts', 'A', 'k:a'))
    expect(fake.log).toEqual([])
    session.dispose()
  })

  it('applies the language of the new path after its grammar is registered, and ignores a superseded request', async () => {
    const fake = createFakeMonaco({ typescript: {}, python: { pending: true }, json: { pending: true } })
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    session.show(file('b.py', 'B', 'k:b'))
    session.show(file('c.json', 'C', 'k:c'))
    expect(fake.models[0]!.language).toBe('typescript')
    fake.resolveLanguage('json')
    await Promise.resolve(); await Promise.resolve()
    expect(fake.models[0]!.language).toBe('json')
    fake.resolveLanguage('python')                       // the older request finishes last and must not win
    await Promise.resolve(); await Promise.resolve()
    expect(fake.models[0]!.language).toBe('json')
    session.dispose()
  })

  it('shows plain text when the grammar of the new path cannot be registered', async () => {
    const fake = createFakeMonaco({ typescript: {} })
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    session.show(file('b.zig', 'B', 'k:b'))
    await Promise.resolve(); await Promise.resolve()
    expect(fake.models[0]!.language).toBe('plaintext')
    session.dispose()
  })
})

describe('CodeSession.dispose', () => {
  it('remembers the position under the current key, then destroys the editor and the model', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    fake.editors[0]!.state = { scrollTop: 1234, line: 55 }
    session.dispose()
    expect(codeViewStates.get('k:a')).toEqual({ scrollTop: 1234, line: 55 })
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
    expect(fake.log.slice(-3)).toEqual(['code.saveViewState', 'code.dispose', 'model1.dispose'])
  })

  it('is idempotent, and a disposed session ignores show()', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    session.dispose(); session.dispose()
    fake.log.length = 0
    session.show(file('b.ts', 'B', 'k:b'))
    expect(fake.log).toEqual([])
    expect(fake.models.filter((model) => model.disposed)).toHaveLength(1)
  })

  it('stops following the colour scheme', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    document.documentElement.dataset.scheme = 'light'
    const session = (await openCodeSession(fake.runtime, host, file('a.ts', 'A', 'k:a'), never))!
    document.documentElement.dataset.scheme = 'dark'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fake.themes).toHaveLength(1)
    session.dispose()
    document.documentElement.dataset.scheme = 'light'
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fake.themes).toHaveLength(1)
  })

  it('leaks no models over many open / close cycles', async () => {
    const fake = createFakeMonaco(FAKE_LANGUAGES)
    for (let i = 0; i < 25; i++) (await openCodeSession(fake.runtime, host, file(`f${i}.ts`, `t${i}`, `k:${i}`), never))!.dispose()
    expect(fake.models).toHaveLength(25)
    expect(fake.liveModels()).toHaveLength(0)
    expect(fake.liveEditors()).toHaveLength(0)
  })
})
