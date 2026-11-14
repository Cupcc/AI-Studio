import { describe, expect, it } from 'vitest'
import { assetName, compareVersions, parseRelease } from './release'

const SHA = 'b575cb9a99ae81e7e426139266873fe999a8ea825e45ea063d7a11191070dc84'
const github = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v1.2.0', name: 'AI Developer Studio 1.2.0', body: '## 1.2.0\n\n- 更新', draft: false, prerelease: false,
  published_at: '2026-11-20T00:00:00Z', html_url: 'https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v1.2.0',
  assets: [{ name: assetName('1.2.0', 'arm64'), size: 100, digest: `sha256:${SHA}`, browser_download_url: 'https://github.com/x/y.zip' }],
  ...overrides
})

describe('compareVersions', () => {
  it('orders by major, minor, patch and puts pre-releases below the release', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('v1.1.0', '1.1.0')).toBe(0)
    expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0)
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBeLessThan(0)
    expect(compareVersions('garbage', '1.0.0')).toBe(0)
  })
})

describe('parseRelease', () => {
  it('reads the version, notes and this machine’s asset with GitHub’s digest', () => {
    expect(parseRelease(github(), 'arm64')).toMatchObject({
      version: '1.2.0', name: 'AI Developer Studio 1.2.0', notes: '## 1.2.0\n\n- 更新',
      asset: { name: 'AI-Developer-Studio-1.2.0-mac-arm64.zip', size: 100, sha256: SHA, url: 'https://github.com/x/y.zip' }
    })
  })

  it('falls back to the checksum written in the notes', () => {
    const release = parseRelease(github({ body: `SHA-256: \`${SHA.toUpperCase()}\``, assets: [{ ...github().assets[0], digest: null }] }), 'arm64')
    expect(release?.asset?.sha256).toBe(SHA)
  })

  it('has no asset for another architecture and no checksum when none is published', () => {
    expect(parseRelease(github(), 'x64')?.asset).toBeNull()
    expect(parseRelease(github({ body: '', assets: [{ ...github().assets[0], digest: undefined }] }), 'arm64')?.asset?.sha256).toBeNull()
  })

  it('ignores drafts, pre-releases, unparsable tags and non-HTTPS downloads', () => {
    expect(parseRelease(github({ draft: true }), 'arm64')).toBeNull()
    expect(parseRelease(github({ prerelease: true }), 'arm64')).toBeNull()
    expect(parseRelease(github({ tag_name: 'latest' }), 'arm64')).toBeNull()
    expect(parseRelease(null, 'arm64')).toBeNull()
    expect(parseRelease(github({ assets: [{ ...github().assets[0], browser_download_url: 'http://x/y.zip' }] }), 'arm64')?.asset).toBeNull()
  })
})
