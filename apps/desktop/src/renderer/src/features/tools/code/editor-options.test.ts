import { describe, expect, it } from 'vitest'
import { CODE_DIFF_MAX_COMPUTATION_MS } from './limits'
import { codeAriaLabel, codeEditorOptions, diffEditorOptions, lockViewerModelOptions, modifiedAriaLabel, originalAriaLabel } from './editor-options'
import { createFakeMonaco, type FakeModel } from './fake-monaco'

const FAMILY = "'IBM Plex Mono', monospace"

describe('viewer editor options', () => {
  const code = codeEditorOptions(FAMILY, 'studio-code-light', 'src/app.ts')

  it('are read-only, laid out automatically and use the app font and theme', () => {
    expect(code).toMatchObject({ readOnly: true, domReadOnly: true, automaticLayout: true, fontFamily: FAMILY, theme: 'studio-code-light', fontSize: 12 })
  })

  it('switch off everything that costs main-thread time or needs the language service', () => {
    expect(code).toMatchObject({
      minimap: { enabled: false }, links: false, wordBasedSuggestions: 'off', occurrencesHighlight: 'off', selectionHighlight: false,
      quickSuggestions: false, suggestOnTriggerCharacters: false, hover: { enabled: 'off' }, parameterHints: { enabled: false },
      codeLens: false, colorDecorators: false, stickyScroll: { enabled: false }, bracketPairColorization: { enabled: false }
    })
  })

  it('fold by indentation without a language service, as VS Code does for plain grammars (DEC-25)', () => {
    expect(code).toMatchObject({ folding: true, foldingStrategy: 'indentation', showFoldingControls: 'mouseover' })
  })

  it('let Tab leave the editor (no keyboard trap) and name the editor after the path', () => {
    expect(code.tabFocusMode).toBe(true)
    expect(code.ariaLabel).toBe(codeAriaLabel('src/app.ts'))
    expect(codeAriaLabel('src/app.ts')).toContain('src/app.ts')
  })

  it('do not swallow page scrolling or copy whole lines', () => {
    expect(code.scrollbar?.alwaysConsumeMouseWheel).toBe(false)
    expect(code.emptySelectionClipboard).toBe(false)
  })

  describe('of the diff editor', () => {
    const diff = diffEditorOptions(FAMILY, 'studio-code-dark', 'src/app.ts')

    it('are read-only on both sides with the same shared restrictions', () => {
      expect(diff).toMatchObject({ readOnly: true, originalEditable: false, minimap: { enabled: false }, links: false, tabFocusMode: true, theme: 'studio-code-dark' })
    })

    it('bound the main-thread diff: 1.5 s budget, collapsed unchanged regions, files over 1 MB skipped', () => {
      expect(diff.maxComputationTime).toBe(CODE_DIFF_MAX_COMPUTATION_MS)
      expect(diff.maxFileSize).toBe(1)
      expect(diff.hideUnchangedRegions).toMatchObject({ enabled: true })
    })

    it('show whitespace changes like Git does and label both sides with the path', () => {
      expect(diff.ignoreTrimWhitespace).toBe(false)
      expect(diff.originalAriaLabel).toBe(originalAriaLabel('src/app.ts'))
      expect(diff.modifiedAriaLabel).toBe(modifiedAriaLabel('src/app.ts'))
      expect(originalAriaLabel('x')).not.toBe(modifiedAriaLabel('x'))
    })
  })
})

describe('lockViewerModelOptions', () => {
  it('switches bracket pair colourisation off and keeps it off when Monaco turns it back on', () => {
    const fake = createFakeMonaco()
    const model = fake.runtime.monaco.editor.createModel('x', 'plaintext') as unknown as FakeModel
    expect(model.getOptions().bracketPairColorizationOptions.enabled).toBe(true)
    lockViewerModelOptions(model as never)
    expect(model.getOptions().bracketPairColorizationOptions.enabled).toBe(false)
    model.forceBracketColorization()
    expect(model.getOptions().bracketPairColorizationOptions.enabled).toBe(false)
  })

  it('stops reacting once disposed', () => {
    const fake = createFakeMonaco()
    const model = fake.runtime.monaco.editor.createModel('x', 'plaintext') as unknown as FakeModel
    lockViewerModelOptions(model as never).dispose()
    model.forceBracketColorization()
    expect(model.getOptions().bracketPairColorizationOptions.enabled).toBe(true)
  })
})
