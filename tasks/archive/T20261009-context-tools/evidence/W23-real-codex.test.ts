import { expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CodexProvider } from '../../../../packages/agent-adapter/src/codex/provider'
import { EventRecorder } from '../../../../packages/agent-adapter/src/testing/index'

it.skipIf(process.env.STUDIO_W23_REAL !== '1')('W23 real Codex: native patch comes through the changed Adapter in a non-Git fixture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-w23-native-'))
  const cwd = join(root, 'non git fixture'); await mkdir(cwd)
  await writeFile(join(cwd, 'native.txt'), 'w23-before\n')
  const provider = new CodexProvider(), environment = { env: { ...process.env } }
  let report: Record<string, unknown> = { scenario: 'Independent non-Git native patch integration', fixture: cwd }
  try {
    const availability = await provider.checkAvailability({ environment, timeoutMs: 10000 })
    report = { ...report, availability: { version: availability.version, login: availability.login, status: availability.status } }
    const session = await provider.createSession({ cwd, environment, overrides: { approvalPolicy: 'never', sandboxMode: 'workspace-write' } })
    const events = new EventRecorder(session)
    await session.sendUserInput({ text: 'Use apply_patch to change native.txt from w23-before to w23-after. The complete original file is exactly one line w23-before followed by a newline. Do not run shell commands. Do not modify any other file. Reply done.' })
    const terminal = await events.waitFor('turn.completed', () => true, 180000)
    const diffs = events.ofType('turn.diff.updated')
    const content = await readFile(join(cwd, 'native.txt'), 'utf8')
    report = { ...report, terminal: { outcome: terminal.outcome, error: terminal.error }, diffEvents: diffs.map(event => ({ turnId: event.turnId, seq: event.seq, diff: event.diff })), content }
    expect(terminal.outcome).toBe('completed')
    expect(content).toBe('w23-after\n')
    expect(diffs.length).toBeGreaterThan(0)
    const saved = diffs.at(-1)!.diff
    expect(saved.nativeSessionId).toBe(session.nativeSessionId)
    expect(saved.cliVersion).toBe('0.163.0')
    expect(saved.patch).toContain('-w23-before')
    expect(saved.patch).toContain('+w23-after')
    expect(saved.files).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'completed', patch: expect.stringContaining('+w23-after') })]))
    report.result = 'passed'
  } catch (error) { report.result = 'failed'; report.error = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await provider.dispose()
    await writeFile(new URL('W23-real-codex.json', import.meta.url), JSON.stringify(report, null, 2))
    await rm(root, { recursive: true, force: true })
  }
}, 210000)
