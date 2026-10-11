import { expect, it, vi } from 'vitest'
import { parseDefinition } from '../../../../apps/desktop/src/shared/project-view/schema'
import { ProjectViewService } from '../../../../apps/desktop/src/main/services/project-view/project-view-service'
import { useProjectViews } from '../../../../apps/desktop/src/renderer/src/features/project-view/store'
import { projectViewApi } from '../../../../apps/desktop/src/renderer/src/features/project-view/api'
vi.mock('../../../../apps/desktop/src/renderer/src/features/project-view/api', () => ({ projectViewApi: vi.fn() }))

it('runtime schema rejects non-string enum values (independent boundary)', () => {
  expect(() => parseDefinition({ schemaVersion: 1, viewId: 'architecture', bindings: {}, root: { type: 'diagram', props: { direction: ['horizontal'] } } }, 'architecture')).toThrow()
})

it('missing Project root is isolated as a safe View failure rather than synchronous open failure', async () => {
  const service = new ProjectViewService({ projectPath: () => '/nonexistent-w2-review-project', changed() {}, settleMs: 1 })
  try {
    expect(() => service.open('missing')).not.toThrow()
    const state = await service.getSnapshot('missing', 'architecture')
    expect(state.status).toBe('error')
    expect(state.error).not.toContain('/nonexistent-w2-review-project')
  } finally { service.dispose() }
})

it('closing Project ignores a pending snapshot response', async () => {
  let resolve!: (state: unknown) => void
  const response = new Promise(resolveResponse => { resolve = resolveResponse })
  vi.mocked(projectViewApi).mockReturnValue({ getSnapshot: () => response } as never)
  const task = useProjectViews.getState().load('w2-closing', 'architecture')
  useProjectViews.getState().close('w2-closing')
  resolve({ projectId: 'w2-closing', viewId: 'architecture', revision: 20, status: 'ready', snapshot: null, error: null })
  await task
  expect(useProjectViews.getState().states['w2-closing:architecture']).toBeUndefined()
})
