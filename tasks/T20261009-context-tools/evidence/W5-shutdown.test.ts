import { expect, it, vi } from 'vitest'
import { createShutdownHandler } from '../../../apps/desktop/src/main/shutdown'

it('W5 retains the database and refuses final quit when feature-owned Runtime release rejects', async () => {
  const disposeCore = vi.fn(), quit = vi.fn(), onError = vi.fn()
  const failure = new Error('fixture idle Runtime release rejected')
  const shutdown = createShutdownHandler({
    disposeFeatures: async () => { throw failure }, disposeCore, quit, onError
  })
  const event = { preventDefault: vi.fn() }
  shutdown(event)
  await new Promise(done => setImmediate(done))
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(onError).toHaveBeenCalledWith(failure)
  expect(disposeCore).not.toHaveBeenCalled()
  expect(quit).not.toHaveBeenCalled()
})
