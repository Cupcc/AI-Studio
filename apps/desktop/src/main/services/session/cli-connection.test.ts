import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CliConnections, validateBaseUrl } from './cli-connection'

type Store = { values: Map<string, string>; getPreference(key: string): string | null; setPreference(key: string, value: string): void }
function store(): Store { const values = new Map<string, string>(); return { values, getPreference: key => values.get(key) ?? null, setPreference: (key, value) => { values.set(key, value) } } }
function secrets() { return { available: async () => true, encrypt: async (value: string) => Buffer.from(`sealed:${value}`), decrypt: async (value: Buffer) => value.toString().slice(7) } }

describe('CliConnections', () => {
  it('accepts HTTP and HTTPS endpoints and keeps local mode separate', async () => {
    expect(validateBaseUrl('http://203.0.113.7:3000/')).toBe('http://203.0.113.7:3000')
    expect(validateBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1')
    for (const url of ['ftp://example.com', 'https://user:pass@example.com', 'https://example.com/?key=1', 'example.com']) expect(() => validateBaseUrl(url)).toThrow()
    const db = store(); const connections = new CliConnections(db, secrets())
    expect(connections.get('codex')).toMatchObject({ mode: 'local', profile: null })
    const saved = await connections.save({ cli: 'codex', mode: 'app', baseUrl: 'https://gateway.example/v1', auth: 'api_key', apiKey: 'secret' })
    expect(saved.profile).toMatchObject({ baseUrl: 'https://gateway.example/v1', hasApiKey: true })
    expect(JSON.stringify([...db.values])).not.toContain('secret')
    await expect(connections.environment('codex', { PATH: '/bin' })).resolves.toMatchObject({ env: { PATH: '/bin' }, connection: { baseUrl: 'https://gateway.example/v1', apiKey: 'secret' } })
    await connections.save({ cli: 'codex', mode: 'local' })
    await expect(connections.environment('codex', { PATH: '/bin' })).resolves.toEqual({ env: { PATH: '/bin' } })
  })

  it('requires a new key when the endpoint changes and refuses plaintext fallback', async () => {
    const db = store(); const connections = new CliConnections(db, { ...secrets(), available: async () => false })
    await expect(connections.save({ cli: 'claude-code', mode: 'app', baseUrl: 'https://gateway.example', auth: 'api_key', apiKey: 'secret' })).rejects.toThrow('密钥保护')
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

  it('tests Claude Code with the model ID its catalog resolves for the local alias', async () => {
    const home = await mkdtemp(join(tmpdir(), 'studio-connection-'))
    const models: string[] = []
    const server = createServer(async (request, response) => {
      let raw = ''; for await (const chunk of request) raw += chunk
      models.push(JSON.parse(raw).model)
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ content: [{ type: 'text', text: 'Hello' }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('No TCP address')
      const connections = new CliConnections(store(), secrets())
      await connections.save({ cli: 'claude-code', mode: 'app', baseUrl: `http://127.0.0.1:${address.port}`, auth: 'api_key', apiKey: 'secret' })
      const env = { HOME: home, ANTHROPIC_MODEL: 'opus' }
      const catalog = async (environment: { connection?: { apiKey: string } }) => {
        expect(environment.connection?.apiKey).toBe('secret')
        return [{ id: 'default', displayName: 'Default', resolvedModel: 'claude-default-native' }, { id: 'opus', displayName: 'Opus', resolvedModel: 'claude-opus-native' }]
      }
      await expect(connections.test('claude-code', env, catalog)).resolves.toMatchObject({ ok: true, model: 'claude-opus-native', reply: 'Hello' })
      await expect(connections.test('claude-code', { HOME: home }, catalog)).resolves.toMatchObject({ ok: true, model: 'claude-default-native' })
      expect(models).toEqual(['claude-opus-native', 'claude-default-native'])
      const unavailable = async () => { throw new Error('spawn failed') }
      await expect(connections.test('claude-code', env, unavailable)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('模型目录') })
      await expect(connections.test('claude-code', { HOME: home }, unavailable)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('模型目录') })
      expect(models).toHaveLength(2)
      await expect(connections.test('claude-code', { HOME: home, ANTHROPIC_MODEL: 'claude-full-id[1m]' }, unavailable)).resolves.toMatchObject({ ok: true, model: 'claude-full-id' })
      expect(models).toEqual(['claude-opus-native', 'claude-default-native', 'claude-full-id'])
    } finally {
      server.closeAllConnections(); server.close()
      await rm(home, { recursive: true, force: true })
    }
  })

})
