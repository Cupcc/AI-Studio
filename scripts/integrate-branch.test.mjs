import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { git } from './check-paths.mjs'
import { integrateBranch as integrateDelivery } from './integrate-branch.mjs'

const tryLine = '体验：打开示例页，看到新功能'
// The fixture title is a feat, so an integration that passes no body still says how to try it.
const integrateBranch = options => integrateDelivery({ body: tryLine, ...options })

// Lets a test move dev between the checks and the compare-and-swap, as a concurrent integration would.
const hooks = vi.hoisted(() => ({ beforeDevUpdate: null }))
vi.mock('./check-paths.mjs', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, git: (args, cwd) => {
    if (args[0] === 'update-ref' && args.includes('refs/heads/dev') && args.length > 3) hooks.beforeDevUpdate?.()
    return actual.git(args, cwd)
  } }
})

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  hooks.beforeDevUpdate = null
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})
function fixture() {
  // Git reports worktree paths with symlinks resolved, such as macOS /var -> /private/var.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'studio-integration-')))
  temporary.push(dir)
  const main = path.join(dir, 'main'), source = path.join(dir, '功能 worktree')
  mkdirSync(main)
  git(['init', '-q', '-b', 'dev'], main)
  git(['config', 'user.email', 'fixture@example.invalid'], main)
  git(['config', 'user.name', 'Fixture'], main)
  git(['config', 'core.hooksPath', path.join(dir, 'no-hooks')], main)
  const commit = cwd => { git(['add', '.'], cwd); git(['commit', '-qm', 'fixture'], cwd); return git(['rev-parse', 'HEAD'], cwd).trim() }
  writeFileSync(path.join(main, 'base.txt'), 'stable')
  writeFileSync(path.join(main, '.gitignore'), 'ignored/\n')
  const base = commit(main)
  // The main checkout is the acceptance checkout, parked on a dev commit instead of the dev branch.
  git(['switch', '-q', '--detach'], main)
  git(['worktree', 'add', '-q', '-b', 'feat/example', source, 'dev'], main)
  return { main, source, base, commit }
}
function feature(f) {
  writeFileSync(path.join(f.source, 'feature.txt'), 'committed feature')
  return f.commit(f.source)
}
const dev = f => git(['rev-parse', 'dev'], f.main).trim()
function unchanged(f) {
  expect(dev(f)).toBe(f.base)
  expect(git(['rev-parse', 'HEAD'], f.main).trim()).toBe(f.base)
  expect(existsSync(path.join(f.main, 'feature.txt'))).toBe(false)
}

const title = 'feat(example): add the example feature'
const runUrl = 'https://github.com/owner/repo/actions/runs/7'
// Runs as vm-ci.mjs records them: by default one passing affected run at the current branch tip.
const passing = (f, overrides = {}) => () => [{ id: '7', url: runUrl, branch: 'feat/example',
  headSha: git(['rev-parse', 'feat/example'], f.main).trim(), scope: 'affected', conclusion: 'success', ...overrides }]
const integrate = (f, branch = 'feat/example', cwd = f.main) => integrateBranch({ branch, title, cwd, runs: passing(f) })
// Another integration lands on dev through its own worktree.
function advanceDev(f) {
  const other = path.join(path.dirname(f.main), 'other')
  git(['worktree', 'add', '-q', '--detach', other, 'dev'], f.main)
  writeFileSync(path.join(other, 'dev.txt'), 'new dev work')
  git(['update-ref', 'refs/heads/dev', f.commit(other)], f.main)
}

test('squashes the task branch into one dev commit without touching the acceptance checkout', () => {
  const f = fixture(), first = feature(f)
  writeFileSync(path.join(f.source, 'second.txt'), 'second commit')
  const head = f.commit(f.source)
  const result = integrateBranch({ branch: 'feat/example', title, body: `Verified by the fixture.\n\n${tryLine}\n体验：点击保存`, cwd: f.main, runs: passing(f) })
  expect(result).toMatchObject({ branch: 'feat/example', sourceCommit: head, worktree: f.source })
  expect(result.cleanupError).toBeUndefined()
  expect(dev(f)).toBe(result.commit)
  expect(git(['rev-list', '--parents', '-n1', 'dev'], f.main).trim().split(' ')).toEqual([result.commit, f.base])
  expect(git(['rev-parse', 'dev^{tree}'], f.main)).toBe(git(['rev-parse', `${head}^{tree}`], f.main))
  const message = git(['log', '-1', '--format=%B', 'dev'], f.main)
  expect(message.startsWith(`${title}\n\nVerified by the fixture.\n\n${tryLine}\n体验：点击保存\n\nSquashed commits:\n- ${first.slice(0, 7)}`)).toBe(true)
  expect(message).toContain(`Source-Branch: feat/example\nSource-Commit: ${head}\nCI-Run: ${runUrl}`)
  expect(git(['reflog', '-1', '--format=%gs', 'dev'], f.main).trim()).toBe('integrate feat/example')
  expect(git(['rev-parse', 'HEAD'], f.main).trim()).toBe(f.base)
  expect(existsSync(path.join(f.main, 'second.txt'))).toBe(false)
  expect(git(['status', '--porcelain'], f.main)).toBe('')
})

test('integrates while the acceptance checkout has local changes and leaves them alone', () => {
  const f = fixture(); feature(f)
  writeFileSync(path.join(f.main, 'base.txt'), 'local edit')
  writeFileSync(path.join(f.main, 'local.txt'), 'untracked')
  expect(integrate(f).commit).toBe(dev(f))
  expect(readFileSync(path.join(f.main, 'base.txt'), 'utf8')).toBe('local edit')
  expect(readFileSync(path.join(f.main, 'local.txt'), 'utf8')).toBe('untracked')
  expect(git(['rev-parse', 'HEAD'], f.main).trim()).toBe(f.base)
})

test('removes the integrated worktree and branch, ignoring ignored build output', () => {
  const f = fixture(); feature(f)
  mkdirSync(path.join(f.source, 'ignored'))
  writeFileSync(path.join(f.source, 'ignored', 'build.txt'), 'generated')
  integrate(f)
  expect(existsSync(f.source)).toBe(false)
  expect(git(['worktree', 'list', '--porcelain'], f.main)).not.toContain('feat/example')
  expect(() => git(['rev-parse', '--verify', 'refs/heads/feat/example'], f.main)).toThrow()
})

test('runs from the source worktree and still removes it', () => {
  const f = fixture(), head = feature(f)
  const result = integrate(f, 'feat/example', f.source)
  expect(result.cleanupError).toBeUndefined()
  expect(git(['log', '-1', '--format=%(trailers:key=Source-Commit,valueonly)', 'dev'], f.main).trim()).toBe(head)
  expect(existsSync(f.source)).toBe(false)
  expect(() => git(['rev-parse', '--verify', 'refs/heads/feat/example'], f.main)).toThrow()
})

test('keeps body trailers in the final trailer block', () => {
  const f = fixture(), head = feature(f)
  const body = `Checked with the fixture.\nNote: the first line stays in the body.\n${tryLine}\n\nCo-Authored-By: Helper <helper@example.invalid>\n`
  integrateBranch({ branch: 'feat/example', title, body, cwd: f.main, runs: passing(f) })
  const message = git(['log', '-1', '--format=%B', 'dev'], f.main)
  expect(message).toContain(`Checked with the fixture.\nNote: the first line stays in the body.\n${tryLine}\n\nSquashed commits:`)
  expect(git(['log', '-1', '--format=%(trailers:only,unfold)', 'dev'], f.main).trim().split('\n')).toEqual([
    'Co-Authored-By: Helper <helper@example.invalid>', 'Source-Branch: feat/example', `Source-Commit: ${head}`, `CI-Run: ${runUrl}`
  ])
})

test('requires a Conventional Commit title before changing dev', () => {
  const f = fixture(); feature(f)
  expect(() => integrateBranch({ branch: 'feat/example', title: ' ', cwd: f.main })).toThrow('--title')
  expect(() => integrateBranch({ branch: 'feat/example', title: 'add the example feature', cwd: f.main, runs: passing(f) })).toThrow('commitlint')
  unchanged(f)
})

test('refuses a feat, fix or perf delivery that does not say how to try it', () => {
  const f = fixture(); feature(f)
  for (const [type, body] of [['feat', ''], ['fix', 'Verified by the fixture.'], ['perf', '体验：'], ['feat', '体验:打开示例页']]) {
    expect(() => integrateBranch({ branch: 'feat/example', title: `${type}(example): change the example`, body, cwd: f.main, runs: passing(f) }))
      .toThrow('体验：无')
  }
  unchanged(f)
  expect(existsSync(f.source)).toBe(true)
})

test.each([
  ['fix(ci): keep the runner alive', 'Verified by the fixture.\n\n体验：无'],
  ['chore(example): tidy the example', 'Verified by the fixture.']
])('integrates %s with the body it was given', (subject, body) => {
  const f = fixture(); feature(f)
  const result = integrateBranch({ branch: 'feat/example', title: subject, body, cwd: f.main, runs: passing(f) })
  expect(dev(f)).toBe(result.commit)
  expect(git(['log', '-1', '--format=%B', 'dev'], f.main).startsWith(`${subject}\n\n${body}\n\nSquashed commits:`)).toBe(true)
})

test('refuses while any checkout has the dev branch', () => {
  const f = fixture(); feature(f)
  git(['switch', '-q', 'dev'], f.main)
  expect(() => integrate(f)).toThrow(`dev is checked out in ${f.main}`)
  expect(dev(f)).toBe(f.base)
  expect(existsSync(f.source)).toBe(true)
})

test.each(['unstaged', 'staged', 'untracked'])('refuses %s source changes without copying or committing them', kind => {
  const f = fixture(), committed = feature(f)
  writeFileSync(path.join(f.source, kind === 'untracked' ? 'extra.txt' : 'feature.txt'), 'unsaved work')
  if (kind === 'staged') git(['add', '.'], f.source)
  expect(() => integrate(f)).toThrow('source worktree has uncommitted')
  expect(git(['rev-parse', 'HEAD'], f.source).trim()).toBe(committed)
  expect(readFileSync(path.join(f.source, kind === 'untracked' ? 'extra.txt' : 'feature.txt'), 'utf8')).toBe('unsaved work')
  unchanged(f)
})

test('requires source commits and an independent source worktree', () => {
  const f = fixture()
  expect(() => integrate(f)).toThrow('no new commits')
  expect(() => integrate(f, 'feat/missing')).toThrow('own worktree')
  for (const branch of ['dev', 'main', '', '--help']) expect(() => integrate(f, branch)).toThrow('Specify a local task branch')
  unchanged(f)
})

test('requires rebase before integration when dev moved on', () => {
  const f = fixture(); feature(f)
  const other = path.join(path.dirname(f.main), 'other')
  git(['worktree', 'add', '-q', '-b', 'fix/other', other, 'dev'], f.main)
  writeFileSync(path.join(other, 'dev.txt'), 'new dev work')
  git(['update-ref', 'refs/heads/dev', f.commit(other)], f.main)
  const head = dev(f)
  expect(() => integrate(f)).toThrow('Rebase the task branch')
  expect(dev(f)).toBe(head)
  expect(existsSync(f.source)).toBe(true)
})

test('refuses when another integration moves dev after the checks', () => {
  const f = fixture(); feature(f)
  const moved = git(['commit-tree', `${f.base}^{tree}`, '-p', f.base, '-m', 'other integration'], f.main).trim()
  hooks.beforeDevUpdate = () => { hooks.beforeDevUpdate = null; git(['update-ref', 'refs/heads/dev', moved], f.main) }
  expect(() => integrate(f)).toThrow('dev moved during integration')
  expect(dev(f)).toBe(moved)
  expect(existsSync(f.source)).toBe(true)
})

test('requires a passing affected or full run that covers the source changes', () => {
  const f = fixture(), head = feature(f)
  const attempt = runs => () => integrateBranch({ branch: 'feat/example', title, cwd: f.main, runs })
  expect(attempt(() => [])).toThrow('No passing affected or full CI run covers feat/example')
  expect(attempt(passing(f, { conclusion: 'failure' }))).toThrow('node scripts/vm-ci.mjs')
  // A manual e2e run checks only the listed specs; a run of other changes or another branch says nothing about these.
  expect(attempt(passing(f, { scope: 'e2e' }))).toThrow('No passing')
  expect(attempt(passing(f, { headSha: f.base }))).toThrow('No passing')
  expect(attempt(passing(f, { branch: 'feat/other' }))).toThrow('No passing')
  unchanged(f)
  integrateBranch({ branch: 'feat/example', title, cwd: f.main, runs: passing(f, { scope: 'full' }) })
  expect(git(['log', '-1', '--format=%(trailers:key=CI-Run,valueonly)', 'dev'], f.main).trim()).toBe(runUrl)
  expect(git(['log', '-1', '--format=%(trailers:key=Source-Commit,valueonly)', 'dev'], f.main).trim()).toBe(head)
})

test('rejects a run from before a rebase onto a newer dev, which never tested the combination', () => {
  const f = fixture(), tested = feature(f)
  advanceDev(f)
  git(['rebase', '-q', 'dev'], f.source)
  expect(() => integrateBranch({ branch: 'feat/example', title, cwd: f.main, runs: passing(f, { headSha: tested }) }))
    .toThrow('a run from before a rebase onto a newer dev does not count')
  // A reworded commit tests the same tree.
  const rebased = git(['rev-parse', 'HEAD'], f.source).trim()
  git(['commit', '-q', '--amend', '-m', 'feat: reworded'], f.source)
  integrateBranch({ branch: 'feat/example', title, cwd: f.main, runs: passing(f, { headSha: rebased }) })
  expect(git(['log', '-1', '--format=%(trailers:key=CI-Run,valueonly)', 'dev'], f.main).trim()).toBe(runUrl)
})

test('rejects a run from before a rebase when the branch changed afterwards', () => {
  const g = fixture(), first = feature(g)
  advanceDev(g)
  git(['rebase', '-q', 'dev'], g.source)
  writeFileSync(path.join(g.source, 'feature.txt'), 'changed after the run')
  g.commit(g.source)
  expect(() => integrateBranch({ branch: 'feat/example', title, cwd: g.main, runs: passing(g, { headSha: first }) })).toThrow('No passing')
})

test('needs no run when the selector picks no checks', () => {
  const f = fixture()
  mkdirSync(path.join(f.source, 'docs'))
  writeFileSync(path.join(f.source, 'docs', 'note.md'), '# Note\n')
  f.commit(f.source)
  const never = () => { throw new Error('documentation needs no CI run') }
  integrateBranch({ branch: 'feat/example', title, cwd: f.main, runs: never })
  expect(git(['log', '-1', '--format=%B', 'dev'], f.main)).not.toContain('CI-Run')
})

test('packaging inputs need a package or full run', () => {
  const g = fixture()
  mkdirSync(path.join(g.source, 'apps', 'desktop'), { recursive: true })
  writeFileSync(path.join(g.source, 'apps', 'desktop', 'electron-builder.yml'), 'appId: example\n')
  g.commit(g.source)
  const attempt = () => integrateBranch({ branch: 'feat/example', title, cwd: g.main, runs: passing(g) })
  expect(attempt).toThrow('No passing package or full CI run')
  expect(attempt).toThrow('--scope package')
  integrateBranch({ branch: 'feat/example', title, cwd: g.main, runs: passing(g, { scope: 'package' }) })
  expect(git(['log', '-1', '--format=%(trailers:key=CI-Run,valueonly)', 'dev'], g.main).trim()).toBe(runUrl)
})

const cli = (args, cwd) => spawnSync(process.execPath, [fileURLToPath(new URL('./integrate-branch.mjs', import.meta.url)), ...args], { cwd, encoding: 'utf8' })

// The CLI reads the runs vm-ci.mjs recorded in the Git common directory.
function recordRun(f) {
  const dir = path.join(f.main, '.git', 'ai-studio-ci')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '7.json'), JSON.stringify(passing(f)()[0]))
}

function bodyFile(f, text = tryLine) {
  const file = path.join(path.dirname(f.main), 'body.md')
  writeFileSync(file, `${text}\n`)
  return file
}

test('CLI rejects a dirty source with a nonzero status and unchanged dev', () => {
  const f = fixture(); feature(f)
  writeFileSync(path.join(f.source, 'extra.txt'), 'not committed')
  const result = cli(['feat/example', '--title', title, '--body-file', bodyFile(f)], f.main)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('commit them on the task branch first')
  unchanged(f)
})

test('CLI keeps dev integrated and exits 0 when the worktree cannot be removed', () => {
  const f = fixture(), head = feature(f)
  recordRun(f)
  git(['worktree', 'lock', f.source], f.main)
  const result = cli(['feat/example', '--title', title, '--body-file', bodyFile(f)], f.main)
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(`at ${head} into dev as`)
  expect(result.stderr).toContain(`the worktree ${f.source} or the branch feat/example was not removed`)
  expect(result.stderr).toContain('locked')
  expect(git(['log', '-1', '--format=%(trailers:key=Source-Commit,valueonly)', 'dev'], f.main).trim()).toBe(head)
  expect(git(['rev-parse', 'HEAD'], f.source).trim()).toBe(head)
  expect(git(['rev-parse', 'refs/heads/feat/example'], f.main).trim()).toBe(head)
})

test('CLI squashes with a body file and rejects missing arguments', () => {
  const f = fixture(), head = feature(f)
  recordRun(f)
  expect(cli(['--freeze'], f.main).status).toBe(1)
  const withoutSteps = cli(['feat/example', '--title', title, '--body-file', bodyFile(f, 'Checked with the fixture.')], f.main)
  expect(withoutSteps.status).toBe(1)
  expect(withoutSteps.stderr).toContain('体验：')
  unchanged(f)
  const result = cli(['feat/example', '--title', title, '--body-file', bodyFile(f, `Checked with the fixture.\n\n${tryLine}`)], f.main)
  expect(result.status).toBe(0)
  expect(result.stdout).toContain(`at ${head} into dev as`)
  expect(result.stdout).toContain(`Removed the worktree ${f.source} and the branch feat/example.`)
  expect(git(['log', '-1', '--format=%B', 'dev'], f.main)).toContain(`Checked with the fixture.\n\n${tryLine}\n\nSquashed commits:`)
  expect(cli(['feat/example'], f.main).status).toBe(1)
})

test('CLI records why CI was skipped', () => {
  const f = fixture(); feature(f)
  const result = cli(['feat/example', '--title', title, '--body-file', bodyFile(f), '--skip-ci', 'GitHub Actions outage'], f.main)
  expect(result.status, result.stderr).toBe(0)
  expect(git(['log', '-1', '--format=%(trailers:key=CI-Run,valueonly)', 'dev'], f.main).trim()).toBe('skipped (GitHub Actions outage)')
})
