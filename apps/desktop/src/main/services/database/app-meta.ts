// Accessors for the example `app_meta` table.
import type { DatabaseSync } from 'node:sqlite'

export function setAppMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, new Date().toISOString())
}

export function getAppMeta(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}
