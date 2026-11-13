import { createServer, type Server, type RequestListener } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { testApiConnection } from './connection-test'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) })))
})
async function fixture(handler: RequestListener) {
  const server = createServer(handler); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No TCP address')
  return `http://127.0.0.1:${address.port}`
}

describe('direct API connection test', () => {
  it.each(['codex', 'claude-code'] as const)('sends hi directly for %s and requires a complete model reply', async cli => {
    const baseUrl = await fixture(async (request, response) => {
      let raw = ''; for await (const chunk of request) raw += chunk
      const body = JSON.parse(raw)
      expect(body.model).toBe('native-model')
      expect(body.stream).toBe(true)
      if (cli === 'codex') {
        expect(request.url).toBe('/v1/responses')
        expect(request.headers.authorization).toBe('Bearer secret')
        expect(body.input[0].content[0].text).toBe('hi')
      } else {
        expect(request.url).toBe('/v1/messages')
        expect(request.headers['x-api-key']).toBe('secret')
        expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const events = cli === 'codex'
        ? [{ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello!' }] }] } }]
        : [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }, { type: 'content_block_delta', delta: { text: ' there!' } }, { type: 'message_stop' }]
      for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`)
      response.end()
    })
    const result = await testApiConnection(cli, { baseUrl: `${baseUrl}/v1`, apiKey: 'secret', auth: 'api_key' }, 'native-model')
    expect(result).toMatchObject({ ok: true, model: 'native-model', durationMs: expect.any(Number), reply: cli === 'codex' ? 'Hello!' : 'Hello there!', message: `连接测试通过（native-model）。回复：${cli === 'codex' ? 'Hello!' : 'Hello there!'}` })
  })

  it.each([
    { status: 401, body: 'unauthorized', type: 'text/plain' },
    { status: 200, body: 'data: {"type":"response.failed"}\n\n', type: 'text/event-stream' },
    { status: 200, body: 'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n', type: 'text/event-stream' },
    { status: 200, body: '{"output":[]}', type: 'application/json' },
  ])('rejects an HTTP error, failed stream, truncated stream or empty reply: $body', async ({ status, body, type }) => {
    const baseUrl = await fixture((_request, response) => { response.writeHead(status, { 'Content-Type': type }); response.end(body) })
    expect((await testApiConnection('codex', { baseUrl, apiKey: 'secret', auth: 'api_key' }, 'native-model')).ok).toBe(false)
  })

  it.each([
    { status: 401, body: '{"error":{"type":"authentication_error"}}', expected: 'API Key（HTTP 401）' },
    { status: 503, body: '{"error":{"code":"model_not_found","message":"No available channel for model x"}}', expected: '网关可达，但模型 native-model 不可用（HTTP 503）' },
    { status: 404, body: '{"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}}', expected: '网关可达，但模型 native-model 不可用（HTTP 404）' },
    { status: 429, body: '{"error":{"message":"Rate limit reached. Received Model Group=claude"}}', expected: '额度不足或被限流' },
    { status: 500, body: '{"error":{"message":"Model Group=x upstream failure"}}', expected: '服务返回 HTTP 500' },
  ])('tells a rejected key, an unavailable model and other HTTP errors apart: $status', async ({ status, body, expected }) => {
    const baseUrl = await fixture((_request, response) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(body) })
    const result = await testApiConnection('claude-code', { baseUrl, apiKey: 'secret', auth: 'api_key' }, 'native-model')
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(expected) })
    expect(result.message).not.toContain('channel')
  })
})
