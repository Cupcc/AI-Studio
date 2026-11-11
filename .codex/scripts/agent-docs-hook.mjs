import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const hash = value => createHash('sha256').update(value).digest('hex')
const isDoc = file => /\.md$/i.test(file) || /^docs\/.*\.html$/i.test(file)
const review = '按 AGENTS.md「文档同步与收尾复核」追踪本次事实变化：核对负责文档、决定记录、路线图各节、验收要求与相关任务的负责人、阻塞条件和状态；按主题/编号/同义表述搜索。修正遗漏，在已有任务或最终回复简述核对范围及保留理由。链接通过不代表语义一致；不要为无影响的文档制造修改。'

// One bounded Git query; only stat dirty documents, never parse their bodies here.
// --no-renames exposes both sides as add/delete, including moves out of docs.
export function changedDocuments(root) {
  const status = execFileSync('git', ['--no-optional-locks', 'status', '--porcelain=v2',
    '-z', '--untracked-files=all', '--no-renames'], {
    cwd: root, encoding: 'utf8', timeout: 1500, maxBuffer: 2 * 1024 * 1024
  })
  const documents = {}
  for (const entry of status.split('\0')) {
    const file = entry.startsWith('? ') ? entry.slice(2)
      : entry.startsWith('1 ') ? entry.split(' ').slice(8).join(' ')
        : entry.startsWith('u ') ? entry.split(' ').slice(10).join(' ') : ''
    if (!isDoc(file)) continue
    try {
      const stat = statSync(path.join(root, file), { bigint: true })
      documents[file] = `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.ino}`
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
      documents[file] = 'deleted'
    }
  }
  return documents
}

function context(message, event = 'PostToolUse') {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: message } }
}

export function handleHook(input, { root = repository } = {}) {
  const event = input.hook_event_name
  if (!['SessionStart', 'PostToolUse'].includes(event)) return {}
  // Never merge unrelated sessions into a fallback state file.
  if (typeof input.session_id !== 'string' || !input.session_id) throw new Error('Missing session_id')
  const directory = path.join(root, '.runtime/agent-docs-hook')
  const stateFile = path.join(directory, `${hash(input.session_id)}.json`)
  let state = { documents: {}, notified: false, baselined: false }
  try {
    const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
    state = { documents: saved.documents, notified: saved.notified, baselined: saved.baselined }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (event === 'SessionStart' && state.baselined) return {}
  const previous = JSON.stringify(state)
  const current = changedDocuments(root)
  if (event === 'SessionStart') {
    state.documents = current
    state.baselined = true
  }
  let output = {}
  if (event === 'PostToolUse' && !state.notified && JSON.stringify(state.documents) !== JSON.stringify(current)) {
    const paths = [...new Set([...Object.keys(state.documents), ...Object.keys(current)])]
      .filter(file => state.documents[file] !== current[file]).slice(0, 6).map(file => JSON.stringify(file)).join('、')
    output = context(`检测到本会话中的文档工作树变化：${paths || '文档被还原或移除'}。${review}`)
    state.notified = true
  }
  state.documents = current
  if (JSON.stringify(state) !== previous) {
    mkdirSync(directory, { recursive: true })
    const temporary = `${stateFile}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 })
    renameSync(temporary, stateFile)
  }
  return output
}

export function hookFailure(input) {
  const message = '文档变更提醒未完成。请按 AGENTS.md 手动复核文档；链接检查使用 pnpm check:docs。'
  if (input.hook_event_name === 'PostToolUse') return context(message)
  if (input.hook_event_name === 'SessionStart') return context(message, 'SessionStart')
  return {}
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let input = {}
  try {
    input = JSON.parse(readFileSync(0, 'utf8'))
    process.stdout.write(JSON.stringify(handleHook(input)))
  } catch (error) {
    console.error(`Document hook: ${error.code ?? error.name}; manual review required.`)
    process.stdout.write(JSON.stringify(hookFailure(input)))
  }
}
