import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { git } from './check-paths.mjs'

// Deliveries of these types change what a person sees in the app, so their squash commit says how to try them.
export const userFacingTypes = ['feat', 'fix', 'perf']

const commitType = title => /^(\w+)(?:\(.*\))?!?:/.exec(title.trim())?.[1] ?? ''
const tryLines = body => [...body.matchAll(/^体验：[ \t]*(\S.*)$/gm)].map(match => match[1].trim())

export const lacksTryLine = (title, body) => userFacingTypes.includes(commitType(title)) && !tryLines(body).length

export function parseCommit({ sha, date, title, body }) {
  const steps = tryLines(body).filter(line => line !== '无')
  return { sha, date, type: commitType(title), title, tryLines: steps, needsTry: steps.length > 0 || lacksTryLine(title, body) }
}

export function readRange({ base = 'main', head = 'dev', root = process.cwd() } = {}) {
  const short = sha => git(['rev-parse', '--short', sha], root).trim()
  const headSha = git(['rev-parse', '--verify', `${head}^{commit}`], root).trim()
  // Git lists the main checkout first; that is where a person tries dev.
  const checkoutSha = /^HEAD (\S+)$/m.exec(git(['worktree', 'list', '--porcelain'], root))[1]
  const commits = git(['log', '--reverse', '--format=%h%x1f%cs%x1f%s%x1f%b%x1e', `${base}..${head}`, '--'], root)
    .split('\x1e').map(record => record.trim()).filter(Boolean)
    .map(record => {
      const [sha, date, title, body] = record.split('\x1f')
      return parseCommit({ sha, date, title, body })
    })
  return { base, head, headSha, headShort: short(headSha), checkout: { sha: short(checkoutSha), current: checkoutSha === headSha }, commits }
}

export function renderChecklist({ base, head, headSha, headShort, checkout, commits }) {
  if (!commits.length) return `${base}..${head} 没有待验收的提交。`
  const item = commit => [`- [ ] ${commit.sha} ${commit.title}（${commit.date}）`,
    ...(commit.tryLines.length ? commit.tryLines : ['（未记录体验步骤，见提交正文）']).map(line => `  - ${line}`)]
  const section = (heading, lines) => [`## ${heading}`, '', ...(lines.length ? lines : ['（无）']), '']
  return [
    `# 待验收清单（${base}..${head}）`, '',
    `- ${head} 在 \`${headShort}\`，领先 ${base} ${commits.length} 个提交。`,
    checkout.current ? `- 主目录在 \`${checkout.sha}\`，与 ${head} 一致。`
      : `- 主目录在 \`${checkout.sha}\`，不是 ${head} 的最新提交。体验前在主目录运行 \`git switch --detach ${head}\`。`, '',
    ...section('需要体验', commits.filter(commit => commit.needsTry).flatMap(item)),
    ...section('无需体验', commits.filter(commit => !commit.needsTry).map(commit => `- ${commit.sha} ${commit.title}`)),
    '## 推进 main', '',
    `全部通过后，把 main 快进到 \`${headShort}\`：`, '',
    '```sh', 'git fetch origin', `git push origin ${headSha}:refs/heads/main`, 'git fetch origin main:main', '```', '',
    'main 只能拿到从最旧提交开始连续的一段，所以某一项未通过时，它之后的提交要等它修复或撤回后才能推进。'
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' } } })
    console.log(renderChecklist(readRange(values)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
