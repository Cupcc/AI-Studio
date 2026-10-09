// Project records with their UI state, and window-level shell state
// (specs/project/spec.md §3; PROJ-Q1, PROJ-Q3 confirmed 2026-10-09).
import type { Migration } from '../migrator'

export const projectCore: Migration = {
  id: '2026100902_project_core',
  up: (db) => {
    db.exec(`CREATE TABLE projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      local_path TEXT NOT NULL,
      canonical_path TEXT NOT NULL UNIQUE,
      -- Device and inode of the directory (decimal strings), used when two
      -- path strings name the same directory (spec §2.1.3).
      dev TEXT NOT NULL,
      ino TEXT NOT NULL,
      -- Owned by the chat module (specs/chat/spec.md); NULL until set.
      default_cli TEXT,
      ui_state TEXT NOT NULL DEFAULT '{}',
      last_opened_at TEXT,
      hidden_from_recent INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_recent IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT`)
    db.exec('CREATE INDEX projects_dev_ino ON projects (dev, ino)')
    db.exec('CREATE INDEX projects_last_opened ON projects (last_opened_at)')
    db.exec(`CREATE TABLE shell_window_state (
      id TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT`)
  }
}
