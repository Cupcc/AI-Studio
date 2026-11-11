import type { Migration } from '../migrator'
export const workbenchAgents: Migration = {
  id: '2026111103_workbench_agents',
  up(db) {
    db.exec(`CREATE TABLE workbench_agent_runs (
      project_id TEXT NOT NULL,
      view_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      request_json TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      PRIMARY KEY (project_id, view_id, request_id)
    )`)
  }
}
