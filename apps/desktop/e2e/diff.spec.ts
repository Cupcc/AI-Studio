import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { commitAll, git, initRepo, put } from './git-fixture'

// FR-TOOL-002 (project changes relative to HEAD) against the built app, with real temporary Git repositories.
// No CLI or model runs; only the native directory chooser is stubbed, every user action goes through the UI.
const appDir = join(__dirname, '..')
const evidence = process.env.STUDIO_E2E_EVIDENCE_DIR ?? join(appDir, '../../.runtime/desktop-e2e/screenshots/diff')
let dir: string, app: ElectronApplication, page: Page
const workspace = () => page.locator('.project-workspace:not([hidden])')
const panel = () => workspace().getByRole('region', { name: '项目变更' })
const list = () => panel().getByRole('listbox', { name: '变更文件' })
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (name: string) => list().getByRole('option').filter({ has: page.locator('.diff-row__name', { hasText: new RegExp(`^${escape(name)}$`) }) })

async function launch() {
  app = await electron.launch({ args: [appDir, `--studio-user-data-dir=${join(dir, 'user data')}`], cwd: appDir, env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' } })
  page = await app.firstWindow()
  await expect(page.getByTestId('topbar')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]!; win.setContentSize(1280, 800); win.show(); win.focus() })
}
async function openProject(path: string, name: string) {
  await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, path)
  await page.getByRole('button', { name: '打开本地目录', exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}
async function openDiff() { await workspace().getByRole('button', { name: 'Diff', exact: true }).click(); await expect(panel()).toBeVisible() }
async function capture(name: string) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: join(evidence, `W0-${name}.png`) }) }

test.beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), 'studio diff ')); await launch() })
test.afterEach(async () => {
  try { await app.close() } catch { /* already closed */ }
  rmSync(dir, { recursive: true, force: true })
})

test('FR-TOOL-002: staged, unstaged, untracked, renamed, deleted, mode-only and binary changes against HEAD, refreshed live', async () => {
  const root = join(dir, 'Diff Project')
  initRepo(root)
  put(root, 'src/a.ts', 'export const A = 1\n')
  put(root, 'src/b.ts', 'export const B = 1\n')
  put(root, 'keep.txt', 'one\n')
  put(root, 'docs/old name.md', '# a stable heading\nline two\nline three\n')
  put(root, 'del.txt', 'to be deleted\n')
  put(root, 'mode.sh', '#!/bin/sh\n')
  put(root, 'bin.dat', Buffer.from([0x00, 0x01, 0x02, 0x03]))
  commitAll(root)
  // The working tree afterwards: one change of every kind the list has to tell apart.
  put(root, 'src/a.ts', 'export const A = 2 // staged\n'); git(root, 'add', 'src/a.ts')
  put(root, 'src/b.ts', 'export const B = 2 // not staged\n')
  put(root, 'keep.txt', 'one\ntwo staged\n'); git(root, 'add', 'keep.txt'); put(root, 'keep.txt', 'one\ntwo staged\nthree unstaged\n')
  put(root, 'new file.txt', 'brand new\n')
  git(root, 'mv', 'docs/old name.md', 'docs/renamed.md'); put(root, 'docs/renamed.md', '# a stable heading\nline two\nline three\nline four\n')
  rmSync(join(root, 'del.txt'))
  chmodSync(join(root, 'mode.sh'), 0o755)
  put(root, 'bin.dat', Buffer.from([0x00, 0xff, 0xfe, 0xfd]))
  await openProject(root, 'Diff Project')
  await page.evaluate(() => {
    const w = window as unknown as { __csp: string[] }; w.__csp = []
    document.addEventListener('securitypolicyviolation', event => w.__csp.push(`${event.effectiveDirective} ${event.blockedURI}`))
  })

  await openDiff()
  await expect(panel()).toContainText('相对 HEAD (main @')
  for (const name of ['a.ts', 'b.ts', 'keep.txt', 'new file.txt', 'renamed.md', 'del.txt', 'mode.sh', 'bin.dat']) await expect(row(name)).toBeVisible()
  await expect(row('renamed.md')).toContainText('old name.md')
  await expect(row('mode.sh')).toContainText('仅模式变化')
  await expect(row('bin.dat')).toContainText('二进制')
  await expect(row('new file.txt')).toContainText('未跟踪')
  await expect(panel()).not.toContainText('没有未提交变更')
  await capture('diff-list')

  // The final difference against HEAD: the staged edit and the unstaged edit of one file are both in it.
  await row('keep.txt').click()
  await expect(panel()).toContainText('three unstaged')
  await expect(panel()).toContainText('two staged')
  await row('a.ts').click()
  await expect(panel()).toContainText('export const A = 2')
  await row('bin.dat').click()
  await expect(panel()).toContainText('二进制')
  await row('del.txt').click()
  await expect(panel()).toContainText('to be deleted')
  await capture('diff-file')

  // A change made while the panel is open reaches the list through the watcher.
  put(root, 'late.txt', 'created while open\n')
  await expect(row('late.txt')).toBeVisible({ timeout: 20_000 })
  // Reverting a file removes it from the list and clears a selection that no longer differs.
  git(root, 'checkout', '--', 'src/b.ts')
  await expect(row('b.ts')).toHaveCount(0, { timeout: 20_000 })

  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([])
  expect(existsSync(join(root, '.git'))).toBe(true)
})

test('FR-TOOL-002 item 3: a clean repository says so, a directory that is not Git never says "no changes" and gets no repository', async () => {
  const clean = join(dir, 'Clean Project')
  initRepo(clean); put(clean, 'a.txt', 'a\n'); commitAll(clean)
  await openProject(clean, 'Clean Project')
  await openDiff()
  await expect(panel()).toContainText('没有未提交变更')
  await expect(list()).toHaveCount(0)

  await page.getByRole('button', { name: '新建标签页', exact: true }).click()
  const plain = join(dir, 'Plain Project')
  mkdirSync(plain); put(plain, 'file.txt', 'not in any repository\n')
  await openProject(plain, 'Plain Project')
  await openDiff()
  await expect(panel()).toContainText('此目录不是 Git 仓库')
  await expect(panel()).toContainText('不会自动初始化 Git')
  await expect(panel()).not.toContainText('没有未提交变更')
  await expect(panel()).not.toContainText('没有变更')
  await capture('diff-not-git')
  expect(existsSync(join(plain, '.git'))).toBe(false)
})

test('FR-TOOL-002 item 3: an unborn HEAD explains the missing baseline, lists the files as new and never claims "no changes"', async () => {
  const root = join(dir, 'Unborn Project')
  initRepo(root)
  put(root, 'first.txt', 'first\n'); put(root, 'src/second.ts', 'second\n')
  await openProject(root, 'Unborn Project')
  await openDiff()
  await expect(panel()).toContainText('还没有首个提交')
  await expect(row('first.txt')).toBeVisible()
  await expect(row('second.ts')).toBeVisible()
  await expect(panel()).not.toContainText('没有未提交变更')
  await expect(panel()).not.toContainText('没有变更')
  await capture('diff-no-head')
  // The client never creates a commit for the user.
  expect(() => git(root, 'rev-parse', '--verify', '-q', 'HEAD')).toThrow()
})

test('FR-TOOL-002: a Project inside a repository shows only its own changes and says where it is', async () => {
  const repo = join(dir, 'Monorepo')
  initRepo(repo)
  put(repo, 'pkg/inside.ts', 'inside\n'); put(repo, 'other/outside.ts', 'outside\n')
  commitAll(repo)
  put(repo, 'pkg/inside.ts', 'inside changed\n'); put(repo, 'other/outside.ts', 'outside changed\n')
  await openProject(join(repo, 'pkg'), 'pkg')
  await openDiff()
  await expect(row('inside.ts')).toBeVisible()
  await expect(row('outside.ts')).toHaveCount(0)
  await expect(panel()).toContainText('位于 Git 仓库的子目录')
  await expect(panel()).toContainText('pkg')
  await capture('diff-subdirectory')
  writeFileSync(join(repo, 'other', 'outside.ts'), 'changed again\n')
  await expect(row('outside.ts')).toHaveCount(0)
})
