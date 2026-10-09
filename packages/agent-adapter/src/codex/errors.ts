import { AdapterError, adapterError, type AdapterErrorCode } from '../errors.js';
import { JsonRpcRemoteError } from '../core/json-rpc.js';
import type { TurnError } from './protocol/v2/TurnError.js';

export function codexError(error: unknown, source: string, fallback: AdapterErrorCode = 'provider_error'): AdapterError {
  if (error instanceof AdapterError) return error;
  const native = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof native.message === 'string' ? native.message : String(error);
  const rpcData = error instanceof JsonRpcRemoteError ? error.data : undefined;
  const info = native.codexErrorInfo ?? (rpcData && typeof rpcData === 'object' && 'codexErrorInfo' in rpcData ? rpcData.codexErrorInfo : rpcData);
  const tag = typeof info === 'string' ? info : info && typeof info === 'object' ? Object.keys(info)[0] : undefined;
  const detail = info && typeof info === 'object' && tag ? (info as Record<string, unknown>)[tag] : undefined;
  const status = detail && typeof detail === 'object' ? (detail as Record<string, unknown>).httpStatusCode : undefined;
  let code = fallback;
  if (tag === 'unauthorized' || status === 401 || status === 403) code = 'auth_required';
  else if (['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded'].includes(tag ?? '') || status === 429) code = 'quota_exceeded';
  else if (['httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts'].includes(tag ?? '')) code = 'network_error';
  else if (error instanceof JsonRpcRemoteError && error.code === -32601) code = 'unsupported';
  return adapterError(code, message, { cause: error, native: {
    source: `codex:${source}`, message, ...(tag ? { code: tag } : error instanceof JsonRpcRemoteError ? { code: error.code } : {}),
    ...(info !== undefined ? { detail: info } : {}),
  } });
}

export function turnError(error: TurnError | null | undefined) {
  return codexError(error ?? { message: 'Codex turn failed' }, 'turn/completed').info;
}
