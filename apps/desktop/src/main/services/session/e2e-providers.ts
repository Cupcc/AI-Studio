import type { AgentProvider, InputRequestInit, ResumeSessionOptions, SessionSink, TurnContext } from '@ai-studio/agent-adapter'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseReferencedFiles } from './file-reference'

/** `[e2e:markdown]` reply covering the Markdown range of Shell Spec v02 §6 (content mirrors prototype v02). */
export const E2E_MARKDOWN_REPLY = [
  '失败的 3 个用例都来自金额单位：`toChargeAmount` 返回以元为单位的小数，而 Stripe 要求以分为单位的**整数**。',
  '',
  '### 修改',
  '',
  '- `services/payment/amount.ts`：改为按分计算；',
  '  - 边界用例：`0.1 + 0.2`、`19.99`',
  '- `services/payment/amount.test.ts`：补充 3 个用例。',
  '',
  '```ts',
  'export function toChargeAmount(price: number) {',
  '  // 按最小货币单位计算，避免浮点误差',
  '  return Math.round(price * 100)',
  '}',
  '```',
  '',
  '### 测试结果',
  '',
  '| 测试集 | 通过 | 失败 |',
  '|---|---:|---:|',
  '| payment | 24 | 0 |',
  '| auth | 18 | 0 |',
  '',
  '```diff',
  '-  res.redirect(nextUrl)',
  '+  await writeSession(res, user)',
  '```',
  '',
  '> 取消流程参考了 [Stripe 文档](https://docs.stripe.com/billing/subscriptions/cancel)。'
].join('\n')

/** Explicitly injected by the development entry point; never chosen by runtime fallback. */
export function createE2eProviders(): AgentProvider[] {
  return (['codex', 'claude-code'] as const).map(cli => {
    // `files` collects the references of every user input of the turn (start and steer), in arrival order.
    const runs = new Map<string, { turn: TurnContext; sink: SessionSink; remaining: number; files: string[] }>()
    const failures = new Set<string>()
    const schedule = (turn: TurnContext, callback: () => void, delay: number) => {
      const timer = setTimeout(() => { if (!turn.signal.aborted) callback() }, delay)
      turn.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
    }
    const DEFAULT_REPLY = '模拟回复已完成。可以继续同一个 Session。'
    const complete = (run: { turn: TurnContext; sink: SessionSink; files: string[] }, text = DEFAULT_REPLY) => {
      // Lets Playwright assert from the transcript which references actually reached the Provider.
      const reply = text === DEFAULT_REPLY && run.files.length ? `已收到文件引用：${run.files.join(', ')}` : text
      run.sink.itemCompleted(run.turn.turnId, { itemId: `${run.turn.turnId}:message`, kind: 'assistant_message', status: 'completed', text: reply })
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
    const provider: E2eProvider = new E2eProvider(cli, {
      displayName: cli === 'codex' ? 'Codex' : 'Claude Code',
      models: [
        { id: cli === 'codex' ? 'e2e-codex' : 'e2e-claude', displayName: cli === 'codex' ? 'E2E Codex' : 'E2E Claude', isDefault: true },
        { id: 'e2e-alternate', displayName: 'E2E Alternate' }
      ],
      capabilities: { nativeTitle: true, inputWhileRunning: cli === 'codex' ? 'steer' : 'none' },
      behavior: {
        onSteer(turn, input) {
          if (input.text.includes('[e2e:steer-error]')) throw new Error('模拟追加失败，输入已保留')
          runs.get(turn.turnId)?.files.push(...parseReferencedFiles(input.text))
        },
        onStartTurn(turn, input, sink) {
          const run = { turn, sink, remaining: 0, files: parseReferencedFiles(input.text) }
          runs.set(turn.turnId, run)
          turn.signal.addEventListener('abort', () => runs.delete(turn.turnId), { once: true })
          sink.itemStarted(turn.turnId, { itemId: `${turn.turnId}:message`, kind: 'assistant_message', status: 'in_progress', text: '' })
          sink.itemStarted(turn.turnId, {
            itemId: `${turn.turnId}:tool`, kind: 'command', status: 'in_progress',
            activity: { verb: 'run', label: 'Run echo studio-e2e' }, command: { command: 'echo studio-e2e' }
          })
          schedule(turn, () => sink.itemCompleted(turn.turnId, {
            itemId: `${turn.turnId}:tool`, kind: 'command', status: 'completed',
            activity: { verb: 'run', label: 'Run echo studio-e2e' }, command: { command: 'echo studio-e2e', exitCode: 0, output: 'studio-e2e' }
          }), 160)
          schedule(turn, () => sink.itemDelta(turn.turnId, `${turn.turnId}:message`, 'text', '正在处理模拟请求…'), 80)
          if (input.text.includes('[e2e:slow]')) return
          if (input.text.includes('Current Project View: Architecture') && input.text.includes('重新整理支付模块架构')) {
            const cwd = provider.sessions.find(session => session.controller.activeTurn?.turnId === turn.turnId)?.options.cwd
            schedule(turn, () => {
              if (!cwd) return
              const directory = join(cwd, '.ai-studio/knowledge')
              mkdirSync(directory, { recursive: true })
              writeFileSync(join(directory, 'architecture.json'), JSON.stringify({
                schemaVersion: 1, viewId: 'architecture',
                data: {
                  summary: '支付模块架构已整理',
                  graph: { nodes: [{ id: 'api', name: 'Payment API', path: 'src/payment/api.ts' }, { id: 'service', name: 'Payment Service', path: 'src/payment/service.ts' }, { id: 'store', name: 'Payment Store', path: 'src/payment/store.ts' }], edges: [{ from: 'api', to: 'service', label: 'validate' }, { from: 'service', to: 'store', label: 'persist' }] },
                  modules: [{ name: 'Payment API', responsibility: '校验与入口', path: 'src/payment/api.ts' }, { name: 'Payment Service', responsibility: '支付编排', path: 'src/payment/service.ts' }, { name: 'Payment Store', responsibility: '本地持久化', path: 'src/payment/store.ts' }]
                }
              }))
              complete(run, '已通过普通模拟 CLI Session 更新 Architecture Knowledge。')
            }, 600)
            return
          }
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
          if (input.text.includes('[e2e:markdown]')) { schedule(turn, () => complete(run, E2E_MARKDOWN_REPLY), 300); return }
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
    return provider
  })
}
