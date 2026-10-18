import type { Migration } from '../migrator'

export const turnDiff = {
  id: '2026101801_turn_diff',
  up(db) {
    db.exec(`CREATE TABLE turn_diffs (
      turn_id TEXT PRIMARY KEY NOT NULL REFERENCES session_turns(id),
      revision INTEGER NOT NULL,
      final INTEGER NOT NULL CHECK(final IN (0, 1)),
      data TEXT NOT NULL
    ) STRICT`)
  }
} satisfies Migration
