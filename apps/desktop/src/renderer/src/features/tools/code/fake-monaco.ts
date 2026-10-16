import type { MonacoRuntime } from './monaco-runtime-types'

/**
 * A recording stand-in for the parts of Monaco the viewers use (jsdom cannot run the real editor). It keeps just enough
 * state to assert lifecycle behaviour: which editors and models are alive, their content, language, view state and the
 * order of calls. Test helper, not a test file.
 */
export interface FakeModel {
  id: number
  value: string
  language: string
  disposed: boolean
  bracketColorization: boolean
  setValue(value: string): void
  getOptions(): { bracketPairColorizationOptions: { enabled: boolean } }
  updateOptions(options: { bracketColorizationOptions?: { enabled: boolean } }): void
  onDidChangeOptions(listener: () => void): { dispose(): void }
  /** Simulates Monaco's configuration service re-enabling bracket colourisation. */
  forceBracketColorization(): void
  dispose(): void
}

export interface FakeEditor {
  kind: 'code' | 'diff'
  host: HTMLElement
  options: Record<string, unknown>
  model: FakeModel | null
  models: { original: FakeModel; modified: FakeModel } | null
  state: { scrollTop: number; line: number }
  disposed: boolean
  updates: Record<string, unknown>[]
  /** Fires `onDidUpdateDiff` listeners (diff editor only). */
  fireDiffUpdate(): void
}

export interface FakeLanguage { pending?: boolean; ok?: boolean }

export function createFakeMonaco(languages: Record<string, FakeLanguage> = {}) {
  const log: string[] = []
  const editors: FakeEditor[] = []
  const models: FakeModel[] = []
  const themes: string[] = []
  const definedThemes: string[] = []
  const languageRequests: string[] = []
  const pendingLanguage = new Map<string, () => void>()
  let remeasures = 0
  let nextId = 1
  let failCreate = false

  function makeModel(value: string, language = 'plaintext'): FakeModel {
    const listeners = new Set<() => void>()
    const model: FakeModel = {
      id: nextId++, value, language, disposed: false, bracketColorization: true,
      setValue(next) { log.push(`model${model.id}.setValue`); model.value = next },
      getOptions: () => ({ bracketPairColorizationOptions: { enabled: model.bracketColorization } }),
      updateOptions(options) {
        if (options.bracketColorizationOptions) model.bracketColorization = options.bracketColorizationOptions.enabled
        listeners.forEach((l) => l())
      },
      onDidChangeOptions(listener) { listeners.add(listener); return { dispose: () => { listeners.delete(listener) } } },
      forceBracketColorization() { model.bracketColorization = true; listeners.forEach((l) => l()) },
      dispose() { log.push(`model${model.id}.dispose`); model.disposed = true }
    }
    models.push(model)
    return model
  }

  function makeEditor(kind: 'code' | 'diff', host: HTMLElement, options: Record<string, unknown>) {
    const diffListeners = new Set<() => void>()
    const record: FakeEditor = {
      kind, host, options, model: null, models: null, state: { scrollTop: 0, line: 1 }, disposed: false, updates: [],
      fireDiffUpdate: () => [...diffListeners].forEach((l) => l())
    }
    editors.push(record)
    const base = {
      saveViewState: () => { log.push(`${kind}.saveViewState`); return { ...record.state } },
      restoreViewState: (state: { scrollTop: number; line: number } | null) => { log.push(`${kind}.restoreViewState`); if (state) record.state = { ...state } },
      setScrollPosition: (position: { scrollTop: number }) => { log.push(`${kind}.scrollTo(${position.scrollTop})`); record.state = { ...record.state, scrollTop: position.scrollTop } },
      updateOptions: (update: Record<string, unknown>) => { record.updates.push(update) },
      dispose: () => { log.push(`${kind}.dispose`); record.disposed = true }
    }
    return { record, base, diffListeners }
  }

  const monaco = {
    editor: {
      defineTheme: (name: string) => { definedThemes.push(name) },
      setTheme: (name: string) => { themes.push(name) },
      remeasureFonts: () => { remeasures++ },
      createModel: (value: string, language?: string) => { log.push(`createModel(${language})`); return makeModel(value, language) },
      setModelLanguage: (model: FakeModel, language: string) => { log.push(`setModelLanguage(${language})`); model.language = language },
      create: (host: HTMLElement, options: Record<string, unknown> & { model?: FakeModel }) => {
        if (failCreate) throw new Error('create failed')
        const { record, base } = makeEditor('code', host, options)
        record.model = options.model ?? null
        log.push('create')
        return { ...base, getModel: () => record.model }
      },
      createDiffEditor: (host: HTMLElement, options: Record<string, unknown>) => {
        if (failCreate) throw new Error('create failed')
        const { record, base, diffListeners } = makeEditor('diff', host, options)
        log.push('createDiffEditor')
        return {
          ...base,
          setModel: (value: { original: FakeModel; modified: FakeModel } | null) => { log.push(value ? 'diff.setModel' : 'diff.setModel(null)'); record.models = value },
          getOriginalEditor: () => ({ updateOptions: (u: Record<string, unknown>) => { record.updates.push({ original: u }) } }),
          getModifiedEditor: () => ({ updateOptions: (u: Record<string, unknown>) => { record.updates.push({ modified: u }) } }),
          onDidUpdateDiff: (listener: () => void) => { diffListeners.add(listener); return { dispose: () => { diffListeners.delete(listener) } } }
        }
      }
    }
  }

  const runtime = {
    monaco,
    ensureLanguage: (id: string): Promise<boolean> => {
      languageRequests.push(id)
      const language = languages[id]
      const ok = id === 'plaintext' || (language ? language.ok !== false : false)
      if (language?.pending) return new Promise((resolve) => { pendingLanguage.set(id, () => resolve(ok)) })
      return Promise.resolve(ok)
    }
  }

  return {
    runtime: runtime as unknown as MonacoRuntime,
    log, editors, models, themes, definedThemes, languageRequests,
    get remeasures() { return remeasures },
    liveEditors: () => editors.filter((e) => !e.disposed),
    liveModels: () => models.filter((m) => !m.disposed),
    resolveLanguage: (id: string) => pendingLanguage.get(id)?.(),
    failNextCreates: (fail: boolean) => { failCreate = fail }
  }
}

export type FakeMonaco = ReturnType<typeof createFakeMonaco>
