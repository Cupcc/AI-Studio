import { adapterError } from '../errors.js';
import { JsonRpcPeer } from '../core/json-rpc.js';
import type { RuntimeHandle } from '../core/runtime-process.js';
import type { ModelInfo } from '../types.js';
import type { InitializeParams } from './protocol/InitializeParams.js';
import type { InitializeResponse } from './protocol/InitializeResponse.js';
import type { ThreadStartParams } from './protocol/v2/ThreadStartParams.js';
import type { ThreadStartResponse } from './protocol/v2/ThreadStartResponse.js';
import type { ThreadResumeParams } from './protocol/v2/ThreadResumeParams.js';
import type { ThreadResumeResponse } from './protocol/v2/ThreadResumeResponse.js';
import type { TurnStartParams } from './protocol/v2/TurnStartParams.js';
import type { TurnStartResponse } from './protocol/v2/TurnStartResponse.js';
import type { TurnSteerParams } from './protocol/v2/TurnSteerParams.js';
import type { TurnSteerResponse } from './protocol/v2/TurnSteerResponse.js';
import type { TurnInterruptParams } from './protocol/v2/TurnInterruptParams.js';
import type { TurnInterruptResponse } from './protocol/v2/TurnInterruptResponse.js';
import type { ThreadSettingsUpdateParams } from './protocol/v2/ThreadSettingsUpdateParams.js';
import type { ThreadSettingsUpdateResponse } from './protocol/v2/ThreadSettingsUpdateResponse.js';
import type { ThreadBackgroundTerminalsListParams } from './protocol/v2/ThreadBackgroundTerminalsListParams.js';
import type { ThreadBackgroundTerminalsListResponse } from './protocol/v2/ThreadBackgroundTerminalsListResponse.js';
import type { ThreadBackgroundTerminalsTerminateParams } from './protocol/v2/ThreadBackgroundTerminalsTerminateParams.js';
import type { ThreadBackgroundTerminalsTerminateResponse } from './protocol/v2/ThreadBackgroundTerminalsTerminateResponse.js';
import type { ModelListParams } from './protocol/v2/ModelListParams.js';
import type { ModelListResponse } from './protocol/v2/ModelListResponse.js';
import type { ConfigReadParams } from './protocol/v2/ConfigReadParams.js';
import type { ConfigReadResponse } from './protocol/v2/ConfigReadResponse.js';
import type { ThreadBackgroundTerminal } from './protocol/v2/ThreadBackgroundTerminal.js';

export const CODEX_PROTOCOL_VERSION = '0.161.0';

interface Methods {
  initialize: [InitializeParams, InitializeResponse];
  'thread/start': [ThreadStartParams, ThreadStartResponse];
  'thread/resume': [ThreadResumeParams, ThreadResumeResponse];
  'turn/start': [TurnStartParams, TurnStartResponse];
  'turn/steer': [TurnSteerParams, TurnSteerResponse];
  'turn/interrupt': [TurnInterruptParams, TurnInterruptResponse];
  'thread/settings/update': [ThreadSettingsUpdateParams, ThreadSettingsUpdateResponse];
  'thread/backgroundTerminals/list': [ThreadBackgroundTerminalsListParams, ThreadBackgroundTerminalsListResponse];
  'thread/backgroundTerminals/terminate': [ThreadBackgroundTerminalsTerminateParams, ThreadBackgroundTerminalsTerminateResponse];
  'model/list': [ModelListParams, ModelListResponse];
  'config/read': [ConfigReadParams, ConfigReadResponse];
}

/** All outbound operations are checked against CLI-generated 0.161.0 types. */
export class CodexConnection {
  readonly peer: JsonRpcPeer;
  serverVersion: string | undefined;

  constructor(readonly runtime: RuntimeHandle, timeoutMs: number, onProtocolError?: (message: string) => void) {
    this.peer = new JsonRpcPeer(runtime.lineTransport(), {
      defaultTimeoutMs: timeoutMs,
      onProtocolError: (error) => onProtocolError?.(error.message),
    });
  }

  request<M extends keyof Methods>(method: M, params: Methods[M][0], signal?: AbortSignal): Promise<Methods[M][1]> {
    return this.peer.request<Methods[M][1]>(method, params, { signal });
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    const response = await this.request('initialize', {
      clientInfo: { name: 'ai_developer_studio', title: 'AI Developer Studio', version: '0.1.0' },
      capabilities: { experimentalApi: true, requestAttestation: false },
    }, signal);
    this.serverVersion = typeof response?.userAgent === 'string' ? /^[^/\s]+\/([\d.]+)/.exec(response.userAgent)?.[1] : undefined;
    this.peer.notify('initialized');
  }

  async models(signal?: AbortSignal): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    await this.pages(async (cursor) => {
      const page = await this.request('model/list', { cursor, limit: 100, includeHidden: false }, signal);
      if (!Array.isArray(page?.data)) throw adapterError('protocol_error', 'Malformed model/list response');
      for (const model of page.data) {
        if (typeof model.model !== 'string' || typeof model.displayName !== 'string') {
          throw adapterError('protocol_error', 'Malformed model entry');
        }
        models.push({ id: model.model, displayName: model.displayName, description: model.description,
          isDefault: model.isDefault, hidden: model.hidden,
          reasoningEfforts: model.supportedReasoningEfforts?.map((entry) => entry.reasoningEffort) ?? [] });
      }
      return page.nextCursor;
    });
    return models;
  }

  async terminals(threadId: string, signal?: AbortSignal): Promise<ThreadBackgroundTerminal[]> {
    const terminals: ThreadBackgroundTerminal[] = [];
    await this.pages(async (cursor) => {
      const page = await this.request('thread/backgroundTerminals/list', { threadId, cursor, limit: 100 }, signal);
      if (!Array.isArray(page?.data)) throw adapterError('protocol_error', 'Malformed terminal list');
      for (const terminal of page.data) {
        if (typeof terminal.itemId !== 'string' || typeof terminal.processId !== 'string' ||
            (terminal.osPid !== null && (!Number.isInteger(terminal.osPid) || terminal.osPid <= 0))) {
          throw adapterError('protocol_error', 'Malformed background terminal');
        }
        terminals.push(terminal);
      }
      return page.nextCursor;
    });
    return terminals;
  }

  private async pages(read: (cursor: string | undefined) => Promise<string | null>): Promise<void> {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const next = await read(cursor);
      if (next === null || next === undefined) return;
      if (typeof next !== 'string' || seen.has(next)) throw adapterError('protocol_error', 'Invalid pagination cursor');
      seen.add(next);
      cursor = next;
    }
    throw adapterError('protocol_error', 'Pagination exceeded 100 pages');
  }
}
