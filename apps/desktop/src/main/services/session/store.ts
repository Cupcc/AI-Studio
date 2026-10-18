import type { DatabaseSync } from 'node:sqlite'
import type { ComposerDraft, DraftKey, SessionMessage, SessionSummary, TranscriptItem } from '@shared/session/types'
import type { TurnDiffRecord } from '@shared/tools/turn-diff'

export interface StoredTurn {
  id: string
  session_id: string
  started_at: number
  ended_at: number | null
  outcome: string | null
  adapter_turn_id: string | null
  model: string | null
  message: string
}

export class SessionStore {
  constructor(readonly db: DatabaseSync) {}

  transaction<T>(run: () => T): T {
    this.db.exec('SAVEPOINT session_write')
    try {
      const result = run()
      this.db.exec('RELEASE session_write')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK TO session_write; RELEASE session_write')
      throw error
    }
  }

  summaries(): SessionSummary[] {
    return (this.db.prepare('SELECT data FROM sessions').all() as { data: string }[]).map(row => JSON.parse(row.data))
  }

  saveSummary(session: SessionSummary): void {
    this.db.prepare(`INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET native_session_id=excluded.native_session_id,
      last_user_message_at=excluded.last_user_message_at, data=excluded.data`).run(
      session.id, session.projectId, session.cli, session.nativeSessionId,
      session.lastUserMessageAt, session.createdAt, JSON.stringify({ ...session, stopping: false }))
  }

  nextSequence(id: string): number {
    return Number((this.db.prepare('SELECT COALESCE(MAX(sequence), 0)+1 AS n FROM transcript_items WHERE session_id=?').get(id) as { n: number }).n)
  }

  saveItem(item: TranscriptItem): void {
    this.db.prepare(`INSERT INTO transcript_items VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(item.id, item.sessionId, item.sequence, JSON.stringify(item))
  }

  items(id: string, before: number, limit: number): TranscriptItem[] {
    return (this.db.prepare('SELECT data FROM transcript_items WHERE session_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?')
      .all(id, before, limit) as { data: string }[]).map(row => JSON.parse(row.data)).reverse()
  }

  unresolved(id: string): TranscriptItem[] {
    return (this.db.prepare("SELECT data FROM transcript_items WHERE session_id=? AND json_extract(data, '$.kind')='input_request' AND json_extract(data, '$.resolution') IS NULL")
      .all(id) as { data: string }[]).map(row => JSON.parse(row.data))
  }

  incompleteItems(id: string, turnId: string): TranscriptItem[] {
    return (this.db.prepare(`SELECT data FROM transcript_items WHERE session_id=? AND json_extract(data, '$.turnId')=? AND (
      (json_extract(data, '$.kind')='agent_message' AND json_extract(data, '$.complete')=0) OR
      (json_extract(data, '$.kind')='tool_activity' AND json_extract(data, '$.item.status')='in_progress'))`)
      .all(id, turnId) as { data: string }[]).map(row => JSON.parse(row.data))
  }

  /** Repair stale streaming rows left by older crash recovery, without rewriting completed turns. */
  finalizeInterruptedHistory(): void {
    this.db.prepare(`UPDATE transcript_items SET data=CASE json_extract(data, '$.kind')
      WHEN 'agent_message' THEN json_set(data, '$.complete', json('true'))
      ELSE json_set(data, '$.item.status', (
        SELECT outcome FROM session_turns WHERE id=json_extract(transcript_items.data, '$.turnId')
        AND session_id=transcript_items.session_id)) END
      WHERE ((json_extract(data, '$.kind')='agent_message' AND json_extract(data, '$.complete')=0)
        OR (json_extract(data, '$.kind')='tool_activity' AND json_extract(data, '$.item.status')='in_progress'))
      AND EXISTS (SELECT 1 FROM session_turns WHERE id=json_extract(transcript_items.data, '$.turnId')
        AND session_id=transcript_items.session_id AND ended_at IS NOT NULL AND outcome IN ('failed', 'interrupted'))`).run()
  }

  startTurn(id: string, sessionId: string, at: number, model: string | null, message: SessionMessage): void {
    this.db.prepare('INSERT INTO session_turns(id, session_id, started_at, model, message) VALUES (?, ?, ?, ?, ?)')
      .run(id, sessionId, at, model, JSON.stringify(message))
  }

  bindTurn(id: string, adapterId: string): void {
    this.db.prepare('UPDATE session_turns SET adapter_turn_id=? WHERE id=?').run(adapterId, id)
  }

  endTurn(id: string, outcome: string, at: number): void {
    this.db.prepare('UPDATE session_turns SET outcome=?, ended_at=? WHERE id=?').run(outcome, at, id)
  }

  turn(sessionId: string, turnId: string): StoredTurn | undefined {
    return this.db.prepare('SELECT * FROM session_turns WHERE id=? AND session_id=?').get(turnId, sessionId) as unknown as StoredTurn | undefined
  }

  turnDiff(turnId: string): TurnDiffRecord | null {
    const row = this.db.prepare('SELECT data FROM turn_diffs WHERE turn_id=?').get(turnId) as { data: string } | undefined
    return row ? JSON.parse(row.data) : null
  }

  saveTurnDiff(record: TurnDiffRecord): void {
    this.db.prepare(`INSERT INTO turn_diffs VALUES (?, ?, ?, ?)
      ON CONFLICT(turn_id) DO UPDATE SET revision=excluded.revision, final=excluded.final, data=excluded.data
      WHERE turn_diffs.final=0 AND excluded.revision>turn_diffs.revision`)
      .run(record.turnId, record.revision, record.final ? 1 : 0, JSON.stringify(record))
  }

  lastTurn(sessionId: string, failed = false): StoredTurn | undefined {
    return this.db.prepare(`SELECT * FROM session_turns WHERE session_id=? ${failed ? "AND outcome='failed'" : ''} ORDER BY started_at DESC, rowid DESC LIMIT 1`)
      .get(sessionId) as unknown as StoredTurn | undefined
  }

  private draftKey(key: DraftKey): string {
    return key.kind === 'new_chat' ? (key.viewId ? `project:${key.projectId}:view:${key.viewId}` : `project:${key.projectId}`) : `session:${key.sessionId}`
  }

  getDraft(key: DraftKey): ComposerDraft | null {
    const row = this.db.prepare('SELECT data FROM session_drafts WHERE key=?').get(this.draftKey(key)) as { data: string } | undefined
    return row ? JSON.parse(row.data) : null
  }

  saveDraft(key: DraftKey, draft: ComposerDraft): void {
    this.db.prepare('INSERT INTO session_drafts VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data')
      .run(this.draftKey(key), key.projectId, JSON.stringify(draft))
  }

  deleteDraft(key: DraftKey): void {
    this.db.prepare('DELETE FROM session_drafts WHERE key=?').run(this.draftKey(key))
  }

  getPreference(key: string): string | null {
    return (this.db.prepare('SELECT value FROM session_preferences WHERE key=?').get(key) as { value: string } | undefined)?.value ?? null
  }

  setPreference(key: string, value: string): void {
    this.db.prepare('INSERT INTO session_preferences VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
  }
}
