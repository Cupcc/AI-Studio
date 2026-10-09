import type { AgentProvider, InputRequestInit, ResumeSessionOptions, SessionSink, TurnContext } from '@ai-studio/agent-adapter'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'

/** Explicitly injected by the development entry point; never chosen by runtime fallback. */
export function createE2eProviders(): AgentProvider[] {
  return (['codex', 'claude-code'] as const).map(cli => {
    const runs = new Map<string, { turn: TurnContext; sink: SessionSink; remaining: number }>()
    const failures = new Set<string>()
    const schedule = (turn: TurnContext, callback: () => void, delay: number) => {
      const timer = setTimeout(() => { if (!turn.signal.aborted) callback() }, delay)
      turn.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
    }
    const complete = (run: { turn: TurnContext; sink: SessionSink }) => {
      run.sink.itemCompleted(run.turn.turnId, { itemId: `${run.turn.turnId}:message`, kind: 'assistant_message', status: 'completed', text: '模拟回复已完成。可以继续同一个 Session。' })
      run.sink.nativeTurnEnded(run.turn.turnId, { status: 'completed', model: cli === 'codex' ? 'e2e-codex' : 'e2e-claude' })
    }
    const approval: InputRequestInit = {
      kind: 'approval', nativeType: 'e2e:approval', subject: 'command', title: '允许运行测试命令？', command: 'echo studio-e2e', allowsMessage: false,
      options: [{ id: 'allow', label: '允许', intent: 'allow' }, { id: 'deny', label: '拒绝', intent: 'deny' }]
    }
    // Fixture native IDs remain resumable across app relaunch; real providers enforce their own storage.
    class E2eProvider extends FakeProvider {
      override resumeSession(options: ResumeSessionOptions) {
        this.knownNativeIds.add(options.nativeSessionId)
        return super.resumeSession(options)
      }
    }
    return new E2eProvider(cli, {
      displayName: cli === 'codex' ? 'Codex' : 'Claude Code',
      models: [
        { id: cli === 'codex' ? 'e2e-codex' : 'e2e-claude', displayName: cli === 'codex' ? 'E2E Codex' : 'E2E Claude', isDefault: true },
        { id: 'e2e-alternate', displayName: 'E2E Alternate' }
      ],
      capabilities: { nativeTitle: true },
      behavior: {
        onStartTurn(turn, input, sink) {
          const run = { turn, sink, remaining: 0 }
          runs.set(turn.turnId, run)
          turn.signal.addEventListener('abort', () => runs.delete(turn.turnId), { once: true })
          sink.itemStarted(turn.turnId, { itemId: `${turn.turnId}:message`, kind: 'assistant_message', status: 'in_progress', text: '' })
          schedule(turn, () => sink.itemDelta(turn.turnId, `${turn.turnId}:message`, 'text', '正在处理模拟请求…'), 80)
          if (input.text.includes('[e2e:slow]')) return
          if (input.text.includes('[e2e:error]') && !failures.has(input.text)) {
            failures.add(input.text)
            schedule(turn, () => sink.nativeTurnEnded(turn.turnId, { status: 'failed', error: { code: 'provider_error', message: '模拟执行失败', retryable: true, native: { source: 'e2e', message: '这是一条模拟错误详情' } } }), 400)
            return
          }
          if (input.text.includes('[e2e:approval]') || input.text.includes('[e2e:multi]')) {
            run.remaining = input.text.includes('[e2e:multi]') ? 2 : 1
            schedule(turn, () => {
              for (let index = 0; index < run.remaining; index++) sink.inputRequested(turn.turnId, { ...approval, title: `允许运行测试命令 ${index + 1}？` }, null)
            }, 200)
            return
          }
          if (input.text.includes('[e2e:question]') || input.text.includes('[e2e:secret]')) {
            run.remaining = 1
            schedule(turn, () => sink.inputRequested(turn.turnId, {
              kind: 'question', nativeType: 'e2e:question', title: '需要你的输入',
              questions: [{ id: 'choice', prompt: '请选择下一步或输入回复', multiSelect: false, allowFreeText: true, secret: input.text.includes('[e2e:secret]'), options: [{ id: 'continue', label: '继续' }] }]
            }, null), 200)
            return
          }
          schedule(turn, () => complete(run), input.text.includes('[e2e:delay]') ? 1800 : 500)
        },
        onRespond(record) {
          const run = runs.get(record.request.turnId)
          if (run && --run.remaining === 0) schedule(run.turn, () => complete(run), 100)
        },
        onDeclineWithText(records) {
          const run = records[0] && runs.get(records[0].request.turnId)
          if (run) { run.remaining = 0; schedule(run.turn, () => complete(run), 100) }
        }
      }
    })
  })
}
