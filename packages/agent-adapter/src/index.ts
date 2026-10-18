// Public contract
export * from './errors.js';
export * from './types.js';
export type * from './events.js';
export type * from './provider.js';
export { buildAvailabilityReport, deriveAvailabilityStatus, failed, ok, skipped } from './availability.js';
export { ProviderRegistry } from './registry.js';
export { ensureSession } from './session-helpers.js';

// Shared core used by providers
export { deferred, monotonicMs, pollUntil, sleep, withTimeout } from './core/async.js';
export type { Deferred } from './core/async.js';
export { AsyncQueue } from './core/async-queue.js';
export { EventStream, TypedEmitter } from './core/emitter.js';
export type { EmitterOptions } from './core/emitter.js';
export { compareVersions, execBounded, parseVersion, resolveExecutable } from './core/exec.js';
export type { ExecResult } from './core/exec.js';
export { LiveSessions } from './core/live-sessions.js';
export { JSON_RPC_METHOD_NOT_FOUND, JsonRpcPeer, JsonRpcRemoteError } from './core/json-rpc.js';
export type { IncomingRequest, JsonRpcErrorObject, JsonRpcId, JsonRpcNotification, JsonRpcPeerOptions } from './core/json-rpc.js';
export { createStreamLineTransport, DEFAULT_MAX_LINE_CHARS, LineSplitter } from './core/line-transport.js';
export type { LineTransport } from './core/line-transport.js';
export {
  defaultProcessLister,
  descendantsIn,
  findAlive,
  identityOf,
  isZombie,
  listDescendants,
  listProcessGroup,
  parsePsOutput,
  PsProcessLister,
  signalProcesses,
  waitForExit,
} from './core/process-probe.js';
export type { ExitVerification, ProcessIdentity, ProcessInfo, ProcessLister } from './core/process-probe.js';
export { redactDeep, redactSecrets } from './core/redact.js';
export { RuntimeProcess } from './core/runtime-process.js';
export { RuntimeResources } from './core/runtime-resources.js';
export type {
  ChildProcessLike,
  RuntimeHandle,
  RuntimeSpawnOptions,
  TerminateOptions,
  TerminationReport,
} from './core/runtime-process.js';
export { RuntimeSlot } from './core/runtime-slot.js';
export { SessionController, validateInputResponse } from './core/session-controller.js';
export type {
  InputRequestInit,
  PendingInputRecord,
  SessionControllerOptions,
  SessionDriver,
  SessionSink,
  StopContext,
  TurnContext,
} from './core/session-controller.js';
export { DEFAULT_TIMEOUTS, resolveTimeouts } from './core/timeouts.js';
export type { AdapterTimeouts } from './core/timeouts.js';
export { TurnGuard } from './core/turn-guard.js';
export { boundNativeDiff, NATIVE_DIFF_LIMIT, NATIVE_DIFF_FILES } from './core/turn-diff.js';
export type { TurnClass, TurnRecord } from './core/turn-guard.js';
