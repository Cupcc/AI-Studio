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
    setDraft: text => send('setDraft', { text })
  }), writable: false });
  const ready = () => parent.postMessage({ channel, type: 'ready' }, '*');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();`

export const SDK_TYPES = `type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
interface WorkbenchSnapshot {
  target: { projectId: string; kind: 'draft' | 'instance'; id: string }
  manifest: { schemaVersion: 1; pluginId: string; version: string; sdkVersion: 1; title: string; entry: string; capabilities: ('state.read' | 'state.write' | 'conversation.draft')[] }
  packageRevision: string
  state: JsonValue
  stateRevision: number
  pageUrl: string
  enabled: boolean
}
interface WorkbenchPageApi {
  getInstance(): Promise<WorkbenchSnapshot>
  updateState(state: JsonValue, expectedRevision: number): Promise<WorkbenchSnapshot>
  subscribe(listener: (snapshot: WorkbenchSnapshot) => void): () => void
  setDraft(text: string): Promise<void>
}
interface Window { readonly workbench: WorkbenchPageApi }
`
