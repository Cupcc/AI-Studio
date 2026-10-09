import type { SessionAttention, SessionProjectState, SessionStatus, SessionSummary } from './types'

/** FR-STATE-001–006: one indicator, no visible Idle state. */
export function sessionStatus(session: Pick<SessionSummary, 'activity' | 'errorUnseen' | 'completionUnread'>): SessionStatus {
  if (session.activity === 'needs_input') return 'needs_input'
  if (session.activity === 'running') return 'running'
  if (session.errorUnseen) return 'error'
  return session.completionUnread ? 'completed_unread' : null
}

/** D-07: Running contributes to close counts, but never to attention dots. */
export function projectSessionState(projectId: string, sessions: readonly SessionSummary[]): SessionProjectState {
  const ranks: Record<NonNullable<SessionAttention>, number> = { completed_unread: 1, error: 2, needs_input: 3 }
  let attention: SessionAttention = null
  const counts = { running: 0, needsInput: 0 }
  for (const session of sessions) {
    if (session.projectId !== projectId) continue
    if (session.activity === 'running') counts.running++
    if (session.activity === 'needs_input') counts.needsInput++
    const status = sessionStatus(session)
    if (status && status !== 'running' && (!attention || ranks[status] > ranks[attention])) attention = status
  }
  return { projectId, attention, counts }
}

export function sortSessions(sessions: readonly SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => b.lastUserMessageAt - a.lastUserMessageAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

export interface SessionDateGroup {
  id: 'today' | 'yesterday' | 'previous_week' | 'earlier'
  label: string
  sessions: SessionSummary[]
}

/** FR-NAV-003 / NAV-Q1: local calendar boundaries, including DST. */
export function groupSessions(sessions: readonly SessionSummary[], now = new Date()): SessionDateGroup[] {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getTime()
  const boundaries = [day(0), day(-1), day(-7)]
  const groups: SessionDateGroup[] = [
    { id: 'today', label: '今天', sessions: [] },
    { id: 'yesterday', label: '昨天', sessions: [] },
    { id: 'previous_week', label: '过去 7 天', sessions: [] },
    { id: 'earlier', label: '更早', sessions: [] }
  ]
  for (const session of sortSessions(sessions)) {
    const index = boundaries.findIndex((boundary) => session.lastUserMessageAt >= boundary)
    groups[index < 0 ? 3 : index]!.sessions.push(session)
  }
  return groups.filter((group) => group.sessions.length > 0)
}

export function initialSessionTitle(text: string): string {
  const line = text.split(/\r?\n/).map((value) => value.trim()).find(Boolean)?.replace(/\s+/g, ' ') ?? ''
  const characters = Array.from(line)
  return characters.length ? characters.slice(0, 40).join('') + (characters.length > 40 ? '…' : '') : '新对话'
}

export function formatWorkedFor(durationMs: number): string {
  const seconds = Math.max(0, Math.floor(durationMs / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`
}
