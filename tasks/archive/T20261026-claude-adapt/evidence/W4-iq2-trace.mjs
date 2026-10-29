import { writeFile } from 'node:fs/promises'
import { ClaudeProvider } from '../../../../packages/agent-adapter/dist/claude/index.js'
import { createScratchProject, hostEnvironmentForTests } from '../../../../packages/agent-adapter/dist/testing/real-cli.js'

const started = Date.now()
const trace = { cli: '2.1.311', sdk: '0.3.293', events: [], observations: [], outcome: null }
const at = () => Date.now() - started
const safeEvent = (event) => {
  const row = { atMs: at(), type: event.type }
  if (event.type === 'turn.started' || event.type === 'turn.completed' || event.type === 'turn.diff.updated') row.turnId = event.turnId
  if (event.type === 'turn.completed') row.outcome = event.outcome
  if (event.type === 'input.requested') {
    row.requestId = event.request.requestId
    row.kind = event.request.kind
    row.nativeType = event.request.nativeType
    row.toolName = event.request.toolName
  }
  if (event.type === 'input.resolved') row.resolution = event.resolution.status
  if (event.type === 'session.state') row.state = event.state
  if (event.type === 'runtime.started' || event.type === 'runtime.exited') row.runtime = event.info?.generation ?? event.generation
  trace.events.push(row)
}

const { cwd } = await createScratchProject('claude-iq2-trace')
const provider = new ClaudeProvider()
let session
try {
  session = await provider.createSession({ cwd, environment: hostEnvironmentForTests(),
    overrides: { model: 'haiku', permissionMode: 'default' },
    providerOptions: { settingSources: [], tools: ['Bash'], maxTurns: 3, maxBudgetUsd: 0.3 } })
  session.subscribe(safeEvent)
  const turn = await session.sendUserInput({ text: 'Run exactly this Bash command once: touch declined-command-ran.txt' })
  trace.observations.push({ atMs: at(), phase: 'sent', turnId: turn.turnId })
  const approvalDeadline = Date.now() + 30_000
  while (Date.now() < approvalDeadline && !session.pendingInputs.some((entry) => entry.kind === 'approval')) await new Promise((resolve) => setTimeout(resolve, 100))
  const pendingBefore = session.pendingInputs.map((entry) => ({ requestId: entry.requestId, turnId: entry.turnId, kind: entry.kind }))
  trace.observations.push({ atMs: at(), phase: 'approval-observed', pending: pendingBefore })
  if (!pendingBefore.some((entry) => entry.kind === 'approval')) throw new Error('No approval request observed')
  const reply = await session.replyWithText('Do not run it. Reply with exactly DECLINED_TRACE_OK and nothing else.')
  trace.observations.push({ atMs: at(), phase: 'replyWithText', reply })
  const endDeadline = Date.now() + 120_000
  while (Date.now() < endDeadline && !trace.events.some((event) => event.type === 'turn.completed' && event.turnId === turn.turnId)) {
    const pending = session.pendingInputs.map((entry) => ({ requestId: entry.requestId, turnId: entry.turnId, kind: entry.kind }))
    trace.observations.push({ atMs: at(), phase: 'poll', state: session.state, pending })
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  const completed = trace.events.find((event) => event.type === 'turn.completed' && event.turnId === turn.turnId)
  trace.outcome = { completed: !!completed, state: session.state,
    pending: session.pendingInputs.map((entry) => ({ requestId: entry.requestId, turnId: entry.turnId, kind: entry.kind })) }
} catch (error) {
  trace.outcome = { error: String(error?.message ?? error).slice(0, 300), state: session?.state,
    pending: session?.pendingInputs?.map((entry) => ({ requestId: entry.requestId, turnId: entry.turnId, kind: entry.kind })) ?? [] }
} finally {
  await provider.dispose().catch((error) => { trace.observations.push({ atMs: at(), phase: 'dispose-error', error: String(error?.message ?? error).slice(0, 200) }) })
  trace.durationMs = at()
  await writeFile(new URL('./W4-iq2-trace.json', import.meta.url), JSON.stringify(trace, null, 2) + '\n')
}
