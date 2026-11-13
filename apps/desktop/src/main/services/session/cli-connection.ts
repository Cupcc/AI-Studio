import { testApiConnection } from './connection-test'
import { randomUUID } from 'node:crypto'
import type { ProviderEnvironment } from '@ai-studio/agent-adapter'
import { SESSION_CLIS, type SessionCli } from '@shared/session/types'
import { DEFAULT_TEST_MODELS, type CliConnection, type ConnectionProfile, type ConnectionTestResult, type SaveCliConnection } from '@shared/session/cli-connection'
import type { SessionStore } from './store'
import type { Env } from '../shell-env/login-env'

interface StoredProfile extends ConnectionProfile { encryptedKey: string }
interface StoredConnection { mode: 'local' | 'app'; revision: string; profile: StoredProfile | null }
export interface SecretStorage {
  available(): Promise<boolean>
  encrypt(value: string): Promise<Buffer>
  decrypt(value: Buffer): Promise<string>
}
const LOCAL: StoredConnection = { mode: 'local', revision: 'local', profile: null }

export function validateBaseUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('请输入有效的 Base URL。') }
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL 不能包含凭据、查询参数或片段。')
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Base URL 须以 http:// 或 https:// 开头。')
  return url.href.replace(/\/+$/, '')
}

/** Stores encrypted profiles and immutable per-session copies in the application database only. */
export class CliConnections {
  private readonly saving = new Set<SessionCli>()
  constructor(private readonly store: Pick<SessionStore, 'getPreference' | 'setPreference'>, private readonly secrets: SecretStorage) {}

  private read(key: string): StoredConnection {
    const raw = this.store.getPreference(key)
    if (raw === null) return LOCAL
    try {
      const data: unknown = JSON.parse(raw)
      if (!data || typeof data !== 'object' || !('mode' in data) || !['local', 'app'].includes(String(data.mode)) || !('revision' in data) || typeof data.revision !== 'string' || !('profile' in data)) throw new Error()
      let profile: StoredProfile | null = null
      if (data.profile !== null) {
        const p = data.profile
        if (!p || typeof p !== 'object' || !('baseUrl' in p) || typeof p.baseUrl !== 'string' || !('auth' in p) || !(p.auth === 'api_key' || p.auth === 'bearer') || !('encryptedKey' in p) || typeof p.encryptedKey !== 'string' || !p.encryptedKey) throw new Error()
        const testModel = 'testModel' in p && typeof p.testModel === 'string' ? p.testModel : ''
        profile = { baseUrl: validateBaseUrl(p.baseUrl), auth: p.auth, encryptedKey: p.encryptedKey, ...(testModel ? { testModel } : {}) }
      }
      if (data.mode === 'app' && !profile) throw new Error()
      return { mode: data.mode === 'app' ? 'app' : 'local', revision: data.revision, profile }
    } catch { throw new Error('应用连接配置无法读取，请重新保存配置。') }
  }

  get(cli: SessionCli): CliConnection {
    const saved = this.read(`connection:${cli}`)
    const profile = saved.profile
    return { cli, mode: saved.mode, revision: saved.revision, profile: profile ? { baseUrl: profile.baseUrl, auth: profile.auth, hasApiKey: true, ...(profile.testModel ? { testModel: profile.testModel } : {}) } : null }
  }
  list(): CliConnection[] { return SESSION_CLIS.map(cli => this.get(cli)) }

  async save(request: SaveCliConnection): Promise<CliConnection> {
    if (this.saving.has(request.cli)) throw new Error('正在保存此 CLI 的配置，请稍后重试。')
    this.saving.add(request.cli)
    try {
      const previous = this.read(`connection:${request.cli}`)
      let profile = previous.profile
      if (request.mode === 'app') {
        const baseUrl = validateBaseUrl(request.baseUrl)
        const testModel = request.testModel?.trim()
        if (testModel && /\s/.test(testModel)) throw new Error('测试模型不能包含空格。')
        if (request.cli === 'codex' && request.auth !== 'api_key') throw new Error('Codex 使用 API Key 认证。')
        const key = request.apiKey
        if (!key && (!profile || profile.baseUrl !== baseUrl || profile.auth !== request.auth)) throw new Error('请为此连接填写 API Key。修改地址或认证方式后需重新填写。')
        if (!await this.secrets.available()) throw new Error('系统密钥保护暂不可用，配置未保存。')
        let encryptedKey: string
        try { encryptedKey = key ? (await this.secrets.encrypt(key)).toString('base64') : profile!.encryptedKey }
        catch { throw new Error('无法安全保存 API Key，请检查系统钥匙串后重试。') }
        profile = { baseUrl, auth: request.auth, encryptedKey, ...(testModel ? { testModel } : {}) }
      }
      this.store.setPreference(`connection:${request.cli}`, JSON.stringify({ mode: request.mode, revision: randomUUID(), profile } satisfies StoredConnection))
      return this.get(request.cli)
    } finally { this.saving.delete(request.cli) }
  }

  /** Called inside the Session creation transaction; old sessions without a snapshot remain native. */
  bind(sessionId: string, cli: SessionCli): void {
    this.store.setPreference(`connection:session:${sessionId}`, JSON.stringify(this.read(`connection:${cli}`)))
  }

  async environment(cli: SessionCli, env: Env, sessionId?: string): Promise<ProviderEnvironment> {
    const saved = this.read(sessionId ? `connection:session:${sessionId}` : `connection:${cli}`)
    if (saved.mode === 'local') return { env }
    const profile = saved.profile
    if (!profile) throw new Error('应用连接配置不完整，请重新保存。')
    let apiKey: string
    try { apiKey = await this.secrets.decrypt(Buffer.from(profile.encryptedKey, 'base64')) }
    catch { throw new Error('无法读取此会话的 API Key，请解锁系统钥匙串后重试。') }
    return { env, connection: { baseUrl: profile.baseUrl, apiKey, auth: profile.auth } }
  }

  /** Checks that the gateway answers; it never starts the CLI, so the CLI path itself is not covered. */
  async test(cli: SessionCli): Promise<ConnectionTestResult> {
    const { connection } = await this.environment(cli, {})
    if (!connection) return { ok: false, message: '请先保存应用连接配置。' }
    return testApiConnection(cli, connection, this.get(cli).profile?.testModel || DEFAULT_TEST_MODELS[cli])
  }

}
