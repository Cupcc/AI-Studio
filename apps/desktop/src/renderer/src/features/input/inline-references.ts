import type { ContextItem, InlineReference } from '@shared/session/types'

export function sameReference(a: ContextItem, b: ContextItem): boolean {
  return a.type === 'file' && b.type === 'file' ? a.path === b.path
    : a.type === 'skill' && b.type === 'skill' ? a.id === b.id : false
}

/** Preserve positions around one text edit; touching a reference removes its attachment. */
export function editInlineReferences(before: string, after: string, references: readonly InlineReference[]) {
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const oldEnd = before.length - suffix, delta = after.length - before.length
  const kept: InlineReference[] = [], removed: InlineReference[] = []
  for (const ref of references) {
    if (ref.end <= prefix) kept.push(ref)
    else if (ref.start >= oldEnd) kept.push({ ...ref, start: ref.start + delta, end: ref.end + delta })
    else removed.push(ref)
  }
  return { kept, removed }
}
