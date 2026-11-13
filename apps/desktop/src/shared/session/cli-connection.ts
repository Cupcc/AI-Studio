import type { SessionCli } from './types'

export interface ConnectionProfile {
  baseUrl: string
  auth: 'api_key' | 'bearer'
  /** Model for the connection test only; Sessions keep the CLI's own model. */
  testModel?: string
}
/** Used when a connection names no test model: each CLI's own default at the time (Codex 0.167.2, Claude Code 2.1.323). */
export const DEFAULT_TEST_MODELS: Record<SessionCli, string> = { codex: 'gpt-6.1-sol', 'claude-code': 'claude-opus-5-5' }
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
