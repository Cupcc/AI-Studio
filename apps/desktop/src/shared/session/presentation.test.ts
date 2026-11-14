import { describe, expect, it } from 'vitest'
import { countDiffLines, formatDuration, groupSessions, initialSessionTitle, projectSessionState, sessionStatus, sortSessions } from './presentation'
import type { SessionSummary } from './types'

const summary = (id: string, patch: Partial<SessionSummary> = {}): SessionSummary => ({
  id, projectId: 'p', cli: 'codex', nativeSessionId: null, title: id, titleSource: 'client', model: null,
  originViewId: null, activity: 'none', stopping: false, errorUnseen: false, completionUnread: false,
  status: null, createdAt: 1, updatedAt: 1, lastUserMessageAt: 1, ...patch
})

describe('FR-STATE / AC-03–05 presentation', () => {
  it('counts running work without showing it as Project attention; ignores other Projects', () => {
    const sessions = [summary('run', { activity: 'running' }), summary('other', { projectId: 'q', activity: 'needs_input' })]
    expect(projectSessionState('p', sessions)).toEqual({ projectId: 'p', attention: null, counts: { running: 1, needsInput: 0 } })
  })
  it('chooses one attention signal in the required order', () => {
    const unread = summary('unread', { completionUnread: true })
    const error = summary('error', { errorUnseen: true })
    const needs = summary('needs', { activity: 'needs_input' })
    expect(projectSessionState('p', [unread]).attention).toBe('completed_unread')
    expect(projectSessionState('p', [unread, error]).attention).toBe('error')
    expect(projectSessionState('p', [error, needs]).attention).toBe('needs_input')
    expect(sessionStatus(summary('idle'))).toBeNull()
  })
})

describe('FR-NAV-003 history', () => {
  it('does not reorder when Agent output, attention or Rename changes', () => {
    const older = summary('old', { lastUserMessageAt: 100, updatedAt: 900, title: 'renamed', completionUnread: true })
    const newer = summary('new', { lastUserMessageAt: 200, updatedAt: 200 })
    expect(sortSessions([older, newer]).map((s) => s.id)).toEqual(['new', 'old'])
  })
  it('uses non-overlapping calendar boundaries and includes future timestamps in today', () => {
    const now = new Date(2026, 9, 9, 12)
    const at = (day: number, hour = 0) => new Date(2026, 9, day, hour).getTime()
    const groups = groupSessions([
      summary('older', { lastUserMessageAt: at(1, 23) }), summary('week', { lastUserMessageAt: at(2) }),
      summary('yesterday', { lastUserMessageAt: at(8) }), summary('today', { lastUserMessageAt: at(9) }),
      summary('future', { lastUserMessageAt: at(10) })
    ], now)
    expect(groups.map((g) => [g.id, g.sessions.map((s) => s.id)])).toEqual([
      ['today', ['future', 'today']], ['yesterday', ['yesterday']], ['previous_week', ['week']], ['earlier', ['older']]
    ])
  })
  it('omits empty groups and preserves source data', () => {
    const sessions = [summary('b'), summary('a')]
    expect(groupSessions([], new Date())).toEqual([])
    expect(sortSessions(sessions).map((s) => s.id)).toEqual(['a', 'b'])
    expect(sessions.map((s) => s.id)).toEqual(['b', 'a'])
  })
  it('generates a title without breaking supplementary Unicode characters', () => {
    expect(initialSessionTitle('\n  Build   the app\nsecond line')).toBe('Build the app')
    expect(initialSessionTitle('🙂'.repeat(41))).toBe('🙂'.repeat(40) + '…')
    expect(initialSessionTitle(' \n ')).toBe('新对话')
  })
})

describe('Transcript durations and diff totals · Shell Spec v02 §6', () => {
  it('formats a duration in Chinese units and does not show a sub-second turn as zero', () => {
    expect([400, 8000, 138_000, 3_900_000].map(formatDuration)).toEqual(['不到 1 秒', '8 秒', '2 分 18 秒', '1 小时 05 分'])
  })

  it('counts changed lines of a patch without its file headers', () => {
    expect(countDiffLines('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,3 @@\n context\n-old\n+new\n+more\n')).toEqual({ additions: 2, deletions: 1 })
    expect(countDiffLines('')).toEqual({ additions: 0, deletions: 0 })
  })
})
