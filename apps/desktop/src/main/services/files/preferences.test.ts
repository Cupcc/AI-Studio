import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { setAppMeta } from '../database/app-meta'
import { runMigrations } from '../database/migrator'
import { migrations } from '../database/migrations'
import { FILES_PREFERENCE_KEYS, readFilesPreferences, writeFilesPreferences } from './preferences'

function database() {
  const db = new DatabaseSync(':memory:')
  runMigrations(db, migrations)
  return db
}

describe('Files viewer preferences (TOOLS-Q13)', () => {
  it('defaults to the editor without soft wrap, and keeps each choice across reads (restarts)', () => {
    const db = database()
    expect(readFilesPreferences(db)).toEqual({ markdownPreview: false, wordWrap: false })
    expect(writeFilesPreferences(db, { markdownPreview: true })).toEqual({ markdownPreview: true, wordWrap: false })
    expect(writeFilesPreferences(db, { wordWrap: true })).toEqual({ markdownPreview: true, wordWrap: true })
    expect(readFilesPreferences(db)).toEqual({ markdownPreview: true, wordWrap: true })
  })

  it('ignores a damaged stored value', () => {
    const db = database()
    setAppMeta(db, FILES_PREFERENCE_KEYS.markdownPreview, 'maybe')
    expect(readFilesPreferences(db).markdownPreview).toBe(false)
  })
})
