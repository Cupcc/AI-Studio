import type { SessionCli } from './types'

export type CliInstallation = { cli: SessionCli } & (
  | { status: 'idle' }
  | { status: 'installing'; phase: 'preparing' | 'downloading' | 'installing' | 'checking' }
  | { status: 'complete' }
  | { status: 'error'; message: string }
)

export const CLI_INSTALL_COMMANDS: Record<SessionCli, string> = {
  codex: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
  'claude-code': 'curl -fsSL https://claude.ai/install.sh | bash'
}
