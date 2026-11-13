import type { SessionCli } from '@shared/session/types'
import type { ConnectionTestResult } from '@shared/session/cli-connection'
import type { ProviderConnection } from '@ai-studio/agent-adapter'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

// Error shapes of the Anthropic / OpenAI APIs and common gateways for an unknown or unserved model.
const MODEL_UNAVAILABLE = /model_not_found|not_found_error|no available channel for model|model\b[^.]{0,80}\b(?:not found|does not exist|not exist|unavailable|not available|not supported)|(?:invalid|unknown|unsupported) model/i

/** Says which side failed without echoing the response body, which could carry request details. */
function failure(status: number, body: string, model: string): string {
  if (status === 401 || status === 403) return `服务拒绝了 API Key（HTTP ${status}），请检查 Key 与权限。`
  if (status === 402 || status === 429) return `服务返回 HTTP ${status}，可能是额度不足或被限流，请稍后重试或检查额度。`
  if (MODEL_UNAVAILABLE.test(body)) return `网关可达，但模型 ${model} 不可用（HTTP ${status}），请换一个测试模型。`
  return `服务返回 HTTP ${status}，请检查地址、Key 和额度。`
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
    if (!response.ok) return { ok: false, message: failure(response.status, (await response.text().catch(() => '')).slice(0, 4096), model) }
    const body = await response.text()
    const reply = response.headers.get('content-type')?.includes('text/event-stream') ? streamReply(body, claude) : responseText(JSON.parse(body), claude)
    if (!reply) return { ok: false, message: '服务未返回完整模型回复，连接测试未通过。' }
    const safeReply = reply.split(connection.apiKey).join('[redacted]').slice(0, 500)
    return { ok: true, message: `连接测试通过（${model}）。回复：${safeReply}`, model, reply: safeReply, durationMs: Date.now() - startedAt }
  } catch { return { ok: false, message: 'API 请求失败、超时或响应无效，请检查地址、网络和代理。' } }
}
