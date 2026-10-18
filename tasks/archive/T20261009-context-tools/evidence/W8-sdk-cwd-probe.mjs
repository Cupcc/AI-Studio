// W8：确认真实 Claude Agent SDK 传给 spawnClaudeCodeProcess 的 cwd 与调用方传入的字符串逐字相同
// （RuntimeResources 以该字符串做 Project 范围匹配）。钩子返回假进程，不启动任何真实 CLI，也不调用模型。
// 用法（任意目录）：node W8-sdk-cwd-probe.mjs
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

const sdkPath = fileURLToPath(new URL('../../../../../runtime-tools-cleanup/packages/agent-adapter/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs', import.meta.url))
const sdk = await import(sdkPath)
for (const cwd of ['/tmp/w8//proj/', '/tmp/w8/./proj', '/tmp/w8/proj/../proj', '/tmp/w8/proj']) {
  let seen
  const abort = new AbortController()
  const fake = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), killed: false, exitCode: null, signalCode: null, kill() { return true } })
  const query = sdk.query({ prompt: (async function* () {})(), options: { cwd, pathToClaudeCodeExecutable: '/nonexistent/claude',
    spawnClaudeCodeProcess: (spawn) => { seen = spawn.cwd; return fake }, abortController: abort } })
  await new Promise((resolve) => setTimeout(resolve, 300))
  console.log(JSON.stringify({ given: cwd, seen, identical: seen === cwd }))
  try { query.close() } catch { /* fake process */ }
  abort.abort()
}
process.exit(0)
