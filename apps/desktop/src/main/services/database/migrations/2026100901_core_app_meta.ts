// Example table for the skeleton: application-level key/value metadata.
// Not a product data table.
import type { Migration } from '../migrator'

export const coreAppMeta: Migration = {
  id: '2026100901_core_app_meta',
  up: (db) => {
    db.exec(`CREATE TABLE app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT`)
  }
}
