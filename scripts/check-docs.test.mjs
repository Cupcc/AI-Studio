import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { snapshot } from './check-docs.mjs'
import { git } from './check-paths.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

test('Git snapshots preserve Unicode byte boundaries, unusual names, empty and repeated blobs, and staged versions', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'studio doc snapshot '))
  temporary.push(root)
  const run = args => git(args, root)
  run(['init', '-q'])
  run(['config', 'user.email', 'fixture@example.invalid'])
  run(['config', 'user.name', 'Fixture'])
  run(['config', 'core.hooksPath', path.join(root, 'no-hooks')])
  mkdirSync(path.join(root, 'docs'))
  const files = new Map([
    ['README.md', '# 中文 👋\n[link](<docs/line\nbreak.md>)\n'],
    ['docs/line\nbreak.md', '# First\n\0Markdown body\n'],
    ['docs/empty.md', ''],
    ['docs/repeated.md', '# 中文 👋\n[link](<docs/line\nbreak.md>)\n'],
    ['docs/image.png', null]
  ])
  for (const [name, content] of files) writeFileSync(path.join(root, name), content ?? Buffer.from([0, 255, 10]))
  run(['add', '.'])
  run(['commit', '-qm', 'fixture'])
  expect(snapshot('HEAD', root)).toEqual(files)
  writeFileSync(path.join(root, 'README.md'), '# Staged\n')
  run(['add', 'README.md'])
  const tree = run(['write-tree']).trim()
  writeFileSync(path.join(root, 'README.md'), '# Unstaged\n')
  expect(snapshot(tree, root).get('README.md')).toBe('# Staged\n')
  expect(snapshot('', root).get('README.md')).toBe('# Unstaged\n')
  expect(snapshot('HEAD', root).get('README.md')).toBe(files.get('README.md'))
})
