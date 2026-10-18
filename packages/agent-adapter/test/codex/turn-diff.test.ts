import { afterEach, expect, it, vi } from 'vitest';
import { Harness } from './harness.js';
import { EventRecorder } from '../../src/testing/event-recorder.js';
import { boundNativeDiff, NATIVE_DIFF_LIMIT } from '../../src/core/turn-diff.js';

const harnesses: Harness[] = [];
afterEach(async () => { await Promise.all(harnesses.splice(0).map(h => h.provider.dispose())); });
const setup = () => { const h = new Harness(); harnesses.push(h); return h; };

it('replaces aggregate snapshots and ignores wrong Thread, late Turn and old runtime notifications', async () => {
  const h = setup(), session = await h.session(), events = new EventRecorder(session);
  const first = await h.start(session);
  h.notify(session, 'turn/diff/updated', { diff: 'first' });
  h.notify(session, 'turn/diff/updated', { diff: 'latest' });
  h.notify(session, 'turn/diff/updated', { threadId: 'another-thread', diff: 'wrong' });
  await vi.waitFor(() => expect(events.ofType('turn.diff.updated')).toHaveLength(3));
  expect(events.last('turn.diff.updated')!.diff.patch).toBe('latest');
  expect(events.last('turn.diff.updated')!.diff.nativeTurnId).toBe(first);
  h.complete(session);
  await events.waitFor('turn.completed');
  await h.start(session, 'next');
  h.notify(session, 'turn/diff/updated', { turnId: first, diff: 'late' });
  h.notify(session, 'turn/diff/updated', { diff: 'second-turn' });
  await vi.waitFor(() => expect(events.ofType('turn.diff.updated')).toHaveLength(5));
  expect(events.last('turn.diff.updated')!.diff.patch).toBe('second-turn');
});

it('keeps completion status and per-file patches, replaces duplicate file items and records the actual server version', async () => {
  const h = setup();
  h.configure = server => server.handle('initialize', () => ({ userAgent: 'ai_developer_studio/0.163.0 (macos)' }));
  const session = await h.session(), events = new EventRecorder(session);
  await h.start(session);
  const item = { type: 'fileChange', id: 'file-1', status: 'failed', changes: [{ path: '/tmp/a.txt', kind: { type: 'update', move_path: '/tmp/b.txt' }, diff: '@@\n-old\n+new' }] };
  h.notify(session, 'item/completed', { item });
  h.notify(session, 'item/completed', { item });
  await vi.waitFor(() => expect(events.ofType('turn.diff.updated')).toHaveLength(3));
  expect(events.last('turn.diff.updated')!.diff).toMatchObject({ cliVersion: '0.163.0', state: 'unknown', patch: null,
    files: [{ itemId: 'file-1', path: '/tmp/b.txt', oldPath: '/tmp/a.txt', change: 'rename', status: 'failed', patch: '@@\n-old\n+new' }] });
});

it('distinguishes explicit empty native data from malformed and missing data', async () => {
  const h = setup(), session = await h.session(), events = new EventRecorder(session);
  await h.start(session);
  await vi.waitFor(() => expect(events.ofType('turn.diff.updated')).toHaveLength(1));
  expect(events.last('turn.diff.updated')!.diff).toMatchObject({
    nativeSessionId: session.nativeSessionId, nativeTurnId: expect.any(String),
    source: 'client:native-turn-bound', state: 'unknown', patch: null, files: []
  });
  h.notify(session, 'turn/diff/updated', { diff: '' });
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.state).toBe('empty'));
  h.notify(session, 'turn/diff/updated', { diff: 42 });
  await vi.waitFor(() => expect(events.last('turn.diff.updated')?.diff.state).toBe('failed'));
  expect(session.state).toBe('running');
});

it('keeps concurrent Sessions separate even when the native Turn id is equal', async () => {
  const h = setup(), a = await h.session(), b = await h.session();
  const ea = new EventRecorder(a), eb = new EventRecorder(b);
  await h.start(a); await h.start(b);
  h.notify(a, 'turn/diff/updated', { diff: 'a' }, 0);
  h.notify(b, 'turn/diff/updated', { diff: 'b' }, 1);
  await vi.waitFor(() => expect(ea.last('turn.diff.updated')?.diff.patch).toBe('a'));
  await vi.waitFor(() => expect(eb.last('turn.diff.updated')?.diff.patch).toBe('b'));
  h.notify(a, 'turn/diff/updated', { diff: 'wrong-runtime' }, 1);
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(eb.ofType('turn.diff.updated')).toHaveLength(2);
});

it('bounds aggregate and per-file patches by bytes without breaking Unicode', () => {
  const record = boundNativeDiff({ nativeSessionId: 'thread', nativeTurnId: 'turn', source: 'codex:turn/diff/updated', protocolVersion: 'test', state: 'available', patch: '字'.repeat(NATIVE_DIFF_LIMIT), truncated: false,
    files: [{ itemId: '1', path: 'a', change: 'modify', status: 'completed', patch: '🙂'.repeat(NATIVE_DIFF_LIMIT) }, { itemId: '2', path: 'b', change: 'add', status: 'completed', patch: 'more' }] });
  expect(record.truncated).toBe(true);
  expect(Buffer.byteLength(record.patch!)).toBeLessThanOrEqual(NATIVE_DIFF_LIMIT);
  expect(record.patch).not.toContain('\ufffd');
  expect(record.files[0]!.patch).not.toContain('\ufffd');
  expect(record.files[1]!.patch).toBe('');
});
