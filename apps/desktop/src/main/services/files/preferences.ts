// Files viewer preferences kept across restarts (TOOLS-Q13): the Markdown mode chosen last and soft wrap.
import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_FILES_PREFERENCES, type FilesPreferences } from '@shared/tools/files'
import { getAppMeta, setAppMeta } from '../database/app-meta'

/** app_meta keys; values are 'true' / 'false'. */
export const FILES_PREFERENCE_KEYS = {
  markdownPreview: 'files.viewer.markdownPreview',
  wordWrap: 'files.viewer.wordWrap'
} as const satisfies Record<keyof FilesPreferences, string>

const NAMES = Object.keys(FILES_PREFERENCE_KEYS) as (keyof FilesPreferences)[]

export function readFilesPreferences(db: DatabaseSync): FilesPreferences {
  const result = { ...DEFAULT_FILES_PREFERENCES }
  for (const name of NAMES) {
    const stored = getAppMeta(db, FILES_PREFERENCE_KEYS[name])
    if (stored === 'true' || stored === 'false') result[name] = stored === 'true'
  }
  return result
}

export function writeFilesPreferences(db: DatabaseSync, patch: Partial<FilesPreferences>): FilesPreferences {
  for (const name of NAMES) {
    const value = patch[name]
    if (value !== undefined) setAppMeta(db, FILES_PREFERENCE_KEYS[name], value ? 'true' : 'false')
  }
  return readFilesPreferences(db)
}
