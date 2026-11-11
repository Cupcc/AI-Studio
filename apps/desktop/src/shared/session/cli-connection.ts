import type { SessionCli } from './types'

export interface ConnectionProfile {
  baseUrl: string
  auth: 'api_key' | 'bearer'
}
export interface CliConnection {
  cli: SessionCli
  mode: 'local' | 'app'
  profile: (ConnectionProfile & { hasApiKey: boolean }) | null
  revision: string
}
export type SaveCliConnection = { cli: SessionCli } & (
  | { mode: 'local' }
  | ({ mode: 'app'; apiKey?: string } & ConnectionProfile)
)
export type ConnectionTestResult = { ok: true; message: string; model: string; reply: string; durationMs: number } | { ok: false; message: string }
