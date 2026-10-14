import { expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  let exited: ((event: { exitCode: number }) => void) | undefined
  const pty = {
    pid: 777777, pause: vi.fn(), resume: vi.fn(), write: vi.fn(), resize: vi.fn(),
    onData: () => ({ dispose() {} }),
    onExit(listener: (event: { exitCode: number }) => void) { exited = listener; return { dispose() {} } }
  }
  return { pty, exit: () => exited?.({ exitCode: 0 }) }
})

vi.mock('node-pty', () => ({ spawn: () => fixture.pty }))

import { createPtySpawner } from '@w4-terminal-driver'

it('W4 refuses to confirm cleanup when the Shell exited before its identity was ever observed', async () => {
  const lister = { list: async () => {
    fixture.exit()
    // A successful OS listing is not proof of ownership: the Shell is absent and a child is reparented.
    return [{ pid: 777778, ppid: 1, startedAt: 'w4-start', state: 'S', command: 'w4-fixture' }]
  } }
  const spawner = createPtySpawner({ lister: lister as never })
  const terminal = await spawner({ shell: '/bin/sh', cwd: '/tmp', env: {}, cols: 80, rows: 24 })
  await expect(terminal.liveOwnedProcesses()).rejects.toThrow('ownership unavailable')
  await expect(terminal.close()).rejects.toThrow('ownership unavailable')
  expect(fixture.pty.resume).not.toHaveBeenCalled()
})
