import type { TranscriptItem } from '@shared/session/types'

// A turn as the conversation shows it (Shell Spec v02 §6): the user message, the process the agent
// went through, the reply, and the turn's footer. The transcript itself stays a flat, ordered list.

type Of<K extends TranscriptItem['kind']> = Extract<TranscriptItem, { kind: K }>
export type UserItem = Of<'user_message'>
export type AgentItem = Of<'agent_message'>
export type StepItem = Of<'tool_activity'>
export type RequestItem = Of<'input_request'>
export type ErrorItem = Of<'error'>
export type TurnEndItem = Of<'turn_end'>

export type StepVerb = 'think' | 'plan' | 'read' | 'list' | 'search' | 'edit' | 'run' | 'fetch' | 'tool' | 'agent' | 'other'

export type ProcessEntry =
  | { type: 'step'; item: StepItem }
  /** Consecutive reads, listings and searches: one counted row. */
  | { type: 'group'; key: string; items: StepItem[] }
  /** Text the agent wrote between steps. */
  | { type: 'commentary'; item: AgentItem }
  /** An answered or cancelled request; a pending one stays outside the process. */
  | { type: 'request'; item: RequestItem }

export interface TurnBlock {
  key: string
  user: UserItem | null
  entries: ProcessEntry[]
  /** Steps the agent took: thinking and tool activity, not its commentary or the requests. */
  steps: number
  answers: AgentItem[]
  pending: RequestItem[]
  errors: ErrorItem[]
  end: TurnEndItem | null
  startedAt: number
}

export function stepVerb(item: StepItem): StepVerb {
  const tool = item.item
  if (tool.kind === 'reasoning') return 'think'
  if (tool.kind === 'plan') return 'plan'
  if (tool.activity) return tool.activity.verb
  return tool.kind === 'command' ? 'run' : tool.kind === 'file_change' ? 'edit' : tool.kind === 'web_search' ? 'search' : tool.kind === 'tool_call' ? 'tool' : 'other'
}

/** Thinking the CLI did not publish has nothing to show once it has finished. */
export function stepVisible(item: StepItem): boolean {
  return item.item.kind !== 'reasoning' || item.item.status === 'in_progress' || !!item.item.text?.trim()
}

const EXPLORING: ReadonlySet<StepVerb> = new Set(['read', 'list', 'search'])

function buildBlock(items: TranscriptItem[]): TurnBlock {
  const first = items[0]!
  const user = first.kind === 'user_message' ? first : null
  const body = user ? items.slice(1) : items
  const isStep = (item: TranscriptItem) => (item.kind === 'tool_activity' && stepVisible(item)) || item.kind === 'input_request'
  const lastStep = body.findLastIndex(isStep)
  const end = body.findLast((item): item is TurnEndItem => item.kind === 'turn_end') ?? null
  const messages = body.flatMap((item, index) => item.kind === 'agent_message' && item.text.trim() ? [{ item, index }] : [])
  // The CLI's own label wins; without one, text after the last step is the reply (session spec §3.2).
  const labelled = messages.some(({ item }) => item.phase === 'final_answer')
  let answers = messages.filter(({ item, index }) => labelled ? item.phase === 'final_answer' : index > lastStep && item.phase !== 'commentary')
  // A completed turn always shows a reply: its closing text whatever the label, else the last thing it said.
  // A stopped turn shows only what it had started to reply.
  if (!answers.length && end?.outcome === 'completed') {
    const closing = messages.filter(({ index }) => index > lastStep)
    answers = closing.length ? closing : messages.slice(-1)
  }
  const answered = new Set(answers.map(({ item }) => item.id))

  const entries: ProcessEntry[] = []
  let steps = 0
  for (const item of body) {
    if (item.kind === 'tool_activity' && stepVisible(item)) {
      steps++
      const previous = entries.at(-1)
      if (EXPLORING.has(stepVerb(item)) && previous?.type === 'step' && EXPLORING.has(stepVerb(previous.item))) entries[entries.length - 1] = { type: 'group', key: previous.item.id, items: [previous.item, item] }
      else if (EXPLORING.has(stepVerb(item)) && previous?.type === 'group') previous.items.push(item)
      else entries.push({ type: 'step', item })
    } else if (item.kind === 'agent_message' && item.text.trim() && !answered.has(item.id)) entries.push({ type: 'commentary', item })
    else if (item.kind === 'input_request' && item.resolution) entries.push({ type: 'request', item })
  }
  return {
    key: first.id, user, entries, steps, end, startedAt: first.at,
    answers: answers.map(({ item }) => item),
    pending: body.filter((item): item is RequestItem => item.kind === 'input_request' && !item.resolution),
    errors: body.filter((item): item is ErrorItem => item.kind === 'error')
  }
}

/** Every user message opens a block, so input sent while a turn runs starts a new one. */
export function buildTurns(items: readonly TranscriptItem[]): TurnBlock[] {
  const blocks: TranscriptItem[][] = []
  for (const item of items) {
    if (item.kind === 'user_message' || !blocks.length) blocks.push([item])
    else blocks.at(-1)!.push(item)
  }
  return blocks.map(buildBlock)
}
