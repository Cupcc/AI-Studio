import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodeViewer from './CodeViewer'
import { codeViewStates } from './code-session'
import { codeAriaLabel } from './editor-options'
import { createFakeMonaco, type FakeMonaco } from './fake-monaco'
import { CODE_VIEWER_MAX_CHARS, CODE_VIEWER_TOO_LARGE } from './limits'
import { CODE_THEME_IDS } from './monaco-theme'

const loader = vi.hoisted(() => ({ loadMonaco: vi.fn() }))
vi.mock('./monaco-loader', () => ({ loadMonaco: loader.loadMonaco }))

let fake: FakeMonaco
beforeEach(() => {
  fake = createFakeMonaco({ typescript: {}, python: {} })
  loader.loadMonaco.mockReset().mockResolvedValue(fake.runtime)
  codeViewStates.clear()
})
afterEach(() => { cleanup(); delete document.documentElement.dataset.scheme })

const props = { path: 'src/app.ts', text: 'const a = 1', viewStateKey: 'k:app', active: true }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('CodeViewer', () => {
  it('has an accessible name from the path and creates no editor (and loads no Monaco) while inactive', async () => {
    render(<CodeViewer {...props} active={false} />)
    expect(screen.getByRole('group', { name: codeAriaLabel('src/app.ts') })).toBeTruthy()
    await flush()
    expect(loader.loadMonaco).not.toHaveBeenCalled()
    expect(fake.editors).toHaveLength(0)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a loading status, then exactly one editor with the content', async () => {
    render(<CodeViewer {...props} />)
    expect(screen.getByRole('status').textContent).toContain('加载中')
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(fake.liveModels()).toHaveLength(1)
    expect(fake.liveModels()[0]!.value).toBe('const a = 1')
    expect(fake.liveEditors()[0]!.host.parentElement?.className).toBe('code-viewer')
  })

  it('destroys the editor and its model when it becomes inactive, and brings the position back when active again', async () => {
    const view = render(<CodeViewer {...props} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    fake.editors[0]!.state = { scrollTop: 480, line: 21 }
    view.rerender(<CodeViewer {...props} active={false} />)
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
    expect(codeViewStates.get('k:app')).toEqual({ scrollTop: 480, line: 21 })
    view.rerender(<CodeViewer {...props} active />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    expect(fake.liveEditors()[0]!.state).toEqual({ scrollTop: 480, line: 21 })
    expect(fake.editors).toHaveLength(2)
  })

  it('destroys the editor and its model on unmount and remembers the position', async () => {
    const view = render(<CodeViewer {...props} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    fake.editors[0]!.state = { scrollTop: 12, line: 3 }
    view.unmount()
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
    expect(codeViewStates.get('k:app')).toEqual({ scrollTop: 12, line: 3 })
  })

  it('never creates the editor when it is hidden or unmounted before Monaco has loaded', async () => {
    let load!: (runtime: unknown) => void
    loader.loadMonaco.mockReturnValue(new Promise((resolve) => { load = resolve }))
    const view = render(<CodeViewer {...props} />)
    view.rerender(<CodeViewer {...props} active={false} />)
    load(fake.runtime)
    await flush(); await flush()
    expect(fake.editors).toHaveLength(0)
    view.unmount()
  })

  it('feeds new content into the same editor instead of recreating it', async () => {
    const view = render(<CodeViewer {...props} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    const editor = fake.editors[0]!
    editor.state = { scrollTop: 90, line: 4 }
    view.rerender(<CodeViewer {...props} text="const a = 2" />)
    expect(fake.models[0]!.value).toBe('const a = 2')
    expect(editor.state).toEqual({ scrollTop: 90, line: 4 })
    view.rerender(<CodeViewer {...props} path="tool.py" text="x = 1" viewStateKey="k:py" />)
    expect(fake.models[0]!.value).toBe('x = 1')
    await waitFor(() => expect(fake.models[0]!.language).toBe('python'))
    expect(fake.editors).toHaveLength(1)
    expect(fake.models).toHaveLength(1)
    expect(screen.getByRole('group', { name: codeAriaLabel('tool.py') })).toBeTruthy()
  })

  it('does not recreate the editor when only the error callback changes', async () => {
    const view = render(<CodeViewer {...props} onError={() => {}} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    view.rerender(<CodeViewer {...props} onError={() => {}} />)
    await flush()
    expect(fake.editors).toHaveLength(1)
  })

  it('follows the colour scheme live without recreating the editor or losing its position', async () => {
    document.documentElement.dataset.scheme = 'light'
    render(<CodeViewer {...props} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    fake.editors[0]!.state = { scrollTop: 300, line: 15 }
    document.documentElement.dataset.scheme = 'dark'
    await waitFor(() => expect(fake.themes).toEqual([CODE_THEME_IDS.dark]))
    expect(fake.editors).toHaveLength(1)
    expect(fake.liveModels()).toHaveLength(1)
    expect(fake.editors[0]!.state).toEqual({ scrollTop: 300, line: 15 })
  })

  it('ends with exactly one live editor under StrictMode\'s double effects', async () => {
    render(<StrictMode><CodeViewer {...props} /></StrictMode>)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    await flush()
    expect(fake.liveEditors()).toHaveLength(1)
    expect(fake.liveModels()).toHaveLength(1)
  })

  describe('errors', () => {
    it('refuses text over the viewer limit: an alert, one onError, no Monaco', async () => {
      const onError = vi.fn()
      render(<CodeViewer {...props} text={'a'.repeat(CODE_VIEWER_MAX_CHARS + 1)} onError={onError} />)
      expect(screen.getByRole('alert').textContent).toBe(CODE_VIEWER_TOO_LARGE)
      await flush()
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(CODE_VIEWER_TOO_LARGE)
      expect(loader.loadMonaco).not.toHaveBeenCalled()
      expect(fake.editors).toHaveLength(0)
    })

    it('shows a file again once it is within the limit', async () => {
      const view = render(<CodeViewer {...props} text={'a'.repeat(CODE_VIEWER_MAX_CHARS + 1)} />)
      view.rerender(<CodeViewer {...props} text={'a'.repeat(CODE_VIEWER_MAX_CHARS)} />)
      await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('does not complain about a large text while it is hidden', async () => {
      const onError = vi.fn()
      render(<CodeViewer {...props} active={false} text={'a'.repeat(CODE_VIEWER_MAX_CHARS + 1)} onError={onError} />)
      await flush()
      expect(onError).not.toHaveBeenCalled()
    })

    it('reports a Monaco that cannot be loaded and leaves the alert in place', async () => {
      loader.loadMonaco.mockRejectedValue(new Error('chunk 404'))
      const onError = vi.fn()
      render(<CodeViewer {...props} onError={onError} />)
      await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
      expect(onError.mock.calls[0]![0]).toContain('chunk 404')
      expect(screen.getByRole('alert').textContent).toContain('chunk 404')
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('reports an editor that cannot be created and keeps no model behind', async () => {
      fake.failNextCreates(true)
      const onError = vi.fn()
      render(<CodeViewer {...props} onError={onError} />)
      await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
      expect(onError.mock.calls[0]![0]).toContain('create failed')
      expect(fake.liveModels()).toHaveLength(0)
    })

    it('tries again when it is shown after a failure', async () => {
      loader.loadMonaco.mockRejectedValueOnce(new Error('offline'))
      const view = render(<CodeViewer {...props} />)
      await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
      view.rerender(<CodeViewer {...props} active={false} />)
      view.rerender(<CodeViewer {...props} active />)
      await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })
})
