import type { CliConnection, SaveCliConnection, ConnectionTestResult } from '../session/cli-connection'
import { defineContract, event, invoke } from './contract'
import type { CliInstallation } from '../session/cli-installation'
import type { TurnDiffRecord, TurnDiffRef } from '../tools/turn-diff'
import type {
  ComposerDraft,
  ConversationPage,
  CreateSessionRequest,
  DraftKey,
  InputResponse,
  ModelCatalogResult,
  SkillCatalogResult,
  SkillContentResult,
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
export const PASTED_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const sessionContract = defineContract('session', {
  invoke: {
    list: invoke<{ projectId: string }, SessionSummary[]>('session:list'),
    getTurnDiff: invoke<TurnDiffRef, TurnDiffRecord>('session:get-turn-diff'),
    getConversation: invoke<{ sessionId: string; beforeSequence?: number; limit?: number }, ConversationPage>('session:get-conversation'),
    // Creation/send return once stored and accepted; Runtime startup is asynchronous.
    create: invoke<CreateSessionRequest, SessionSummary>('session:create'),
    send: invoke<SessionMessage & { sessionId: string }, void>('session:send'),
    answer: invoke<{ sessionId: string; requestId: string; response: InputResponse }, void>('session:answer'),
    replyWithText: invoke<{ sessionId: string; text: string }, void>('session:reply-with-text'),
    stop: invoke<{ sessionId: string }, void>('session:stop'),
    retry: invoke<{ sessionId: string }, void>('session:retry'),
    rename: invoke<{ sessionId: string; title: string }, SessionSummary>('session:rename'),
    setReasoningEffort: invoke<{ sessionId: string; reasoningEffort: string | null }, void>('session:set-reasoning-effort'),
    setModel: invoke<{ sessionId: string; model: string | null }, void>('session:set-model'),
    getCliConnections: invoke<void, CliConnection[]>('session:get-cli-connections'),
    saveCliConnection: invoke<SaveCliConnection, CliConnection>('session:save-cli-connection'),
    testCliConnection: invoke<{ cli: SessionCli }, ConnectionTestResult>('session:test-cli-connection'),
    getCliInstallations: invoke<void, CliInstallation[]>('session:get-cli-installations'),
    installCli: invoke<{ cli: SessionCli }, void>('session:install-cli'),
    cancelCliInstallation: invoke<{ cli: SessionCli }, void>('session:cancel-cli-installation'),
    getProviders: invoke<void | { force: boolean }, ProviderSummary[]>('session:get-providers'),
    setCliEnabled: invoke<{ cli: SessionCli; enabled: boolean }, ProviderSummary[]>('session:set-cli-enabled'),
    getSkillContent: invoke<{ cli: SessionCli; projectId: string; skillId: string }, SkillContentResult>('session:get-skill-content'),
    getSkills: invoke<{ cli: SessionCli; projectId: string }, SkillCatalogResult>('session:get-skills'),
    getModels: invoke<{ cli: SessionCli; projectId: string }, ModelCatalogResult>('session:get-models'),
    getGlobalDefaultCli: invoke<void, SessionCli | null>('session:get-global-default-cli'),
    setGlobalDefaultCli: invoke<{ cli: SessionCli }, void>('session:set-global-default-cli'),
    getDefaultCli: invoke<{ projectId: string }, SessionCli | null>('session:get-default-cli'),
    setDefaultCli: invoke<{ projectId: string; cli: SessionCli }, void>('session:set-default-cli'),
    getDraft: invoke<DraftKey, ComposerDraft>('session:get-draft'),
    saveDraft: invoke<{ key: DraftKey; draft: ComposerDraft }, void>('session:save-draft'),
    pasteAttachment: invoke<{ projectId: string; name: string; mime: string; bytes: Uint8Array }, Extract<import('../session/types').ContextItem, { type: 'upload' }>>('session:paste-attachment'),
    updateViewing: invoke<SessionViewing, void>('session:update-viewing'),
    opened: invoke<{ projectId: string; sessionId: string }, void>('session:opened'),
    getProjectState: invoke<{ projectId: string }, SessionProjectState>('session:get-project-state'),
    stopProject: invoke<{ projectId: string }, StopProjectSessionsResult>('session:stop-project'),
    projectClosed: invoke<{ projectId: string }, void>('session:project-closed')
  },
  events: {
    summaryChanged: event<SessionSummaryChange>('session:summary-changed'),
    transcriptChanged: event<TranscriptChange>('session:transcript-changed'),
    cliConnectionsChanged: event<CliConnection[]>('session:cli-connections-changed'),
    cliInstallationsChanged: event<CliInstallation[]>('session:cli-installations-changed'),
    providersChanged: event<ProviderSummary[]>('session:providers-changed')
  }
})
