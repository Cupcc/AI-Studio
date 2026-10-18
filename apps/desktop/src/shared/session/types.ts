// Serializable Session DTOs. Runtime handles and process details stay in main.
// Sources: session/chat/input specs; FR-STATE-001–007 and AC-02–AC-05.
import type {
  InputRequest,
  InputResolution,
  InputResponse,
  ItemSnapshot,
  ModelInfo,
  ProviderCapabilities
} from '@ai-studio/agent-adapter'

export type { InputRequest, InputResolution, InputResponse, ModelInfo, ProviderCapabilities }

export type SessionCli = 'codex' | 'claude-code'
export const SESSION_CLIS: readonly SessionCli[] = ['codex', 'claude-code']
export type SessionActivity = 'none' | 'running' | 'needs_input'
export type SessionStatus = 'running' | 'needs_input' | 'error' | 'completed_unread' | null
export type SessionAttention = 'needs_input' | 'error' | 'completed_unread' | null

export interface SessionSummary {
  id: string
  projectId: string
  cli: SessionCli
  nativeSessionId: string | null
  title: string
  titleSource: 'client' | 'native' | 'user'
  reasoningEffort?: string | null
  model: string | null
  originViewId: string | null
  viewContextAttached?: boolean
  viewContextPaths?: string[]
  lastOutcome?: 'completed' | 'interrupted' | 'failed'
  activity: SessionActivity
  stopping: boolean
  errorUnseen: boolean
  completionUnread: boolean
  status: SessionStatus
  createdAt: number
  updatedAt: number
  lastUserMessageAt: number
}

export type ContextItem = { type: 'view'; viewId: string } | { type: 'file'; path: string } | { type: 'image'; path: string } | { type: 'skill'; id: string; name: string }

interface TranscriptBase {
  id: string
  sessionId: string
  turnId: string | null
  /** Monotonic within the Session; stable while an item streams. */
  sequence: number
  at: number
}

export type TranscriptItem = TranscriptBase & (
  | { kind: 'user_message'; text: string; contextItems: ContextItem[]; redacted?: boolean; viewContextAttached?: boolean; viewContextPaths?: string[] }
  | { kind: 'agent_message'; text: string; complete: boolean; nativeItemId: string }
  | { kind: 'tool_activity'; item: ItemSnapshot }
  | { kind: 'input_request'; request: InputRequest; resolution: InputResolution | null; redacted?: boolean }
  | { kind: 'error'; summary: string; details: string; retryable: boolean }
  | { kind: 'turn_end'; outcome: 'completed' | 'interrupted'; durationMs: number; model?: string }
)

export interface ConversationPage {
  session: SessionSummary
  /** Ascending sequence order, initially the latest page. */
  items: TranscriptItem[]
  hasMore: boolean
  /** Pass as `beforeSequence` to get older items. */
  nextBeforeSequence: number | null
}

export interface ProviderSummary {
  cli: SessionCli
  displayName: string
  status: 'checking' | 'available' | 'not_installed' | 'not_logged_in' | 'unsupported_version' | 'error'
  reason: string | null
  version: string | null
  compatibility: 'tested' | 'untested' | 'unsupported' | null
  checkedAt: number
  capabilities: ProviderCapabilities
}

export interface SkillCatalogResult {
  skills: { id: string; name: string; description: string }[]
  error: string | null
}

export interface ModelCatalogResult {
  models: ModelInfo[]
  error: string | null
}

/** Project draft and per-Session composer text have independent storage keys. */
export type DraftKey =
  | { projectId: string; kind: 'new_chat'; viewId?: string }
  | { projectId: string; kind: 'session'; sessionId: string }

export interface ComposerDraft {
  cli: SessionCli | null
  reasoningEffort?: string | null
  model: string | null
  text: string
  contextItems: ContextItem[]
}

export interface SessionMessage {
  text: string
  contextItems?: ContextItem[]
}

export interface CreateSessionRequest extends SessionMessage {
  projectId: string
  cli: SessionCli
  reasoningEffort?: string | null
  model?: string | null
  originViewId?: string | null
  viewContextAttached?: boolean
}

export interface SessionViewing {
  projectId: string | null
  sessionId: string | null
  /** Main verifies this against its BrowserWindow; focus never clears unread. */
  foreground: boolean
}

export interface SessionProjectState {
  projectId: string
  attention: SessionAttention
  counts: { running: number; needsInput: number }
}

export interface SessionSummaryChange {
  session: SessionSummary
  project: SessionProjectState
}

export interface TranscriptChange {
  sessionId: string
  /** Upserts by stable id; UI must not append a second copy of a completed item. */
  items: TranscriptItem[]
}

export interface StopProjectSessionsResult {
  stopped: string[]
  failed: { sessionId: string; reason: string }[]
}
