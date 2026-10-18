import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
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
    '--branch', '-z', '--untracked-files=all', '--no-renames'], {
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
  // Include HEAD and changed path membership: link targets can be non-Markdown.
  return { documents, key: hash(status + JSON.stringify(documents)) }
}

export function runLinkCheck(root, { timeout = 8000, script = path.join(repository, 'scripts/check-docs.mjs') } = {}) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 128 * 1024
  })
  const ok = !result.error && result.status === 0
  const detail = result.error?.code === 'ETIMEDOUT' ? '链接检查超时，未完成。'
    : result.error ? `链接检查未完成：${result.error.code}`
      : `${result.stderr ?? ''}\n${result.stdout ?? ''}`.trim().slice(0, 1200)
  return { ok, detail }
}

function context(message, event = 'PostToolUse') {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: message } }
}

export function handleHook(input, { root = repository, check = runLinkCheck } = {}) {
  const event = input.hook_event_name
  if (!['SessionStart', 'PostToolUse', 'Stop'].includes(event)) return {}
  // Never merge unrelated sessions into a fallback state file.
  if (typeof input.session_id !== 'string' || !input.session_id) throw new Error('Missing session_id')
  const directory = path.join(root, '.runtime/agent-docs-hook')
  const stateFile = path.join(directory, `${hash(input.session_id)}.json`)
  let state = { documents: {}, key: '', pending: false, notified: false, baselined: false }
  try { state = { ...state, ...JSON.parse(readFileSync(stateFile, 'utf8')) } } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const previous = JSON.stringify(state)
  const current = changedDocuments(root)
  if (event === 'SessionStart') {
    // Baseline existing worktree changes so a new session does not pay for a
    // full link check unless it changes documentation itself.
    if (!state.baselined) {
      state.documents = current.documents
      state.key = current.key
      state.pending = false
      state.notified = false
      state.checkedKey = undefined
      state.result = undefined
      state.blockedTurn = undefined
      state.baselined = true
    }
  } else if (JSON.stringify(state.documents) !== JSON.stringify(current.documents)) {
    state.pending = true
  }
  state.documents = current.documents
  state.key = current.key
  let output = {}
  if (state.pending && event === 'PostToolUse' && !state.notified) {
    const paths = Object.keys(current.documents).slice(0, 6).map(file => JSON.stringify(file)).join('、')
    output = context(`检测到本会话中的文档工作树变化：${paths || '文档被还原或移除'}。${review}`)
    state.notified = true
  }
  if (state.pending && event === 'Stop') {
    if (state.checkedKey !== current.key) {
      state.result = check(root)
      state.checkedKey = current.key
    }
    if ((!state.notified || !state.result.ok) && !input.stop_hook_active
      && (!input.turn_id || state.blockedTurn !== input.turn_id)) {
      output = { decision: 'block', reason: `${state.result.ok ? '链接检查通过。' : '链接检查失败或未完成。'} ${state.result.detail}\n${review}\n请完成复核；如检查未完成且无法修复，在最终回复明确原因和影响，不报告为全部通过。相同版本不自动重跑检查，此 hook 最多要求一次续跑。` }
      state.notified = true
      state.blockedTurn = input.turn_id
    } else {
      // A Stop continuation must always be able to finish, even if checks fail.
      state.pending = false
      state.notified = false
    }
  }
  if (JSON.stringify(state) !== previous) {
    mkdirSync(directory, { recursive: true })
    const temporary = `${stateFile}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 })
    renameSync(temporary, stateFile)
  }
  return output
}

export function hookFailure(input) {
  const message = '文档 hook 检测或状态存储失败，不能视为复核通过。请按 AGENTS.md 手动复核并运行 pnpm check:docs；无法完成时在最终回复列明原因。'
  if (input.hook_event_name === 'PostToolUse') return context(message)
  if (input.hook_event_name === 'SessionStart') return context(message, 'SessionStart')
  if (input.hook_event_name === 'Stop' && !input.stop_hook_active) return { decision: 'block', reason: message }
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
