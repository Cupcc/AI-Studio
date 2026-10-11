import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ViewSnapshot } from '@shared/project-view/types'
import { catalogEntry, DEFAULT_DEFINITIONS } from '@shared/project-view/defaults'
vi.mock('./renderer', () => ({
  MemoViewRenderer: ({ snapshot }: { snapshot: ViewSnapshot }) => {
    if (snapshot.revision === 2) throw new Error('render fixture failure')
    return <p>成功版本 {snapshot.revision}</p>
  }
}))
import { RenderBoundary } from './Preview'
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('retains last successfully rendered content on render failure and recovers with next revision', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const snapshot: ViewSnapshot = {
    projectId: 'p', viewId: 'architecture', catalog: catalogEntry('architecture'),
    revision: 1, updatedAt: 1, knowledge: null, definition: DEFAULT_DEFINITIONS.get('architecture')!
  }
  const view = render(<RenderBoundary snapshot={snapshot} />)
  expect(screen.getByText('成功版本 1')).toBeTruthy()
  view.rerender(<RenderBoundary snapshot={{ ...snapshot, revision: 2 }} />)
  expect(screen.getByRole('alert').textContent).toContain('保留上一版')
  expect(screen.getByText('成功版本 1')).toBeTruthy()
  view.rerender(<RenderBoundary snapshot={{ ...snapshot, revision: 3 }} />)
  expect(screen.getByText('成功版本 3')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
