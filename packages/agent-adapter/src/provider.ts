import type { AdapterErrorInfo } from './errors.js';
import type { AdapterEventListener } from './events.js';
import type {
  InputRequest,
  InputResponse,
  ModelInfo,
  NativeSkillCatalog,
  ProviderId,
  ReplyWithTextResult,
  SessionRuntimeState,
  StopResult,
  TurnSnapshot,
  UserInput,
} from './types.js';
import type { AdapterTimeouts } from './core/timeouts.js';

export type Unsubscribe = () => void;

/**
 * Process environment supplied by the host. The desktop app resolves the user's
 * login-shell environment (06 §6); the adapter never reads `process.env` implicitly.
 */
export interface ProviderEnvironment {
  /** Environment for every spawned CLI process. Must contain PATH unless `executablePath` is set. */
  env: Readonly<Record<string, string | undefined>>;
  /** Explicit CLI executable; skips PATH discovery when set. */
  executablePath?: string;
}

// ---------------------------------------------------------------------------
// Availability (06 §5 last bullet; UX §6 New Chat item 4)
// ---------------------------------------------------------------------------

export type CheckResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'failed'; error: AdapterErrorInfo }
  | { status: 'skipped'; reason: string };

export interface ExecutableInfo {
  path: string;
  source: 'explicit' | 'path';
}

export interface VersionInfo {
  version: string;
  raw: string;
  /** tested: inside the provider's verified range; untested: newer/other; unsupported: known incompatible. */
  compatibility: 'tested' | 'untested' | 'unsupported';
  testedVersions?: string;
}

export interface LoginInfo {
  /** Never carries account identity (email, organization). */
  state: 'logged_in' | 'logged_out' | 'unknown';
  /** Coarse method label, e.g. `chatgpt`, `api_key`, `oauth`. */
  method?: string;
}

export interface ModelCatalog {
  models: readonly ModelInfo[];
  defaultModelId?: string;
}

export type AvailabilityStatus = 'available' | 'not_installed' | 'not_logged_in' | 'unsupported_version' | 'error';

export interface AvailabilityReport {
  providerId: ProviderId;
  checkedAt: number;
  /** Summary derived from the parts; see `deriveAvailabilityStatus`. */
  status: AvailabilityStatus;
  /** Explanation for any status other than `available`. */
  reason?: AdapterErrorInfo;
  executable: CheckResult<ExecutableInfo>;
  version: CheckResult<VersionInfo>;
  login: CheckResult<LoginInfo>;
  models: CheckResult<ModelCatalog>;
}

export interface AvailabilityOptions {
  environment: ProviderEnvironment;
  /** Whether to load the model catalog (may start a short-lived runtime). Default false. */
  includeModels?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

/**
 * Optional native overrides. Omitted fields keep the CLI's own configuration
 * (01 §8 principles 19–20; 04 §3). Providers reject fields they do not support
 * with `unsupported` instead of silently ignoring them.
 */
export interface NativeOverrides {
  /** Model for the session; omit to use the CLI default. */
  model?: string;
  /** Codex `approvalPolicy`. */
  approvalPolicy?: string;
  /** Codex `sandbox` mode. */
  sandboxMode?: string;
  /** Claude Code `permissionMode`. */
  permissionMode?: string;
}

export interface SessionOptionsBase {
  /** Project directory (absolute). */
  cwd: string;
  environment: ProviderEnvironment;
  overrides?: NativeOverrides;
  timeouts?: Partial<AdapterTimeouts>;
  /** Provider-specific extras documented by each provider. */
  providerOptions?: Readonly<Record<string, unknown>>;
}

export type CreateSessionOptions = SessionOptionsBase;

export interface ResumeSessionOptions extends SessionOptionsBase {
  /**
   * Native id persisted from `session.native_id`. Resume must target exactly this id and
   * must fail with `resume_failed` rather than create a new native session (04 §4 rule 7).
   */
  nativeSessionId: string;
}

export interface ProviderCapabilities {
  /** When the native session id is known: at creation (Codex) or after the first turn starts (Claude). */
  nativeSessionIdTiming: 'on_create' | 'after_first_input';
  /**
   * Whether `sendUserInput` is accepted while a turn runs (Shell Spec §6 "follows the CLI").
   * `steer` adds the input to the running turn. `queue` starts a later native turn when the
   * provider exposes that distinction. Providers must report their native behavior, not a
   * product-wide intersection of capabilities (I-Q3 / Product Definition principle 24).
   */
  inputWhileRunning: 'none' | 'steer' | 'queue';
  /** Whether question requests (multiple choice / free text) are surfaced, beyond approvals. */
  questionRequests: boolean;
  /**
   * Which request kinds can natively take composer text as their answer (I-Q2). Per request,
   * `acceptsFreeTextAnswer()` is authoritative; any other pending request is declined with the text.
   */
  freeTextAnswers: { questions: boolean; approvals: boolean };
  /** Whether the CLI reports a conversation title (`session.title`). */
  nativeTitle: boolean;
  /** Whether Stop can fall back to restarting the isolated runtime and resuming the same native id. */
  runtimeRecovery: boolean;
}

/** One CLI integration. V1 ships Codex and Claude Code; others register through the registry (04 §6). */
export interface AgentProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  /** Reports executable discovery, version, login state and model catalog separately. Never throws for "unavailable". */
  checkAvailability(options: AvailabilityOptions): Promise<AvailabilityReport>;
  /**
   * Model catalog for the Model Selector before a session exists. Must not create (or persist)
   * a native conversation.
   */
  listModels(options: { environment: ProviderEnvironment; cwd?: string; signal?: AbortSignal }): Promise<ModelInfo[]>;
  /** Lists CLI-discovered skills without creating a native conversation. */
  listSkills?(options: { environment: ProviderEnvironment; cwd: string; signal?: AbortSignal }): Promise<NativeSkillCatalog>;
  /** Starts an isolated runtime and a new native session. Resolves when input can be sent. */
  createSession(options: CreateSessionOptions): Promise<AgentSession>;
  /**
   * Starts an isolated runtime and resumes the given native session. Rejects with
   * `resume_failed` when it cannot — or, if the CLI only detects it lazily, the first turn fails
   * with `resume_failed` and the session closes. Never falls back to a new native session.
   */
  resumeSession(options: ResumeSessionOptions): Promise<AgentSession>;
  /**
   * Strict, retryable release of every managed runtime this provider owns, including runtimes of
   * failed/late startups and availability / model probes. The optional canonical `cwd` (the exact
   * string passed to `createSession`) limits it to one Project. Does not dispose the provider.
   * Rejects with an `AggregateError` when any exit is unconfirmed; unconfirmed handles stay
   * retained and the next call retries them. New startups in the same scope are rejected with
   * `invalid_state` only while a release is running.
   */
  releaseRuntimes(cwd?: string): Promise<void>;
  /**
   * Shutdown: disposes every live session this provider created (stopping active turns and
   * terminating runtimes with exit verification), then releases provider resources. Uses the
   * strict `releaseRuntimes()` path: rejects when an exit is unconfirmed and can be called again
   * to retry; the provider rejects new work from the first call on.
   */
  dispose(): Promise<void>;
}

/**
 * One live native conversation bound to one isolated runtime (04 §2). Commands return
 * acceptance; outcomes arrive as events through `subscribe`.
 */
export interface AgentSession {
  readonly providerId: ProviderId;
  /** Adapter-local id used in event envelopes. */
  readonly sessionId: string;
  /** Native id once known; see `session.native_id`. */
  readonly nativeSessionId: string | undefined;
  readonly state: SessionRuntimeState;
  readonly activeTurn: TurnSnapshot | undefined;
  readonly pendingInputs: readonly InputRequest[];
  /** Model requested for subsequent turns; `undefined` = CLI default / not changed by the host. */
  readonly model: string | undefined;
  readonly capabilities: ProviderCapabilities;

  subscribe(listener: AdapterEventListener): Unsubscribe;
  /**
   * Starts a turn. Emits `turn.started` before resolving. Rejects only for precondition
   * failures (`invalid_state`, `invalid_argument`, `unsupported`); runtime failures surface as
   * `turn.completed` with outcome `failed`.
   */
  sendUserInput(input: UserInput): Promise<{ turnId: string }>;
  /** Answers one pending request. Concurrent requests are answered independently. */
  respondToInput(requestId: string, response: InputResponse): Promise<void>;
  /**
   * Composer reply while requests are pending (I-Q2, confirmed 2026-10-09): if exactly one request
   * is pending and `acceptsFreeTextAnswer` holds, the text is its answer; otherwise every pending
   * request is declined with the text as explanation and the agent receives the text and continues.
   * Rejects with `invalid_state` when nothing is pending (use `sendUserInput`).
   */
  replyWithText(text: string): Promise<ReplyWithTextResult>;
  /** Idempotent. Resolves after the turn's terminal state and cleanup are settled. */
  stop(): Promise<StopResult>;
  /** Applies to subsequent turns (`null` = CLI default). */
  setModel(model: string | null): Promise<void>;
  /** Next turn override; null explicitly resolves the CLI default. */
  setReasoningEffort(effort: string | null): Promise<void>;
  listModels(): Promise<ModelInfo[]>;
  /** Closes the session and verifies runtime release. Pending/successful calls are idempotent;
   * failed cleanup rejects and can be retried on this same handle, even when state is closed. */
  dispose(): Promise<void>;
}
