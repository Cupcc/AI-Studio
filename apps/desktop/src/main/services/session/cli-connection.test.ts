import { describe, expect, it } from 'vitest'
import { CliConnections, validateBaseUrl } from './cli-connection'

type Store = { values: Map<string, string>; getPreference(key: string): string | null; setPreference(key: string, value: string): void }
function store(): Store { const values = new Map<string, string>(); return { values, getPreference: key => values.get(key) ?? null, setPreference: (key, value) => { values.set(key, value) } } }
function secrets() { return { available: async () => true, encrypt: async (value: string) => Buffer.from(`sealed:${value}`), decrypt: async (value: Buffer) => value.toString().slice(7) } }

describe('CliConnections', () => {
  it('validates secure endpoints and keeps local mode separate', async () => {
    expect(() => validateBaseUrl('http://example.com/v1')).toThrow()
    expect(validateBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1')
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

})
