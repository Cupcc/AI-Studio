import { expect, it } from 'vitest'
import { baselineLabel, classifyPatch, describeError, entryLabel, formatBytes, isModeOnly, omissionNotes, splitPath, totals, twoSidedTexts } from './diff-format'
import { entry, snapshot } from './diff-fixtures'

it('formats sizes and splits a path into name and directory', () => {
  expect([formatBytes(12), formatBytes(2048), formatBytes(3 * 1_048_576)]).toEqual(['12 B', '2.0 KiB', '3.0 MiB'])
  expect(splitPath('src/ui/a.ts')).toEqual({ name: 'a.ts', dir: 'src/ui' })
  expect(splitPath('README.md')).toEqual({ name: 'README.md', dir: '' })
})

it('recognises a mode-only change but not an edit that also changes the mode, a binary or a rename', () => {
  expect(isModeOnly(entry('a.sh', { additions: 0, deletions: 0, newMode: '100755' }))).toBe(true)
  expect(isModeOnly(entry('a.sh', { additions: 1, deletions: 0, newMode: '100755' }))).toBe(false)
  expect(isModeOnly(entry('a.sh', { additions: 0, deletions: 0 }))).toBe(false)
  expect(isModeOnly(entry('a.bin', { additions: null, deletions: null, binary: true, newMode: '100755' }))).toBe(false)
  expect(isModeOnly(entry('b.sh', { kind: 'renamed', additions: 0, deletions: 0, newMode: '100755' }))).toBe(false)
})

it('describes the baseline from what the snapshot knows', () => {
  expect(baselineLabel(null)).toBe('相对 HEAD')
  expect(baselineLabel(snapshot())).toBe('相对 HEAD (main @ abc1234)')
  expect(baselineLabel(snapshot({ head: { branch: null, commit: 'abc1234def', detached: true } }))).toBe('相对 HEAD (已分离 @ abc1234)')
  expect(baselineLabel(snapshot({ head: { branch: 'main', commit: null, detached: false } }))).toBe('相对 HEAD (main)')
  expect(baselineLabel(snapshot({ status: 'no_head', head: null }))).toBe('HEAD 不可用（尚无首个提交）')
})

it('totals ignore unknown counts of binaries', () => {
  expect(totals([entry('a', { additions: 3, deletions: 1 }), entry('b', { additions: null, deletions: null, binary: true })])).toEqual({ additions: 3, deletions: 1 })
})

it('uses an editor only for plain text on both sides', () => {
  const text = { status: 'text', text: 'x', size: 1 } as const
  expect(twoSidedTexts(entry('a'), text, text)).toEqual({ original: 'x', modified: 'x' })
  expect(twoSidedTexts(entry('a'), { status: 'absent' }, text)).toEqual({ original: '', modified: 'x' })
  expect(twoSidedTexts(entry('a'), { status: 'absent' }, { status: 'absent' })).toBeNull()
  expect(twoSidedTexts(entry('a'), text, { status: 'omitted', reason: 'too_large', size: 9 })).toBeNull()
  expect(twoSidedTexts(entry('a', { special: 'symlink' }), text, text)).toBeNull()
  expect(twoSidedTexts(entry('a', { binary: true }), text, text)).toBeNull()
})

it('says why a side is not shown once per reason, with a size where known', () => {
  const big = { status: 'omitted', reason: 'too_large', size: 3 * 1_048_576 } as const
  expect(omissionNotes(entry('a'), big, big)).toEqual(['文件过大（3.0 MiB），超过两侧对比的显示上限。'])
  const bin = { status: 'omitted', reason: 'binary' } as const
  expect(omissionNotes(entry('a.png', { binary: true }), bin, bin)).toEqual(['二进制文件，不显示文本对比。'])
  expect(omissionNotes(entry('l', { special: 'symlink' }), { status: 'omitted', reason: 'symlink' }, { status: 'omitted', reason: 'symlink' })).toHaveLength(1)
  const notes = omissionNotes(entry('a'), { status: 'text', text: '', size: 0 }, { status: 'omitted', reason: 'unsupported_encoding' })
  expect(notes).toEqual(['修改后：文件不是 UTF-8 编码，无法按文本对比。'])
})

it('names a row for assistive technology with kind, path, counts and markers', () => {
  expect(entryLabel(entry('src/a.ts', { additions: 3, deletions: 0 }), true)).toBe('修改，src/a.ts，新增 3 行')
  expect(entryLabel(entry('n.ts', { kind: 'added', untracked: true, additions: 1, deletions: 0 }), true)).toContain('未跟踪')
  expect(entryLabel(entry('n.ts', { kind: 'added', untracked: true, additions: 1, deletions: 0 }), false)).not.toContain('未跟踪')
  expect(entryLabel(entry('b.ts', { kind: 'renamed', oldPath: 'a.ts' }), false)).toContain('a.ts → b.ts')
  expect(entryLabel(entry('x.sh', { additions: 0, deletions: 0, newMode: '100755' }), false)).toContain('仅模式变化')
})

it('colours added lines only inside a hunk, so "+++" content is not taken for a file header', () => {
  const lines = ['diff --git a/x b/x', 'index 1..2 100644', '--- a/x', '+++ b/x', '@@ -1,2 +1,2 @@', ' keep', '-gone', '+++counter', '\\ No newline at end of file']
  expect(classifyPatch(lines)).toEqual(['meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'del', 'add', 'meta'])
})

it('strips the Electron wrapper from an IPC failure', () => {
  expect(describeError(new Error("Error invoking remote method 'diff:get-file': Error: nope"))).toBe('nope')
  expect(describeError('plain')).toBe('plain')
})
