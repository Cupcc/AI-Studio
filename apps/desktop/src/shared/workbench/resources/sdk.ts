export const PAGE_SDK = String.raw`(() => {
  'use strict';
  const channel = 'ai-studio-workbench-v1';
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0;
  let disposed = false;
  function send(method, params) {
    if (disposed) return Promise.reject(new Error('工作台页面已卸载'));
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('宿主响应超时，请刷新页面后重试')); }, 15000);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage({ channel, type: 'request', id, method, params }, '*');
    });
  }
  function receive(event) {
    if (event.source !== parent || !event.data || event.data.channel !== channel) return;
    const message = event.data;
    if (message.type === 'response') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.ok) request.resolve(message.result);
      else request.reject(new Error(message.error || '宿主操作失败'));
    }
    if (message.type === 'snapshot') for (const listener of listeners) {
      try { listener(message.snapshot); } catch (error) { report(error instanceof Error ? error.message : String(error)); }
    }
  }
  function report(message) { parent.postMessage({ channel, type: 'error', message }, '*'); }
  window.addEventListener('message', receive);
  window.addEventListener('error', event => {
    const target = event.target;
    const resource = target instanceof Element ? target.getAttribute('src') || target.getAttribute('href') : null;
    report(resource ? '页面资源加载失败：' + resource : event.message || '页面脚本执行失败');
  }, true);
  window.addEventListener('unhandledrejection', event => report(event.reason instanceof Error ? event.reason.message : String(event.reason)));
  window.addEventListener('pagehide', () => {
    disposed = true;
    window.removeEventListener('message', receive);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('工作台页面已卸载')); }
    pending.clear(); listeners.clear();
  }, { once: true });
  Object.defineProperty(window, 'workbench', { value: Object.freeze({
    getInstance: () => send('getInstance', {}),
    updateState: (state, expectedRevision) => send('updateState', { state, expectedRevision }),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    setDraft: (text, options) => send('setDraft', { text, target: options?.target ?? 'current' }),
    openSession: sessionId => send('openSession', { sessionId }),
    startAgent: request => send('startAgent', request),
    listAgents: () => send('listAgents', {}),
    getAgent: runId => send('getAgent', { runId }),
    stopAgent: runId => send('stopAgent', { runId })
  }), writable: false });
  const ready = () => parent.postMessage({ channel, type: 'ready' }, '*');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();`

export const SDK_TYPES = `type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type WorkbenchCapability = 'state.read' | 'state.write' | 'conversation.draft' | 'project.knowledge.read' | 'project.sessions.read' | 'session.open' | 'agent.execute'
interface ViewNode {
  type: 'stack' | 'grid' | 'section' | 'text' | 'metric' | 'badge' | 'list' | 'table' | 'timeline' | 'diagram' | 'callout' | 'empty'
  bind?: string
  props?: { title?: string; variant?: 'default' | 'muted' | 'accent'; direction?: 'horizontal' | 'vertical'; columns?: string[] }
  children?: ViewNode[]
}
interface WorkbenchKnowledgeResource {
  projectId: string
  viewId: string
  revision: number
  status: 'empty' | 'loading' | 'ready' | 'stale' | 'error'
  error: string | null
  snapshot: null | {
    projectId: string
    viewId: string
    catalog: { id: string; title: string; kind: 'builtin'; order: number }
    knowledge: null | { schemaVersion: 1; viewId: string; data: Record<string, JsonValue>; example?: boolean }
    definition: { schemaVersion: 1; viewId: string; root: ViewNode; bindings: Record<string, string> }
    revision: number
    updatedAt: number
  }
}
interface WorkbenchSessionLink {
  id: string
  title: string
  activity: 'none' | 'running' | 'needs_input'
  status: 'running' | 'needs_input' | 'error' | 'completed_unread' | null
  lastOutcome?: 'completed' | 'interrupted' | 'failed'
  updatedAt: number
  lastUserMessageAt: number
  createdAt: number
}
interface WorkbenchSnapshot {
  target: { projectId: string; kind: 'draft' | 'instance'; id: string }
  manifest: { schemaVersion: 1; pluginId: string; version: string; sdkVersion: 1; title: string; entry: string; capabilities: WorkbenchCapability[]; knowledgeViewId?: 'overview' | 'progress' | 'architecture' | 'agent-team' | 'business-flow' }
  packageRevision: string
  state: JsonValue
  stateRevision: number
  pageUrl: string
  resources?: { knowledge?: WorkbenchKnowledgeResource; sessions?: WorkbenchSessionLink[] }
  appearance?: { dark: boolean; variables: Record<string, string> }
}
interface WorkbenchAgentRequest { requestId: string; key: string; title: string; text: string; model: string | null }
interface WorkbenchAgentRun { request: WorkbenchAgentRequest; session: WorkbenchSessionLink & { stopping: boolean } }
interface WorkbenchAgentConversation {
  session: WorkbenchSessionLink & { stopping: boolean }
  items: ({ turnId: string | null; sequence: number; at: number } & ({ kind: 'agent_message'; text: string; complete: boolean } | { kind: 'error'; summary: string; details: string } | { kind: 'user_message' | 'tool_activity' | 'input_request' | 'turn_end' }))[]
  hasMore: boolean
}
interface WorkbenchPageApi {
  getInstance(): Promise<WorkbenchSnapshot>
  updateState(state: JsonValue, expectedRevision: number): Promise<WorkbenchSnapshot>
  subscribe(listener: (snapshot: WorkbenchSnapshot) => void): () => void
  setDraft(text: string, options?: { target: 'current' | 'new' }): Promise<void>
  openSession(sessionId: string): Promise<void>
  startAgent(request: WorkbenchAgentRequest): Promise<WorkbenchAgentRun>
  listAgents(): Promise<WorkbenchAgentRun[]>
  getAgent(runId: string): Promise<WorkbenchAgentConversation>
  stopAgent(runId: string): Promise<void>
}
interface Window { readonly workbench: WorkbenchPageApi }
`
