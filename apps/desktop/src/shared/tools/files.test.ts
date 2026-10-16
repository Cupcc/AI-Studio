import { describe, expect, it } from 'vitest'
import {
  FILES_LIMITS, isReferenceablePath, joinProjectPath, parseProjectPath, projectPathName, projectPathParent
} from './files'

describe('parseProjectPath', () => {
  it.each(['', 'a', 'src/a.ts', 'docs/my file.md', '-leading-dash', 'a\\b', '日本語/文件.md', 'emoji-😀/x', 'tab\tname', '.hidden/.env', 'a..b/c', '...'])(
    'accepts %j', (path) => { expect(parseProjectPath(path)).toBe(path) })

  it.each([
    ['not a string', 7], ['null', null], ['absolute', '/etc/passwd'], ['trailing slash', 'src/'],
    ['double slash', 'src//a'], ['dot segment', 'src/./a'], ['parent segment', '../a'], ['inner parent', 'src/../../a'],
    ['only dot', '.'], ['NUL', 'a\0b'], ['lone high surrogate', 'a\uD800b'], ['lone low surrogate', 'a\uDC00b']
  ])('rejects %s', (_name, path) => { expect(() => parseProjectPath(path)).toThrow(/^invalid path/) })

  it('limits the whole path and every segment in UTF-8 bytes, not characters', () => {
    expect(() => parseProjectPath('a'.repeat(FILES_LIMITS.nameBytes))).not.toThrow()
    expect(() => parseProjectPath('a'.repeat(FILES_LIMITS.nameBytes + 1))).toThrow(/name too long/)
    // Counted in UTF-8 bytes, not characters: 255 characters of three bytes (765) are a legal APFS name, 341 are not.
    expect(() => parseProjectPath('文'.repeat(255))).not.toThrow()
    expect(() => parseProjectPath('文'.repeat(341))).toThrow(/name too long/)
    const long = Array.from({ length: 5 }, () => 'a'.repeat(250)).join('/')
    expect(long.length).toBeGreaterThan(FILES_LIMITS.pathBytes)
    expect(() => parseProjectPath(long)).toThrow(/too long/)
  })

  it('does not normalise: composed and decomposed forms are different paths for the services to compare', () => {
    const composed = 'café', decomposed = 'café'
    expect(parseProjectPath(composed)).toBe(composed)
    expect(parseProjectPath(decomposed)).toBe(decomposed)
    expect(composed).not.toBe(decomposed)
  })
})

describe('path helpers', () => {
  it('joins, splits and names', () => {
    expect(joinProjectPath('', 'a')).toBe('a')
    expect(joinProjectPath('src', 'a.ts')).toBe('src/a.ts')
    expect(projectPathParent('src/lib/a.ts')).toBe('src/lib')
    expect(projectPathParent('a.ts')).toBe('')
    expect(projectPathName('src/lib/a.ts')).toBe('a.ts')
    expect(projectPathName('a.ts')).toBe('a.ts')
  })
  it('refuses a name that would change the path structure', () => {
    for (const name of ['', 'a/b', '..', '.']) expect(() => joinProjectPath('src', name)).toThrow()
  })
})

describe('isReferenceablePath', () => {
  it('accepts ordinary names including spaces, dashes, brackets and unicode', () => {
    for (const path of ['a.ts', 'docs/my file.md', '-x', 'a[1]*.txt', '日本語.md', 'a\\b']) expect(isReferenceablePath(path)).toBe(true)
  })
  it('rejects the root, invalid paths and control characters (viewable, but not referenceable)', () => {
    for (const path of ['', '../a', '/a', 'a\nb', 'a\tb', 'a\u007Fb', 'a\u001Bb', 'a\u0085b', 'a\u2028b', 'a\u2029b']) expect(isReferenceablePath(path)).toBe(false)
    expect(parseProjectPath('a\nb')).toBe('a\nb')
  })
})
