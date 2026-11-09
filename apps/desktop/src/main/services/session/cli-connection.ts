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
        if (!p || typeof p !== 'object' || !('baseUrl' in p) || typeof p.baseUrl !== 'string' || !('model' in p) || !(p.model === null || typeof p.model === 'string') || !('auth' in p) || !(p.auth === 'api_key' || p.auth === 'bearer') || !('encryptedKey' in p) || typeof p.encryptedKey !== 'string' || !p.encryptedKey) throw new Error()
        profile = { baseUrl: validateBaseUrl(p.baseUrl), model: p.model, auth: p.auth, encryptedKey: p.encryptedKey }
      }
      if (data.mode === 'app' && !profile) throw new Error()
      return { mode: data.mode === 'app' ? 'app' : 'local', revision: data.revision, profile }
    } catch { throw new Error('应用连接配置无法读取，请重新保存配置。') }
  }

  get(cli: SessionCli): CliConnection {
    const saved = this.read(`connection:${cli}`)
    return { cli, mode: saved.mode, revision: saved.revision, profile: saved.profile ? { baseUrl: saved.profile.baseUrl, model: saved.profile.model, auth: saved.profile.auth, hasApiKey: true } : null }
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
        profile = { baseUrl, model: request.model, auth: request.auth, encryptedKey }
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
    return { env, connection: { baseUrl: profile.baseUrl, apiKey, auth: profile.auth, ...(profile.model ? { model: profile.model } : {}) } }
  }

  async test(cli: SessionCli): Promise<ConnectionTestResult> {
    const { connection } = await this.environment(cli, {})
    if (!connection) return { ok: false, message: '请先保存应用连接配置。' }
    if (!connection.model) return { ok: false, message: '请填写并保存要测试的模型。' }
    const claude = cli === 'claude-code'
    const endpoint = claude ? `${connection.baseUrl.replace(/\/v1$/, '')}/v1/messages` : `${connection.baseUrl}/responses`
    try {
      const response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', ...(claude ? { 'anthropic-version': '2023-06-01' } : {}),
          ...(claude && connection.auth === 'api_key' ? { 'x-api-key': connection.apiKey } : { Authorization: `Bearer ${connection.apiKey}` }) },
        body: JSON.stringify(claude ? { model: connection.model, max_tokens: 1, messages: [{ role: 'user', content: 'Reply OK.' }] } : { model: connection.model, max_output_tokens: 16, input: 'Reply OK.', store: false })
      })
      await response.body?.cancel()
      return response.ok ? { ok: true, message: '连接测试通过。' } : { ok: false, message: `服务返回 HTTP ${response.status}，请检查地址、凭据、模型和额度。` }
    } catch { return { ok: false, message: '连接失败或超时，请检查地址、网络和代理。' } }
  }
}
