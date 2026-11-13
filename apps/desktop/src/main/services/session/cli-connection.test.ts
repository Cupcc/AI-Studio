import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TEST_MODELS } from '@shared/session/cli-connection'
import { CliConnections, validateBaseUrl } from './cli-connection'

type Store = { values: Map<string, string>; getPreference(key: string): string | null; setPreference(key: string, value: string): void }
function store(): Store { const values = new Map<string, string>(); return { values, getPreference: key => values.get(key) ?? null, setPreference: (key, value) => { values.set(key, value) } } }
function secrets() { return { available: async () => true, encrypt: async (value: string) => Buffer.from(`sealed:${value}`), decrypt: async (value: Buffer) => value.toString().slice(7) } }

describe('CliConnections', () => {
  it('accepts HTTP and HTTPS endpoints and keeps local mode separate', async () => {
    expect(validateBaseUrl('http://203.0.113.7:3000/', 'claude-code')).toBe('http://203.0.113.7:3000')
    expect(validateBaseUrl('https://example.com/v1/', 'codex')).toBe('https://example.com/v1')
    for (const url of ['ftp://example.com', 'https://user:pass@example.com', 'https://example.com/?key=1', 'example.com']) expect(() => validateBaseUrl(url, 'codex')).toThrow()
    const db = store(); const connections = new CliConnections(db, secrets())
    expect(connections.get('codex')).toMatchObject({ mode: 'local', profile: null })
    const saved = await connections.save({ cli: 'codex', mode: 'app', baseUrl: 'https://gateway.example/v1', auth: 'api_key', apiKey: 'secret' })
    expect(saved.profile).toMatchObject({ baseUrl: 'https://gateway.example/v1', hasApiKey: true })
    expect(JSON.stringify([...db.values])).not.toContain('secret')
    await expect(connections.environment('codex', { PATH: '/bin' })).resolves.toMatchObject({ env: { PATH: '/bin' }, connection: { baseUrl: 'https://gateway.example/v1', apiKey: 'secret' } })
    await connections.save({ cli: 'codex', mode: 'local' })
    await expect(connections.environment('codex', { PATH: '/bin' })).resolves.toEqual({ env: { PATH: '/bin' } })
  })

  it('reads a Codex address without a path as the /v1 root, when saving and when loading an older record', async () => {
    const db = store(); const connections = new CliConnections(db, secrets())
    const saved = await connections.save({ cli: 'codex', mode: 'app', baseUrl: 'http://203.0.113.7:3000/', auth: 'api_key', apiKey: 'secret' })
    expect(saved.profile?.baseUrl).toBe('http://203.0.113.7:3000/v1')
    await expect(connections.save({ cli: 'codex', mode: 'app', baseUrl: 'http://203.0.113.7:3000', auth: 'api_key' })).resolves.toMatchObject({ profile: { baseUrl: 'http://203.0.113.7:3000/v1' } })
    const older = JSON.stringify({ mode: 'app', revision: 'old', profile: { baseUrl: 'http://203.0.113.7:3000', auth: 'api_key', encryptedKey: Buffer.from('sealed:secret').toString('base64') } })
    db.setPreference('connection:codex', older)
    db.setPreference('connection:session:old', older)
    expect(connections.get('codex').profile?.baseUrl).toBe('http://203.0.113.7:3000/v1')
    expect((await connections.environment('codex', {}, 'old')).connection?.baseUrl).toBe('http://203.0.113.7:3000/v1')
    for (const url of ['https://gateway.example/api/v3', 'https://gateway.example/openai']) expect(validateBaseUrl(url, 'codex')).toBe(url)
    await expect(connections.save({ cli: 'claude-code', mode: 'app', baseUrl: 'http://203.0.113.7:3000', auth: 'api_key', apiKey: 'secret' })).resolves.toMatchObject({ profile: { baseUrl: 'http://203.0.113.7:3000' } })
  })

  it('keeps the saved key when the endpoint changes, returns it for the form, and refuses plaintext fallback', async () => {
    const connections = new CliConnections(store(), secrets())
    await expect(connections.key('claude-code')).resolves.toBeNull()
    await expect(connections.save({ cli: 'claude-code', mode: 'app', baseUrl: 'https://gateway.example', auth: 'api_key' })).rejects.toThrow('请为此连接填写 API Key')
    await connections.save({ cli: 'claude-code', mode: 'app', baseUrl: 'https://gateway.example', auth: 'api_key', apiKey: 'secret' })
    await connections.save({ cli: 'claude-code', mode: 'app', baseUrl: 'https://other.example', auth: 'api_key' })
    await expect(connections.key('claude-code')).resolves.toBe('secret')
    expect((await connections.environment('claude-code', {})).connection).toEqual({ baseUrl: 'https://other.example', apiKey: 'secret', auth: 'api_key' })
    const locked = new CliConnections(store(), { ...secrets(), available: async () => false })
    await expect(locked.save({ cli: 'claude-code', mode: 'app', baseUrl: 'https://gateway.example', auth: 'api_key', apiKey: 'secret' })).rejects.toThrow('密钥保护')
  })
  it('ignores a legacy model in saved profiles and session snapshots', async () => {
    const db = store(); const connections = new CliConnections(db, secrets())
    const legacy = JSON.stringify({ mode: 'app', revision: 'old', profile: { baseUrl: 'https://gateway.example/v1', model: 'old-model', auth: 'api_key', encryptedKey: Buffer.from('sealed:secret').toString('base64') } })
    db.setPreference('connection:codex', legacy)
    db.setPreference('connection:session:old', legacy)
    expect(connections.get('codex').profile).not.toHaveProperty('model')
    expect((await connections.environment('codex', {}, 'old')).connection).toEqual({ baseUrl: 'https://gateway.example/v1', apiKey: 'secret', auth: 'api_key' })
    await connections.save({ cli: 'codex', mode: 'app', baseUrl: 'https://gateway.example/v1', auth: 'api_key' })
    expect(db.getPreference('connection:codex')).not.toContain('model')
  })

  it('tests the unsaved form with its test model, or the built-in default, and keeps it out of the Session connection', async () => {
    const models: string[] = [], keys: string[] = []
    const server = createServer(async (request, response) => {
      let raw = ''; for await (const chunk of request) raw += chunk
      models.push(JSON.parse(raw).model); keys.push(String(request.headers['x-api-key']))
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ content: [{ type: 'text', text: 'Hello' }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No TCP address')
      const baseUrl = `http://127.0.0.1:${address.port}`
      const db = store(); const connections = new CliConnections(db, secrets())
      await expect(connections.test({ cli: 'claude-code', baseUrl, auth: 'api_key' })).resolves.toEqual({ ok: false, message: '请填写 API Key。' })
      await expect(connections.test({ cli: 'claude-code', baseUrl, auth: 'api_key', apiKey: 'draft-key', testModel: ' draft-model ' })).resolves.toMatchObject({ ok: true, model: 'draft-model', reply: 'Hello' })
      expect(db.values.size).toBe(0)
      await connections.save({ cli: 'claude-code', mode: 'app', baseUrl, auth: 'api_key', apiKey: 'secret' })
      expect(connections.get('claude-code').profile).not.toHaveProperty('testModel')
      await expect(connections.test({ cli: 'claude-code', baseUrl, auth: 'api_key' })).resolves.toMatchObject({ ok: true, model: DEFAULT_TEST_MODELS['claude-code'], reply: 'Hello' })
      await expect(connections.test({ cli: 'claude-code', baseUrl, auth: 'api_key', testModel: 'claude opus' })).rejects.toThrow('测试模型不能包含空格')
      await expect(connections.save({ cli: 'claude-code', mode: 'app', baseUrl, auth: 'api_key', testModel: 'claude opus' })).rejects.toThrow('测试模型不能包含空格')
      const saved = await connections.save({ cli: 'claude-code', mode: 'app', baseUrl, auth: 'api_key', testModel: ' gateway-model ' })
      expect(saved.profile).toMatchObject({ testModel: 'gateway-model', hasApiKey: true })
      expect(models).toEqual(['draft-model', DEFAULT_TEST_MODELS['claude-code']])
      expect(keys).toEqual(['draft-key', 'secret'])
      expect((await connections.environment('claude-code', {})).connection).toEqual({ baseUrl, apiKey: 'secret', auth: 'api_key' })
    } finally {
      server.closeAllConnections(); server.close()
    }
  })
})
