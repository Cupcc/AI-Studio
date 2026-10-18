import type { AdapterErrorInfo, NativeDiagnostic } from './errors.js';

/** Stable provider identifier persisted by the session manager (04 §5 Session.cli_type). */
export type ProviderId = string;

/** Identifiers of the two V1 providers. Future CLIs register additional ids (04 §6). */
export const BUILT_IN_PROVIDER_IDS = {
  codex: 'codex',
  claudeCode: 'claude-code',
} as const;

// ---------------------------------------------------------------------------
// User input
// ---------------------------------------------------------------------------

export type InputAttachment =
  /** A local file reference the CLI should consider (Codex `mention`, Claude file reference). */
  | { kind: 'file'; path: string; name?: string }
  /** A local image. */
  | { kind: 'image'; path: string }
  | { kind: 'skill'; name: string; path: string };

/** Native CLI skill metadata. Paths are for trusted host use, never renderer input. */
export interface NativeSkillInfo { name: string; description: string; path: string; enabled: boolean }
export interface NativeSkillCatalog { skills: NativeSkillInfo[]; errors: { path: string; message: string }[] }

export interface UserInput {
  text: string;
  /** Providers reject attachment kinds they cannot pass natively (`unsupported`). */
  attachments?: readonly InputAttachment[];
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface ModelInfo {
  /** Value passed back to `setModel` / `model` options. */
  id: string;
  displayName: string;
  description?: string;
  /** True for the CLI's own default model, when the CLI reports one. */
  isDefault?: boolean;
  /** True when the CLI marks the model as hidden from pickers. */
  hidden?: boolean;
  /** Reasoning effort levels the CLI reports for the model, if any. */
  reasoningEfforts?: readonly string[];
  defaultReasoningEffort?: string;
  inputModalities?: readonly string[];
}

// ---------------------------------------------------------------------------
// Items (assistant messages, reasoning and tool activity)
// ---------------------------------------------------------------------------

export type ItemKind =
  | 'assistant_message'
  | 'reasoning'
  | 'command'
  | 'file_change'
  | 'tool_call'
  | 'web_search'
  | 'plan'
  | 'other';

export type ItemStatus = 'in_progress' | 'completed' | 'failed' | 'declined' | 'interrupted';

/** Verb used for one-line activity rows such as "Read / Edit / Run" (Shell Spec v01 §5). */
export type ActivityVerb = 'read' | 'edit' | 'run' | 'search' | 'list' | 'fetch' | 'tool' | 'agent' | 'other';

export interface ActivityDescriptor {
  verb: ActivityVerb;
  /** Short display label, e.g. "Read src/index.ts" or "Run pnpm test". */
  label: string;
  /** Path, command or URL the activity targets, when known. */
  target?: string;
}

export type FileChangeKind = 'add' | 'modify' | 'delete' | 'rename' | 'unknown';

/** Native records only. No working-tree reads or inferred Shell coverage. */
export interface NativeTurnDiff {
  nativeSessionId: string;
  nativeTurnId: string;
  source: string;
  cliVersion?: string;
  protocolVersion: string;
  state: 'unknown' | 'available' | 'empty' | 'unavailable' | 'failed';
  patch: string | null;
  patchTruncated?: boolean;
  fileListTruncated?: boolean;
  files: NativeDiffFile[];
  truncated: boolean;
  reason?: string;
}

export interface NativeDiffFile {
  itemId: string;
  path: string;
  oldPath?: string;
  change: FileChangeKind;
  status: ItemStatus;
  patch: string;
  truncated?: boolean;
}

export interface ItemSnapshot {
  /** Native item id (Codex item id, Claude message/tool_use id). Unique within the session. */
  itemId: string;
  kind: ItemKind;
  status: ItemStatus;
  /**
   * Full text for assistant_message / reasoning / plan items. On `item.completed` this is the
   * authoritative body and replaces any text accumulated from `item.delta` events.
   */
  text?: string;
  activity?: ActivityDescriptor;
  command?: { command: string; cwd?: string; exitCode?: number | null; output?: string };
  files?: ReadonlyArray<{ path: string; change: FileChangeKind }>;
  tool?: { name: string; server?: string; input?: unknown; result?: unknown };
  /** Short failure text for failed items. */
  error?: string;
  /** Native type tag for diagnostics, e.g. `commandExecution` or `tool_use:Bash`. */
  nativeType?: string;
}

export type ItemDeltaChannel = 'text' | 'reasoning' | 'output';

// ---------------------------------------------------------------------------
// Input requests (Needs Input) and responses
// ---------------------------------------------------------------------------

export type ApprovalOptionIntent = 'allow' | 'allow_always' | 'deny' | 'cancel' | 'other';

export interface ApprovalOption {
  /** Opaque id chosen by the provider; passed back in `InputResponse`. */
  id: string;
  /** Native label or a faithful rendering of the native decision. */
  label: string;
  description?: string;
  intent: ApprovalOptionIntent;
  /** The native UI's preferred / primary choice, if the CLI indicates one. */
  primary?: boolean;
}

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface InputQuestion {
  id: string;
  header?: string;
  prompt: string;
  options: readonly QuestionOption[];
  multiSelect: boolean;
  /** Whether a free-text answer is accepted natively (Codex `isOther`, Claude "Other"). */
  allowFreeText: boolean;
  /** The answer should be masked in UI and never persisted (Codex `isSecret`). */
  secret: boolean;
}

interface InputRequestBase {
  /** Adapter-generated id, unique per session (native ids are not unique across runtimes). */
  requestId: string;
  turnId: string;
  /** Native item the request belongs to, if any. */
  itemId?: string;
  createdAt: number;
  /** Native method / tool name, e.g. `item/commandExecution/requestApproval` or `canUseTool:Bash`. */
  nativeType: string;
}

export interface ApprovalRequest extends InputRequestBase {
  kind: 'approval';
  /** What is being approved. */
  subject: 'command' | 'file_change' | 'tool' | 'permissions' | 'network' | 'other';
  /** Primary prompt text; the native sentence when the CLI provides one. */
  title: string;
  description?: string;
  command?: string;
  cwd?: string;
  paths?: readonly string[];
  toolName?: string;
  /** Tool input for display only. */
  toolInput?: unknown;
  /** Native decisions in native order. */
  options: readonly ApprovalOption[];
  /** Whether a free-text message may accompany the decision natively (e.g. Claude deny message). */
  allowsMessage: boolean;
}

export interface QuestionRequest extends InputRequestBase {
  kind: 'question';
  title?: string;
  questions: readonly InputQuestion[];
}

export type InputRequest = ApprovalRequest | QuestionRequest;

export type InputResponse =
  | { kind: 'approval'; optionId: string; message?: string }
  | {
      kind: 'answers';
      /** Keyed by `InputQuestion.id`. */
      answers: Readonly<Record<string, { optionIds?: readonly string[]; text?: string }>>;
    };

export type InputResolution =
  /** Answered from the card, or by a composer reply that became the answer (`viaText`). */
  | { status: 'answered'; response: InputResponse; viaText?: boolean }
  /** Declined by a composer reply; the text went to the agent as the explanation (I-Q2). */
  | { status: 'declined_with_text'; text: string }
  | {
      status: 'cancelled';
      reason: 'turn_stopping' | 'turn_ended' | 'runtime_exited' | 'native_resolved' | 'disposed';
    };

/** Outcome of `AgentSession.replyWithText` (I-Q2, confirmed 2026-10-09). */
export interface ReplyWithTextResult {
  /** `answered`: the text answered the single pending request; `declined`: all pending requests were declined with it. */
  disposition: 'answered' | 'declined';
  requestIds: string[];
}

/**
 * Whether composer text can natively be the answer of `request`: a question request with
 * exactly one question that accepts free text. Approvals never take text as an answer.
 */
export function acceptsFreeTextAnswer(request: InputRequest): boolean {
  return request.kind === 'question' && request.questions.length === 1 && request.questions[0]!.allowFreeText;
}

// ---------------------------------------------------------------------------
// Turns and Stop
// ---------------------------------------------------------------------------

export type TurnOutcome = 'completed' | 'interrupted' | 'failed';

/** Native terminal state reported by a provider before stop correlation is applied. */
export interface NativeTurnEnd {
  status: TurnOutcome;
  /** Normalized error for `failed`; for stopped turns it is kept as diagnostic only. */
  error?: AdapterErrorInfo;
  nativeDurationMs?: number;
  /** Model that actually served the turn, when the CLI reports it. */
  model?: string;
}

export type StopPhase =
  | 'requested'
  | 'interrupting'
  | 'awaiting_terminal'
  | 'cleaning_up'
  | 'recovering'
  | 'completed'
  | 'failed';

export interface ProcessRef {
  pid: number;
  command: string;
}

export interface CleanupReport {
  /**
   * confirmed: targeted processes proven exited; not_required: nothing to clean for this turn;
   * unsupported: native cleanup unavailable (triggers recovery); failed: could not confirm.
   */
  status: 'confirmed' | 'not_required' | 'unsupported' | 'failed';
  /** What was cleaned: only this turn's commands, the whole native thread, or the runtime. */
  scope: 'turn' | 'thread' | 'runtime' | 'none';
  verifiedExited?: readonly ProcessRef[];
  survivors?: readonly ProcessRef[];
  detail?: string;
  error?: AdapterErrorInfo;
}

export interface RecoveryReport {
  status: 'resumed';
  /** Runtime-level fallback may have stopped background services started by earlier turns (04 §4 rule 6). */
  mayHaveStoppedEarlierBackgroundCommands: boolean;
  verifiedExited?: readonly ProcessRef[];
  detail?: string;
}

export type StopRecoveryReason =
  | 'interrupt_failed'
  | 'terminal_timeout'
  | 'cleanup_failed'
  | 'cleanup_timeout'
  | 'cleanup_unsupported'
  | 'runtime_exited';

export interface StopSummary {
  requestedAt: number;
  completedAt: number;
  /** Final cleanup status of the Stop. */
  cleanup: 'confirmed' | 'not_required' | 'runtime_restarted' | 'failed';
  cleanupReport?: CleanupReport;
  recoveryReason?: StopRecoveryReason;
  recovery?: RecoveryReport;
  /** Native diagnostic of the stopped turn (e.g. Claude `error_during_execution`), never an error. */
  nativeDiagnostic?: NativeDiagnostic;
}

export interface StopResult {
  /**
   * stopped: turn ended as interrupted and cleanup finished (confirmed / not required / runtime restarted);
   * already_completed: the native turn completed successfully before the stop took effect;
   * not_running: there was no active turn;
   * failed: the turn ended but cleanup / recovery failed; the session is closed.
   */
  status: 'stopped' | 'already_completed' | 'not_running' | 'failed';
  turnId?: string;
  summary?: StopSummary;
  error?: AdapterErrorInfo;
}

// ---------------------------------------------------------------------------
// Session runtime state (adapter level; not a UI state, see FR-STATE-006)
// ---------------------------------------------------------------------------

export type SessionRuntimeState = 'idle' | 'running' | 'stopping' | 'closed';

export type SessionCloseReason = 'disposed' | 'runtime_exited' | 'resume_failed' | 'stop_failed' | 'fatal_error';

export interface TurnSnapshot {
  turnId: string;
  nativeTurnId?: string;
  startedAt: number;
  stopRequested: boolean;
}

export interface RuntimeExitInfo {
  /** Increments each time the session starts a new runtime process. */
  generation: number;
  pid?: number;
  code: number | null;
  signal: string | null;
  /** True when the adapter asked the runtime to exit. */
  expected: boolean;
  /** Epoch ms. */
  exitedAt: number;
  /** Bounded stderr tail for diagnostics. */
  stderrTail?: string;
}
