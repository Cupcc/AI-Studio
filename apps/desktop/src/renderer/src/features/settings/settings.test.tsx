import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import { appearanceOf, type AppearanceState, type ColorMode, type GlassColor } from '@shared/ipc/settings'
import { SettingsDialog } from './SettingsDialog'
import { installSettingsIntegration, SettingsEntry } from './integration'
import { useAbout } from '../app-info/store'
import { useSettings } from './store'
import { shellIntegration } from '../project/integration'
import { useSessions } from '../session/store'

const initial = useSettings.getState()
let state: AppearanceState
let changed: ((state: AppearanceState) => void) | null, openRequested: (() => void) | null
let setGlassColor: ReturnType<typeof vi.fn>, setMode: ReturnType<typeof vi.fn>
beforeEach(() => {
  useSettings.setState(initial, true)
  for (const key of ['theme', 'scheme', 'glassColor']) delete document.documentElement.dataset[key]
  state = appearanceOf(); changed = null; openRequested = null
  const next = (change: Partial<AppearanceState>) => (state = appearanceOf({ ...state, ...change }, { ...state, ...change }))
  setGlassColor = vi.fn(async ({ color }: { color: GlassColor }) => next({ glassColor: color }))
  setMode = vi.fn(async ({ mode }: { mode: ColorMode }) => next({ mode, dark: mode === 'dark' }))
  Object.defineProperty(window, 'studio', { configurable: true, value: { settings: {
    getAppearance: async () => state, setGlassColor, setMode,
    onAppearanceChanged: (cb: typeof changed) => { changed = cb; return () => { changed = null } },
    onOpenRequested: (cb: typeof openRequested) => { openRequested = cb; return () => { openRequested = null } }
  }, app: { getInfo: async () => { throw new Error('not needed') } }, updates: {
    getState: async () => null, onStateChanged: () => () => {}, onAboutRequested: () => () => {}
  } } as unknown as StudioApi })
})
afterEach(() => { cleanup() })

const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) })
function Harness() {
  const open = useSettings((s) => s.dialogOpen)
  return <><button>before</button>{open && <SettingsDialog />}</>
}
/** Focuses a trigger, then opens the dialog the way the entry, menu or ⌘, does. */
async function openDialog() {
  render(<Harness />)
  screen.getByRole('button', { name: 'before' }).focus()
  await act(async () => { useSettings.getState().openDialog() })
}

describe('settings · FR-SET-001 / FR-SET-002 · AC-08', () => {
  it('tests the unsaved form, saves URL and key without a model, and keeps the saved key masked in the form', async () => {
    const previous = useSessions.getState()
    const connection = { cli: 'codex', mode: 'local', profile: null, revision: 'local' }
    const saveCliConnection = vi.fn(async (request) => ({ ...connection, ...request, revision: 'saved', profile: { baseUrl: request.baseUrl, auth: request.auth, hasApiKey: true, ...(request.testModel ? { testModel: request.testModel } : {}) } }))
    const testCliConnection = vi.fn(async () => ({ ok: true, message: '连接测试通过。回复：Hi!', model: 'native-model', reply: 'Hi!', durationMs: 1200 }))
    Object.assign(window.studio, { session: {
      getProviders: async () => [{ cli: 'codex', displayName: 'Codex CLI', status: 'available', reason: null }],
      getGlobalDefaultCli: async () => 'codex', getCliConnections: async () => [connection], saveCliConnection, testCliConnection, getCliConnectionKey: async () => 'secret',
    } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, drafts: {} })
    try {
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      const configure = await screen.findByRole('button', { name: '配置' })
      await waitFor(() => expect(configure.hasAttribute('disabled')).toBe(false))
      fireEvent.click(configure)
      fireEvent.click(screen.getByRole('radio', { name: '自定义连接' }))
      expect(screen.queryByLabelText('模型')).toBeNull()
      expect(screen.queryByLabelText('认证方式')).toBeNull()
      fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://gateway.example/v1' } })
      fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret' } })
      expect(screen.getByLabelText<HTMLInputElement>('测试模型').placeholder).toBe('gpt-6.1-sol（默认）')
      fireEvent.click(screen.getByRole('button', { name: '测试连接' }))
      await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Hi!'))
      expect(testCliConnection).toHaveBeenCalledWith({ cli: 'codex', auth: 'api_key', baseUrl: 'https://gateway.example/v1', apiKey: 'secret' })
      expect(saveCliConnection).not.toHaveBeenCalled()
      expect(screen.getByRole('status').textContent).toContain('native-model')
      expect(screen.getByRole('status').textContent).toContain('1.2 s')
      expect(screen.getByRole('status').textContent).toContain('尚未保存')
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
      expect(screen.getByRole('button', { name: '返回 CLI 列表' }).hasAttribute('disabled')).toBe(true)
      expect(screen.getByRole('button', { name: '取消' }).hasAttribute('disabled')).toBe(true)
      await waitFor(() => expect(saveCliConnection).toHaveBeenCalledWith({ cli: 'codex', mode: 'app', auth: 'api_key', baseUrl: 'https://gateway.example/v1', apiKey: 'secret' }))
      await waitFor(() => expect(screen.getByText('已安全保存')).toBeTruthy())
      const key = screen.getByLabelText<HTMLInputElement>('API Key')
      expect([key.value, key.type]).toEqual(['secret', 'password'])
      fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }))
      expect(key.type).toBe('text')
      fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://other.example/v1' } })
      expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false)
      expect(screen.getByRole('button', { name: '测试连接' }).hasAttribute('disabled')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: '返回 CLI 列表' }))
      fireEvent.click(screen.getByRole('button', { name: '配置' }))
      expect(screen.getByLabelText<HTMLInputElement>('Base URL').value).toBe('https://gateway.example/v1')
      await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('API Key').value).toBe('secret'))
      expect(screen.getByLabelText<HTMLInputElement>('API Key').type).toBe('password')
      fireEvent.change(screen.getByLabelText('测试模型'), { target: { value: ' gateway-model ' } })
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
      await waitFor(() => expect(saveCliConnection).toHaveBeenLastCalledWith({ cli: 'codex', mode: 'app', auth: 'api_key', baseUrl: 'https://gateway.example/v1', testModel: 'gateway-model' }))
      await waitFor(() => expect(screen.getByText('已保存')).toBeTruthy())
      expect(screen.getByLabelText<HTMLInputElement>('测试模型').value).toBe('gateway-model')
    } finally { useSessions.setState(previous, true) }
  })

  it('shows a rejected save without the IPC wrapper text', async () => {
    const previous = useSessions.getState()
    const connection = { cli: 'claude-code', mode: 'local', profile: null, revision: 'local' }
    const saveCliConnection = vi.fn(async () => { throw new Error("Error invoking remote method 'session:save-cli-connection': Error: Base URL 须以 http:// 或 https:// 开头。") })
    Object.assign(window.studio, { session: {
      getProviders: async () => [{ cli: 'claude-code', displayName: 'Claude Code', status: 'available', reason: null }],
      getGlobalDefaultCli: async () => 'claude-code', getCliConnections: async () => [connection], saveCliConnection, testCliConnection: vi.fn(),
    } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, drafts: {} })
    try {
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      const configure = await screen.findByRole('button', { name: '配置' })
      await waitFor(() => expect(configure.hasAttribute('disabled')).toBe(false))
      fireEvent.click(configure)
      fireEvent.click(screen.getByRole('radio', { name: '自定义连接' }))
      fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'ftp://example.com' } })
      fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'secret' } })
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Base URL 须以 http:// 或 https:// 开头。'))
    } finally { useSessions.setState(previous, true) }
  })

  it('loads the CLI category, saves one default for all Projects and retries detection', async () => {
    const previous = useSessions.getState()
    const provider = { cli: 'codex' as const, displayName: 'Codex CLI', status: 'available' as const, reason: null }
    const getProviders = vi.fn(async () => [provider])
    const setGlobalDefaultCli = vi.fn(async () => {})
    Object.assign(window.studio, { session: { getProviders, getGlobalDefaultCli: async () => 'codex', setGlobalDefaultCli } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, defaultCli: { p: null, p2: null }, drafts: {} })
    try {
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      const option = await screen.findByRole('radio', { name: /Codex CLI/ })
      await waitFor(() => expect(option.hasAttribute('disabled')).toBe(false))
      expect(screen.queryByText('已应用到所有 Project。')).toBeNull()
      expect(screen.queryByText('点击可用的 CLI 设为默认，所有项目共用。')).toBeNull()
      expect(screen.queryByText('未添加的 CLI 不检测，也不出现在新建对话中。')).toBeNull()
      expect(screen.queryByRole('heading', { name: '未添加' })).toBeNull()
      fireEvent.click(option)
      await waitFor(() => expect(option.getAttribute('aria-checked')).toBe('true'))
      expect(screen.queryByText('已应用到所有 Project。')).toBeNull()
      expect(setGlobalDefaultCli).toHaveBeenCalledWith({ cli: 'codex' })
      expect(useSessions.getState().defaultCli).toEqual({ p: 'codex', p2: 'codex' })
      fireEvent.click(screen.getByRole('button', { name: '重新检测' }))
      await waitFor(() => expect(getProviders).toHaveBeenCalledWith({ force: true }))
      await screen.findByRole('button', { name: '重新检测' })
    } finally { useSessions.setState(previous, true) }
  })

  it('reports a rejected CLI setting without changing the default or claiming success', async () => {
    const previous = useSessions.getState()
    Object.assign(window.studio, { session: {
      getProviders: async () => [{ cli: 'codex', displayName: 'Codex CLI', status: 'available' }],
      getGlobalDefaultCli: async () => null, setGlobalDefaultCli: async () => { throw new Error('disk full') }
    } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, defaultCli: { p: null }, drafts: {} })
    try {
      await openDialog()
      fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      const option = await screen.findByRole('radio', { name: /Codex CLI/ })
      await waitFor(() => expect(option.hasAttribute('disabled')).toBe(false))
      fireEvent.click(option)
      expect((await screen.findByRole('alert')).textContent).toContain('disk full')
      expect(useSessions.getState().defaultCli.p).toBe('codex') // The sole available CLI was already selected automatically.
      expect(screen.queryByText('已应用到所有 Project。')).toBeNull()
    } finally { useSessions.setState(previous, true) }
  })

  it('shows why a one-click install failed, keeps it after reopening, and clears it on the next attempt (T20261108 D-W2-2)', async () => {
    const previous = useSessions.getState()
    const failure = '安装命令失败（退出码 7）。请检查网络、代理及目录权限。'
    let installations: unknown[] = [{ cli: 'claude-code', status: 'error', message: failure }]
    let notify: ((state: unknown[]) => void) | null = null
    const installCli = vi.fn(async () => { notify?.(installations = [{ cli: 'claude-code', status: 'installing', phase: 'downloading' }]) })
    Object.assign(window.studio, { session: {
      getProviders: async () => [{ cli: 'claude-code', displayName: 'Claude Code', status: 'not_installed', reason: '未找到 claude' }],
      getGlobalDefaultCli: async () => null, getCliInstallations: async () => installations, installCli,
      onCliInstallationsChanged: (cb: typeof notify) => { notify = cb; return () => { notify = null } },
    } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, defaultCli: {}, drafts: {} })
    try {
      await openDialog(); fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      expect((await screen.findByRole('alert')).textContent).toBe(failure)
      fireEvent.click(screen.getByRole('button', { name: '一键安装' }))
      await screen.findByRole('button', { name: '正在安装…' })
      expect(screen.queryByRole('alert')).toBeNull()
      act(() => notify?.([{ cli: 'claude-code', status: 'error', message: failure }]))
      expect((await screen.findByRole('alert')).textContent).toBe(failure)
      expect(screen.getByRole('button', { name: '一键安装' })).toBeTruthy()
    } finally { useSessions.setState(previous, true) }
  })

  it('groups added and not-added CLI and supports removing all then adding and rechecking', async () => {
    const previous = useSessions.getState()
    let providers = [
      { cli: 'codex', displayName: 'Codex', status: 'available', reason: null },
      { cli: 'claude-code', displayName: 'Claude Code', status: 'not_logged_in', reason: '请登录' }
    ]
    const setCliEnabled = vi.fn(async ({ cli, enabled }: { cli: string; enabled: boolean }) => {
      providers = providers.map(item => item.cli === cli ? { ...item, status: enabled ? 'checking' : 'disabled' } : item)
      return providers
    })
    const getProviders = vi.fn(async () => providers)
    Object.assign(window.studio, { session: { getProviders, getGlobalDefaultCli: async () => 'codex', setCliEnabled } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, defaultCli: {}, drafts: {} })
    try {
      await openDialog(); fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      const codex = await screen.findByRole('button', { name: '移除 Codex' })
      await waitFor(() => expect(codex.hasAttribute('disabled')).toBe(false))
      expect(screen.getByRole('radio', { name: 'Codex' })).toBeTruthy()
      expect(screen.getByRole('radio', { name: 'Claude Code' }).hasAttribute('disabled')).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: '处理方法' }))
      expect(screen.getByText(/在终端完成 Claude Code 登录/)).toBeTruthy()
      fireEvent.click(codex)
      await screen.findByRole('button', { name: '添加 Codex' })
      fireEvent.click(screen.getByRole('button', { name: '移除 Claude Code' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '重新检测' }).hasAttribute('disabled')).toBe(true))
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(screen.getAllByRole('button', { name: /^添加 / }).map(item => item.getAttribute('aria-label'))).toEqual(['添加 Codex', '添加 Claude Code'])
      fireEvent.click(screen.getByRole('button', { name: '添加 Codex' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '重新检测' }).hasAttribute('disabled')).toBe(false))
      expect(screen.getByText('待检测')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: '重新检测' }))
      await waitFor(() => expect(getProviders).toHaveBeenCalledWith({ force: true }))
      await screen.findByRole('button', { name: '重新检测' })
    } finally { useSessions.setState(previous, true) }
  })

  it('retains the added CLI when removing it fails', async () => {
    const previous = useSessions.getState()
    Object.assign(window.studio, { session: { getProviders: async () => [{ cli: 'codex', displayName: 'Codex', status: 'available' }],
      getGlobalDefaultCli: async () => 'codex', setCliEnabled: async () => { throw new Error('disk full') } } })
    useSessions.setState({ providers: [], providersError: null, projects: {}, drafts: {} })
    try {
      await openDialog(); fireEvent.click(screen.getByRole('button', { name: 'CLI' }))
      const checkbox = await screen.findByRole('button', { name: '移除 Codex' })
      await waitFor(() => expect(checkbox.hasAttribute('disabled')).toBe(false))
      fireEvent.click(checkbox)
      expect((await screen.findByRole('alert')).textContent).toContain('disk full')
      expect(screen.getByRole('button', { name: '移除 Codex' })).toBe(checkbox)
    } finally { useSessions.setState(previous, true) }
  })

  it('applies the saved appearance to <html> before the first render and follows main-process changes', async () => {
    state = appearanceOf({ glassColor: 'mint', mode: 'dark' }, { dark: true })
    const integration = installSettingsIntegration()
    await integration.ready
    expect({ ...document.documentElement.dataset }).toEqual({ theme: 'glass', scheme: 'dark', glassColor: 'mint' })
    expect(shellIntegration().NavigationFooter).toBe(SettingsEntry)
    act(() => changed!(appearanceOf({}, { reducedTransparency: true })))
    expect({ ...document.documentElement.dataset }).toEqual({ theme: 'solid', scheme: 'light', glassColor: 'aurora' })
    expect(useSettings.getState().appearance).toEqual({ glassColor: 'aurora', mode: 'system', reducedTransparency: true, dark: false, effective: 'solid' })
    act(() => openRequested!())
    expect(useSettings.getState().dialogOpen).toBe(true)
    integration.dispose()
    expect(changed).toBeNull()
    expect(shellIntegration().NavigationFooter).toBeUndefined()
  })

  it('the navigation entry opens the dialog', () => {
    render(<SettingsEntry />)
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(useSettings.getState().dialogOpen).toBe(true)
  })

  it('badges the entry when an update is ready and then opens 关于 (FR-SET-003)', () => {
    const release = { version: '1.2.0', name: '1.2.0', notes: '', publishedAt: null, url: '' }
    useAbout.setState({ update: { phase: 'ready', release, progress: null, error: null, checkedAt: 1, automatic: true, blocked: null } })
    try {
      render(<SettingsEntry />)
      fireEvent.click(screen.getByRole('button', { name: '设置（可更新）' }))
      expect(useSettings.getState()).toMatchObject({ dialogOpen: true, category: 'about' })
    } finally { useAbout.setState({ update: null }) }
  })

  it('shows the Appearance category with mode and glass background radio groups, no theme choice; the current mode is checked and focused', async () => {
    await openDialog()
    expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '外观', current: 'page' })).toBeTruthy()
    expect(screen.getAllByRole('radiogroup').map((group) => group.getAttribute('aria-labelledby'))).toEqual(['settings-mode', 'settings-glass-color'])
    expect(screen.queryByRole('radiogroup', { name: '主题' })).toBeNull()
    expect(screen.queryByText('纯色')).toBeNull()
    expect(screen.queryByText('点选后立即生效。')).toBeNull()
    const modes = screen.getByRole('radiogroup', { name: '模式' })
    expect([...modes.querySelectorAll('[role=radio]')].map((el) => [el.textContent, el.getAttribute('aria-checked')])).toEqual([['跟随系统', 'true'], ['浅色', 'false'], ['深色', 'false']])
    expect(document.activeElement).toBe(radio('跟随系统'))
  })

  it('closes on Esc, the close button and a click outside, returning focus', async () => {
    for (const close of [
      () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }),
      () => fireEvent.click(screen.getByRole('button', { name: '关闭设置' })),
      () => fireEvent.mouseDown(document.querySelector('.modal-backdrop')!)
    ]) {
      cleanup(); useSettings.getState().closeDialog()
      await openDialog()
      act(close)
      expect(useSettings.getState().dialogOpen).toBe(false)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'before' }))
    }
  })

  it('a click inside the dialog does not close it, and Tab stays inside', async () => {
    await openDialog()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(useSettings.getState().dialogOpen).toBe(true)
    const close = screen.getByRole('button', { name: '关闭设置' })
    close.focus()
    // Order: close, category, checked mode, checked glass colour (one tab stop per radio group).
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '极光' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it('explains "Reduce transparency" while it shows solid, and reports a failed save', async () => {
    state = appearanceOf({}, { reducedTransparency: true })
    useSettings.setState({ appearance: state })
    await openDialog()
    expect(screen.getByRole('status').textContent).toBe('系统已开启“降低透明度”，当前显示为纯色外观。')
    setGlassColor.mockRejectedValueOnce(new Error('disk full'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => { fireEvent.click(radio('薄荷')) })
    expect(screen.getByRole('alert').textContent).toBe('未能保存外观设置。')
    expect(radio('极光').getAttribute('aria-checked')).toBe('true')
    await act(async () => { fireEvent.click(radio('薄荷')) })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    // The colour is kept for when transparency returns; the note stays while the system setting is on.
    expect(radio('薄荷').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('系统已开启“降低透明度”，当前显示为纯色外观。')
  })

  it('offers the glass background colours; a click applies one at once (SET-Q5)', async () => {
    await openDialog()
    const group = screen.getByRole('radiogroup', { name: '毛玻璃背景' })
    const swatch = (name: string) => screen.getByRole('radio', { name })
    expect(group.querySelectorAll('[role=radio]')).toHaveLength(5)
    expect(swatch('极光').getAttribute('aria-checked')).toBe('true')
    await act(async () => { fireEvent.click(swatch('薄荷')) })
    expect(setGlassColor).toHaveBeenCalledWith({ color: 'mint' })
    expect(document.documentElement.dataset.glassColor).toBe('mint')
    expect(swatch('薄荷').getAttribute('aria-checked')).toBe('true')
    await act(async () => { fireEvent.keyDown(swatch('薄荷'), { key: 'ArrowLeft' }) })
    expect(setGlassColor).toHaveBeenLastCalledWith({ color: 'aurora' })
    expect(document.activeElement).toBe(swatch('极光'))
  })

  it('the colour mode applies at once and sets the scheme on <html> (FR-SET-002, 2026-10-12)', async () => {
    await openDialog()
    await act(async () => { fireEvent.click(radio('深色')) })
    expect(setMode).toHaveBeenCalledWith({ mode: 'dark' })
    expect(document.documentElement.dataset.scheme).toBe('dark')
    expect(radio('深色').getAttribute('aria-checked')).toBe('true')
    await act(async () => { fireEvent.keyDown(radio('深色'), { key: 'ArrowRight' }) })
    expect(setMode).toHaveBeenLastCalledWith({ mode: 'system' })
    expect(document.activeElement).toBe(radio('跟随系统'))
    expect(document.documentElement.dataset.scheme).toBe('light')
  })
})
