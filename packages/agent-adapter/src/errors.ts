/**
 * Normalized error codes. Providers map native failures onto these codes and keep
 * the native diagnostic in `AdapterErrorInfo.native`.
 */
export type AdapterErrorCode =
  /** Executable not found (explicit path missing or not on the supplied PATH). */
  | 'not_installed'
  /** CLI version is outside the range the provider declares as supported. */
  | 'unsupported_version'
  /** CLI reports no usable login / credentials. */
  | 'auth_required'
  /** The runtime process could not be started. */
  | 'spawn_failed'
  /** The native session could not be resumed. Never followed by a silent new session. */
  | 'resume_failed'
  /** The runtime exited without being asked to. */
  | 'runtime_crashed'
  /** Malformed or unexpected protocol traffic. */
  | 'protocol_error'
  /** Network / connection failure reported by the CLI. */
  | 'network_error'
  /** Rate limit, usage limit or quota exhausted. */
  | 'quota_exceeded'
  /** Generic model / provider-side failure. */
  | 'provider_error'
  /** A bounded wait expired. */
  | 'timeout'
  /** Stop could not prove that the targeted processes exited, and recovery failed or was unavailable. */
  | 'stop_cleanup_failed'
  /** Operation not allowed in the current session / turn state. */
  | 'invalid_state'
  /** Caller supplied an invalid argument (unknown request id, option id, ...). */
  | 'invalid_argument'
  /** The provider or CLI version does not support the requested operation. */
  | 'unsupported'
  /** The session or provider has been disposed. */
  | 'disposed'
  | 'unknown';

/** Native diagnostic preserved verbatim (after optional redaction) for "show details". */
export interface NativeDiagnostic {
  /** Where the diagnostic came from, e.g. `codex:turn/completed`, `claude:result`, `runtime:exit`. */
  source: string;
  code?: string | number;
  message?: string;
  /** Additional structured detail; must be JSON-serializable. */
  detail?: unknown;
}

/** Serializable error shape carried in events and across IPC. */
export interface AdapterErrorInfo {
  code: AdapterErrorCode;
  message: string;
  /** Whether retrying the same operation may succeed (e.g. network). Absent = unknown. */
  retryable?: boolean;
  native?: NativeDiagnostic;
}

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  readonly retryable: boolean | undefined;
  readonly native: NativeDiagnostic | undefined;

  constructor(info: AdapterErrorInfo, options?: { cause?: unknown }) {
    super(info.message, options);
    this.name = 'AdapterError';
    this.code = info.code;
    this.retryable = info.retryable;
    this.native = info.native;
  }

  get info(): AdapterErrorInfo {
    const info: AdapterErrorInfo = { code: this.code, message: this.message };
    if (this.retryable !== undefined) info.retryable = this.retryable;
    if (this.native !== undefined) info.native = this.native;
    return info;
  }

  toJSON(): AdapterErrorInfo {
    return this.info;
  }
}

export function adapterError(
  code: AdapterErrorCode,
  message: string,
  extra?: { retryable?: boolean; native?: NativeDiagnostic; cause?: unknown },
): AdapterError {
  const info: AdapterErrorInfo = { code, message };
  if (extra?.retryable !== undefined) info.retryable = extra.retryable;
  if (extra?.native !== undefined) info.native = extra.native;
  return new AdapterError(info, extra?.cause === undefined ? undefined : { cause: extra.cause });
}

export function isAdapterError(value: unknown): value is AdapterError {
  return value instanceof AdapterError;
}

/** Converts anything thrown into an AdapterError, keeping existing codes. */
export function toAdapterError(value: unknown, fallbackCode: AdapterErrorCode = 'unknown'): AdapterError {
  if (value instanceof AdapterError) return value;
  if (value instanceof Error) {
    return adapterError(fallbackCode, value.message, { cause: value });
  }
  return adapterError(fallbackCode, typeof value === 'string' ? value : safeStringify(value));
}

export function toErrorInfo(value: unknown, fallbackCode: AdapterErrorCode = 'unknown'): AdapterErrorInfo {
  return toAdapterError(value, fallbackCode).info;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
