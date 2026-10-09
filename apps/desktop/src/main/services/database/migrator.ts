// Idempotent, forward-only migration runner on top of node:sqlite.
import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  /** Sortable unique id: `<YYYYMMDD><NN>_<feature>_<name>`, e.g. `2026100901_core_app_meta`. */
  id: string
  up: (db: DatabaseSync) => void
}

const MIGRATION_ID = /^\d{10}_[a-z0-9]+(?:[_-][a-z0-9]+)*$/

export interface MigrationResult {
  applied: string[]
  alreadyApplied: number
}

export function validateMigrations(migrations: readonly Migration[]): void {
  const seen = new Set<string>()
  let previous = ''
  for (const m of migrations) {
    if (!MIGRATION_ID.test(m.id)) throw new Error(`Invalid migration id: ${m.id}`)
    if (seen.has(m.id)) throw new Error(`Duplicate migration id: ${m.id}`)
    if (m.id <= previous) throw new Error(`Migrations must be listed in ascending id order: ${m.id}`)
    seen.add(m.id)
    previous = m.id
  }
}

export function runMigrations(db: DatabaseSync, migrations: readonly Migration[]): MigrationResult {
  validateMigrations(migrations)
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`)
  const rows = db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>
  const applied = new Set(rows.map((r) => r.id))
  const known = new Set(migrations.map((m) => m.id))
  const unknown = [...applied].filter((id) => !known.has(id))
  if (unknown.length > 0) {
    // The database was migrated by a newer build; refuse rather than guess.
    throw new Error(`Database has migrations unknown to this build: ${unknown.join(', ')}`)
  }
  const record = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
  const result: MigrationResult = { applied: [], alreadyApplied: applied.size }
  for (const m of migrations) {
    if (applied.has(m.id)) continue
    db.exec('BEGIN IMMEDIATE')
    try {
      m.up(db)
      record.run(m.id, new Date().toISOString())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${m.id} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    result.applied.push(m.id)
  }
  return result
}
