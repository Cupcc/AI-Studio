import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'
import { git, paths } from './check-paths.mjs'

// rank orders how far along a status is. active tasks fill 进行中, holds keeps a task's paths away from the ready queue.
const STATUS = {
  draft: { rank: 0, queued: true },
  ready: { rank: 1, queued: true },
  blocked: { rank: 2, active: true },
  in_progress: { rank: 3, active: true, holds: true },
  verifying: { rank: 4, active: true, holds: true },
  done: { rank: 5 }
}
const NEXT = { ai: 'AI', human: '你', none: '无' }
// Records created earlier are migrated separately and may still lack `next`.
const NEXT_REQUIRED_FROM = '2026-11-13'
const TASKS = 'tasks'
const ARCHIVE = '.agents/archive/tasks'
const DAY = 24 * 60 * 60 * 1000
const usage = 'Usage: node scripts/tasks.mjs [--stale [days] | --check | archive <id> [<id>...]]'

const parser = unified().use(remarkParse).use(remarkGfm)
function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}
const name = task => path.basename(task.dir)
// Rows read from a branch worktree say so; dev and the current working tree are the unmarked default.
const origin = task => task.source && task.source !== 'dev' ? ` @ ${task.source}` : ''
const inside = (file, dir) => file === dir || file.startsWith(`${dir}/`)
const taskFile = file => new RegExp(`^(${TASKS}/(?!templates/)[^/]+)/task\\.md$`).exec(file)?.[1]
function read(root, file) {
  try { return readFileSync(path.join(root, file), 'utf8') } catch { return null }
}

export function parseFrontmatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!block) return null
  const fields = {}
  for (const line of block[1].split(/\r?\n/)) {
    const pair = /^([\w-]+):(.*)$/.exec(line)
    if (!pair) continue
    const quoted = /^\s*(["'])(.*?)\1\s*(?:#.*)?$/.exec(pair[2])
    const value = quoted ? quoted[2] : pair[2].replace(/(?:^|\s)#.*$/, '').trim()
    fields[pair[1]] = !quoted && /^\[.*\]$/.test(value)
      ? value.slice(1, -1).split(',').map(item => item.trim().replace(/^(["'])(.*)\1$/, '$2')).filter(Boolean)
      : value
  }
  return fields
}

export function openQuestions(text) {
  const nodes = parser.parse(text).children
  const start = nodes.findIndex(node => node.type === 'heading' && node.depth === 2 && toString(node).trim() === '未决问题')
  if (start < 0) return []
  const rows = []
  for (const node of nodes.slice(start + 1)) {
    if (node.type === 'heading' && node.depth <= 2) break
    if (node.type !== 'table') continue
    const [header, ...body] = node.children.map(row => row.children.map(cell => toString(cell).trim()))
    const owner = header.findIndex(cell => cell.startsWith('决策方'))
    // The AI settles its own questions; only the rest wait for a person.
    rows.push(...body.filter(row => owner < 0 || !/^AI$/i.test(row[owner])))
  }
  return rows.filter(row => row.some(Boolean))
}

export function parseTask(dir, text, extra = {}) {
  const fields = (text ? parseFrontmatter(text) : null) ?? {}
  for (const key of ['paths', 'fr', 'ac', 'specs']) fields[key] = [fields[key] ?? []].flat().filter(Boolean)
  return { ...fields, dir, questions: text ? openQuestions(text) : [], ...extra }
}

export function worktreeTasks(root) {
  let entries
  try { entries = readdirSync(path.join(root, TASKS), { withFileTypes: true }) } catch { return [] }
  return entries.filter(entry => entry.isDirectory() && entry.name !== 'templates').map(entry => entry.name).sort()
    .map(id => parseTask(`${TASKS}/${id}`, read(root, `${TASKS}/${id}/task.md`), { source: null }))
}

function hasRef(root, ref) {
  try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], root); return true } catch { return false }
}
function lastCommit(root, ref, dir) {
  const date = git(['log', '-1', '--format=%cI', ref, '--', dir], root).trim()
  return date ? new Date(date) : null
}
// An uncommitted edit counts as changed now; otherwise the branch's last commit on the directory dates it,
// so a task parked in a forgotten worktree still turns stale.
function heldSince(cwd, dir) {
  return git(['status', '--porcelain', '--', dir], cwd) ? null : lastCommit(cwd, 'HEAD', dir)
}
// Task paths that differ from a commit in a working tree, uncommitted and untracked files included.
function changes(cwd, base) {
  return new Set([...paths(git(['diff', '--name-only', '--no-renames', '-z', base, '--', `${TASKS}/`], cwd)),
    ...paths(git(['ls-files', '--others', '--exclude-standard', '-z', '--', `${TASKS}/`], cwd))])
}

function refTasks(root, ref) {
  const files = paths(git(['ls-tree', '-r', '--name-only', '-z', ref, '--', `${TASKS}/`], root))
  const ids = new Set(files.map(file => file.split('/')).filter(parts => parts.length > 2 && parts[1] !== 'templates').map(parts => parts[1]))
  return [...ids].sort().map(id => {
    const dir = `${TASKS}/${id}`
    const text = files.includes(`${dir}/task.md`) ? git(['show', `${ref}:${dir}/task.md`], root) : null
    return parseTask(dir, text, { source: ref, changedAt: lastCommit(root, ref, dir) })
  })
}

function branchWorktrees(root) {
  // The first record is the main checkout, which only parks on a dev commit for acceptance.
  return git(['worktree', 'list', '--porcelain', '-z'], root).split('\0\0').slice(1).map(record => record.split('\0'))
    .map(lines => ({
      worktree: lines.find(line => line.startsWith('worktree '))?.slice('worktree '.length),
      branch: lines.find(line => line.startsWith('branch refs/heads/'))?.slice('branch refs/heads/'.length)
    })).filter(entry => entry.worktree && entry.branch)
}

// One list for every reader: dev's records, replaced by the working copy of each branch worktree that touched them.
// Without a dev ref the current working tree is the only source.
export function loadTasks(root, { now = new Date() } = {}) {
  if (!hasRef(root, 'dev')) {
    let dirty
    try { dirty = new Set([...changes(root, 'HEAD')].map(file => file.split('/')[1])) } catch { /* no commit yet */ }
    return worktreeTasks(root).map(task => ({
      ...task, changedAt: (dirty && !dirty.has(name(task)) && lastCommit(root, 'HEAD', task.dir)) || now
    }))
  }
  const merged = new Map(refTasks(root, 'dev').map(task => [task.dir, task]))
  const claims = new Map()
  for (const { worktree, branch } of branchWorktrees(root)) {
    let files
    try { files = changes(worktree, git(['merge-base', 'dev', 'HEAD'], worktree).trim()) } catch { continue }
    for (const file of files) {
      const dir = taskFile(file)
      if (!dir) continue
      const text = read(worktree, file)
      const copy = text === null ? null : parseTask(dir, text, { source: branch, changedAt: heldSince(worktree, dir) ?? now })
      claims.set(dir, [...claims.get(dir) ?? [], { branch, copy }])
    }
  }
  for (const [dir, claim] of claims) {
    const [furthest] = claim.filter(item => item.copy).map(item => item.copy)
      .sort((a, b) => (STATUS[b.status]?.rank ?? -1) - (STATUS[a.status]?.rank ?? -1))
    if (furthest) merged.set(dir, { ...furthest, claimedBy: claim.map(item => item.branch) })
    else merged.delete(dir)
  }
  return [...merged.values()].sort((a, b) => a.dir < b.dir ? -1 : 1).map(task => ({ ...task, changedAt: task.changedAt ?? now }))
}

export function checkTasks(tasks) {
  const problems = []
  for (const task of tasks) {
    const report = text => problems.push(`${task.dir}${origin(task)}: ${text}`)
    if (task.claimedBy?.length > 1) report(`被多个分支同时改动：${task.claimedBy.join('、')}`)
    if (task.id === undefined && task.status === undefined) { report('缺少 task.md 或 frontmatter'); continue }
    if (task.id !== name(task)) report(`id「${task.id ?? ''}」与目录名不一致`)
    if (!STATUS[task.status]) report(`status「${task.status ?? ''}」不在 ${Object.keys(STATUS).join(' | ')} 之内`)
    if (task.status === 'done') report(`status 为 done，须运行 node scripts/tasks.mjs archive ${name(task)} 归档`)
    if (task.status === 'ready' && !(task.paths.length && task.evidence)) report('status 为 ready，须填写 paths 与 evidence')
    if (task.next && !NEXT[task.next]) report(`next「${task.next}」不在 ${Object.keys(NEXT).join(' | ')} 之内`)
    if (!task.next && task.created >= NEXT_REQUIRED_FROM) report('缺少 next')
    if (task.next === 'none' && task.status !== 'done') report('next 为 none，但任务未完成')
  }
  return problems
}

const literal = glob => glob.split(/[*?[{]/)[0]
export function overlaps(a, b) {
  return !a.length || !b.length || a.some(one => b.some(other =>
    literal(one).startsWith(literal(other)) || literal(other).startsWith(literal(one))))
}

export function readyQueue(tasks) {
  const holders = tasks.filter(task => STATUS[task.status]?.holds)
  return tasks.filter(task => task.status === 'ready').map(task => {
    const blocker = holders.find(other => overlaps(task.paths, other.paths))
    if (!blocker) holders.push(task)
    return { task, blocker }
  })
}

export function staleTasks(tasks, { days = 3, now = new Date() } = {}) {
  return tasks.filter(task => task.next !== 'human' && !STATUS[task.status]?.queued && now - task.changedAt > days * DAY)
}

export function overview(tasks, { now = new Date(), ahead = 0 } = {}) {
  return {
    now, ahead,
    human: tasks.filter(task => task.next === 'human'),
    questions: tasks.filter(task => task.status !== 'done').flatMap(task => task.questions.map(cells => ({ task, cells }))),
    active: tasks.filter(task => STATUS[task.status]?.active && task.next !== 'human'),
    queue: readyQueue(tasks),
    drafts: tasks.filter(task => task.status === 'draft'),
    problems: checkTasks(tasks)
  }
}

const row = (...cells) => `  ${cells.filter(Boolean).join('  ')}`
const label = task => name(task) + origin(task)
const stay = (task, now) => `停留 ${Math.max(0, Math.floor((now - task.changedAt) / DAY))} 天`
const progress = (task, now) => row(label(task), task.status, `下一步 ${task.next ? NEXT[task.next] ?? task.next : '未填'}`, stay(task, now), task.waiting)

export function renderStale(tasks, now = new Date()) {
  return tasks.map(task => progress(task, now)).join('\n')
}

export function renderOverview({ now, ahead, human, questions, active, queue, drafts, problems }) {
  const sections = [
    ['待你处理', [...human.map(task => row(label(task), task.status, stay(task, now), task.waiting)),
      ...questions.map(({ task, cells }) => row(label(task), `未决：${cells.join(' | ')}`))]],
    ['进行中', active.map(task => progress(task, now))],
    ['排队', [...queue.map(({ task, blocker }) => row(label(task), task.status,
      blocker ? `需排队（与 ${name(blocker)} 重叠）` : '可并行', task.paths.join(', '))),
    ...drafts.map(task => row(label(task), task.status, task.waiting))]],
    ['需要修正', problems.map(problem => row(problem))]
  ].filter(([, rows]) => rows.length).map(([title, rows]) => [title, ...rows].join('\n'))
  if (ahead) sections.push(`待验收：dev 领先 main ${ahead} 个提交，运行 node scripts/acceptance.mjs 查看`)
  return sections.join('\n\n')
}

function aheadOfMain(root) {
  return hasRef(root, 'main') && hasRef(root, 'dev') ? Number(git(['rev-list', '--count', 'main..dev'], root)) : 0
}

function markdownTargets(text) {
  const found = []
  walk(parser.parse(text), node => {
    if (!['link', 'image', 'definition'].includes(node.type) || !node.url) return
    const start = node.position.start.offset
    const source = text.slice(start, node.position.end.offset)
    // The destination follows the link text, so a URL repeated inside the text is never the one replaced.
    const from = node.type === 'link' ? (node.children.at(-1)?.position.end.offset ?? start + 1) - start
      : node.type === 'image' ? source.lastIndexOf('](') : source.indexOf(']:')
    const at = source.indexOf(node.url, Math.max(from, 0))
    found.push({ url: node.url, line: node.position.start.line, start: at < 0 ? -1 : start + at })
  })
  return found
}

// HTML keeps paths in attributes and in script data alike, so every quoted run is a candidate.
function htmlTargets(text) {
  return [...text.matchAll(/(?<=["'])[^"'\n<>]+(?=["'])/g)].map(match => (
    { url: match[0], start: match.index, line: text.slice(0, match.index).split('\n').length }))
}

// `was` is the path the links were written against and `move` maps a link target to where it now lives.
// A target is rewritten only when it no longer resolves there from `file`.
export function rewriteLinks(text, { file, was = file, move }) {
  const edits = [], unresolved = []
  for (const { url, start, line } of file.endsWith('.html') ? htmlTargets(text) : markdownTargets(text)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(url)) continue
    const cut = url.search(/[?#]/)
    const pathname = cut < 0 ? url : url.slice(0, cut)
    let decoded
    try { decoded = decodeURIComponent(pathname) } catch { continue }
    const resolve = from => path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded))
    const target = move(resolve(was))
    if (resolve(file) === target) continue
    if (start < 0) { unresolved.push({ line, url }); continue }
    let next = (path.posix.relative(path.posix.dirname(file), target) || '.') + (decoded.endsWith('/') ? '/' : '')
    if (decoded !== pathname) next = encodeURI(next)
    edits.push({ start, end: start + pathname.length, next })
  }
  for (const { start, end, next } of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, start) + next + text.slice(end)
  return { text, count: edits.length, unresolved }
}

function mentions(root, id) {
  let output
  try { output = git(['grep', '-nIzF', '-e', `${TASKS}/${id}`], root) } catch (error) {
    if (error.status === 1) return []
    throw error
  }
  const old = new RegExp(`(?<!archive/)${TASKS}/${id}(?![\\w-])`)
  return output.split('\n').filter(Boolean).map(entry => entry.split('\0')).filter(([, , text]) => old.test(text))
    .map(([file, line, text]) => ({ file, line: Number(line), text: text.trim() }))
}

function archiveOne(root, id) {
  const from = `${TASKS}/${id}`, to = `${ARCHIVE}/${id}`
  mkdirSync(path.join(root, ARCHIVE), { recursive: true })
  git(['mv', from, to], root)
  const move = target => inside(target, from) ? to + target.slice(from.length) : target
  const rewritten = [], manual = []
  for (const file of paths(git(['ls-files', '-z', '--', '*.md', '*.html'], root))) {
    const absolute = path.join(root, file)
    if (!lstatSync(absolute, { throwIfNoEntry: false })?.isFile()) continue
    const text = readFileSync(absolute, 'utf8')
    const moved = inside(file, to)
    // A file outside the task directory can only reach into it by naming it.
    if (!moved && !text.includes(id)) continue
    const result = rewriteLinks(text, { file, was: moved ? from + file.slice(to.length) : file, move })
    manual.push(...result.unresolved.map(({ line, url }) => ({ file, line, text: url })))
    if (!result.count) continue
    writeFileSync(absolute, result.text)
    rewritten.push({ file, count: result.count })
  }
  manual.push(...mentions(root, id))
  return { id, from, to, rewritten, manual }
}

export function archiveTasks(root, ids) {
  ids = [...new Set(ids)]
  if (!ids.length) throw new Error(usage)
  for (const id of ids) {
    const from = `${TASKS}/${id}`, to = `${ARCHIVE}/${id}`
    if (!/^[\w-]+$/.test(id)) throw new Error(`任务 ID 不合法：${id}`)
    if (!existsSync(path.join(root, from)) && existsSync(path.join(root, to))) throw new Error(`${id} 已归档到 ${to}，未做任何改动。`)
    if (existsSync(path.join(root, to))) throw new Error(`${to} 已存在，未做任何改动。`)
    const text = read(root, `${from}/task.md`)
    if (text === null) throw new Error(`找不到 ${from}/task.md，未做任何改动。`)
    const status = parseFrontmatter(text)?.status
    if (status !== 'done') throw new Error(`${from} 的 status 为 ${status || '空'}，只有 done 才能归档，未做任何改动。`)
    if (!git(['ls-files', '--', from], root)) throw new Error(`${from} 尚未纳入 Git，先 git add 再归档，未做任何改动。`)
  }
  return ids.map(id => archiveOne(root, id))
}

export function renderArchive({ from, to, rewritten, manual }) {
  return [`已归档 ${from} → ${to}`,
    ...(rewritten.length ? ['改写链接（未暂存）：', ...rewritten.map(({ file, count }) => row(file, String(count)))] : []),
    ...(manual.length ? ['需手动核对：', ...manual.map(({ file, line, text }) => row(`${file}:${line}`, text.slice(0, 120)))] : [])
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = git(['rev-parse', '--show-toplevel']).trim()
    const [command, ...rest] = process.argv.slice(2)
    const print = text => { if (text) console.log(text) }
    if (command === 'archive') {
      for (const result of archiveTasks(root, rest)) print(renderArchive(result))
    } else if (command === '--check' && !rest.length) {
      const problems = checkTasks(worktreeTasks(root))
      if (problems.length) {
        console.error(problems.join('\n'))
        process.exitCode = 1
      }
    } else if (command === '--stale' && rest.length < 2 && /^\d*$/.test(rest[0] ?? '')) {
      const now = new Date()
      print(renderStale(staleTasks(loadTasks(root, { now }), { days: Number(rest[0] ?? 3), now }), now))
    } else if (command === undefined) {
      const now = new Date()
      print(renderOverview(overview(loadTasks(root, { now }), { now, ahead: aheadOfMain(root) })))
    } else throw new Error(usage)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
