import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { DEFAULT_DEFINITIONS, catalogEntry } from '@shared/project-view/defaults'
import { parseDefinition } from '@shared/project-view/schema'
import type { ViewSnapshot, ViewState } from '@shared/project-view/types'
import { ViewRenderer } from './renderer'
import { useProjectViews } from './store'
const snapshot = (projectId = 'p', revision = 1): ViewSnapshot => ({
  projectId, viewId: 'architecture', catalog: catalogEntry('architecture'), revision, updatedAt: 1,
  knowledge: { schemaVersion: 1, viewId: 'architecture', data: { summary: '<img src=x onerror=alert(1)>', modules: [{ name: 'Payment', responsibility: 'Handle payment', path: 'src/payment.ts' }], graph: { nodes: [{ id: 'api', name: 'API' }, { id: 'db', name: 'Database' }], edges: [{ from: 'api', to: 'db' }] } } },
  definition: DEFAULT_DEFINITIONS.get('architecture')!
})
const state = (projectId = 'p', revision = 1): ViewState => ({ projectId, viewId: 'architecture', revision, status: 'ready', error: null, snapshot: snapshot(projectId, revision) })
beforeEach(() => useProjectViews.setState({ states: {}, zoom: {} }))
afterEach(cleanup)
it('renders facts as inert text, table cells and calculated graph; does not inject HTML', () => {
  const view = render(<ViewRenderer snapshot={snapshot()} />)
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  expect(view.container.querySelector('img')).toBeNull()
  expect(screen.getByRole('cell', { name: 'Payment' })).toBeTruthy()
  expect(screen.getByRole('img', { name: '关系图' })).toBeTruthy()
})
it('shows example and missing-binding states without crashing', () => {
  const current = snapshot()
  current.knowledge = { schemaVersion: 1, viewId: 'architecture', data: {}, example: true }
  render(<ViewRenderer snapshot={current} />)
  expect(screen.getByText('示例数据')).toBeTruthy()
  expect(screen.getAllByText('暂无内容').length).toBeGreaterThan(0)
})
it('covers every trusted component with a project override', () => {
  const current = snapshot()
  current.definition = parseDefinition({
    schemaVersion: 1, viewId: 'architecture', bindings: { summary: 'data.summary', modules: 'data.modules' },
    root: { type: 'grid', children: ['section', 'text', 'metric', 'badge', 'list', 'timeline', 'callout', 'empty'].map(type => ({ type, bind: type === 'list' || type === 'timeline' ? 'modules' : 'summary' })) }
  }, 'architecture')
  expect(() => render(<ViewRenderer snapshot={current} />)).not.toThrow()
})
it('deduplicates older revisions, isolates projects and keeps zoom runtime-only', () => {
  const store = useProjectViews.getState()
  store.accept(state('p', 3)); store.accept(state('p', 1)); store.accept(state('other', 2))
  expect(useProjectViews.getState().states['p:architecture']!.revision).toBe(3)
  store.setZoom('p', 'architecture', 5)
  expect(useProjectViews.getState().zoom['p:architecture']).toBe(2)
  store.close('p')
  expect(useProjectViews.getState().states['p:architecture']).toBeUndefined()
  expect(useProjectViews.getState().states['other:architecture']).toBeTruthy()
  expect(useProjectViews.getState().zoom['p:architecture']).toBeUndefined()
  store.accept(state('p', 4))
  expect(useProjectViews.getState().states['p:architecture']).toBeUndefined()
})
