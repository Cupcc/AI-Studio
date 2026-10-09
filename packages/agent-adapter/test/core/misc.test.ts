import { describe, expect, it } from 'vitest';
import { AsyncQueue } from '../../src/core/async-queue.js';
import { withTimeout } from '../../src/core/async.js';
import { redactDeep, redactSecrets } from '../../src/core/redact.js';
import { buildAvailabilityReport, failed, ok, skipped } from '../../src/availability.js';
import { AdapterError, toAdapterError } from '../../src/errors.js';
import { acceptsFreeTextAnswer, type QuestionRequest } from '../../src/types.js';

describe('AsyncQueue', () => {
  it('delivers pushed values to waiting and later readers, then ends', async () => {
    const queue = new AsyncQueue<number>();
    const iterator = queue[Symbol.asyncIterator]();
    const first = iterator.next();
    queue.push(1);
    queue.push(2);
    expect(await first).toEqual({ value: 1, done: false });
    queue.end();
    expect(await iterator.next()).toEqual({ value: 2, done: false });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
    expect(() => queue.push(3)).toThrow(/ended/);
  });

  it('rejects pending readers on fail', async () => {
    const queue = new AsyncQueue<number>();
    const pending = queue[Symbol.asyncIterator]().next();
    queue.fail(new Error('gone'));
    await expect(pending).rejects.toThrow('gone');
  });
});

describe('withTimeout', () => {
  it('aborts the work signal and rejects with a timeout AdapterError', async () => {
    let aborted = false;
    const error = await withTimeout(
      (signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve(undefined);
          });
        }),
      10,
      'Work',
    )
      .then(() => undefined)
      .catch((e: unknown) => e);
    expect((error as AdapterError).code).toBe('timeout');
    expect(aborted).toBe(true);
  });
});

describe('redaction', () => {
  it('removes tokens, keys and emails', () => {
    expect(redactSecrets('Bearer abc.def user@example.com sk-abcdefghij')).toBe('Bearer [redacted] [redacted-email] [redacted]');
    expect(redactDeep({ apiKey: 'x', nested: { email: 'a@b.co', text: 'mail me at a@b.co' } })).toEqual({
      apiKey: '[redacted]',
      nested: { email: '[redacted]', text: 'mail me at [redacted-email]' },
    });
  });
});

describe('availability summary', () => {
  const exe = ok({ path: '/x/codex', source: 'path' as const });
  const version = ok({ version: '0.161.0', raw: 'codex-cli 0.161.0', compatibility: 'tested' as const });
  const models = skipped<{ models: [] }>('not requested');

  it('reports not installed, not logged in, unsupported version and available separately', () => {
    expect(
      buildAvailabilityReport('codex', {
        executable: failed({ code: 'not_installed', message: 'codex not found on PATH' }),
        version: skipped('no executable'),
        login: skipped('no executable'),
        models,
      }).status,
    ).toBe('not_installed');
    expect(buildAvailabilityReport('codex', { executable: exe, version, login: ok({ state: 'logged_out' }), models }).status).toBe(
      'not_logged_in',
    );
    expect(
      buildAvailabilityReport('codex', {
        executable: exe,
        version: ok({ version: '0.100.0', raw: '', compatibility: 'unsupported', testedVersions: '0.161.x' }),
        login: ok({ state: 'logged_in' }),
        models,
      }),
    ).toMatchObject({ status: 'unsupported_version', reason: { code: 'unsupported_version' } });
    const available = buildAvailabilityReport('codex', {
      executable: exe,
      version: ok({ version: '0.162.0', raw: '', compatibility: 'untested' }),
      login: ok({ state: 'logged_in' }),
      models: failed({ code: 'timeout', message: 'model/list timed out' }),
    });
    expect(available.status).toBe('available');
    expect(available.reason).toBeUndefined();
  });
});

describe('errors and helpers', () => {
  it('normalizes thrown values', () => {
    expect(toAdapterError(new Error('x'), 'provider_error').code).toBe('provider_error');
    const original = new AdapterError({ code: 'auth_required', message: 'login', native: { source: 'codex' } });
    expect(toAdapterError(original)).toBe(original);
    expect(JSON.parse(JSON.stringify(original))).toEqual({ code: 'auth_required', message: 'login', native: { source: 'codex' } });
  });

  it('decides which requests take composer text as an answer', () => {
    const question = (count: number, allowFreeText: boolean): QuestionRequest => ({
      kind: 'question',
      requestId: 'r',
      turnId: 't',
      createdAt: 0,
      nativeType: 'q',
      questions: Array.from({ length: count }, (_, i) => ({
        id: `q${i}`,
        prompt: 'p',
        options: [],
        multiSelect: false,
        allowFreeText,
        secret: false,
      })),
    });
    expect(acceptsFreeTextAnswer(question(1, true))).toBe(true);
    expect(acceptsFreeTextAnswer(question(1, false))).toBe(false);
    expect(acceptsFreeTextAnswer(question(2, true))).toBe(false);
  });
});
