import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server, type RequestListener } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { nativeTestModel, testApiConnection } from './connection-test'

const directories: string[] = []
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) })))
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
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

  it('does not guess a model when local configuration has none', async () => {
    expect(await testApiConnection('codex', { baseUrl: 'http://127.0.0.1:1', apiKey: 'secret', auth: 'api_key' }, '')).toMatchObject({ ok: false, message: expect.stringContaining('未指定模型') })
  })

  it('reads native config files without running a CLI and respects model aliases', async () => {
    const home = await mkdtemp(join(tmpdir(), 'studio-api-model-')); directories.push(home)
    await mkdir(join(home, '.codex')); await mkdir(join(home, '.claude'))
    await writeFile(join(home, '.codex/config.toml'), 'model = "base"\nprofile = "work"\n[profiles.work]\nmodel = "native-model"\n')
    await writeFile(join(home, '.claude/settings.json'), JSON.stringify({ model: 'sonnet', env: { ANTHROPIC_DEFAULT_SONNET_MODEL: 'native-sonnet' } }))
    expect(await nativeTestModel('codex', { HOME: home })).toBe('native-model')
    expect(await nativeTestModel('claude-code', { HOME: home })).toBe('native-sonnet')
    expect(await nativeTestModel('claude-code', { HOME: home, ANTHROPIC_MODEL: 'environment-model' })).toBe('environment-model')
    await writeFile(join(home, '.claude/settings.json'), JSON.stringify({ env: { ANTHROPIC_MODEL: 'settings-model' } }))
    expect(await nativeTestModel('claude-code', { HOME: home, ANTHROPIC_MODEL: 'environment-model' })).toBe('settings-model')
  })
})
