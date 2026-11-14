import { expect, it } from 'vitest';
import { mapItem } from '../../src/codex/mapping.js';
import { ClaudeMessages } from '../../src/claude/messages.js';
import { ITEM_DIFF_LIMIT, type ItemSnapshot } from '../../src/types.js';
import type { SessionSink } from '../../src/core/session-controller.js';
import type { ThreadItem } from '../../src/codex/protocol/v2/ThreadItem.js';

it('keeps the Codex label of commentary and of the final answer, and leaves other text unlabelled', () => {
  const message = (phase: string | null) => mapItem({ type: 'agentMessage', id: 'm', text: 'hi', phase } as unknown as ThreadItem, true);
  expect(message('commentary')).toMatchObject({ kind: 'assistant_message', phase: 'commentary' });
  expect(message('final_answer')).toMatchObject({ phase: 'final_answer' });
  expect(message('partial_answer')).not.toHaveProperty('phase');
  expect(message(null)).not.toHaveProperty('phase');
});

it('carries each Codex file patch on the item and caps a long one', () => {
  const item = mapItem({ type: 'fileChange', id: 'f', status: 'completed', changes: [
    { path: 'a.ts', kind: { type: 'update', move_path: null }, diff: '@@ -1 +1 @@\n-old\n+new\n' },
    { path: 'big.ts', kind: { type: 'add' }, diff: '+'.repeat(ITEM_DIFF_LIMIT + 5) },
    { path: 'gone.ts', kind: { type: 'delete' }, diff: '' }
  ] } as unknown as ThreadItem, true)!;
  expect(item.files).toEqual([
    { path: 'a.ts', change: 'modify', diff: '@@ -1 +1 @@\n-old\n+new\n' },
    { path: 'big.ts', change: 'add', diff: '+'.repeat(ITEM_DIFF_LIMIT), diffTruncated: true },
    { path: 'gone.ts', change: 'delete' }
  ]);
});

it('shows a Claude edit as the lines it replaced and the lines it wrote', () => {
  const started: ItemSnapshot[] = [];
  const messages = new ClaudeMessages({ itemStarted: (_turn: string, item: ItemSnapshot) => { started.push(item); } } as unknown as SessionSink, 't');
  const tool = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input });
  messages.accept({ type: 'assistant', uuid: 'u', parent_tool_use_id: null, message: { id: 'msg', model: 'm', content: [
    tool('e', 'Edit', { file_path: '/p/a.ts', old_string: 'one\ntwo', new_string: 'three' }),
    tool('w', 'Write', { file_path: '/p/b.ts', content: 'x\ny' }),
    tool('m', 'MultiEdit', { file_path: '/p/c.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: '' }] }),
    tool('n', 'NotebookEdit', { path: '/p/n.ipynb' })
  ] } } as never);
  expect(started.map((item) => item.files?.[0])).toEqual([
    { path: '/p/a.ts', change: 'unknown', diff: '-one\n-two\n+three' },
    { path: '/p/b.ts', change: 'unknown', diff: '+x\n+y' },
    { path: '/p/c.ts', change: 'unknown', diff: '-a\n+b\n@@\n-c' },
    { path: '/p/n.ipynb', change: 'unknown' }
  ]);
});
