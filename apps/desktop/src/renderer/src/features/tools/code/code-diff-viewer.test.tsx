import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodeDiffViewer from './CodeDiffViewer'
import { diffViewStates } from './diff-session'
import { modifiedAriaLabel } from './editor-options'
import { createFakeMonaco, type FakeMonaco } from './fake-monaco'
import { CODE_DIFF_SIDE_MAX_CHARS, CODE_DIFF_TOO_LARGE } from './limits'

const loader = vi.hoisted(() => ({ loadMonaco: vi.fn() }))
vi.mock('./monaco-loader', () => ({ loadMonaco: loader.loadMonaco }))

let fake: FakeMonaco
beforeEach(() => {
  fake = createFakeMonaco({ typescript: {} })
  loader.loadMonaco.mockReset().mockResolvedValue(fake.runtime)
  diffViewStates.clear()
})
afterEach(cleanup)

const props = { path: 'src/app.ts', original: 'a', modified: 'b', viewStateKey: 'k:diff', active: true }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('CodeDiffViewer', () => {
  it('has an accessible name from the path and creates nothing while inactive', async () => {
    render(<CodeDiffViewer {...props} active={false} />)
    expect(screen.getByRole('group', { name: modifiedAriaLabel('src/app.ts') })).toBeTruthy()
    await flush()
    expect(loader.loadMonaco).not.toHaveBeenCalled()
    expect(fake.editors).toHaveLength(0)
  })

  it('shows a loading status, then one diff editor with both texts', async () => {
    render(<CodeDiffViewer {...props} />)
    expect(screen.getByRole('status').textContent).toContain('加载中')
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    expect(fake.liveEditors()[0]!.kind).toBe('diff')
    expect(fake.liveModels().map((model) => model.value)).toEqual(['a', 'b'])
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('destroys the editor and both models when inactive or unmounted, remembering the position', async () => {
    const view = render(<CodeDiffViewer {...props} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    fake.editors[0]!.fireDiffUpdate()
    fake.editors[0]!.state = { scrollTop: 66, line: 6 }
    view.rerender(<CodeDiffViewer {...props} active={false} />)
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
    expect(diffViewStates.get('k:diff')).toEqual({ scrollTop: 66, line: 6 })
    view.rerender(<CodeDiffViewer {...props} active />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    view.unmount()
    expect(fake.liveEditors()).toHaveLength(0)
    expect(fake.liveModels()).toHaveLength(0)
  })

  it('feeds new sides into the same editor', async () => {
    const view = render(<CodeDiffViewer {...props} />)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    view.rerender(<CodeDiffViewer {...props} modified="c" />)
    expect(fake.models.map((model) => model.value)).toEqual(['a', 'c'])
    expect(fake.editors).toHaveLength(1)
  })

  it('never creates the editor when hidden before Monaco has loaded', async () => {
    let load!: (runtime: unknown) => void
    loader.loadMonaco.mockReturnValue(new Promise((resolve) => { load = resolve }))
    const view = render(<CodeDiffViewer {...props} />)
    view.rerender(<CodeDiffViewer {...props} active={false} />)
    load(fake.runtime)
    await flush(); await flush()
    expect(fake.editors).toHaveLength(0)
  })

  it('ends with one live editor under StrictMode', async () => {
    render(<StrictMode><CodeDiffViewer {...props} /></StrictMode>)
    await waitFor(() => expect(fake.liveEditors()).toHaveLength(1))
    await flush()
    expect(fake.liveEditors()).toHaveLength(1)
    expect(fake.liveModels()).toHaveLength(2)
  })

  it('refuses a side over the diff limit in place, without loading Monaco', async () => {
    render(<CodeDiffViewer {...props} modified={'x'.repeat(CODE_DIFF_SIDE_MAX_CHARS + 1)} />)
    expect(screen.getByRole('alert').textContent).toBe(CODE_DIFF_TOO_LARGE)
    await flush()
    expect(loader.loadMonaco).not.toHaveBeenCalled()
    expect(fake.editors).toHaveLength(0)
  })

  it('shows a load failure in place (the props have no error callback)', async () => {
    loader.loadMonaco.mockRejectedValue(new Error('chunk 404'))
    render(<CodeDiffViewer {...props} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('chunk 404'))
    expect(fake.liveModels()).toHaveLength(0)
  })
})
