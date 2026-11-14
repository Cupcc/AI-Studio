// Pure parsing of a GitHub "latest release" response and version ordering. No Electron, so it is unit-tested directly.
import type { ReleaseInfo } from '@shared/ipc/updates'

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  /** Lower-case hex SHA-256; null when GitHub reports no digest and the notes carry none. */
  sha256: string | null
}

export interface Release extends ReleaseInfo {
  /** The zipped app bundle for this machine, or null when the release has none. */
  asset: ReleaseAsset | null
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const SHA256 = /^[0-9a-f]{64}$/

export function parseVersion(value: string): { core: [number, number, number]; pre: string | null } | null {
  const match = VERSION.exec(value.trim())
  return match ? { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null } : null
}

/** Semver order without build metadata; a pre-release sorts below its release. Unparsable versions compare equal. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! - y.core[i]!
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre < y.pre ? -1 : 1
}

/** Release zips are named `AI-Developer-Studio-<version>-mac-<arch>.zip` (scripts/README.md, GitHub Release). */
export const assetName = (version: string, arch: string) => `AI-Developer-Studio-${version}-mac-${arch}.zip`

/** Older releases put the checksum only in the notes: "SHA-256: `<hex>`". */
function checksumFromNotes(notes: string): string | null {
  const found = /SHA-?256[^0-9a-f]{0,8}([0-9a-f]{64})/i.exec(notes)
  return found?.[1] ? found[1].toLowerCase() : null
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** Returns null for drafts, pre-releases and responses that are not a usable release. */
export function parseRelease(raw: unknown, arch: string): Release | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.draft === true || r.prerelease === true) return null
  const parsed = parseVersion(text(r.tag_name))
  if (!parsed || parsed.pre) return null
  const version = parsed.core.join('.')
  const notes = text(r.body)
  const wanted = assetName(version, arch)
  const entry = (Array.isArray(r.assets) ? r.assets : []).find(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object' && (item as Record<string, unknown>).name === wanted
  )
  let asset: ReleaseAsset | null = null
  const url = text(entry?.browser_download_url)
  if (entry && url.startsWith('https://')) {
    const digest = text(entry.digest).toLowerCase()
    const fromDigest = digest.startsWith('sha256:') ? digest.slice(7) : ''
    const sha256 = SHA256.test(fromDigest) ? fromDigest : checksumFromNotes(notes)
    asset = { name: wanted, url, size: typeof entry.size === 'number' ? entry.size : 0, sha256 }
  }
  return {
    version,
    name: text(r.name) || `v${version}`,
    notes,
    publishedAt: text(r.published_at) || null,
    url: text(r.html_url) || '',
    asset
  }
}
