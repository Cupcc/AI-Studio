import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
const root = '/tmp/studio-ac06-real.zrj4BN'
const appDir = resolve('apps/desktop')
const require = createRequire(join(appDir, 'package.json'))
const { _electron: electron } = require('@playwright/test')
const env = { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: 'low', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5' }
delete env.STUDIO_E2E_PROVIDERS
const app = await electron.launch({ args: [appDir, '--remote-debugging-port=9337', `--studio-user-data-dir=${join(root,'user-data')}`], cwd: appDir, env })
await app.firstWindow()
await app.evaluate(async ({ app, BrowserWindow, dialog }, { root, appDir }) => {
  const { createRequire } = process.getBuiltinModule('module')
  const { appendFileSync, existsSync, readFileSync, writeFileSync, realpathSync } = process.getBuiltinModule('fs')
  const { join } = process.getBuiltinModule('path')
  const require = createRequire(join(appDir, 'package.json'))
  const { CodexProvider } = require('@ai-studio/agent-adapter/codex')
  const { ClaudeProvider } = require('@ai-studio/agent-adapter/claude')
  const counterFile = join(root, 'budget.json'), auditFile = join(root, 'audit.jsonl')
  const used = existsSync(counterFile) ? JSON.parse(readFileSync(counterFile, 'utf8')) : { codex: 0, 'claude-code': 0 }
  const record = event => appendFileSync(auditFile, JSON.stringify({ at: Date.now(), ...event }) + '\n')
  const targets = { codex: 'gpt-6-luna', 'claude-code': 'haiku' }
  for (const Provider of [CodexProvider, ClaudeProvider]) {
    for (const method of ['createSession', 'resumeSession']) {
      const original = Provider.prototype[method]
      Provider.prototype[method] = async function(options) {
        const id = this.id, expected = targets[id]
        if (options.overrides?.model !== expected) throw new Error('AC-06 guard: select the authorized model in the UI')
        const fixtureRoots = ['Codex Payment', 'Claude Payment'].map(name => realpathSync(join(root, name)))
        if (!fixtureRoots.includes(realpathSync(options.cwd))) throw new Error('AC-06 guard: fixture projects only')
        const configured = { ...options, environment: { ...options.environment, env: { ...options.environment.env,
          CLAUDE_CODE_EFFORT_LEVEL: 'low', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5' } },
          providerOptions: { ...options.providerOptions, ...(id === 'codex' ? { effort: 'low', config: { model_reasoning_effort: 'low' } } : {}) } }
        record({ type: 'configured', provider: id, operation: method, model: expected, effort: 'low' })
        const session = await original.call(this, configured)
        const setModel = session.setModel.bind(session)
        session.setModel = model => { if (model !== expected) throw new Error('AC-06 guard: unauthorized model fallback'); return setModel(model) }
        const send = session.sendUserInput.bind(session)
        session.sendUserInput = input => {
          if (used[id] >= 2) throw new Error('AC-06 guard: two-turn budget exhausted')
          if (session.model !== expected) throw new Error('AC-06 guard: unexpected active model')
          used[id]++; writeFileSync(counterFile, JSON.stringify(used, null, 2))
          record({ type: 'submitted', provider: id, call: used[id], model: session.model, effort: 'low',
            hasViewContext: input.text.startsWith('Current Project View: Architecture\n'),
            userText: input.text.split('\n\n').at(-1) })
          return send(input)
        }
        session.subscribe(event => {
          if (event.type === 'turn.completed') record({ type: event.type, provider: id, outcome: event.outcome,
            model: event.model, durationMs: event.durationMs, errorCode: event.error?.code })
          if (event.type === 'session.native_id') record({ type: event.type, provider: id, nativeSessionId: event.nativeSessionId })
          if (event.type === 'input.requested') record({ type: event.type, provider: id, kind: event.request.kind })
          if (event.type === 'runtime.started') record({ type: event.type, provider: id, pid: event.pid })
        })
        return session
      }
    }
  }
  let pick = existsSync(join(root, 'Codex Payment', '.ai-studio')) ? 1 : 0
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(root, pick++ === 0 ? 'Codex Payment' : 'Claude Payment')] })
  app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus()
}, { root, appDir })
console.log(JSON.stringify({ root, port: 9337, realProviders: true, budget: '2 user turns per CLI', effort: 'low', audit: join(root, 'audit.jsonl') }))
const stop = async () => { await app.close(); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
app.process().once('exit', () => process.exit(0))
