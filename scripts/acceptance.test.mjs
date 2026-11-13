import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { git } from './check-paths.mjs'
import { readRange, renderChecklist } from './acceptance.mjs'

const temporary = []
beforeEach(() => {
  for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) vi.stubEnv(name, undefined)
  vi.stubEnv('GIT_COMMITTER_DATE', '2026-11-05T12:00:00')
})
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

// main holds one accepted commit. Each message becomes one dev commit, oldest first, and the main checkout is
// parked on the newest one.
function fixture(...messages) {
  // Git reports worktree paths with symlinks resolved, such as macOS /var -> /private/var.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'studio-acceptance-')))
  temporary.push(dir)
  const root = path.join(dir, '主目录')
  git(['init', '-q', '-b', 'main', root], dir)
  git(['config', 'user.email', 'fixture@example.invalid'], root)
  git(['config', 'user.name', 'Fixture'], root)
  git(['config', 'core.hooksPath', path.join(dir, 'no-hooks')], root)
  const commit = message => {
    git(['commit', '-q', '--allow-empty', '-m', message], root)
    return git(['rev-parse', '--short', 'HEAD'], root).trim()
  }
  const accepted = commit('chore: accepted baseline')
  git(['switch', '-q', '-c', 'dev'], root)
  const shas = messages.map(commit)
  git(['switch', '-q', '--detach'], root)
  return { dir, root, accepted, shas }
}
const checklist = (f, options) => renderChecklist(readRange({ root: f.root, ...options }))
const section = (text, heading) => text.split(`## ${heading}\n\n`)[1].split('\n\n')[0].split('\n')
const full = (f, sha) => git(['rev-parse', sha], f.root).trim()
const cli = (args, cwd) => spawnSync(process.execPath, [fileURLToPath(new URL('./acceptance.mjs', import.meta.url)), ...args], { cwd, encoding: 'utf8' })

test('lists deliveries to try with their steps, oldest first, and the rest in one line each', () => {
  const f = fixture(
    'feat(view): add the example view\n\nVerified by the fixture.\n\n体验：打开示例页\n体验：点击保存，看到提示\n\n' +
      'Squashed commits:\n- 1a2b3c4 feat(view): add the example view\n\nSource-Branch: feat/view',
    'feat(theme)!: drop the solid theme\n\nIntegrated before deliveries recorded how to try them.',
    'fix(ci): keep the runner alive\n\n体验：无',
    'docs(guide): explain the view\n\n体验：阅读新增的指南',
    'chore(deps): bump the runner')
  const [view, theme, ci, guide, deps] = f.shas
  const text = checklist(f)
  expect(section(text, '需要体验')).toEqual([
    `- [ ] ${view} feat(view): add the example view（2026-11-05）`,
    '  - 打开示例页',
    '  - 点击保存，看到提示',
    `- [ ] ${theme} feat(theme)!: drop the solid theme（2026-11-05）`,
    '  - （未记录体验步骤，见提交正文）',
    `- [ ] ${guide} docs(guide): explain the view（2026-11-05）`,
    '  - 阅读新增的指南'
  ])
  expect(section(text, '无需体验')).toEqual([`- ${ci} fix(ci): keep the runner alive`, `- ${deps} chore(deps): bump the runner`])
})

test('says where dev and the main checkout stand and how to promote dev', () => {
  const f = fixture('feat(view): add the example view\n\n体验：打开示例页', 'chore(deps): bump the runner')
  const text = checklist(f)
  expect(text).toContain(`- dev 在 \`${f.shas[1]}\`，领先 main 2 个提交。\n- 主目录在 \`${f.shas[1]}\`，与 dev 一致。\n`)
  expect(text).not.toContain('git switch')
  expect(text).toContain(`\`\`\`sh\ngit fetch origin\ngit push origin ${full(f, 'dev')}:refs/heads/main\ngit fetch origin main:main\n\`\`\``)
})

test('tells a main checkout that is behind dev to switch, from whichever worktree it runs', () => {
  const f = fixture('feat(view): add the example view\n\n体验：打开示例页')
  git(['switch', '-q', '--detach', 'main'], f.root)
  const behind = `- 主目录在 \`${f.accepted}\`，不是 dev 的最新提交。体验前在主目录运行 \`git switch --detach dev\`。`
  expect(checklist(f)).toContain(behind)
  const task = path.join(f.dir, 'task')
  git(['worktree', 'add', '-q', '--detach', task, 'dev'], f.root)
  expect(checklist(f, { root: task })).toContain(behind)
})

test('says so in one line when nothing awaits acceptance', () => {
  const f = fixture()
  expect(checklist(f)).toBe('main..dev 没有待验收的提交。')
  expect(cli([], f.root)).toMatchObject({ status: 0, stdout: 'main..dev 没有待验收的提交。\n' })
})

test('CLI prints main..dev by default and the range given by --base and --head', () => {
  const f = fixture('fix(list): keep the order\n\n体验：拖动列表项', 'feat(view): add the example view\n\n体验：打开示例页', 'chore(deps): bump the runner')
  const [list, view] = f.shas
  const all = cli([], f.root)
  expect(all.status, all.stderr).toBe(0)
  expect(all.stdout).toBe(`${checklist(f)}\n`)
  expect(all.stdout).toContain('领先 main 3 个提交')
  const part = cli(['--base', list, '--head', view], f.root)
  expect(part.status, part.stderr).toBe(0)
  expect(part.stdout).toContain(`- ${view} 在 \`${view}\`，领先 ${list} 1 个提交。`)
  expect(section(part.stdout, '需要体验')).toEqual([`- [ ] ${view} feat(view): add the example view（2026-11-05）`, '  - 打开示例页'])
  expect(section(part.stdout, '无需体验')).toEqual(['（无）'])
  expect(part.stdout).toContain(`git push origin ${full(f, view)}:refs/heads/main`)
  expect(cli(['--head', 'missing'], f.root).status).toBe(1)
})
