import type { editor } from 'monaco-editor/editor/editor.api.js'

/**
 * Text models of editable files kept between editor instances (TOOLS-Q13). The Files viewer creates an editor only while
 * a file is shown, so switching tabs or hiding the panel would otherwise lose the undo history, as VS Code never does.
 * A model is lent out while an editor shows it and returned when that editor goes; only returned models are cached.
 * The cache is an optimisation: the Files store holds the unsaved text, so an evicted or mismatched model is recreated.
 * No Monaco runtime import here, so the store can release models without loading the editor chunk.
 */
const MODEL_LIMIT = 20
const idle = new Map<string, editor.ITextModel>()

/** The cached model of `key` if it still holds exactly `text`; otherwise the stale one is disposed. */
export function takeCodeModel(key: string, text: string): editor.ITextModel | undefined {
  const model = idle.get(key)
  if (!model) return undefined
  idle.delete(key)
  if (!model.isDisposed() && model.getValue() === text) return model
  model.dispose()
  return undefined
}

/** Returns a model when its editor goes; the least recently returned ones are disposed above the limit. */
export function keepCodeModel(key: string, model: editor.ITextModel): void {
  idle.get(key)?.dispose()
  idle.delete(key)
  if (model.isDisposed()) return
  idle.set(key, model)
  for (const [old, stale] of idle) {
    if (idle.size <= MODEL_LIMIT) break
    idle.delete(old)
    stale.dispose()
  }
}

/** Disposes cached models of a closed file (`key`) or of every file of a closed Project (`prefix`). */
export function releaseCodeModels(key: string, options: { prefix?: boolean } = {}): void {
  for (const [entry, model] of [...idle]) {
    if (options.prefix ? !entry.startsWith(key) : entry !== key) continue
    idle.delete(entry)
    model.dispose()
  }
}

export const cachedCodeModels = (): number => idle.size
