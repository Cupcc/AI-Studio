import type { SessionCli, SessionStatus } from '@shared/session/types'

export function CliBadge({ cli }: { cli: SessionCli }) {
  return <span className="session-cli" title={cli === 'codex' ? 'Codex CLI' : 'Claude Code'} aria-label={cli === 'codex' ? 'Codex CLI' : 'Claude Code'}>{cli === 'codex' ? 'CX' : 'CC'}</span>
}
const labels: Record<NonNullable<SessionStatus>, string> = { running: 'Running', needs_input: 'Needs Input', error: 'Error', completed_unread: 'Completed Unread' }
export function SessionStatusIndicator({ status }: { status: SessionStatus }) {
  if (!status) return null
  return <span role="img" aria-label={labels[status]} title={labels[status]} className={status === 'running' ? 'session-spinner' : `attention-dot attention-dot--${status}`} />
}
