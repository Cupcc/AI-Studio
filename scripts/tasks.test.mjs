import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { git } from './check-paths.mjs'
import {
  archiveTasks, checkTasks, loadTasks, openQuestions, overlaps, overview, parseTask, readyQueue,
  renderArchive, renderOverview, renderStale, staleTasks, worktreeTasks
} from './tasks.mjs'

const DAY = 24 * 60 * 60 * 1000
const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
})
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

function repo(branch = 'trunk') {
  // Git reports worktree paths with symlinks resolved, such as macOS /var -> /private/var.
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'studio tasks ')))
  temporary.push(base)
  const root = path.join(base, 'main')
  mkdirSync(root)
  git(['init', '-q', '-b', branch], root)
  git(['config', 'user.email', 'fixture@example.invalid'], root)
  git(['config', 'user.name', 'Fixture'], root)
  git(['config', 'core.hooksPath', path.join(base, 'no-hooks')], root)
  const write = (file, contents, cwd = root) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), contents)
  }
  const commit = (cwd = root) => { git(['add', '.'], cwd); git(['commit', '-qm', 'fixture'], cwd) }
  const text = (file, cwd = root) => readFileSync(path.join(cwd, file), 'utf8')
  const worktree = name => {
    const dir = path.join(base, name)
    git(['worktree', 'add', '-q', '-b', `feat/${name}`, dir, branch], root)
    return dir
  }
  return { root, write, commit, text, worktree }
}
const record = (id, fields = {}, body = '') =>
  `---\nid: ${id}\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}\n`).join('')}---\n\n# ${id}\n${body}`
const task = (id, fields, body) => parseTask(`tasks/${id}`, record(id, fields, body), { source: null, changedAt: new Date(0) })
const cli = (root, ...args) => spawnSync(process.execPath, [fileURLToPath(new URL('./tasks.mjs', import.meta.url)), ...args], { cwd: root, encoding: 'utf8' })

test('parses scalars, inline lists and trailing comments from the frontmatter', () => {
  const parsed = parseTask('tasks/T1', '---\nid: T1\nstatus: ready        # 取值见 Lifecycle\nnext: ai\n' +
    'waiting: 等评审 #2 轮\npaths: [scripts/**, "docs/a b.md"]  # 写入范围\nevidence:   # 待填\nfr: []\ncreated: 2026-11-13\n---\n# T1\n')
  expect(parsed).toMatchObject({
    dir: 'tasks/T1', id: 'T1', status: 'ready', next: 'ai', waiting: '等评审', paths: ['scripts/**', 'docs/a b.md'],
    evidence: '', fr: [], ac: [], specs: [], created: '2026-11-13', questions: []
  })
  expect(parseTask('tasks/T2', '# no frontmatter\n')).toMatchObject({ dir: 'tasks/T2', paths: [], questions: [] })
  expect(parseTask('tasks/T2', null).id).toBeUndefined()
})

test('extracts the open question rows a person decides, without the header, the separator or later tables', () => {
  const text = record('T1', {}, '\n## 未决问题\n\n<!-- 可选 -->\n\n| 问题 | 推荐答案 | 决策方 |\n|---|---|---|\n' +
    '| 是否保留[旧入口](../x.md) | 保留 | 人 |\n| 第二问 |  | AI |\n|  |  |  |\n\n## 目标\n\n| 场景 | 结果 |\n|---|---|\n| 别的表 | 不算 |\n')
  expect(openQuestions(text)).toEqual([['是否保留旧入口', '保留', '人']])
  expect(openQuestions(record('T2', {}, '\n## 目标\n\n| a |\n|---|\n| b |\n'))).toEqual([])
})

test('two globs overlap when one literal prefix starts with the other, and empty paths overlap everything', () => {
  expect(overlaps(['scripts/**'], ['scripts/tasks.mjs'])).toBe(true)
  expect(overlaps(['apps/desktop/src/main/**'], ['docs/**', 'apps/desktop/src/{main,shared}/ipc.ts'])).toBe(true)
  expect(overlaps(['scripts/**'], ['docs/**', 'apps/desktop/e2e/*.spec.ts'])).toBe(false)
  expect(overlaps(['tasks/README.md'], ['tasks/T1/**'])).toBe(false)
  expect(overlaps(['**/*.md'], ['apps/**'])).toBe(true)
  expect(overlaps([], ['docs/**'])).toBe(true)
})

test('marks a ready task parallel unless it overlaps running work or an earlier parallel ready task', () => {
  const queue = readyQueue([
    task('T1-running', { status: 'in_progress', paths: '[apps/desktop/**]' }),
    task('T2-blocked', { status: 'blocked', paths: '[specs/**]' }),
    task('T3-desktop', { status: 'ready', paths: '[apps/desktop/src/main/**]' }),
    task('T4-scripts', { status: 'ready', paths: '[scripts/**]' }),
    task('T5-scripts', { status: 'ready', paths: '[scripts/tasks.mjs, docs/**]' }),
    task('T6-docs', { status: 'ready', paths: '[docs/**]' }),
    task('T7-specs', { status: 'ready', paths: '[specs/**]' })
  ])
  expect(queue.map(({ task, blocker }) => [task.id, blocker?.id ?? null])).toEqual([
    ['T3-desktop', 'T1-running'], ['T4-scripts', null], ['T5-scripts', 'T4-scripts'], ['T6-docs', null], ['T7-specs', null]
  ])
  const unscoped = readyQueue([task('T1', { status: 'verifying' }), task('T2', { status: 'ready', paths: '[docs/**]' })])
  expect(unscoped[0].blocker.id).toBe('T1')
})

test.each([
  ['a missing task.md', { 'tasks/T1/notes.md': 'x' }, ['tasks/T1: 缺少 task.md 或 frontmatter']],
  ['missing frontmatter', { 'tasks/T1/task.md': '# T1\n' }, ['tasks/T1: 缺少 task.md 或 frontmatter']],
  ['an id that differs from the directory', { 'tasks/T1/task.md': record('T2', { status: 'draft' }) }, ['tasks/T1: id「T2」与目录名不一致']],
  ['an unknown status', { 'tasks/T1/task.md': record('T1', { status: 'paused' }) }, [expect.stringContaining('tasks/T1: status「paused」不在')]],
  ['a done task outside the archive', { 'tasks/T1/task.md': record('T1', { status: 'done', next: 'none' }) }, [expect.stringContaining('tasks/T1: status 为 done')]],
  ['an unknown next', { 'tasks/T1/task.md': record('T1', { status: 'draft', next: 'agent' }) }, [expect.stringContaining('tasks/T1: next「agent」不在')]],
  ['a ready task without paths', { 'tasks/T1/task.md': record('T1', { status: 'ready', next: 'ai', evidence: '测试通过' }) }, ['tasks/T1: status 为 ready，须填写 paths 与 evidence']],
  ['a ready task without evidence', { 'tasks/T1/task.md': record('T1', { status: 'ready', next: 'ai', paths: '[docs/**]', evidence: '' }) }, ['tasks/T1: status 为 ready，须填写 paths 与 evidence']],
  ['next none on unfinished work', { 'tasks/T1/task.md': record('T1', { status: 'verifying', next: 'none' }) }, ['tasks/T1: next 为 none，但任务未完成']],
  ['a missing next from the cutoff date on', { 'tasks/T1/task.md': record('T1', { status: 'draft', created: '2026-11-13' }) }, ['tasks/T1: 缺少 next']],
  ['a missing next before the cutoff date', { 'tasks/T1/task.md': record('T1', { status: 'verifying', created: '2026-11-12' }) }, []],
  ['a legacy record without the new fields', { 'tasks/T1/task.md': record('T1', { status: 'in_progress' }) }, []],
  ['a complete ready task and the templates', {
    'tasks/T1/task.md': record('T1', { status: 'ready', next: 'ai', paths: '[docs/**]', evidence: '测试通过', created: '2026-11-13' }),
    'tasks/templates/task.md': record('TYYYYMMDD-slug', { status: 'draft' }), 'tasks/README.md': '# Task Protocol\n'
  }, []]
])('check reports %s', (_, files, expected) => {
  const { root, write } = repo()
  for (const [file, contents] of Object.entries(files)) write(file, contents)
  expect(checkTasks(worktreeTasks(root))).toEqual(expected)
})

test('--check exits 1 with one line per problem and is silent when the records are valid', () => {
  const { root, write, commit } = repo()
  write('tasks/T1/task.md', record('T1', { status: 'verifying', next: 'ai', created: '2026-11-13' }))
  commit()
  expect(cli(root, '--check')).toMatchObject({ status: 0, stdout: '', stderr: '' })
  write('tasks/T1/task.md', record('T1', { status: 'done', next: 'ai' }))
  write('tasks/T2/task.md', record('T2', { status: 'ready', next: 'human' }))
  const failed = cli(root, '--check')
  expect(failed.status).toBe(1)
  expect(failed.stderr.trim().split('\n')).toEqual([
    'tasks/T1: status 为 done，须运行 node scripts/tasks.mjs archive T1 归档', 'tasks/T2: status 为 ready，须填写 paths 与 evidence'
  ])
})

function mixed() {
  const f = repo()
  f.write('tasks/T1-human/task.md', record('T1-human', { status: 'verifying', next: 'human', waiting: '确认验收范围' }))
  f.write('tasks/T2-running/task.md', record('T2-running', { status: 'in_progress', next: 'ai', waiting: '补脚本测试', paths: '[scripts/**]' },
    '\n## 未决问题\n\n| 问题 | 推荐答案 |\n|---|---|\n| 是否保留旧命令 | 保留 |\n'))
  f.write('tasks/T3-legacy/task.md', record('T3-legacy', { status: 'verifying' }))
  f.write('tasks/T4-blocked/task.md', record('T4-blocked', { status: 'blocked', next: 'ai', waiting: '等上游发布', paths: '[specs/**]' }))
  f.write('tasks/T5-ready/task.md', record('T5-ready', { status: 'ready', next: 'ai', paths: '[docs/**]', evidence: '链接检查通过' }))
  f.write('tasks/T6-draft/task.md', record('T6-draft', { status: 'draft', next: 'ai', waiting: '补验收标准' }))
  f.write('tasks/T7-broken/task.md', record('T7-other', { status: 'draft', next: 'ai' }))
  f.write('tasks/templates/task.md', record('TYYYYMMDD-slug', { status: 'draft' }))
  f.commit()
  return f
}

test('the overview lists the sections in order with days since the last change and skips empty ones', () => {
  const { root, write } = mixed()
  write('tasks/T4-blocked/notes.md', 'uncommitted edits count as changed now')
  const now = new Date(Date.now() + 5 * DAY)
  expect(renderOverview(overview(loadTasks(root, { now }), { now }))).toBe([
    '待你处理',
    '  T1-human  verifying  停留 5 天  确认验收范围',
    '  T2-running  未决：是否保留旧命令 | 保留',
    '',
    '进行中',
    '  T2-running  in_progress  下一步 AI  停留 5 天  补脚本测试',
    '  T3-legacy  verifying  下一步 未填  停留 5 天',
    '  T4-blocked  blocked  下一步 AI  停留 0 天  等上游发布',
    '',
    '排队',
    '  T5-ready  ready  需排队（与 T1-human 重叠）  docs/**',
    '  T6-draft  draft  补验收标准',
    '  T7-broken  draft',
    '',
    '需要修正',
    '  tasks/T7-broken: id「T7-other」与目录名不一致'
  ].join('\n'))
  expect(cli(root).stdout).toContain('待你处理\n  T1-human  verifying  停留 0 天  确认验收范围\n')

  const quiet = repo()
  quiet.write('tasks/T1/task.md', record('T1', { status: 'ready', next: 'ai', paths: '[docs/**]', evidence: '链接检查通过' }))
  quiet.commit()
  expect(cli(quiet.root)).toMatchObject({ status: 0, stdout: '排队\n  T1  ready  可并行  docs/**\n' })
})

test('the overview ends with how far dev is ahead of main, and omits the line without both refs', () => {
  const { root, write, commit } = repo('main')
  write('tasks/T1/task.md', record('T1', { status: 'draft', next: 'ai' }))
  commit()
  expect(cli(root).stdout).toBe('排队\n  T1  draft\n')
  git(['switch', '-qc', 'dev'], root)
  write('a.txt', 'a'); commit()
  write('b.txt', 'b'); commit()
  expect(cli(root).stdout).toBe('排队\n  T1  draft\n\n待验收：dev 领先 main 2 个提交，运行 node scripts/acceptance.mjs 查看\n')
})

test('--stale selects running work that nobody touched for longer than the given days', () => {
  const { root } = mixed()
  const select = (elapsed, days) => {
    const now = new Date(Date.now() + elapsed * DAY)
    return staleTasks(loadTasks(root, { now }), { days, now }).map(item => item.id)
  }
  expect(select(4)).toEqual(['T2-running', 'T3-legacy', 'T4-blocked'])
  expect(select(2)).toEqual([])
  expect(select(2, 1)).toEqual(['T2-running', 'T3-legacy', 'T4-blocked'])
  const now = new Date(Date.now() + 4 * DAY)
  expect(renderStale(staleTasks(loadTasks(root, { now }), { now }), now).split('\n')[0]).toBe('  T2-running  in_progress  下一步 AI  停留 4 天  补脚本测试')
  expect(cli(root, '--stale')).toMatchObject({ status: 0, stdout: '' })
  expect(cli(root, '--stale', '0').stdout).toContain('T3-legacy  verifying  下一步 未填  停留 0 天')
})

function shared() {
  const f = repo('dev')
  f.write('tasks/T1-claimed/task.md', record('T1-claimed', { status: 'ready', next: 'ai', paths: '[scripts/**]', evidence: '测试通过' }))
  f.write('tasks/T2-waiting/task.md', record('T2-waiting', { status: 'ready', next: 'ai', paths: '[scripts/tasks.mjs]', evidence: '测试通过' }))
  f.write('tasks/T3-closing/task.md', record('T3-closing', { status: 'verifying', next: 'ai' }))
  f.write('tasks/T4-stable/task.md', record('T4-stable', { status: 'blocked', next: 'ai', waiting: '等上游发布' }))
  f.commit()
  return f
}

test('branch worktrees overlay dev: their status wins, new tasks appear and archived ones disappear', () => {
  const f = shared()
  const owner = f.worktree('owner'), closer = f.worktree('closer')
  f.write('tasks/T1-claimed/task.md', record('T1-claimed', { status: 'in_progress', next: 'ai', paths: '[scripts/**]', evidence: '测试通过', waiting: '实现中' }), owner)
  f.write('tasks/T5-new/task.md', record('T5-new', { status: 'draft', next: 'human', waiting: '确认范围' }), owner)
  f.write('tasks/T4-stable/notes.md', 'notes beside an untouched task.md', owner)
  f.write('tasks/T3-closing/task.md', record('T3-closing', { status: 'done', next: 'none' }), closer)
  f.commit(closer)
  archiveTasks(closer, ['T3-closing'])
  f.write('tasks/T4-stable/task.md', record('T4-stable', { status: 'done', next: 'none' }))
  const parked = path.join(path.dirname(f.root), 'parked')
  git(['worktree', 'add', '-q', '--detach', parked, 'dev'], f.root)
  f.write('tasks/T2-waiting/task.md', record('T2-waiting', { status: 'in_progress', next: 'ai' }), parked)

  const now = new Date(Date.now() + 2 * DAY)
  for (const cwd of [f.root, owner]) {
    expect(loadTasks(cwd, { now }).map(item => [item.id, item.status, item.source])).toEqual([
      ['T1-claimed', 'in_progress', 'feat/owner'], ['T2-waiting', 'ready', 'dev'], ['T4-stable', 'blocked', 'dev'], ['T5-new', 'draft', 'feat/owner']
    ])
  }
  expect(renderOverview(overview(loadTasks(f.root, { now }), { now }))).toBe([
    '待你处理',
    '  T5-new @ feat/owner  draft  停留 0 天  确认范围',
    '',
    '进行中',
    '  T1-claimed @ feat/owner  in_progress  下一步 AI  停留 0 天  实现中',
    '  T4-stable  blocked  下一步 AI  停留 2 天  等上游发布',
    '',
    '排队',
    '  T2-waiting  ready  需排队（与 T1-claimed 重叠）  scripts/tasks.mjs',
    '  T5-new @ feat/owner  draft  确认范围'
  ].join('\n'))
  expect(staleTasks(loadTasks(f.root, { now }), { days: 1, now }).map(item => item.id)).toEqual(['T4-stable'])
  expect(checkTasks(worktreeTasks(f.root))).toEqual([expect.stringContaining('tasks/T4-stable: status 为 done')])
  f.commit(owner)
  expect(staleTasks(loadTasks(f.root, { now }), { days: 1, now }).map(item => item.id)).toEqual(['T1-claimed', 'T4-stable'])
})

test('a task changed in two branch worktrees keeps the furthest status and is reported as a double claim', () => {
  const f = shared()
  const first = f.worktree('first'), second = f.worktree('second')
  const claim = (status, cwd) => f.write('tasks/T1-claimed/task.md',
    record('T1-claimed', { status, next: 'ai', paths: '[scripts/**]', evidence: '测试通过' }), cwd)
  claim('verifying', first)
  f.commit(first)
  claim('in_progress', second)
  const [claimed] = loadTasks(f.root)
  expect(claimed).toMatchObject({ id: 'T1-claimed', status: 'verifying', source: 'feat/first', claimedBy: ['feat/first', 'feat/second'] })
  expect(cli(f.root).stdout).toContain('需要修正\n  tasks/T1-claimed @ feat/first: 被多个分支同时改动：feat/first、feat/second\n')
})

function archivable() {
  const f = repo()
  f.write('docs/04. Technical Requirements.md', '# 技术要求\n\n## 进程管理\n')
  f.write('tasks/README.md', '# Task Protocol\n\n见[归档任务](T1-done/task.md#目标)与[另一任务](T10-other/task.md)。\n')
  f.write('tasks/T1-done/task.md', record('T1-done', { status: 'done', next: 'none' }, [
    '',
    '## 目标',
    '',
    '- [技术要求](<../../docs/04. Technical Requirements.md#进程管理>) 与[编码写法](../../docs/04.%20Technical%20Requirements.md)',
    '- [协议](../README.md#task-protocol)、[计划](plan.md#进度)、![截图](evidence/W1-shot.png)、[本节](#目标)、[外链](https://example.com/T1-done)',
    '- [引用式][protocol]，命令 `rg done tasks/T1-done/task.md`',
    '',
    '[protocol]: ../README.md "Task Protocol"',
    ''
  ].join('\n')))
  f.write('tasks/T1-done/plan.md', '# 计划\n\n## 进度\n\n[任务](task.md)\n')
  f.write('tasks/T1-done/evidence/W1-shot.png', 'png')
  f.write('tasks/T10-other/task.md', record('T10-other', { status: 'verifying', next: 'ai' }, '\n依赖[前置任务](../T1-done/task.md)。\n'))
  f.write('.agents/archive/tasks/T0-old/task.md', record('T0-old', { status: 'done' }, '\n后续见[接续任务](../../../../tasks/T1-done/plan.md#进度)。\n'))
  f.write('docs/index.md', '# 索引\n\n[任务](<../tasks/T1-done/task.md>)，[别的任务](../tasks/T10-other/task.md)，路径 tasks/T1-done 与 tasks/T10-other。\n')
  f.write('docs/map.html', '<a href="../tasks/T1-done/task.md#目标">任务</a>\n<script>const refs = ["任务", "../tasks/T1-done/plan.md", "../tasks/T10-other/task.md"]</script>\n')
  f.write('scripts/report.mjs', "export const record = 'tasks/T1-done/task.md'\nexport const archived = '.agents/archive/tasks/T0-old'\n")
  f.commit()
  return f
}

test('archive moves a done task, repairs links in both directions and lists what it cannot rewrite', () => {
  const f = archivable()
  const [result] = archiveTasks(f.root, ['T1-done'])

  expect(existsSync(path.join(f.root, 'tasks/T1-done'))).toBe(false)
  expect(f.text('.agents/archive/tasks/T1-done/evidence/W1-shot.png')).toBe('png')
  const moved = f.text('.agents/archive/tasks/T1-done/task.md')
  expect(moved).toContain('[技术要求](<../../../../docs/04. Technical Requirements.md#进程管理>) 与[编码写法](../../../../docs/04.%20Technical%20Requirements.md)')
  expect(moved).toContain('[协议](../../../../tasks/README.md#task-protocol)、[计划](plan.md#进度)、![截图](evidence/W1-shot.png)、[本节](#目标)、[外链](https://example.com/T1-done)')
  expect(moved).toContain('[protocol]: ../../../../tasks/README.md "Task Protocol"')
  expect(moved).toContain('命令 `rg done tasks/T1-done/task.md`')
  expect(f.text('.agents/archive/tasks/T1-done/plan.md')).toBe('# 计划\n\n## 进度\n\n[任务](task.md)\n')

  expect(f.text('tasks/README.md')).toContain('见[归档任务](../.agents/archive/tasks/T1-done/task.md#目标)与[另一任务](T10-other/task.md)。')
  expect(f.text('tasks/T10-other/task.md')).toContain('依赖[前置任务](../../.agents/archive/tasks/T1-done/task.md)。')
  expect(f.text('.agents/archive/tasks/T0-old/task.md')).toContain('后续见[接续任务](../T1-done/plan.md#进度)。')
  expect(f.text('docs/index.md')).toBe('# 索引\n\n[任务](<../.agents/archive/tasks/T1-done/task.md>)，[别的任务](../tasks/T10-other/task.md)，路径 tasks/T1-done 与 tasks/T10-other。\n')
  expect(f.text('docs/map.html')).toBe('<a href="../.agents/archive/tasks/T1-done/task.md#目标">任务</a>\n' +
    '<script>const refs = ["任务", "../.agents/archive/tasks/T1-done/plan.md", "../tasks/T10-other/task.md"]</script>\n')

  expect(result.rewritten).toEqual([
    { file: '.agents/archive/tasks/T0-old/task.md', count: 1 }, { file: '.agents/archive/tasks/T1-done/task.md', count: 4 },
    { file: 'docs/index.md', count: 1 }, { file: 'docs/map.html', count: 2 },
    { file: 'tasks/README.md', count: 1 }, { file: 'tasks/T10-other/task.md', count: 1 }
  ])
  expect(result.manual.map(({ file, line }) => `${file}:${line}`)).toEqual(
    ['.agents/archive/tasks/T1-done/task.md:13', 'docs/index.md:3', 'scripts/report.mjs:1'])
  expect(renderArchive(result)).toContain('需手动核对：\n  .agents/archive/tasks/T1-done/task.md:13  - [引用式][protocol]，命令 `rg done tasks/T1-done/task.md`')

  const status = git(['status', '--porcelain'], f.root).split('\n').filter(Boolean)
  expect(status.filter(line => line[0] !== ' ').every(line => line.startsWith('R') && line.includes('tasks/T1-done/'))).toBe(true)
  expect(status.filter(line => line[1] === 'M').map(line => line.slice(3).split(' -> ').at(-1)).sort()).toEqual(result.rewritten.map(item => item.file).sort())
  expect(git(['log', '--oneline'], f.root).trim().split('\n')).toHaveLength(1)
})

test('archive refuses a task that is not done, an unknown id and a second run, changing nothing', () => {
  const f = archivable()
  const untouched = () => expect(git(['status', '--porcelain'], f.root)).toBe('')
  expect(() => archiveTasks(f.root, ['T1-done', 'T10-other'])).toThrow('tasks/T10-other 的 status 为 verifying，只有 done 才能归档')
  untouched()
  expect(() => archiveTasks(f.root, ['T9-missing'])).toThrow('找不到 tasks/T9-missing/task.md')
  expect(() => archiveTasks(f.root, ['../docs'])).toThrow('任务 ID 不合法')
  untouched()

  expect(cli(f.root, 'archive', 'T1-done')).toMatchObject({ status: 0, stderr: '' })
  const after = git(['status', '--porcelain'], f.root)
  const again = cli(f.root, 'archive', 'T1-done')
  expect(again.status).toBe(1)
  expect(again.stderr).toContain('T1-done 已归档到 .agents/archive/tasks/T1-done')
  expect(git(['status', '--porcelain'], f.root)).toBe(after)
})
