import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_DEFINITIONS, catalogEntry } from '@shared/project-view/defaults'
import type { ViewState } from '@shared/project-view/types'
import type { WorkbenchPageSnapshot } from '@shared/workbench/types'

const asset = (name: string, file: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../../out/workbench-packages', name, file), 'utf8')
const frames: HTMLIFrameElement[] = []
afterEach(() => { for (const frame of frames.splice(0)) frame.remove(); vi.restoreAllMocks() })
const knowledge = (): ViewState => ({
  projectId: 'p', viewId: 'architecture', revision: 1, status: 'ready', error: null,
  snapshot: { projectId: 'p', viewId: 'architecture', catalog: catalogEntry('architecture'), revision: 1, updatedAt: 1,
    definition: DEFAULT_DEFINITIONS.get('architecture')!,
    knowledge: { schemaVersion: 1, viewId: 'architecture', data: {
      summary: '<img src=x onerror=alert(1)>', modules: [{ name: 'Payment', responsibility: 'Handle payment', path: 'src/payment.ts' }],
      graph: { nodes: [{ id: 'api', name: 'API' }, { id: 'db', name: 'Database' }], edges: [{ from: 'api', to: 'db' }] }
    } }
  }
})
const snapshot = (name = 'architecture'): WorkbenchPageSnapshot => ({
  target: { projectId: 'p', kind: 'instance', id: name }, manifest: JSON.parse(asset(name, 'manifest.json')),
  packageRevision: 'r1', state: {}, stateRevision: 0, pageUrl: 'app://workbench/page.html',
  resources: { knowledge: knowledge() }, appearance: { dark: false, variables: { '--color-text': '#123456' } }
})
async function boot(name: string, initial: WorkbenchPageSnapshot) {
  const frame = document.createElement('iframe'); frames.push(frame); document.body.append(frame)
  const doc = frame.contentDocument!, pageWindow = frame.contentWindow!
  doc.open(); doc.write(asset(name, 'index.html')); doc.close()
  let receive: (value: WorkbenchPageSnapshot) => void = () => {}
  const api = { getInstance: vi.fn(async () => initial), subscribe: vi.fn((listener: typeof receive) => { receive = listener; return () => {} }), setDraft: vi.fn(async () => {}), openSession: vi.fn(async () => {}) }
  Object.defineProperty(pageWindow, 'workbench', { configurable: true, value: api })
  new Function('window', 'document', asset(name, 'renderer.js'))(pageWindow, doc)
  new Function('window', 'document', asset(name, 'page.js'))(pageWindow, doc)
  await Promise.resolve()
  return { doc, api, receive: (value: WorkbenchPageSnapshot) => receive(value) }
}
it('executes generated self-contained assets with inert text, tables and SVG diagrams', async () => {
  const { doc } = await boot('architecture', snapshot())
  expect(doc.body.textContent).toContain('<img src=x onerror=alert(1)>')
  expect(doc.querySelector('img')).toBeNull()
  expect(doc.querySelector('td')?.textContent).toBe('Payment')
  expect(doc.querySelector('svg[aria-label="关系图"]')).toBeTruthy()
  expect(doc.documentElement.style.getPropertyValue('--color-text')).toBe('#123456')
  for (const name of ['overview', 'progress', 'architecture', 'agent-team', 'business-flow']) {
    expect(asset(name, 'index.html')).toContain('src="./page.js"')
    expect(asset(name, 'page.js')).toBe(asset('architecture', 'page.js'))
  }
})
it('keeps the last rendered document on render failure, latches the error and recovers', async () => {
  const initial = snapshot(), { doc, receive } = await boot('architecture', initial)
  const next = snapshot(); next.resources!.knowledge!.snapshot!.revision = 2
  vi.spyOn(doc, 'createElement').mockImplementationOnce(() => { throw new Error('fixture render failure') })
  receive(next)
  expect(doc.querySelector('[role="alert"]')?.textContent).toContain('工作台渲染失败')
  expect(doc.body.textContent).toContain('Payment')
  receive(next)
  expect(doc.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(false)
  const recovered = snapshot(); recovered.resources!.knowledge!.snapshot!.revision = 3
  receive(recovered)
  expect(doc.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true)
})
it('fills a new unsent conversation draft from an empty page and follows later Knowledge updates', async () => {
  const initial = snapshot(); initial.resources!.knowledge = { ...knowledge(), snapshot: null, status: 'empty' }
  const { doc, api, receive } = await boot('architecture', initial)
  const generate = Array.from(doc.querySelectorAll('button')).find(button => button.textContent === '生成 架构')!
  generate.click()
  expect(api.setDraft).toHaveBeenCalledWith(expect.stringContaining('生成 架构'), { target: 'new' })
  receive(snapshot())
  expect(doc.body.textContent).toContain('Payment')
  expect(doc.body.textContent).not.toContain('生成 架构')
})
it('renders a copied Overview package in a custom draft and uses the ordinary openSession SDK', async () => {
  const initial = snapshot('overview')
  initial.target = { projectId: 'p', kind: 'draft', id: 'copied-overview' }
  initial.resources!.sessions = [
    { id: 'older', title: 'Older', activity: 'none', status: null, lastOutcome: 'completed', updatedAt: 3, lastUserMessageAt: 1, createdAt: 1 },
    { id: 'waiting', title: 'Waiting', activity: 'needs_input', status: 'needs_input', updatedAt: 2, lastUserMessageAt: 2, createdAt: 2 }
  ]
  const { doc, api, receive } = await boot('overview', initial)
  const groups = doc.querySelector('[aria-label="项目 Session 摘要"]')!
  expect(groups.textContent).toContain('Recent Sessions')
  expect(groups.textContent).toContain('Needs Input')
  expect(groups.textContent).toContain('Recently Completed')
  const first = groups.querySelector('button')!; expect(first.textContent).toBe('Waiting'); first.click()
  expect(api.openSession).toHaveBeenCalledWith('waiting')
  receive({ ...initial, resources: { ...initial.resources, sessions: [] }, appearance: { dark: true, variables: {} } })
  expect(groups.querySelectorAll('button')).toHaveLength(0)
  expect(doc.documentElement.dataset.scheme).toBe('dark')
})
