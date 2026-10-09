import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createStreamLineTransport, LineSplitter } from '../../src/core/line-transport.js';

describe('LineSplitter', () => {
  it('splits across chunk boundaries, strips CR and keeps multi-byte characters intact', () => {
    const lines: string[] = [];
    const splitter = new LineSplitter((line) => lines.push(line));
    const bytes = Buffer.from('{"a":"中文"}\r\n{"b":2}\npartial', 'utf8');
    // Split inside the first multi-byte character.
    splitter.push(bytes.subarray(0, 8));
    splitter.push(bytes.subarray(8));
    expect(lines).toEqual(['{"a":"中文"}', '{"b":2}']);
    splitter.end();
    expect(lines).toEqual(['{"a":"中文"}', '{"b":2}', 'partial']);
  });

  it('reports overflow for unterminated lines beyond the limit', () => {
    const overflows: number[] = [];
    const splitter = new LineSplitter(() => {}, { maxLineChars: 10, onOverflow: (n) => overflows.push(n) });
    splitter.push('x'.repeat(11));
    expect(overflows).toEqual([11]);
  });
});

describe('createStreamLineTransport', () => {
  it('sends newline-terminated lines and closes when the input ends', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = createStreamLineTransport(input, output);
    const received: string[] = [];
    transport.onLine((line) => received.push(line));
    const closed = new Promise<{ error?: unknown }>((resolve) => transport.onClose(resolve));

    transport.send('hello');
    expect(output.read()?.toString()).toBe('hello\n');

    input.write('one\ntwo');
    input.end('\n');
    const info = await closed;
    expect(received).toEqual(['one', 'two']);
    expect(info.error).toBeUndefined();
    expect(transport.closed).toBe(true);
    expect(() => transport.send('late')).toThrow(/closed/);
  });

  it('closes with a protocol error when a line is too long', async () => {
    const input = new PassThrough();
    const transport = createStreamLineTransport(input, new PassThrough(), { maxLineChars: 4 });
    const closed = new Promise<{ error?: { code?: string } }>((resolve) => transport.onClose(resolve));
    input.write('abcdefgh');
    expect((await closed).error?.code).toBe('protocol_error');
  });
});
