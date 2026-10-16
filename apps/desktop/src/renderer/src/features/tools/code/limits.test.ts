import { describe, expect, it } from 'vitest'
import { DIFF_LIMITS } from '@shared/tools/diff'
import { FILES_LIMITS } from '@shared/tools/files'
import {
  CODE_DIFF_MAX_COMPUTATION_MS, CODE_DIFF_SIDE_MAX_CHARS, CODE_VIEWER_MAX_CHARS, diffTooLarge, viewerTextTooLarge
} from './limits'

describe('viewer size limits', () => {
  it('are 1 MiB for the viewer and 512 KiB per diff side, with a 1.5 s diff budget', () => {
    expect(CODE_VIEWER_MAX_CHARS).toBe(1024 * 1024)
    expect(CODE_DIFF_SIDE_MAX_CHARS).toBe(512 * 1024)
    expect(CODE_DIFF_MAX_COMPUTATION_MS).toBe(250)
  })

  it('never reject what the services can return (decoded text is never longer than its bytes)', () => {
    // If a service limit is raised above the viewer limit, content would reach Monaco unchecked: fail here instead.
    expect(FILES_LIMITS.readBytes).toBeLessThanOrEqual(CODE_VIEWER_MAX_CHARS)
    expect(DIFF_LIMITS.sideBytes).toBeLessThanOrEqual(CODE_DIFF_SIDE_MAX_CHARS)
  })

  it('accepts the limit exactly and rejects one unit more', () => {
    expect(viewerTextTooLarge('a'.repeat(CODE_VIEWER_MAX_CHARS))).toBe(false)
    expect(viewerTextTooLarge('a'.repeat(CODE_VIEWER_MAX_CHARS + 1))).toBe(true)
    const full = 'a'.repeat(CODE_DIFF_SIDE_MAX_CHARS)
    expect(diffTooLarge(full, full)).toBe(false)
  })

  it('rejects a diff when either side is too large', () => {
    const over = 'a'.repeat(CODE_DIFF_SIDE_MAX_CHARS + 1)
    expect(diffTooLarge(over, '')).toBe(true)
    expect(diffTooLarge('', over)).toBe(true)
    expect(diffTooLarge('', '')).toBe(false)
  })
})
