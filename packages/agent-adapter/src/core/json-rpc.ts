import { adapterError, type AdapterError, toAdapterError } from '../errors.js';
import { EventStream, type Unsubscribe } from './emitter.js';
import type { LineTransport } from './line-transport.js';

export type JsonRpcId = string | number;

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

/** A well-formed error response from the remote side. Providers map it to an AdapterError code. */
export class JsonRpcRemoteError extends Error {
  readonly code: number;
  readonly data: unknown;
  readonly method: string;

  constructor(method: string, error: JsonRpcErrorObject) {
    super(error.message);
    this.name = 'JsonRpcRemoteError';
    this.code = error.code;
    this.data = error.data;
    this.method = method;
  }
}

/** A server-initiated request that may be answered once or dismissed by the remote side. */
export interface IncomingRequest {
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params: unknown;
  readonly receivedAt: number;
  /** True after a local response or remote dismissal; callbacks can no longer answer it. */
  readonly responded: boolean;
  respond(result: unknown): void;
  respondError(error: JsonRpcErrorObject): void;
}

export interface JsonRpcNotification {
  method: string;
  params: unknown;
}

export interface JsonRpcPeerOptions {
  /** Add `"jsonrpc": "2.0"` to outgoing messages. Codex App Server omits the field. Default false. */
  includeVersion?: boolean;
  /** Default per-request timeout. Default 60 s. */
  defaultTimeoutMs?: number;
  /** Malformed input; the connection stays open. */
  onProtocolError?: (error: AdapterError, raw: string) => void;
  /** A response arrived for an id that is no longer pending (timed out or aborted). */
  onLateResponse?: (id: JsonRpcId, message: unknown) => void;
  /** Observes every decoded inbound and outbound message (for filtered evidence logs). */
  trace?: (direction: 'in' | 'out', message: unknown) => void;
}

export const JSON_RPC_METHOD_NOT_FOUND = -32601;

interface PendingRequest {
  method: string;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cleanup(): void;
}

interface PendingIncomingRequest {
  request: IncomingRequest;
  dismiss(): void;
}

/**
 * Newline-delimited JSON-RPC peer: outgoing requests with bookkeeping and timeouts,
 * notifications in both directions, and server-initiated requests that are tracked
 * until answered. All pending work fails when the transport closes.
 */
export class JsonRpcPeer {
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly abandoned = new Set<JsonRpcId>();
  private readonly incoming = new Map<JsonRpcId, PendingIncomingRequest>();
  private readonly notifications = new EventStream<JsonRpcNotification>();
  private readonly requests = new EventStream<IncomingRequest>();
  private readonly closes = new EventStream<{ error: AdapterError }>();
  private closeError: AdapterError | undefined;
  private readonly unsubscribers: Unsubscribe[] = [];

  constructor(
    private readonly transport: LineTransport,
    private readonly options: JsonRpcPeerOptions = {},
  ) {
    this.unsubscribers.push(transport.onLine((line) => this.handleLine(line)));
    this.unsubscribers.push(
      transport.onClose(({ error }) =>
        this.shutdown(error ?? adapterError('runtime_crashed', 'Connection closed by the runtime')),
      ),
    );
  }

  get closed(): boolean {
    return this.closeError !== undefined;
  }

  get pendingRequestCount(): number {
    return this.pending.size;
  }

  /** Server-initiated requests that have not been answered or dismissed yet. */
  get pendingIncoming(): IncomingRequest[] {
    return [...this.incoming.values()].map((entry) => entry.request);
  }

  /**
   * Retires a request resolved by the remote side without sending a response.
   * Returns false for an unknown or already settled id. Captured callbacks become invalid.
   */
  dismissIncoming(id: JsonRpcId): boolean {
    const entry = this.incoming.get(id);
    if (!entry) return false;
    entry.dismiss();
    this.incoming.delete(id);
    return true;
  }

  request<T = unknown>(
    method: string,
    params?: unknown,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    if (this.closeError) return Promise.reject(this.closeError);
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? this.options.defaultTimeoutMs ?? 60_000;
      const timer = setTimeout(() => {
        this.abandon(id);
        reject(adapterError('timeout', `Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onAbort = () => {
        this.abandon(id);
        reject(options.signal?.reason ?? adapterError('timeout', `Request ${method} aborted`));
      };
      if (options.signal?.aborted) {
        clearTimeout(timer);
        reject(options.signal.reason ?? adapterError('timeout', `Request ${method} aborted`));
        return;
      }
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        cleanup: () => {
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', onAbort);
        },
      });
      try {
        this.write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        const entry = this.pending.get(id);
        this.pending.delete(id);
        entry?.cleanup();
        reject(toAdapterError(error, 'protocol_error'));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closeError) throw this.closeError;
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  onNotification(listener: (notification: JsonRpcNotification) => void): Unsubscribe {
    return this.notifications.subscribe(listener);
  }

  /**
   * Registers a handler for server-initiated requests. Handlers must call `respond` or
   * `respondError` exactly once. With no handler registered the peer answers -32601.
   */
  onRequest(listener: (request: IncomingRequest) => void): Unsubscribe {
    return this.requests.subscribe(listener);
  }

  onClose(listener: (info: { error: AdapterError }) => void): Unsubscribe {
    if (this.closeError) {
      const error = this.closeError;
      queueMicrotask(() => listener({ error }));
      return () => {};
    }
    return this.closes.subscribe(listener);
  }

  /** Fails all pending work with `error` and closes the transport. */
  close(error: AdapterError = adapterError('disposed', 'JSON-RPC peer closed')): void {
    this.shutdown(error);
    this.transport.close(error);
  }

  private shutdown(error: AdapterError): void {
    if (this.closeError) return;
    this.closeError = error;
    for (const entry of this.pending.values()) {
      entry.cleanup();
      entry.reject(error);
    }
    this.pending.clear();
    this.incoming.clear();
    this.closes.emit({ error });
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.notifications.dispose();
    this.requests.dispose();
    this.closes.dispose();
  }

  private abandon(id: JsonRpcId): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    entry.cleanup();
    this.pending.delete(id);
    this.abandoned.add(id);
    if (this.abandoned.size > 1000) {
      const oldest = this.abandoned.values().next().value;
      if (oldest !== undefined) this.abandoned.delete(oldest);
    }
  }

  private write(message: Record<string, unknown>): void {
    const payload = this.options.includeVersion ? { jsonrpc: '2.0', ...message } : message;
    const line = JSON.stringify(payload);
    this.transport.send(line);
    this.options.trace?.('out', payload);
  }

  private handleLine(line: string): void {
    if (line.trim() === '') return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch (error) {
      this.protocolError(`Invalid JSON: ${(error as Error).message}`, line);
      return;
    }
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      this.protocolError('Message is not a JSON object', line);
      return;
    }
    this.options.trace?.('in', message);
    const record = message as Record<string, unknown>;
    const hasId = typeof record.id === 'string' || typeof record.id === 'number';
    const method = typeof record.method === 'string' ? record.method : undefined;

    if (method !== undefined && hasId) {
      this.handleIncomingRequest(record.id as JsonRpcId, method, record.params);
    } else if (method !== undefined) {
      this.notifications.emit({ method, params: record.params });
    } else if (hasId && ('result' in record || 'error' in record)) {
      this.handleResponse(record.id as JsonRpcId, record);
    } else {
      this.protocolError('Unrecognized JSON-RPC message', line);
    }
  }

  private handleResponse(id: JsonRpcId, record: Record<string, unknown>): void {
    const entry = this.pending.get(id);
    if (!entry) {
      this.abandoned.delete(id);
      this.options.onLateResponse?.(id, record);
      return;
    }
    this.pending.delete(id);
    entry.cleanup();
    if (record.error !== undefined && record.error !== null) {
      const error = record.error as Partial<JsonRpcErrorObject>;
      entry.reject(
        new JsonRpcRemoteError(entry.method, {
          code: typeof error.code === 'number' ? error.code : 0,
          message: typeof error.message === 'string' ? error.message : JSON.stringify(record.error),
          data: error.data,
        }),
      );
    } else {
      entry.resolve(record.result);
    }
  }

  private handleIncomingRequest(id: JsonRpcId, method: string, params: unknown): void {
    let responded = false;
    const answer = (payload: Record<string, unknown>) => {
      if (responded) throw adapterError('invalid_state', `Request ${String(id)} (${method}) was already answered or dismissed`);
      if (this.closeError) throw this.closeError;
      responded = true;
      this.incoming.delete(id);
      this.write({ id, ...payload });
    };
    const request: IncomingRequest = {
      id,
      method,
      params,
      receivedAt: Date.now(),
      get responded() {
        return responded;
      },
      respond: (result) => answer({ result: result ?? null }),
      respondError: (error) => answer({ error }),
    };
    this.incoming.set(id, { request, dismiss: () => { responded = true; } });
    if (this.requests.listenerCount === 0) {
      request.respondError({ code: JSON_RPC_METHOD_NOT_FOUND, message: `No handler for ${method}` });
      return;
    }
    this.requests.emit(request);
  }

  private protocolError(message: string, raw: string): void {
    this.options.onProtocolError?.(adapterError('protocol_error', message), raw.slice(0, 2000));
  }
}
