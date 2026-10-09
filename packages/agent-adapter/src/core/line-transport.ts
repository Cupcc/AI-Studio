import { StringDecoder } from 'node:string_decoder';
import type { Readable, Writable } from 'node:stream';
import { adapterError, type AdapterError } from '../errors.js';
import { EventStream, type Unsubscribe } from './emitter.js';

/** Newline-delimited text channel. Implemented over process stdio or in memory for tests. */
export interface LineTransport {
  readonly closed: boolean;
  /** Writes one line (a trailing newline is added). Throws `invalid_state` once closed. */
  send(line: string): void;
  onLine(listener: (line: string) => void): Unsubscribe;
  /** Fires once when the channel closes; `error` is set when it closed abnormally. */
  onClose(listener: (info: { error?: AdapterError }) => void): Unsubscribe;
  close(error?: AdapterError): void;
}

export const DEFAULT_MAX_LINE_CHARS = 64 * 1024 * 1024;

/**
 * Splits a byte stream into lines. Handles chunk boundaries inside multi-byte UTF-8
 * characters and CRLF endings; a line longer than `maxLineChars` raises `onOverflow`.
 */
export class LineSplitter {
  private readonly decoder = new StringDecoder('utf8');
  private buffer = '';

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly options: { maxLineChars?: number; onOverflow?: (length: number) => void } = {},
  ) {}

  push(chunk: Buffer | string): void {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    let start = 0;
    let index = this.buffer.indexOf('\n', start);
    while (index >= 0) {
      let line = this.buffer.slice(start, index);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      start = index + 1;
      this.onLine(line);
      index = this.buffer.indexOf('\n', start);
    }
    if (start > 0) this.buffer = this.buffer.slice(start);
    const max = this.options.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
    if (this.buffer.length > max) {
      const length = this.buffer.length;
      this.buffer = '';
      this.options.onOverflow?.(length);
    }
  }

  /** Emits any trailing unterminated line. */
  end(): void {
    this.buffer += this.decoder.end();
    if (this.buffer.length > 0) {
      const line = this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer;
      this.buffer = '';
      this.onLine(line);
    }
  }
}

/**
 * Line transport over a writable/readable pair (e.g. a runtime's stdin/stdout). The transport
 * closes when stdout ends or errors, or when `close()` is called; it does not own the process.
 */
export function createStreamLineTransport(
  input: Readable,
  output: Writable,
  options: { maxLineChars?: number } = {},
): LineTransport {
  const lines = new EventStream<string>();
  const closes = new EventStream<{ error?: AdapterError }>();
  let closed = false;
  let closeInfo: { error?: AdapterError } | undefined;

  const close = (error?: AdapterError) => {
    if (closed) return;
    closed = true;
    closeInfo = error ? { error } : {};
    input.off('data', onData);
    input.off('end', onEnd);
    input.off('close', onEnd);
    input.off('error', onError);
    output.off('error', onOutputError);
    closes.emit(closeInfo);
    lines.dispose();
    closes.dispose();
  };

  const splitter = new LineSplitter((line) => lines.emit(line), {
    ...(options.maxLineChars === undefined ? {} : { maxLineChars: options.maxLineChars }),
    onOverflow: (length) =>
      close(adapterError('protocol_error', `Line exceeded ${options.maxLineChars ?? DEFAULT_MAX_LINE_CHARS} chars (${length})`)),
  });
  const onData = (chunk: Buffer | string) => splitter.push(chunk);
  const onEnd = () => {
    splitter.end();
    close();
  };
  const onError = (error: Error) => close(adapterError('runtime_crashed', `stdout error: ${error.message}`, { cause: error }));
  const onOutputError = (error: Error) => close(adapterError('runtime_crashed', `stdin error: ${error.message}`, { cause: error }));

  input.on('data', onData);
  input.on('end', onEnd);
  input.on('close', onEnd);
  input.on('error', onError);
  output.on('error', onOutputError);

  return {
    get closed() {
      return closed;
    },
    send(line: string) {
      if (closed || output.destroyed || output.writableEnded) {
        throw adapterError('invalid_state', 'Transport is closed');
      }
      output.write(`${line}\n`);
    },
    onLine(listener) {
      return lines.subscribe(listener);
    },
    onClose(listener) {
      if (closed) {
        const info = closeInfo ?? {};
        queueMicrotask(() => listener(info));
        return () => {};
      }
      return closes.subscribe(listener);
    },
    close,
  };
}
