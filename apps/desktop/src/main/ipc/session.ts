import { BrowserWindow } from 'electron'
import { CodexProvider } from '@ai-studio/agent-adapter/codex'
import { ClaudeProvider } from '@ai-studio/agent-adapter/claude'
import type { AgentProvider, InputResponse } from '@ai-studio/agent-adapter'
import { sessionContract, SESSION_MESSAGE_MAX_LENGTH, SESSION_TITLE_MAX_LENGTH } from '@shared/ipc/session'
import type { ComposerDraft, ContextItem, DraftKey, SessionCli } from '@shared/session/types'
import { FILES_LIMITS, parseProjectPath, type FileReferenceResolver } from '@shared/tools/files'
import { SESSION_CLIS } from '@shared/session/types'
import { catalogEntry } from '@shared/project-view/defaults'
import { projectViewsFor } from '../services/project-view'
import type { CoreServices } from '../services/core'
import { projectShellFor } from '../services/project'
import { SessionService } from '../services/session/session-service'
import { SessionStore } from '../services/session/store'
import { defineHandlers, IpcValidationError } from './registry'
import { expectOnlyKeys, expectRecord, expectString, noInput } from './validate'

const id = (value: unknown, name = 'id') => expectString(value, name, { minLength: 1, maxLength: 200 })
const text = (value: unknown) => expectString(value, 'text', { maxLength: SESSION_MESSAGE_MAX_LENGTH })
const cli = (value: unknown): SessionCli => {
  if (!SESSION_CLIS.includes(value as SessionCli)) throw new IpcValidationError('Invalid CLI')
  return value as SessionCli
}
const model = (value: unknown): string | null => value == null ? null : expectString(value, 'model', { minLength: 1, maxLength: 300 })
function record(raw: unknown, keys: readonly string[]) {
  const value = expectRecord(raw)
  expectOnlyKeys(value, keys)
  return value
}
function projectRef(raw: unknown) { const value = record(raw, ['projectId']); return { projectId: id(value.projectId, 'projectId') } }
function sessionRef(raw: unknown) { const value = record(raw, ['sessionId']); return { sessionId: id(value.sessionId, 'sessionId') } }
/** File items are Project-relative (Tools §4.1); the shared rules reject absolute paths, `..`, NUL and oversize. */
function filePath(value: unknown): string {
  const path = expectString(value, 'path', { minLength: 1, maxLength: 8192 })
  try { return parseProjectPath(path) } catch (error) { throw new IpcValidationError(error instanceof Error ? error.message : 'Invalid path') }
}
function context(value: unknown): ContextItem[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new IpcValidationError('Invalid contextItems')
  const items = value.map((item): ContextItem => {
    const entry = expectRecord(item)
    if (entry.type === 'view') {
      expectOnlyKeys(entry, ['type', 'viewId'])
      return { type: 'view', viewId: id(entry.viewId, 'viewId') }
    }
    if (entry.type === 'file') {
      expectOnlyKeys(entry, ['type', 'path'])
      return { type: 'file', path: filePath(entry.path) }
    }
    throw new IpcValidationError('Invalid context type')
  })
  if (items.filter(item => item.type === 'file').length > FILES_LIMITS.referencesPerMessage) throw new IpcValidationError('Too many file references')
  return items
}
function draftKey(raw: unknown): DraftKey {
  const value = expectRecord(raw)
  const projectId = id(value.projectId, 'projectId')
  if (value.kind === 'new_chat') {
    expectOnlyKeys(value, ['kind', 'projectId', 'viewId'])
    const viewId = value.viewId === undefined ? undefined : id(value.viewId, 'viewId')
    if (viewId) catalogEntry(viewId)
    return { kind: 'new_chat', projectId, ...(viewId ? { viewId } : {}) }
  }
  if (value.kind === 'session') {
    expectOnlyKeys(value, ['kind', 'projectId', 'sessionId'])
    return { kind: 'session', projectId, sessionId: id(value.sessionId, 'sessionId') }
  }
  throw new IpcValidationError('Invalid draft key')
}
function draft(raw: unknown): ComposerDraft {
  const value = record(raw, ['cli', 'model', 'text', 'contextItems'])
  return { cli: value.cli === null ? null : cli(value.cli), model: model(value.model), text: text(value.text), contextItems: context(value.contextItems) }
}
function response(raw: unknown): InputResponse {
  const value = expectRecord(raw)
  if (value.kind === 'approval') {
    expectOnlyKeys(value, ['kind', 'optionId', 'message'])
    return { kind: 'approval', optionId: id(value.optionId, 'optionId'), ...(value.message === undefined ? {} : { message: text(value.message) }) }
  }
  if (value.kind === 'answers') {
    expectOnlyKeys(value, ['kind', 'answers'])
    const answers = expectRecord(value.answers)
    if (Object.keys(answers).length > 100) throw new IpcValidationError('Too many answers')
    const parsed: Record<string, { optionIds?: string[]; text?: string }> = Object.create(null)
    for (const [questionId, answer] of Object.entries(answers)) {
      id(questionId, 'questionId')
      const item = record(answer, ['optionIds', 'text'])
      if (item.optionIds !== undefined && (!Array.isArray(item.optionIds) || item.optionIds.length > 100)) throw new IpcValidationError('Invalid options')
      parsed[questionId] = {
        ...(item.text === undefined ? {} : { text: text(item.text) }),
        ...(item.optionIds === undefined ? {} : { optionIds: (item.optionIds as unknown[]).map(option => id(option, 'optionId')) })
      }
    }
    return { kind: 'answers', answers: parsed }
  }
  throw new IpcValidationError('Invalid answer kind')
}

export interface SessionFeatureOptions {
  providers?: readonly AgentProvider[]
  isForeground?: (senderId: number) => boolean
  /** Re-validates Files references at send time; without it a message with file items is refused. */
  fileReferences?: FileReferenceResolver
}

export function isSessionWindowForeground(senderId: number): boolean {
  const window = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.webContents.id === senderId)
  return !!window && window.isFocused() && window.isVisible() && !window.isMinimized()
}

/** Register the migration before creating this feature. No real model requests are made by startup. */
export function createSessionFeature(core: CoreServices, options: SessionFeatureOptions = {}) {
  const shell = projectShellFor(core)
  const service = new SessionService({
    store: new SessionStore(core.database().db), projects: shell.projects,
    canOperate: id => !shell.isProjectClosing(id) && !shell.isQuitting(),
    providers: options.providers ?? [new CodexProvider(), new ClaudeProvider()],
    environment: async () => ({ env: (await core.shellEnv.get()).env }),
    isForeground: options.isForeground ?? isSessionWindowForeground,
    fileReferences: options.fileReferences,
    summaryChanged: change => core.broadcast(sessionContract.events.summaryChanged, change),
    transcriptChanged: change => core.broadcast(sessionContract.events.transcriptChanged, change),
    providersChanged: providers => core.broadcast(sessionContract.events.providersChanged, providers),
    buildViewContext: (projectId, viewId) => projectViewsFor(core).buildContext(projectId, viewId, true),
    turnEnded: projectId => { void projectViewsFor(core).refresh(projectId) }
  })
  shell.setSessionPort(service)
  void service.getProviders().catch(() => {})
  return defineHandlers(sessionContract, {
    list: { parse: projectRef, handle: ({ projectId }) => service.list(projectId) },
    getTurnDiff: {
      parse: raw => {
        const value = record(raw, ['projectId', 'sessionId', 'turnId'])
        return { projectId: id(value.projectId, 'projectId'), sessionId: id(value.sessionId, 'sessionId'), turnId: id(value.turnId, 'turnId') }
      },
      handle: ({ projectId, sessionId, turnId }) => service.getTurnDiff(projectId, sessionId, turnId)
    },
    getConversation: {
      parse: raw => {
        const value = record(raw, ['sessionId', 'beforeSequence', 'limit'])
        for (const field of ['beforeSequence', 'limit']) if (value[field] !== undefined && (!Number.isSafeInteger(value[field]) || Number(value[field]) < 1)) throw new IpcValidationError(`Invalid ${field}`)
        return { sessionId: id(value.sessionId, 'sessionId'), beforeSequence: value.beforeSequence as number | undefined, limit: value.limit as number | undefined }
      },
      handle: ({ sessionId, beforeSequence, limit }) => service.getConversation(sessionId, beforeSequence, limit)
    },
    create: {
      parse: raw => {
        const value = record(raw, ['projectId', 'cli', 'model', 'originViewId', 'viewContextAttached', 'text', 'contextItems'])
        if (value.viewContextAttached !== undefined && typeof value.viewContextAttached !== 'boolean') throw new IpcValidationError('Invalid viewContextAttached')
        return { projectId: id(value.projectId, 'projectId'), cli: cli(value.cli), model: model(value.model), originViewId: value.originViewId == null ? null : id(value.originViewId, 'originViewId'), viewContextAttached: value.viewContextAttached as boolean | undefined, text: text(value.text), contextItems: context(value.contextItems) }
      },
      handle: request => service.create(request)
    },
    send: {
      parse: raw => { const value = record(raw, ['sessionId', 'text', 'contextItems']); return { sessionId: id(value.sessionId, 'sessionId'), text: text(value.text), contextItems: context(value.contextItems) } },
      handle: ({ sessionId, ...message }) => service.send(sessionId, message)
    },
    answer: {
      parse: raw => { const value = record(raw, ['sessionId', 'requestId', 'response']); return { sessionId: id(value.sessionId, 'sessionId'), requestId: id(value.requestId, 'requestId'), response: response(value.response) } },
      handle: ({ sessionId, requestId, response }) => service.answer(sessionId, requestId, response)
    },
    replyWithText: {
      parse: raw => { const value = record(raw, ['sessionId', 'text']); return { sessionId: id(value.sessionId, 'sessionId'), text: text(value.text) } },
      handle: ({ sessionId, text }) => service.replyWithText(sessionId, text)
    },
    stop: { parse: sessionRef, handle: ({ sessionId }) => service.stop(sessionId) },
    retry: { parse: sessionRef, handle: ({ sessionId }) => service.retry(sessionId) },
    rename: {
      parse: raw => { const value = record(raw, ['sessionId', 'title']); return { sessionId: id(value.sessionId, 'sessionId'), title: expectString(value.title, 'title', { maxLength: SESSION_TITLE_MAX_LENGTH * 2 }) } },
      handle: ({ sessionId, title }) => service.rename(sessionId, title)
    },
    setModel: {
      parse: raw => { const value = record(raw, ['sessionId', 'model']); return { sessionId: id(value.sessionId, 'sessionId'), model: model(value.model) } },
      handle: ({ sessionId, model }) => service.setModel(sessionId, model)
    },
    getProviders: { parse: noInput, handle: () => service.getProviders() },
    getModels: { parse: raw => { const value = record(raw, ['cli', 'projectId']); return { cli: cli(value.cli), projectId: id(value.projectId, 'projectId') } }, handle: ({ cli, projectId }) => service.getModels(cli, projectId) },
    getDefaultCli: { parse: projectRef, handle: ({ projectId }) => service.getDefaultCli(projectId) },
    setDefaultCli: { parse: raw => { const value = record(raw, ['projectId', 'cli']); return { projectId: id(value.projectId, 'projectId'), cli: cli(value.cli) } }, handle: ({ projectId, cli }) => service.setDefaultCli(projectId, cli) },
    getDraft: { parse: draftKey, handle: key => service.getDraft(key) },
    saveDraft: { parse: raw => { const value = record(raw, ['key', 'draft']); return { key: draftKey(value.key), draft: draft(value.draft) } }, handle: ({ key, draft }) => service.saveDraft(key, draft) },
    updateViewing: {
      parse: raw => {
        const value = record(raw, ['projectId', 'sessionId', 'foreground'])
        if (typeof value.foreground !== 'boolean') throw new IpcValidationError('foreground must be boolean')
        return { projectId: value.projectId === null ? null : id(value.projectId, 'projectId'), sessionId: value.sessionId === null ? null : id(value.sessionId, 'sessionId'), foreground: value.foreground }
      },
      handle: (viewing, context) => service.updateViewing(context.senderId, viewing)
    },
    opened: {
      parse: raw => { const value = record(raw, ['projectId', 'sessionId']); return { projectId: id(value.projectId, 'projectId'), sessionId: id(value.sessionId, 'sessionId') } },
      handle: ({ projectId, sessionId }, context) => service.opened(context.senderId, projectId, sessionId)
    },
    getProjectState: { parse: projectRef, handle: ({ projectId }) => service.getProjectState(projectId) },
    stopProject: { parse: projectRef, handle: ({ projectId }) => service.stopProjectTurns(projectId) },
    projectClosed: { parse: projectRef, handle: ({ projectId }) => service.projectClosed(projectId) }
  }, () => service.dispose())
}
