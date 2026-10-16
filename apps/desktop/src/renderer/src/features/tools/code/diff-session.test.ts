import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diffViewStates, openDiffSession, type DiffContent } from './diff-session'
import { modifiedAriaLabel, originalAriaLabel } from './editor-options'
import { createFakeMonaco } from './fake-monaco'

const never = () => false
const diff = (path: string, original: string, modified: string, key = `k:${path}`): DiffContent => ({ path, original, modified, viewStateKey: key })
const LANGUAGES = { typescript: {}, python: {} }

let host: HTMLElement
beforeEach(() => { host = document.createElement('div'); document.body.append(host); diffViewStates.clear() })
afterEach(() => { host.remove() })

describe('openDiffSession', () => {
  it('creates one read-only diff editor with an original and a modified model of the path\'s language', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    const session = await openDiffSession(fake.runtime, host, diff('src/a.ts', 'old', 'new'), never)
    expect(fake.liveEditors()).toHaveLength(1)
    const [editor] = fake.liveEditors()
    expect(editor!.kind).toBe('diff')
    expect(editor!.options).toMatchObject({ readOnly: true, originalEditable: false, originalAriaLabel: originalAriaLabel('src/a.ts'), modifiedAriaLabel: modifiedAriaLabel('src/a.ts') })
    expect(editor!.models!.original.value).toBe('old')
    expect(editor!.models!.modified.value).toBe('new')
    expect(fake.liveModels().map((model) => model.language)).toEqual(['typescript', 'typescript'])
    expect(fake.liveModels().every((model) => !model.getOptions().bracketPairColorizationOptions.enabled)).toBe(true)
    session!.dispose()
  })

  it('creates nothing when cancelled meanwhile, and frees the models when the editor cannot be created', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    expect(await openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm'), () => true)).toBeNull()
    expect(fake.editors).toHaveLength(0)
    fake.failNextCreates(true)
    await expect(openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm'), never)).rejects.toThrow('create failed')
    expect(fake.liveModels()).toHaveLength(0)
  })

  it('restores the remembered position only after the first diff has been computed', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    diffViewStates.set('k:a', { scrollTop: 640, line: 12 } as never)
    const session = (await openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm', 'k:a'), never))!
    expect(fake.log).not.toContain('diff.restoreViewState')
    fake.editors[0]!.fireDiffUpdate()
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 640, line: 12 })
    fake.editors[0]!.fireDiffUpdate()                     // later recomputations must not pull the view back
    expect(fake.log.filter((entry) => entry === 'diff.restoreViewState')).toHaveLength(1)
    session.dispose()
  })
})

describe('DiffSession.show', () => {
  it('replaces only the side that changed and restores the position once the new diff is computed', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    const session = (await openDiffSession(fake.runtime, host, diff('a.ts', 'old', 'new', 'k:a'), never))!
    fake.editors[0]!.state = { scrollTop: 250, line: 20 }
    fake.log.length = 0
    session.show(diff('a.ts', 'old', 'newer', 'k:a'))
    const [original, modified] = [fake.models[0]!, fake.models[1]!]
    expect(original.value).toBe('old')
    expect(modified.value).toBe('newer')
    expect(fake.log).toEqual(['diff.saveViewState', `model${modified.id}.setValue`])
    fake.editors[0]!.state = { scrollTop: 0, line: 1 }    // the diff recomputation re-lays out the view
    fake.editors[0]!.fireDiffUpdate()
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 250, line: 20 })
    expect(fake.liveEditors()).toHaveLength(1)
    expect(fake.liveModels()).toHaveLength(2)
    session.dispose()
  })

  it('parks the old file\'s position under its key and relabels both sides for another path', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    const session = (await openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm', 'k:a'), never))!
    fake.editors[0]!.state = { scrollTop: 77, line: 5 }
    session.show(diff('b.py', 'o2', 'm2', 'k:b'))
    expect(diffViewStates.get('k:a')).toEqual({ scrollTop: 77, line: 5 })
    expect(fake.editors[0]!.updates).toContainEqual({ original: { ariaLabel: originalAriaLabel('b.py') } })
    expect(fake.editors[0]!.updates).toContainEqual({ modified: { ariaLabel: modifiedAriaLabel('b.py') } })
    await vi.waitFor(() => expect(fake.models.map((model) => model.language)).toEqual(['python', 'python']))
    session.dispose()
  })

  it('does nothing for identical content', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    const session = (await openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm', 'k:a'), never))!
    fake.log.length = 0
    session.show(diff('a.ts', 'o', 'm', 'k:a'))
    expect(fake.log).toEqual([])
    session.dispose()
  })
})

describe('DiffSession.dispose', () => {
  it('detaches the models, destroys the editor, then frees both models, remembering the position', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    const session = (await openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm', 'k:a'), never))!
    fake.editors[0]!.fireDiffUpdate()
    fake.editors[0]!.state = { scrollTop: 9, line: 2 }
    fake.log.length = 0
    session.dispose()
    expect(diffViewStates.get('k:a')).toEqual({ scrollTop: 9, line: 2 })
    expect(fake.log).toEqual(['diff.saveViewState', 'diff.setModel(null)', 'diff.dispose', 'model1.dispose', 'model2.dispose'])
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
  })

  it('keeps the position that was still waiting to be restored instead of saving the top-of-file state', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    diffViewStates.set('k:a', { scrollTop: 640, line: 12 } as never)
    const session = (await openDiffSession(fake.runtime, host, diff('a.ts', 'o', 'm', 'k:a'), never))!
    session.dispose()                                     // closed before the diff was ever computed
    expect(diffViewStates.get('k:a')).toEqual({ scrollTop: 640, line: 12 })
  })

  it('is idempotent and leaks nothing over many open / close cycles', async () => {
    const fake = createFakeMonaco(LANGUAGES)
    for (let i = 0; i < 20; i++) { const session = (await openDiffSession(fake.runtime, host, diff(`f${i}.ts`, 'o', 'm', `k:${i}`), never))!; session.dispose(); session.dispose() }
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
    expect(fake.models).toHaveLength(40)
  })
})
