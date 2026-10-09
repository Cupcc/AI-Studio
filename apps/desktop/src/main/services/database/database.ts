// Local SQLite database (node:sqlite, built into Electron's Node runtime).
// The file always lives in the app data directory, never in a Project.
import { mkdirSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations, type Migration, type MigrationResult } from './migrator'

export const DATABASE_FILE_NAME = 'studio.sqlite3'

export interface StudioDatabase {
  readonly db: DatabaseSync
  readonly path: string
  readonly migration: MigrationResult
  close(): void
}

export interface OpenDatabaseOptions {
  /** Electron `app.getPath('userData')`. */
  userDataDir: string
  migrations: readonly Migration[]
  fileName?: string
}

export function resolveDatabasePath(userDataDir: string, fileName = DATABASE_FILE_NAME): string {
  if (!isAbsolute(userDataDir)) throw new Error('userDataDir must be absolute')
  if (fileName.includes('/') || fileName.includes('\\') || fileName.startsWith('.')) {
    throw new Error(`Invalid database file name: ${fileName}`)
  }
  const file = resolve(userDataDir, fileName)
  const rel = relative(resolve(userDataDir), file)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Database path escapes userDataDir')
  return file
}

export function openDatabase(options: OpenDatabaseOptions): StudioDatabase {
  const path = resolveDatabasePath(options.userDataDir, options.fileName)
  mkdirSync(options.userDataDir, { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA busy_timeout = 5000')
    const migration = runMigrations(db, options.migrations)
    return {
      db,
      path,
      migration,
      close: () => {
        if (db.isOpen) db.close()
      }
    }
  } catch (error) {
    db.close()
    throw error
  }
}

export function isInsideDirectory(file: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(file))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

