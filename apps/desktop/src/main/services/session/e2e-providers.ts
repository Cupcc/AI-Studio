import type { AgentProvider, InputRequestInit, ResumeSessionOptions, SessionSink, TurnContext, UserInput } from '@ai-studio/agent-adapter'
import { FakeProvider } from '@ai-studio/agent-adapter/testing'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
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
    const NARRATION = '正在处理模拟请求…'
    // `afterRequest`: the narration ended when the CLI asked the user, so the reply is a message of its own.
    const complete = (run: { turn: TurnContext; sink: SessionSink; files: string[] }, text = DEFAULT_REPLY, afterRequest = false) => {
      // Lets Playwright assert from the transcript which references actually reached the Provider.
      const reply = text === DEFAULT_REPLY && run.files.length ? `已收到文件引用：${run.files.join(', ')}` : text
      if (afterRequest) run.sink.itemCompleted(run.turn.turnId, { itemId: `${run.turn.turnId}:message`, kind: 'assistant_message', status: 'completed', text: NARRATION })
      run.sink.itemCompleted(run.turn.turnId, { itemId: `${run.turn.turnId}:${afterRequest ? 'reply' : 'message'}`, kind: 'assistant_message', status: 'completed', text: reply })
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
        { id: cli === 'codex' ? 'e2e-codex' : 'e2e-claude', displayName: cli === 'codex' ? 'E2E Codex' : 'E2E Claude', isDefault: true, reasoningEfforts: cli === 'codex' ? ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] : ['low', 'medium', 'high', 'xhigh', 'max'] },
        { id: 'e2e-alternate', displayName: 'E2E Alternate' }
      ],
      capabilities: { nativeTitle: true, inputWhileRunning: cli === 'codex' ? 'steer' : 'queue' },
      behavior: {
        // Claude-style native queue: `[e2e:queue-fold]` joins the running turn after a short "tool round";
        // anything else waits until no turn runs (e.g. after Stop) and then runs as its own turn.
        onQueue(inputId, input, sink) {
          const controller = provider.sessions.find(session => session.controller.queuedInputIds?.includes(inputId))?.controller
          const take = () => {
            if (!controller || controller.state === 'closed' || !controller.queuedInputIds?.includes(inputId)) return
            if (input.text.includes('[e2e:queue-fold]') && controller.activeTurn) { sink.queuedInputStarted(inputId, false); return }
            if (controller.activeTurn || controller.state !== 'idle') { setTimeout(take, 100); return }
            const turnId = sink.queuedInputStarted(inputId, true)
            if (turnId) setTimeout(() => {
              sink.itemCompleted(turnId, { itemId: `${turnId}:message`, kind: 'assistant_message', status: 'completed', text: `已处理排队消息：${input.text}` })
              sink.nativeTurnEnded(turnId, { status: 'completed', model: 'e2e-claude' })
            }, 300)
          }
          setTimeout(take, 800)
        },
        onSteer(turn, input) {
          if (input.text.includes('[e2e:steer-error]')) throw new Error('模拟追加失败，输入已保留')
          runs.get(turn.turnId)?.files.push(...references(turn, input))
        },
        onStartTurn(turn, input, sink) {
          const run = { turn, sink, remaining: 0, files: references(turn, input) }
          runs.set(turn.turnId, run)
          turn.signal.addEventListener('abort', () => runs.delete(turn.turnId), { once: true })
          if (/\[e2e:diff(?:-empty|-failed|-interrupted)?\]/.test(input.text)) {
            const nativeSessionId = provider.sessions.find(session => session.controller.activeTurn?.turnId === turn.turnId)!.controller.nativeSessionId!
            const nativeTurnId = `native:${turn.turnId}`
            sink.bindNativeTurnId(turn.turnId, nativeTurnId)
            schedule(turn, () => {
              const empty = input.text.includes('[e2e:diff-empty]')
              const failed = input.text.includes('[e2e:diff-failed]')
              const interrupted = input.text.includes('[e2e:diff-interrupted]')
              const diff = { nativeSessionId, nativeTurnId, source: 'e2e:turn/diff/updated', cliVersion: 'fixture', protocolVersion: '0.161.0', state: empty ? 'empty' as const : 'available' as const,
                patch: empty ? '' : 'diff --git a/native.txt b/native.txt\n--- a/native.txt\n+++ b/native.txt\n@@ -1 +1 @@\n-before\n+saved-version\n',
                files: empty ? [] : [{ itemId: 'file-1', path: 'native.txt', change: 'modify' as const, status: failed ? 'failed' as const : 'completed' as const, patch: '@@ -1 +1 @@\n-before\n+saved-version\n' }], truncated: false }
              sink.turnDiffUpdated(turn.turnId, { ...diff, patch: '+obsolete snapshot' })
              sink.turnDiffUpdated(turn.turnId, diff)
              if (failed || interrupted) sink.nativeTurnEnded(turn.turnId, { status: failed ? 'failed' : 'interrupted', ...(failed ? { error: { code: 'provider_error' as const, message: '模拟补丁后的执行失败', retryable: false } } : {}) })
              else complete(run, '模拟原生补丁已保存。')
            }, 250)
            return
          }
          if (input.text.includes('[e2e:process]')) { process(run, input.text.includes('[e2e:slow]')); return }
          // Items arrive in the order a CLI produces them: the step first, then the text that follows it.
          sink.itemStarted(turn.turnId, {
            itemId: `${turn.turnId}:tool`, kind: 'command', status: 'in_progress',
            activity: { verb: 'run', label: 'Run echo studio-e2e' }, command: { command: 'echo studio-e2e' }
          })
          sink.itemStarted(turn.turnId, { itemId: `${turn.turnId}:message`, kind: 'assistant_message', status: 'in_progress', text: '' })
          schedule(turn, () => sink.itemCompleted(turn.turnId, {
            itemId: `${turn.turnId}:tool`, kind: 'command', status: 'completed',
            activity: { verb: 'run', label: 'Run echo studio-e2e' }, command: { command: 'echo studio-e2e', exitCode: 0, output: 'studio-e2e' }
          }), 160)
          schedule(turn, () => sink.itemDelta(turn.turnId, `${turn.turnId}:message`, 'text', NARRATION), 80)
          if (input.text.includes('[e2e:slow]')) return
          if (input.text.includes('Current Workbench: 架构') && input.text.includes('重新整理支付模块架构')) {
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
              complete(run, '已通过普通模拟 CLI Session 更新架构 Knowledge。')
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
          if (input.text.includes('[e2e:selection]') && input.text.includes('严格仅返回 JSON')) { schedule(turn, () => complete(run, JSON.stringify({ candidates: 'ABCDE'.split('').map(id => ({ id, title: '测试方案 '+id, audience: '桌面用户', material: '竹材', price: '100–200 元（待验证）', rationale: '合成测试依据', risk: '成本待验证' })) })), 300); return }
          if (input.text.includes('[e2e:markdown]')) { schedule(turn, () => complete(run, E2E_MARKDOWN_REPLY), 300); return }
          schedule(turn, () => complete(run), input.text.includes('[e2e:delay]') ? 1800 : 500)
        },
        onRespond(record) {
          const run = runs.get(record.request.turnId)
          if (run && --run.remaining === 0) schedule(run.turn, () => complete(run, DEFAULT_REPLY, true), 100)
        },
        onDeclineWithText(records) {
          const run = records[0] && runs.get(records[0].request.turnId)
          if (run) { run.remaining = 0; schedule(run.turn, () => complete(run, DEFAULT_REPLY, true), 100) }
        }
      }
    })
    /**
     * `[e2e:process]`: a turn with every kind of step the conversation shows (Shell Spec v02 §6): thinking with and
     * without published text, lookups, commentary, edits with patches, a failing and a passing command, a tool
     * call, then the reply and the turn's diff. With `[e2e:slow]` it stays on the failing command while it runs.
     */
    function process(run: { turn: TurnContext; sink: SessionSink }, slow: boolean): void {
      const { turn, sink } = run, id = (name: string) => `${turn.turnId}:${name}`
      const at = (delay: number, callback: () => void) => schedule(turn, callback, delay)
      const command = (name: string, start: number, verb: 'read' | 'search' | 'run', line: string, target: string, output: string, exitCode = 0) => {
        const item = { itemId: id(name), kind: 'command' as const, activity: { verb, label: line, target }, command: { command: line, cwd: '/project' } }
        at(start, () => sink.itemStarted(turn.turnId, { ...item, status: 'in_progress' }))
        at(start + 40, () => sink.itemCompleted(turn.turnId, { ...item, status: exitCode ? 'failed' : 'completed', command: { ...item.command, exitCode, output } }))
      }
      const phase = (value: 'commentary' | 'final_answer') => cli === 'codex' ? { phase: value } : {}
      const patches = ['@@ -12 +12 @@\n-export const TEST_TIMEOUT_MS = 8000\n+export const TEST_TIMEOUT_MS = 15000\n', '@@ -30,2 +30,2 @@\n-  vi.advanceTimersByTime(8000)\n-  expect(result.message).toBe(\'连接失败：8 秒内无响应\')\n+  vi.advanceTimersByTime(TEST_TIMEOUT_MS)\n+  expect(result.message).toBe(\'连接失败：15 秒内无响应\')\n']
      const files = ['src/settings/cli-connection.ts', 'src/settings/cli-connection.test.ts'].map((path, index) => ({ path, change: 'modify' as const, diff: patches[index]! }))
      const thinking = '**确认超时常量**\n\n超时常量定义在哪里，测试里有没有写死 8 秒。先搜索常量名，再看设置页有没有展示这个数字。'
      at(0, () => sink.itemStarted(turn.turnId, { itemId: id('think'), kind: 'reasoning', status: 'in_progress', text: '' }))
      at(40, () => sink.itemDelta(turn.turnId, id('think'), 'reasoning', thinking.slice(0, 20)))
      at(120, () => sink.itemCompleted(turn.turnId, { itemId: id('think'), kind: 'reasoning', status: 'completed', text: thinking }))
      command('search', 160, 'search', 'rg -n TEST_TIMEOUT_MS src', 'TEST_TIMEOUT_MS', 'src/settings/cli-connection.ts:12:export const TEST_TIMEOUT_MS = 8000')
      command('read-1', 220, 'read', "sed -n '1,80p' src/settings/cli-connection.ts", 'src/settings/cli-connection.ts', 'export const TEST_TIMEOUT_MS = 8000')
      command('read-2', 280, 'read', "sed -n '1,120p' src/settings/cli-connection.test.ts", 'src/settings/cli-connection.test.ts', 'vi.advanceTimersByTime(8000)')
      at(340, () => sink.itemCompleted(turn.turnId, { itemId: id('commentary'), kind: 'assistant_message', status: 'completed', text: '超时常量只在 `cli-connection.ts` 里定义，测试里另有一处写死的 8000，一起改掉。', ...phase('commentary') }))
      at(380, () => sink.itemCompleted(turn.turnId, { itemId: id('edit'), kind: 'file_change', status: 'completed', activity: { verb: 'edit', label: files.map(file => file.path).join(', ') }, files }))
      const failing = { itemId: id('test-1'), kind: 'command' as const, activity: { verb: 'run' as const, label: 'pnpm vitest run settings', target: 'pnpm vitest run settings' }, command: { command: 'pnpm vitest run settings', cwd: '/project' } }
      at(420, () => sink.itemStarted(turn.turnId, { ...failing, status: 'in_progress' }))
      at(460, () => sink.itemDelta(turn.turnId, id('test-1'), 'output', ' RUN  settings\n ❯ src/settings/cli-connection.test.ts (4)\n'))
      if (slow) return
      at(520, () => sink.itemCompleted(turn.turnId, { ...failing, status: 'failed', command: { ...failing.command, exitCode: 1, output: " FAIL  src/settings/cli-connection.test.ts\n  × 超时后返回可读的错误\n    AssertionError: expected '连接失败：8 秒内无响应' to be '连接失败：15 秒内无响应'\n\n Tests  1 failed | 13 passed (14)" } }))
      // Thinking the CLI did not publish: it has no row once it is done.
      at(560, () => sink.itemCompleted(turn.turnId, { itemId: id('think-2'), kind: 'reasoning', status: 'completed', text: '' }))
      at(600, () => sink.itemCompleted(turn.turnId, { itemId: id('tool'), kind: 'tool_call', status: 'completed', activity: { verb: 'tool', label: 'docs / search' }, tool: { name: 'search', server: 'docs', input: { query: 'connection timeout copy' }, result: [{ title: '错误文案规范', url: 'https://example.com/copy' }] } }))
      command('test-2', 660, 'run', 'pnpm vitest run settings', 'pnpm vitest run settings', ' Test Files  4 passed (4)\n      Tests  14 passed (14)')
      at(760, () => {
        const nativeSessionId = provider.sessions.find(session => session.controller.activeTurn?.turnId === turn.turnId)?.controller.nativeSessionId
        if (nativeSessionId) {
          const nativeTurnId = `native:${turn.turnId}`
          sink.bindNativeTurnId(turn.turnId, nativeTurnId)
          sink.turnDiffUpdated(turn.turnId, { nativeSessionId, nativeTurnId, source: 'e2e:turn/diff/updated', cliVersion: 'fixture', protocolVersion: '0.161.0', state: 'available',
            patch: files.map(file => `diff --git a/${file.path} b/${file.path}\n--- a/${file.path}\n+++ b/${file.path}\n${file.diff}`).join(''),
            files: files.map((file, index) => ({ itemId: `file-${index}`, path: file.path, change: file.change, status: 'completed' as const, patch: file.diff })), truncated: false })
        }
        sink.itemCompleted(turn.turnId, { itemId: id('message'), kind: 'assistant_message', status: 'completed', text: '超时改为 15 秒，错误文案改为由同一个常量生成。`pnpm vitest run settings` 14 项通过。', ...phase('final_answer') })
        sink.nativeTurnEnded(turn.turnId, { status: 'completed', model: cli === 'codex' ? 'e2e-codex' : 'e2e-claude' })
      })
    }
    function references(turn: TurnContext, input: UserInput): string[] {
      const cwd = provider.sessions.find(session => session.controller.activeTurn?.turnId === turn.turnId)?.options.cwd
      return [...parseReferencedFiles(input.text), ...(input.attachments ?? []).flatMap(file => file.kind === 'file' && cwd ? [relative(cwd, file.path)] : [])]
    }
    return provider
  })
}
