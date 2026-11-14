import { countDiffLines, formatDuration } from '@shared/session/presentation'
import { displayName } from '../../lib/display-path'
import { stepVerb, type StepItem, type StepVerb } from './turns'

// How one step of the process reads as a single row (Shell Spec v02 §6): an icon, a verb, what it
// acted on, and the outcome on the right. Wording lives here so rows, groups and the live header agree.

export interface PathParts { name: string; directory: string }

/** File name first, then its directory, relative to the project when the path is inside it. */
export function pathParts(path: string, roots: readonly string[]): PathParts {
  const root = roots.find((value) => value && path.startsWith(`${value}/`))
  const relative = root ? path.slice(root.length + 1) : path
  const cut = relative.lastIndexOf('/')
  return { name: displayName(cut < 0 ? relative : relative.slice(cut + 1)), directory: displayName(cut < 0 ? '' : relative.slice(0, cut)) }
}

export interface StepView {
  icon: string
  verb: string
  /** What the step acted on. `code` text is a command, a query or a pattern and uses the code face. */
  target?: { text: string; code: boolean; path?: PathParts }
  /** First line of the thinking or the plan. */
  preview?: string
  additions?: number
  deletions?: number
  /** Shown only for a problem: the exit code or the terminal status. */
  problem?: string
  duration?: string
  failed: boolean
  running: boolean
  detail: boolean
}

const ICONS: Record<StepVerb, string> = { think: 'thought', plan: 'view-list', read: 'file', list: 'files', search: 'search', edit: 'pencil', run: 'terminal', fetch: 'globe', tool: 'plug', agent: 'agent-team', other: 'dots' }
const VERBS: Record<StepVerb, string> = { think: '思考', plan: '计划', read: '读取', list: '列出', search: '搜索', edit: '编辑', run: '运行', fetch: '获取', tool: '工具', agent: '子 Agent', other: '' }
const EDIT_VERBS: Record<string, string> = { add: '新建', delete: '删除', rename: '重命名' }

/** First readable line of Markdown: emphasis, headings and code marks are noise in a one-line preview. */
export function firstLine(text: string): string {
  const line = text.split('\n').map((value) => value.trim()).find(Boolean) ?? ''
  return line.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '').replace(/\*\*|__|`/g, '')
}

export function diffTotals(item: StepItem): { additions: number; deletions: number } | null {
  const diffs = (item.item.files ?? []).flatMap((file) => file.diff ? [file.diff] : [])
  if (!diffs.length) return null
  return diffs.map(countDiffLines).reduce((sum, next) => ({ additions: sum.additions + next.additions, deletions: sum.deletions + next.deletions }))
}

export function describeStep(item: StepItem, roots: readonly string[]): StepView {
  const tool = item.item, verb = stepVerb(item)
  const running = tool.status === 'in_progress'
  const exitCode = tool.command?.exitCode
  const failed = tool.status === 'failed' || (typeof exitCode === 'number' && exitCode !== 0)
  const elapsed = item.endedAt === undefined ? 0 : item.endedAt - item.at
  const view: StepView = {
    icon: ICONS[verb], verb: VERBS[verb], failed, running, detail: false,
    ...(elapsed >= 1000 ? { duration: formatDuration(elapsed) } : {}),
    ...(typeof exitCode === 'number' && exitCode !== 0 ? { problem: `退出码 ${exitCode}` } : tool.status === 'declined' ? { problem: '已拒绝' } : tool.status === 'interrupted' ? { problem: '已中断' } : {})
  }
  const target = tool.activity?.target
  const asPath = (path: string) => ({ text: path, code: true, path: pathParts(path, roots) })

  if (verb === 'think' || verb === 'plan') {
    const text = tool.text?.trim() ?? ''
    if (verb === 'think' && running) view.verb = '正在思考'
    view.preview = firstLine(text)
    view.detail = !!text
    return view
  }
  if (verb === 'edit') {
    const files = tool.files ?? []
    const kinds = new Set(files.map((file) => file.change))
    const action = (kinds.size === 1 && EDIT_VERBS[files[0]!.change]) || '编辑'
    if (files.length > 1) view.verb = `${action}了 ${files.length} 个文件`
    else {
      view.verb = action
      const path = files[0]?.path ?? target
      if (path) view.target = asPath(path)
    }
    const totals = diffTotals(item)
    if (totals) { view.additions = totals.additions; view.deletions = totals.deletions }
    view.detail = files.length > 1 || !!totals || !!tool.error
  } else if (tool.command) {
    // Codex reads, lists and searches through shell commands; the row names what they looked at.
    if (verb === 'run' || !target || target === tool.command.command) view.target = { text: tool.command.command, code: true }
    else view.target = verb === 'search' ? { text: target, code: true } : asPath(target)
    view.detail = true
  } else {
    const label = tool.activity?.label ?? tool.tool?.name ?? tool.text ?? tool.nativeType ?? ''
    if (verb === 'read' || verb === 'list') view.target = target ? asPath(target) : { text: label, code: false }
    else if (verb === 'search' || verb === 'fetch') view.target = { text: target ?? label, code: true }
    else view.target = { text: label, code: false }
    if (tool.kind === 'web_search') { view.icon = 'globe'; view.verb = '网页搜索' }
    // A lookup's arguments repeat its row; a tool call's arguments and result are the detail.
    const lookup = verb === 'read' || verb === 'list' || verb === 'search'
    view.detail = tool.tool?.result !== undefined || !!tool.error || (!lookup && tool.tool?.input !== undefined) || (verb === 'other' && !!tool.text && tool.text !== label)
  }
  if (failed && view.verb && !view.verb.includes('了')) view.verb = `${view.verb}失败`
  return view
}

/** "搜索 2 次，读取了 3 个文件": the counts of a run of lookups, in the order they first happened. */
export function groupLabel(items: readonly StepItem[]): string {
  const counts = new Map<StepVerb, number>()
  for (const item of items) counts.set(stepVerb(item), (counts.get(stepVerb(item)) ?? 0) + 1)
  return [...counts].map(([verb, count]) => verb === 'read' ? `读取了 ${count} 个文件` : verb === 'list' ? `列出 ${count} 次目录` : `搜索 ${count} 次`).join('，')
}

const LIVE_VERBS: Record<StepVerb, string> = { think: '正在思考', plan: '正在制定计划', read: '正在读取', list: '正在列出', search: '正在搜索', edit: '正在编辑', run: '正在运行', fetch: '正在获取', tool: '正在调用', agent: '正在运行子 Agent', other: '正在执行' }

/** What the agent is doing right now, for the header of a running turn. */
export function liveLabel(item: StepItem, roots: readonly string[]): string {
  const verb = stepVerb(item), view = describeStep(item, roots)
  if (verb === 'think' || verb === 'plan') return LIVE_VERBS[verb]
  return `${LIVE_VERBS[verb]} ${view.target?.path?.name ?? view.target?.text ?? ''}`.trim()
}
