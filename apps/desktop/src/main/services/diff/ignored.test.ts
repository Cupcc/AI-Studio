import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixture, createHarness, type Fixture } from './test-support'

const fixtures: Fixture[] = []
const scratch: string[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.cleanup()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('ignored entries for the Files tree (DEC-25)', () => {
  it('lists ignored files and collapses ignored directories, relative to the Project', async () => {
    const fixture = createFixture({ commit: { '.gitignore': 'node_modules/\n*.log\nbuild\n', 'src/a.ts': 'a\n' } })
    fixtures.push(fixture)
    fixture.write('node_modules/pkg/index.js', 'x')
    fixture.write('node_modules/other/index.js', 'x')
    fixture.write('src/debug.log', 'x')
    fixture.write('build/out.js', 'x')
    fixture.write('src/new.ts', 'tracked later')
    const { service } = createHarness({ p: fixture.root, sub: join(fixture.root, 'src') })
    const result = await service.getIgnored('p')
    expect(result).toMatchObject({ status: 'ok', truncated: false })
    expect(result.status === 'ok' && [...result.paths].sort()).toEqual(['build', 'node_modules', 'src/debug.log'])
    // A Project inside the repository gets paths relative to itself.
    const inside = await service.getIgnored('sub')
    expect(inside.status === 'ok' && inside.paths).toEqual(['debug.log'])
  })

  it('answers not_git outside a repository instead of failing', async () => {
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'ignored plain ')))
    scratch.push(dir)
    const { service } = createHarness({ p: dir })
    expect(await service.getIgnored('p')).toMatchObject({ status: 'unavailable', availability: 'not_git' })
  })
})
