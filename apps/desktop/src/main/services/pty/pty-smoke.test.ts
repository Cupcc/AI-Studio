// node-pty ships an N-API prebuild, so the same binary loads in plain Node
// (Vitest) and in Electron's main process.
import { describe, expect, it } from 'vitest'
import { runPtySmoke } from './pty-smoke'

const env = { PATH: '/usr/bin:/bin', HOME: process.env.HOME ?? '/', TERM: 'xterm-256color' }

describe('runPtySmoke', () => {
  it('spawns a shell in a PTY and receives its output', async () => {
    const result = await runPtySmoke({ shell: '/bin/sh', env })
    expect(result).toMatchObject({ ok: true, receivedMarker: true, exitCode: 0, shell: '/bin/sh' })
  })

  it('reports spawn failures instead of throwing', async () => {
    const result = await runPtySmoke({ shell: '/nonexistent/shell', env, timeoutMs: 2000 })
    expect(result.ok).toBe(false)
  })
})
