import type { Migration } from '../migrator'

/** The old apply flow kept every added or applied draft, pointing at its instance with the applied revision as base.
 *  Flag every draft that targets an instance once; the workbench service closes those whose files still equal their base. */
export const workbenchLegacyDrafts: Migration = {
  id: '2026111201_workbench_legacy_drafts',
  up(db) {
    db.exec('ALTER TABLE workbench_drafts ADD COLUMN legacy_applied INTEGER NOT NULL DEFAULT 0 CHECK(legacy_applied IN (0, 1))')
    db.exec('UPDATE workbench_drafts SET legacy_applied = 1 WHERE target_instance_id IS NOT NULL AND base_package_revision IS NOT NULL')
  }
}
