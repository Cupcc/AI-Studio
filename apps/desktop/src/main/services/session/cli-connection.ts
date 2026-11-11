import { nativeTestModel, testApiConnection } from './connection-test'
import { randomUUID } from 'node:crypto'
import type { ProviderEnvironment } from '@ai-studio/agent-adapter'
import { SESSION_CLIS, type SessionCli } from '@shared/session/types'
import type { CliConnection, ConnectionProfile, ConnectionTestResult, SaveCliConnection } from '@shared/session/cli-connection'
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
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('请使用 HTTPS；本地服务可使用 HTTP。')
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
        profile = { baseUrl: validateBaseUrl(p.baseUrl), auth: p.auth, encryptedKey: p.encryptedKey }
      }
      if (data.mode === 'app' && !profile) throw new Error()
      return { mode: data.mode === 'app' ? 'app' : 'local', revision: data.revision, profile }
    } catch { throw new Error('应用连接配置无法读取，请重新保存配置。') }
  }

  get(cli: SessionCli): CliConnection {
    const saved = this.read(`connection:${cli}`)
    return { cli, mode: saved.mode, revision: saved.revision, profile: saved.profile ? { baseUrl: saved.profile.baseUrl, auth: saved.profile.auth, hasApiKey: true } : null }
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
        if (request.cli === 'codex' && request.auth !== 'api_key') throw new Error('Codex 使用 API Key 认证。')
        const key = request.apiKey
        if (!key && (!profile || profile.baseUrl !== baseUrl || profile.auth !== request.auth)) throw new Error('请为此连接填写 API Key。修改地址或认证方式后需重新填写。')
        if (!await this.secrets.available()) throw new Error('系统密钥保护暂不可用，配置未保存。')
        let encryptedKey: string
        try { encryptedKey = key ? (await this.secrets.encrypt(key)).toString('base64') : profile!.encryptedKey }
        catch { throw new Error('无法安全保存 API Key，请检查系统钥匙串后重试。') }
        profile = { baseUrl, auth: request.auth, encryptedKey }
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

  async test(cli: SessionCli, env: Env): Promise<ConnectionTestResult> {
    const { connection } = await this.environment(cli, env)
    if (!connection) return { ok: false, message: '请先保存应用连接配置。' }
    let model: string
    try { model = await nativeTestModel(cli, env) }
    catch { return { ok: false, message: '无法读取本机模型配置，请检查 CLI 配置文件。' } }
    return testApiConnection(cli, connection, model)
  }

}
