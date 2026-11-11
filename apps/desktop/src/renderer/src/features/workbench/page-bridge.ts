import { WORKBENCH_MESSAGE, type JsonValue, type WorkbenchPageSnapshot } from '@shared/workbench/types'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function json(value: unknown, depth = 0): value is JsonValue {
  if (depth > 50) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return Array.isArray(value) ? value.every(item => json(item, depth + 1))
    : record(value) && Object.values(value).every(item => json(item, depth + 1))
}

type PageRequest = { id: string } & (
  | { method: 'getInstance' }
  | { method: 'updateState'; state: JsonValue; expectedRevision: number }
  | { method: 'setDraft'; text: string; target: 'current' | 'new' }
  | { method: 'openSession'; sessionId: string }
)
function request(value: Record<string, unknown>): PageRequest {
  if (typeof value.id !== 'string' || !value.id || value.id.length > 200) throw new Error('无效页面请求编号')
  const id = value.id
  if (value.method === 'getInstance') return { id, method: 'getInstance' }
  if (!record(value.params)) throw new Error('页面请求缺少参数')
  if (value.method === 'setDraft' && typeof value.params.text === 'string' && value.params.text.length <= 100_000 && (value.params.target === undefined || value.params.target === 'current' || value.params.target === 'new')) return { id, method: 'setDraft', text: value.params.text, target: value.params.target ?? 'current' }
  if (value.method === 'openSession' && typeof value.params.sessionId === 'string' && value.params.sessionId.length > 0 && value.params.sessionId.length <= 200) return { id, method: 'openSession', sessionId: value.params.sessionId }
  if (value.method === 'updateState' && json(value.params.state) && typeof value.params.expectedRevision === 'number' && Number.isSafeInteger(value.params.expectedRevision) && value.params.expectedRevision >= 0) {
    return { id, method: 'updateState', state: value.params.state, expectedRevision: value.params.expectedRevision }
  }
  throw new Error('不支持的页面操作或参数')
}

export function attachWorkbenchPageBridge(options: {
  frame: Window
  snapshot(): WorkbenchPageSnapshot
  updateState(state: JsonValue, expectedRevision: number): Promise<WorkbenchPageSnapshot>
  setDraft(text: string, isActive: () => boolean, target: 'current' | 'new'): Promise<void>
  openSession(sessionId: string, isActive: () => boolean): Promise<void>
  ready(): void
  error(message: string): void
}): () => void {
  let active = true
  const reply = (data: object) => { if (active) options.frame.postMessage({ channel: WORKBENCH_MESSAGE, ...data }, '*') }
  const listener = (event: MessageEvent<unknown>) => {
    if (!active || event.source !== options.frame || !record(event.data) || event.data.channel !== WORKBENCH_MESSAGE) return
    const value = event.data
    if (value.type === 'ready') { options.ready(); return }
    if (value.type === 'error' && typeof value.message === 'string') { options.error(value.message.slice(0, 2000)); return }
    if (value.type !== 'request') return
    void (async () => {
      try {
        const req = request(value), snapshot = options.snapshot()
        if (!snapshot.enabled) throw new Error('工作台已停用')
        let result: unknown
        switch (req.method) {
          case 'getInstance':
            if (!snapshot.manifest.capabilities.includes('state.read')) throw new Error('此工作台未声明读取状态能力')
            result = snapshot; break
          case 'updateState':
            if (!snapshot.manifest.capabilities.includes('state.write')) throw new Error('此工作台未声明保存状态能力')
            result = await options.updateState(req.state, req.expectedRevision); break
          case 'setDraft':
            if (!snapshot.manifest.capabilities.includes('conversation.draft')) throw new Error('此工作台未声明填写对话草稿能力')
            result = await options.setDraft(req.text, () => active, req.target); break
          case 'openSession':
            if (!snapshot.manifest.capabilities.includes('session.open')) throw new Error('此工作台未声明打开对话能力')
            result = await options.openSession(req.sessionId, () => active); break
        }
        reply({ type: 'response', id: req.id, ok: true, result })
      } catch (error) {
        reply({ type: 'response', id: value.id, ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })()
  }
  window.addEventListener('message', listener)
  return () => { active = false; window.removeEventListener('message', listener) }
}
