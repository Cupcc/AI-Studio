import type { Migration } from '../migrator'

export const workbenchCore: Migration = {
  id: '2026111101_workbench',
  up(db) {
    db.exec(`CREATE TABLE workbench_instances (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      plugin_id TEXT NOT NULL,
      package_revision TEXT NOT NULL,
      title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
      state TEXT NOT NULL DEFAULT '{}',
      state_revision INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    ) STRICT`)
    db.exec('CREATE INDEX workbench_instances_project ON workbench_instances(project_id)')
    db.exec(`CREATE TABLE workbench_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      source TEXT NOT NULL CHECK(source IN ('template', 'ai')),
      target_instance_id TEXT REFERENCES workbench_instances(id),
      base_package_revision TEXT,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '{}',
      state_revision INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    ) STRICT`)
    db.exec('CREATE INDEX workbench_drafts_project ON workbench_drafts(project_id)')
  }
}
