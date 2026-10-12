import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '@shared/ipc/contracts'
import { appearanceOf, type AppearanceState, type ColorMode, type GlassColor, type ThemePreference } from '@shared/ipc/settings'
import { SettingsDialog } from './SettingsDialog'
import { installSettingsIntegration, SettingsEntry } from './integration'
import { useSettings } from './store'
import { shellIntegration } from '../project/integration'

const initial = useSettings.getState()
let state: AppearanceState
let changed: ((state: AppearanceState) => void) | null, openRequested: (() => void) | null
let setTheme: ReturnType<typeof vi.fn>, setGlassColor: ReturnType<typeof vi.fn>, setMode: ReturnType<typeof vi.fn>
beforeEach(() => {
  useSettings.setState(initial, true)
  for (const key of ['theme', 'scheme', 'glassColor']) delete document.documentElement.dataset[key]
  state = appearanceOf(); changed = null; openRequested = null
  const next = (change: Partial<AppearanceState>) => (state = appearanceOf({ ...state, ...change }, { ...state, ...change }))
  setTheme = vi.fn(async ({ theme }: { theme: ThemePreference }) => next({ theme }))
  setGlassColor = vi.fn(async ({ color }: { color: GlassColor }) => next({ glassColor: color }))
  setMode = vi.fn(async ({ mode }: { mode: ColorMode }) => next({ mode, dark: mode === 'dark' }))
  Object.defineProperty(window, 'studio', { configurable: true, value: { settings: {
    getAppearance: async () => state, setTheme, setGlassColor, setMode,
    onAppearanceChanged: (cb: typeof changed) => { changed = cb; return () => { changed = null } },
    onOpenRequested: (cb: typeof openRequested) => { openRequested = cb; return () => { openRequested = null } }
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
  it('applies the saved appearance to <html> before the first render and follows main-process changes', async () => {
    state = appearanceOf({ theme: 'solid', glassColor: 'mint', mode: 'dark' }, { dark: true })
    const integration = installSettingsIntegration()
    await integration.ready
    expect({ ...document.documentElement.dataset }).toEqual({ theme: 'solid', scheme: 'dark', glassColor: 'mint' })
    expect(shellIntegration().NavigationFooter).toBe(SettingsEntry)
    act(() => changed!(appearanceOf({}, { reducedTransparency: true })))
    expect({ ...document.documentElement.dataset }).toEqual({ theme: 'solid', scheme: 'light', glassColor: 'aurora' })
    expect(useSettings.getState().appearance).toEqual({ theme: 'glass', glassColor: 'aurora', mode: 'system', reducedTransparency: true, dark: false, effective: 'solid' })
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

  it('shows the Appearance category with mode and theme radio groups; the current mode is checked and focused', async () => {
    await openDialog()
    expect(screen.getByRole('dialog', { name: '设置' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '外观', current: 'page' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: '主题' })).toBeTruthy()
    expect(radio('毛玻璃').getAttribute('aria-checked')).toBe('true')
    expect(radio('毛玻璃').textContent).toContain('默认')
    expect(radio('纯色').getAttribute('aria-checked')).toBe('false')
    expect(radio('纯色').tabIndex).toBe(-1)
    const modes = screen.getByRole('radiogroup', { name: '模式' })
    expect([...modes.querySelectorAll('[role=radio]')].map((el) => [el.textContent, el.getAttribute('aria-checked')])).toEqual([['跟随系统', 'true'], ['浅色', 'false'], ['深色', 'false']])
    expect(document.activeElement).toBe(radio('跟随系统'))
  })

  it('a click applies the theme at once and keeps the dialog open', async () => {
    await openDialog()
    await act(async () => { fireEvent.click(radio('纯色')) })
    expect(setTheme).toHaveBeenCalledWith({ theme: 'solid' })
    expect(document.documentElement.dataset.theme).toBe('solid')
    expect(radio('纯色').getAttribute('aria-checked')).toBe('true')
    expect(useSettings.getState().dialogOpen).toBe(true)
    await act(async () => { fireEvent.click(radio('纯色')) })
    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('arrow keys move and select within the radio group', async () => {
    await openDialog()
    await act(async () => { fireEvent.keyDown(radio('毛玻璃'), { key: 'ArrowRight' }) })
    expect(setTheme).toHaveBeenLastCalledWith({ theme: 'solid' })
    expect(document.activeElement).toBe(radio('纯色'))
    await act(async () => { fireEvent.keyDown(radio('纯色'), { key: 'ArrowRight' }) })
    expect(setTheme).toHaveBeenLastCalledWith({ theme: 'glass' })
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
    // Order: close, category, checked mode, checked theme, checked glass colour (one tab stop per radio group).
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '极光' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it('explains "Reduce transparency" only for a glass choice, and reports a failed save', async () => {
    useSettings.setState({ appearance: appearanceOf({}, { reducedTransparency: true }) })
    await openDialog()
    expect(screen.getByRole('status').textContent).toContain('降低透明度')
    setTheme.mockRejectedValueOnce(new Error('disk full'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => { fireEvent.click(radio('纯色')) })
    expect(screen.getByRole('alert').textContent).toBe('未能保存外观设置。')
    expect(radio('毛玻璃').getAttribute('aria-checked')).toBe('true')
    await act(async () => { fireEvent.click(radio('纯色')) })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('offers glass background colours only for the glass theme; a click applies one at once (SET-Q5)', async () => {
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
    await act(async () => { fireEvent.click(radio('纯色')) })
    expect(screen.queryByRole('radiogroup', { name: '毛玻璃背景' })).toBeNull()
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
