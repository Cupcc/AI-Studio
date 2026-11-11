import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import type { SessionCli } from '@shared/session/types'
import type { ConnectionTestResult } from '@shared/session/cli-connection'
import type { ProviderConnection } from '@ai-studio/agent-adapter'
import type { Env } from '../shell-env/login-env'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

/** Tests use the user-level native model; project/session model choices are independent. */
export async function nativeTestModel(cli: SessionCli, env: Env): Promise<string> {
  const home = env.HOME || homedir()
  if (cli === 'codex') {
    const config = parse(await readFile(join(env.CODEX_HOME || join(home, '.codex'), 'config.toml'), 'utf8'))
    const profile = record(record(config.profiles)[text(config.profile)])
    return text(profile.model) || text(config.model)
  }
  let config: Record<string, unknown> = {}
  try { config = record(JSON.parse(await readFile(join(env.CLAUDE_CONFIG_DIR || join(home, '.claude'), 'settings.json'), 'utf8'))) }
  catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error }
  const settingsEnv = record(config.env)
  const model = text(settingsEnv.ANTHROPIC_MODEL) || text(env.ANTHROPIC_MODEL) || text(config.model)
  const alias = model.replace(/\[1m\]$/, '').toLowerCase()
  if (['sonnet', 'opus', 'haiku'].includes(alias)) {
    const name = `ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL`
    return text(settingsEnv[name]) || text(env[name]) || model
  }
  return model
}

function responseText(value: unknown, claude: boolean): string {
  const data = record(value)
  if (data.error || (data.status && data.status !== 'completed') || ['max_tokens', 'refusal'].includes(text(data.stop_reason))) return ''
  const content = claude ? data.content : Array.isArray(data.output) ? data.output.flatMap(item => record(item).content ?? []) : []
  if (!Array.isArray(content)) return ''
  return content.map(item => {
    const part = record(item)
    return part.type === (claude ? 'text' : 'output_text') ? text(part.text) : ''
  }).filter(Boolean).join('\n')
}

function streamReply(body: string, claude: boolean): string {
  let reply = '', completed = false
  for (const frame of body.replace(/\r\n/g, '\n').split('\n\n')) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') continue
    const event = record(JSON.parse(data))
    if (['error', 'response.failed', 'response.incomplete'].includes(text(event.type))) throw new Error('API stream failed')
    if (claude && event.type === 'content_block_delta') reply += typeof record(event.delta).text === 'string' ? record(event.delta).text : ''
    if (claude && event.type === 'message_delta' && ['max_tokens', 'refusal'].includes(text(record(event.delta).stop_reason))) throw new Error('API response incomplete')
    if (claude && event.type === 'message_stop') completed = true
    if (!claude && event.type === 'response.completed') { reply = responseText(event.response, false); completed = true }
  }
  return completed ? reply.trim() : ''
}

/** A single direct API request. Never starts a CLI, retries or creates a chat session. */
export async function testApiConnection(cli: SessionCli, connection: ProviderConnection, model: string): Promise<ConnectionTestResult> {
  if (!model) return { ok: false, message: '本机配置未指定模型，无法发送测试请求。请先在本机 CLI 配置中设置模型。' }
  const claude = cli === 'claude-code'
  const base = connection.baseUrl.replace(/\/+$/, '')
  const endpoint = claude ? `${base.replace(/\/v1$/, '')}/v1/messages` : `${base}/responses`
  const startedAt = Date.now()
  try {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json', ...(claude ? { 'anthropic-version': '2023-06-01' } : {}),
        ...(claude && connection.auth === 'api_key' ? { 'x-api-key': connection.apiKey } : { Authorization: `Bearer ${connection.apiKey}` }) },
      body: JSON.stringify(claude
        ? { model, max_tokens: 1024, stream: true, messages: [{ role: 'user', content: 'hi' }] }
        : { model, input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }], instructions: '', stream: true, store: false })
    })
    if (!response.ok) {
      await response.body?.cancel()
      return { ok: false, message: `服务返回 HTTP ${response.status}，请检查地址、凭据、本机模型和额度。` }
    }
    const body = await response.text()
    const reply = response.headers.get('content-type')?.includes('text/event-stream') ? streamReply(body, claude) : responseText(JSON.parse(body), claude)
    if (!reply) return { ok: false, message: '服务未返回完整模型回复，连接测试未通过。' }
    const safeReply = reply.split(connection.apiKey).join('[redacted]').slice(0, 500)
    return { ok: true, message: `连接测试通过（${model}）。回复：${safeReply}`, model, reply: safeReply, durationMs: Date.now() - startedAt }
  } catch { return { ok: false, message: 'API 请求失败、超时或响应无效，请检查地址、网络和代理。' } }
}
