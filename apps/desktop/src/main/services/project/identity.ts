// Directory validation and identity (specs/project/spec.md §2.1.2–2.1.3).
// The canonical path comes from realpath(3), which on macOS also resolves
// symlinks, `..`, letter case and Unicode normalization to the on-disk form.
// Aliases realpath keeps distinct (e.g. /System/Volumes/Data/... firmlinks)
// are caught by comparing device and inode numbers.
import { constants, opendirSync, realpathSync, statSync, accessSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import type { OpenFailureReason } from '@shared/project/types'

export interface DirectoryIdentity {
  canonicalPath: string
  dev: string
  ino: string
}

export type InspectResult =
  | { ok: true; selectedPath: string; displayName: string; identity: DirectoryIdentity }
  | { ok: false; reason: OpenFailureReason; privacyHint: boolean }

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : ''
}

function failure(error: unknown): InspectResult {
  const code = errorCode(error)
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP' || code === 'ENAMETOOLONG') {
    return { ok: false, reason: 'not_found', privacyHint: false }
  }
  // EPERM is what macOS privacy protection (TCC) returns for Desktop,
  // Documents, removable volumes, etc.; EACCES is plain permissions.
  return { ok: false, reason: 'unreadable', privacyHint: code === 'EPERM' }
}

export function statIdentity(path: string): { dev: string; ino: string; isDirectory: boolean } {
  const st = statSync(path, { bigint: true })
  return { dev: st.dev.toString(), ino: st.ino.toString(), isDirectory: st.isDirectory() }
}

/** Validates a user-selected path and resolves its identity. Never writes. */
export function inspectDirectory(input: string): InspectResult {
  if (!isAbsolute(input)) return { ok: false, reason: 'not_found', privacyHint: false }
  const selectedPath = resolve(input)
  let st: ReturnType<typeof statIdentity>
  try {
    st = statIdentity(selectedPath)
  } catch (error) {
    return failure(error)
  }
  if (!st.isDirectory) return { ok: false, reason: 'not_directory', privacyHint: false }
  let canonicalPath: string
  try {
    canonicalPath = realpathSync.native(selectedPath)
    accessSync(canonicalPath, constants.R_OK | constants.X_OK)
    // access() can pass while privacy protection still denies listing.
    opendirSync(canonicalPath).closeSync()
  } catch (error) {
    return failure(error)
  }
  return {
    ok: true,
    selectedPath,
    displayName: basename(selectedPath) || selectedPath,
    identity: { canonicalPath, dev: st.dev, ino: st.ino }
  }
}

/** True when `path` currently names the directory with this device and inode. */
export function hasIdentity(path: string, dev: string, ino: string): boolean {
  try {
    const st = statIdentity(path)
    return st.isDirectory && st.dev === dev && st.ino === ino
  } catch {
    return false
  }
}
