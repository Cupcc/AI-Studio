import type { Migration } from '../migrator'

export const sessionCore: Migration = {
  id: '2026100903_session_core',
  up(db) {
    db.exec(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      cli TEXT NOT NULL CHECK (cli IN ('codex', 'claude-code')),
      native_session_id TEXT,
      last_user_message_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      data TEXT NOT NULL,
      UNIQUE(cli, native_session_id)
    ) STRICT;
    CREATE INDEX sessions_project_history ON sessions(project_id, last_user_message_at DESC, created_at DESC);
    CREATE TABLE session_turns (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      outcome TEXT,
      adapter_turn_id TEXT,
      model TEXT,
      message TEXT NOT NULL
    ) STRICT;
    CREATE INDEX session_turns_history ON session_turns(session_id, started_at DESC);
    CREATE TABLE transcript_items (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      sequence INTEGER NOT NULL,
      data TEXT NOT NULL,
      UNIQUE(session_id, sequence)
    ) STRICT;
    CREATE TABLE session_drafts (
      key TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      data TEXT NOT NULL
    ) STRICT;
    CREATE TABLE session_preferences (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) STRICT;`)
  }
}
