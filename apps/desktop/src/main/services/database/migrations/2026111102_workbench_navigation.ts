import type { Migration } from '../migrator'

export const workbenchNavigation: Migration = {
  id: '2026111102_workbench_navigation',
  up(db) {
    db.exec(`CREATE TABLE workbench_navigation (
      project_id TEXT NOT NULL REFERENCES projects(id),
      view_id TEXT NOT NULL,
      title TEXT,
      hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
      position INTEGER NOT NULL,
      PRIMARY KEY(project_id, view_id)
    ) STRICT`)
  }
}
