import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAppMeta, setAppMeta } from './app-meta'
import { DATABASE_FILE_NAME, isInsideDirectory, openDatabase, resolveDatabasePath } from './database'
import { migrations } from './migrations'
import { runMigrations, validateMigrations, type Migration } from './migrator'

let dir: string

beforeEach(() => {
  // Space in the path on purpose: the repo and userData both contain spaces.
  dir = mkdtempSync(join(tmpdir(), 'studio db '))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('creates the database inside userData and applies migrations once', () => {
    const userData = join(dir, 'AI Developer Studio')
    const first = openDatabase({ userDataDir: userData, migrations })
    expect(first.path).toBe(join(userData, DATABASE_FILE_NAME))
    expect(isInsideDirectory(first.path, userData)).toBe(true)
    expect(first.migration.applied).toEqual(migrations.map((m) => m.id))
    setAppMeta(first.db, 'k', 'v1')
    setAppMeta(first.db, 'k', 'v2')
    first.close()

    const second = openDatabase({ userDataDir: userData, migrations })
    expect(second.migration.applied).toEqual([])
    expect(second.migration.alreadyApplied).toBe(migrations.length)
    expect(getAppMeta(second.db, 'k')).toBe('v2')
    expect(getAppMeta(second.db, 'missing')).toBeUndefined()
    expect((second.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe('wal')
    second.close()
  })

  it('refuses database paths outside userData', () => {
    expect(() => resolveDatabasePath('relative/dir')).toThrow(/absolute/)
    expect(() => resolveDatabasePath(dir, '../escape.sqlite3')).toThrow(/Invalid database file name/)
    expect(() => resolveDatabasePath(dir, '.hidden')).toThrow(/Invalid database file name/)
  })
})

describe('runMigrations', () => {
  const m1: Migration = { id: '2026100901_test_one', up: (db) => db.exec('CREATE TABLE one (id INTEGER PRIMARY KEY)') }
  const m2: Migration = { id: '2026100902_test_two', up: (db) => db.exec('CREATE TABLE two (id INTEGER PRIMARY KEY)') }

  it('only applies new migrations on later runs', () => {
    const { db, close } = openDatabase({ userDataDir: dir, migrations: [m1] })
    expect(runMigrations(db, [m1, m2]).applied).toEqual(['2026100902_test_two'])
    expect(runMigrations(db, [m1, m2]).applied).toEqual([])
    close()
  })

  it('rolls back a failing migration and records nothing', () => {
    const bad: Migration = {
      id: '2026100903_test_bad',
      up: (db) => {
        db.exec('CREATE TABLE half (id INTEGER)')
        throw new Error('boom')
      }
    }
    const { db, close } = openDatabase({ userDataDir: dir, migrations: [m1] })
    expect(() => runMigrations(db, [m1, bad])).toThrow(/Migration 2026100903_test_bad failed: boom/)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'half'").all()
    expect(tables).toEqual([])
    const ids = (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>).map((r) => r.id)
    expect(ids).toEqual(['2026100901_test_one'])
    close()
  })

  it('refuses a database migrated by a newer build', () => {
    openDatabase({ userDataDir: dir, migrations: [m1, m2] }).close()
    expect(() => openDatabase({ userDataDir: dir, migrations: [m1] })).toThrow(/unknown to this build/)
  })

  it('validates migration ids and order', () => {
    expect(() => validateMigrations([{ id: 'bad', up: () => {} }])).toThrow(/Invalid migration id/)
    expect(() => validateMigrations([m2, m1])).toThrow(/ascending/)
    expect(() => validateMigrations([m1, m1])).toThrow(/Duplicate/)
    expect(() => validateMigrations(migrations)).not.toThrow()
  })
})
