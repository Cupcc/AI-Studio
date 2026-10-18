import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CodexProvider } from '../../../../packages/agent-adapter/src/codex/provider'
import { EventRecorder } from '../../../../packages/agent-adapter/src/testing/index'
import { buildUserInput, FILE_REFERENCE_STRATEGY } from '../../../../apps/desktop/src/main/services/session/file-reference'

it.skipIf(process.env.STUDIO_W23_REAL !== '1')('W23 real Codex: current application native mention strategy reads the attached reference', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'studio-w23-reference-'))
  const name = 'reference # 中文 " note.txt', path = join(cwd, name)
  const token = `w23-token-${randomUUID()}`
  await writeFile(path, `Verification token: ${token}\n`)
  const provider = new CodexProvider(), environment = { env: { ...process.env } }
  let report: Record<string, unknown> = { fixture: cwd, strategy: FILE_REFERENCE_STRATEGY.codex, name }
  try {
    const availability = await provider.checkAvailability({ environment, timeoutMs: 10000 })
    report = { ...report, version: availability.version, login: availability.login }
    const input = buildUserInput({ files: [{ path: name, name, absolutePath: path }], text: 'Read the attached reference and return only its verification token. Do not modify any file.', strategy: FILE_REFERENCE_STRATEGY.codex })
    expect(input.text).not.toContain(token)
    expect(input.attachments).toEqual([{ kind: 'file', path, name }])
    const session = await provider.createSession({ cwd, environment, overrides: { approvalPolicy: 'never', sandboxMode: 'read-only' } })
    const events = new EventRecorder(session)
    await session.sendUserInput(input)
    const terminal = await events.waitFor('turn.completed', () => true, 180000)
    const answer = events.ofType('item.completed').filter(event => event.item.kind === 'assistant_message').map(event => event.item.text ?? '').join('\n')
    report = { ...report, outcome: terminal.outcome, answer, returnedExpectedToken: answer.includes(token), contentUnchanged: await readFile(path, 'utf8') === `Verification token: ${token}\n` }
    expect(terminal.outcome).toBe('completed')
    expect(answer).toContain(token)
    expect(report.contentUnchanged).toBe(true)
    report.result = 'passed'
  } catch (error) { report.result = 'failed'; report.error = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await provider.dispose()
    await writeFile(new URL('W23-native-reference.json', import.meta.url), JSON.stringify(report, null, 2))
    await rm(cwd, { recursive: true, force: true })
  }
}, 210000)
