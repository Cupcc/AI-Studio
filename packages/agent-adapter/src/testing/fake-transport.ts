import { adapterError, type AdapterError } from '../errors.js';
import { EventStream } from '../core/emitter.js';
import { JsonRpcPeer, type IncomingRequest, type JsonRpcErrorObject, type JsonRpcNotification } from '../core/json-rpc.js';
import type { LineTransport } from '../core/line-transport.js';

/**
 * Two in-memory line transports connected to each other. Delivery is asynchronous
 * (microtask) like real stdio, and closing either side closes both.
 */
export function createLinkedTransports(): [client: LineTransport, server: LineTransport] {
  const a = new MemoryTransport();
  const b = new MemoryTransport();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

class MemoryTransport implements LineTransport {
  peer: MemoryTransport | undefined;
  private readonly lines = new EventStream<string>();
  private readonly closes = new EventStream<{ error?: AdapterError }>();
  private isClosed = false;

  get closed(): boolean {
    return this.isClosed;
  }

  send(line: string): void {
    if (this.isClosed) throw adapterError('invalid_state', 'Transport is closed');
    const target = this.peer;
    queueMicrotask(() => target?.deliver(line));
  }

  onLine(listener: (line: string) => void) {
    return this.lines.subscribe(listener);
  }

  onClose(listener: (info: { error?: AdapterError }) => void) {
    return this.closes.subscribe(listener);
  }

  close(error?: AdapterError): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.closes.emit(error ? { error } : {});
    this.lines.dispose();
    this.closes.dispose();
    const peer = this.peer;
    queueMicrotask(() => peer?.close(error));
  }

  private deliver(line: string): void {
    if (!this.isClosed) this.lines.emit(line);
  }
}

export type ScriptedHandler = (params: unknown, request: IncomingRequest) => unknown | Promise<unknown>;

/** Thrown from a {@link ScriptedHandler} to answer with a JSON-RPC error. */
export class ScriptedRpcError extends Error {
  constructor(readonly error: JsonRpcErrorObject) {
    super(error.message);
  }
}

export interface ReceivedMessage {
  kind: 'request' | 'notification';
  method: string;
  params: unknown;
}

/**
 * Plays the CLI side of a JSON-RPC conversation in unit tests: answers client requests from
 * handlers, pushes notifications and issues server-initiated requests (e.g. approvals).
 */
export class ScriptedJsonRpcServer {
  readonly peer: JsonRpcPeer;
  readonly received: ReceivedMessage[] = [];
  private readonly handlers = new Map<string, ScriptedHandler>();
  private readonly arrivals = new EventStream<ReceivedMessage>();

  constructor(transport: LineTransport) {
    this.peer = new JsonRpcPeer(transport);
    this.peer.onRequest((request) => {
      const message: ReceivedMessage = { kind: 'request', method: request.method, params: request.params };
      this.received.push(message);
      this.arrivals.emit(message);
      void this.dispatch(request);
    });
    this.peer.onNotification((notification: JsonRpcNotification) => {
      const message: ReceivedMessage = { kind: 'notification', method: notification.method, params: notification.params };
      this.received.push(message);
      this.arrivals.emit(message);
    });
  }

  /** Registers (or replaces) the handler for a client request method. */
  handle(method: string, handler: ScriptedHandler): this {
    this.handlers.set(method, handler);
    return this;
  }

  notify(method: string, params?: unknown): void {
    this.peer.notify(method, params);
  }

  /** Server-initiated request; resolves with the client's answer. */
  request<T = unknown>(method: string, params?: unknown, timeoutMs = 5_000): Promise<T> {
    return this.peer.request<T>(method, params, { timeoutMs });
  }

  /** Resolves with the first (already received or future) message matching method and predicate. */
  waitFor(method: string, predicate: (params: unknown) => boolean = () => true, timeoutMs = 5_000): Promise<ReceivedMessage> {
    const found = this.received.find((m) => m.method === method && predicate(m.params));
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(adapterError('timeout', `No ${method} within ${timeoutMs}ms`));
      }, timeoutMs);
      const unsubscribe = this.arrivals.subscribe((message) => {
        if (message.method !== method || !predicate(message.params)) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(message);
      });
    });
  }

  /** Simulates the CLI going away. */
  close(error?: AdapterError): void {
    this.peer.close(error ?? adapterError('runtime_crashed', 'Scripted server closed'));
  }

  private async dispatch(request: IncomingRequest): Promise<void> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      request.respondError({ code: -32601, message: `Method not found: ${request.method}` });
      return;
    }
    let outcome: { result: unknown } | { error: JsonRpcErrorObject };
    try {
      outcome = { result: (await handler(request.params, request)) ?? {} };
    } catch (error) {
      outcome = {
        error:
          error instanceof ScriptedRpcError
            ? error.error
            : { code: -32603, message: error instanceof Error ? error.message : String(error) },
      };
    }
    if (request.responded || this.peer.closed) return;
    try {
      if ('error' in outcome) request.respondError(outcome.error);
      else request.respond(outcome.result);
    } catch {
      // The connection closed while the handler ran.
    }
  }
}
