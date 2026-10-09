import { defineContract, event, invoke } from './contract'
import type {
  ComposerDraft,
  ConversationPage,
  CreateSessionRequest,
  DraftKey,
  InputResponse,
  ModelCatalogResult,
  ProviderSummary,
  SessionCli,
  SessionMessage,
  SessionProjectState,
  SessionSummary,
  SessionSummaryChange,
  SessionViewing,
  StopProjectSessionsResult,
  TranscriptChange
} from '../session/types'

export const SESSION_TITLE_MAX_LENGTH = 100
export const SESSION_MESSAGE_MAX_LENGTH = 200_000
export const TRANSCRIPT_PAGE_SIZE = 100

export const sessionContract = defineContract('session', {
  invoke: {
    list: invoke<{ projectId: string }, SessionSummary[]>('session:list'),
    getConversation: invoke<{ sessionId: string; beforeSequence?: number; limit?: number }, ConversationPage>('session:get-conversation'),
    // Creation/send return once stored and accepted; Runtime startup is asynchronous.
    create: invoke<CreateSessionRequest, SessionSummary>('session:create'),
    send: invoke<SessionMessage & { sessionId: string }, void>('session:send'),
    answer: invoke<{ sessionId: string; requestId: string; response: InputResponse }, void>('session:answer'),
    replyWithText: invoke<{ sessionId: string; text: string }, void>('session:reply-with-text'),
    stop: invoke<{ sessionId: string }, void>('session:stop'),
    retry: invoke<{ sessionId: string }, void>('session:retry'),
    rename: invoke<{ sessionId: string; title: string }, SessionSummary>('session:rename'),
    setModel: invoke<{ sessionId: string; model: string | null }, void>('session:set-model'),
    getProviders: invoke<void, ProviderSummary[]>('session:get-providers'),
    getModels: invoke<{ cli: SessionCli; projectId: string }, ModelCatalogResult>('session:get-models'),
    getDefaultCli: invoke<{ projectId: string }, SessionCli | null>('session:get-default-cli'),
    setDefaultCli: invoke<{ projectId: string; cli: SessionCli }, void>('session:set-default-cli'),
    getDraft: invoke<DraftKey, ComposerDraft>('session:get-draft'),
    saveDraft: invoke<{ key: DraftKey; draft: ComposerDraft }, void>('session:save-draft'),
    updateViewing: invoke<SessionViewing, void>('session:update-viewing'),
    opened: invoke<{ projectId: string; sessionId: string }, void>('session:opened'),
    getProjectState: invoke<{ projectId: string }, SessionProjectState>('session:get-project-state'),
    stopProject: invoke<{ projectId: string }, StopProjectSessionsResult>('session:stop-project'),
    projectClosed: invoke<{ projectId: string }, void>('session:project-closed')
  },
  events: {
    summaryChanged: event<SessionSummaryChange>('session:summary-changed'),
    transcriptChanged: event<TranscriptChange>('session:transcript-changed'),
    providersChanged: event<ProviderSummary[]>('session:providers-changed')
  }
})
