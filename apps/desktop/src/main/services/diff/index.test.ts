import { afterAll, expect, it, vi } from 'vitest'
import { diffContract } from '@shared/ipc/diff'
import type { CoreServices } from '../core'
import { diffFor } from './index'
import { createFixture, serviceEnv } from './test-support'

const fixture = createFixture({ commit: { 'a.txt': 'one\n' } })
afterAll(() => fixture.cleanup())

const shell = vi.hoisted(() => ({ closing: false, quitting: false, root: '' }))
vi.mock('../project', () => ({
  projectShellFor: () => ({
    projects: { getProject: (id: string) => (id === 'p' ? { canonicalPath: shell.root } : undefined) },
    isProjectClosing: () => shell.closing, isQuitting: () => shell.quitting
  })
}))

it('builds one service per core from the Project shell and the login environment, and broadcasts on the typed channels', async () => {
  shell.root = fixture.root
  fixture.write('a.txt', 'one\ntwo\n')
  const broadcast = vi.fn()
  const core = { shellEnv: { get: async () => ({ env: serviceEnv() }) }, broadcast } as unknown as CoreServices
  const service = diffFor(core)
  expect(diffFor(core)).toBe(service)
  expect(diffFor({ ...core } as CoreServices)).not.toBe(service)
  expect(await service.getSnapshot('p')).toMatchObject({ status: 'ready', files: [{ path: 'a.txt' }] })
  await expect(service.getSnapshot('unknown')).rejects.toThrow('Unknown project')

  service.subscribe('p', 3)
  await service.closeProject('p')
  expect(broadcast).toHaveBeenCalledWith(diffContract.events.watchChanged, expect.objectContaining({ projectId: 'p', watch: 'stopped' }))

  // The shell's own closing / quitting state gates operations the same way Terminal's does.
  shell.closing = true
  expect(await service.getSnapshot('p')).toMatchObject({ status: 'project_closing' })
  shell.closing = false; shell.quitting = true
  expect(await service.getSnapshot('p')).toMatchObject({ status: 'project_closing' })
  shell.quitting = false
  expect((await service.getSnapshot('p')).status).toBe('ready')
})
