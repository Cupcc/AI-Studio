import { describe, expect, it, vi } from 'vitest'
import { browserContract } from '@shared/ipc/browser'
import { createBrowserFeature } from '../../ipc/browser'
import type { CoreServices } from '../core'

const service = vi.hoisted(() => ({
  getState: vi.fn(), navigate: vi.fn(), reload: vi.fn(), setBounds: vi.fn(),
  setVisible: vi.fn(), focus: vi.fn(), openExternal: vi.fn(), dismissExternal: vi.fn(), dispose: vi.fn()
}))
vi.mock('./index', () => ({ browserFor: () => service }))

describe('Browser IPC boundary', () => {
  const feature = createBrowserFeature({} as CoreServices)
  const ref = { projectId: 'project', generation: 'generation' }

  it('exposes exactly the limited Browser contract and routes the validated sender identity', () => {
    expect(feature.contract).toBe(browserContract)
    const request = feature.handlers.navigate.parse({ ...ref, url: 'http://localhost:3000/' })
    feature.handlers.navigate.handle(request, { senderId: 23, senderUrl: 'app://studio/' })
    expect(service.navigate).toHaveBeenCalledWith(request, 'http://localhost:3000/', 23)
    feature.handlers.openExternal.handle({ ...ref, requestId: 'pending-id' }, { senderId: 23, senderUrl: 'app://studio/' })
    expect(service.openExternal).toHaveBeenCalledWith({ ...ref, requestId: 'pending-id' }, 23)
  })

  it('rejects missing ownership, unknown fields and arbitrary external URL input', () => {
    expect(() => feature.handlers.getState.parse({ projectId: 'p', absolutePath: '/etc' })).toThrow()
    expect(() => feature.handlers.reload.parse({ projectId: 'p' })).toThrow()
    expect(() => feature.handlers.navigate.parse({ ...ref, url: 'http://localhost/', script: 'execute' })).toThrow()
    expect(() => feature.handlers.openExternal.parse({ ...ref, requestId: 'id', url: 'https://example.com/' })).toThrow()
    expect(() => feature.handlers.setVisible.parse({ ...ref, visible: 1 })).toThrow()
  })

  it.each([
    { x: 0, y: 0, width: NaN, height: 200 },
    { x: Infinity, y: 0, width: 200, height: 200 },
    { x: 0, y: 0, width: -1, height: 200 },
    { x: 0, y: 0, width: 200, height: 100000 },
    { x: 0, y: 0, width: 200, height: 200, extra: true }
  ])('rejects malformed native bounds %#', bounds => {
    expect(() => feature.handlers.setBounds.parse({ ...ref, bounds })).toThrow()
  })

  it('preserves fractional DIP inputs for clipping in main and disposes owned resources', async () => {
    expect(feature.handlers.setBounds.parse({ ...ref, bounds: { x: -0.5, y: 20.8, width: 420.5, height: 320 } })).toEqual({
      ...ref, bounds: { x: -0.5, y: 20.8, width: 420.5, height: 320 }
    })
    await feature.dispose?.()
    expect(service.dispose).toHaveBeenCalledOnce()
  })
})
