import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppInfo } from '@shared/ipc/app'
import type { StudioApi } from '@shared/ipc/contracts'
import type { UpdateState } from '@shared/ipc/updates'
import { AboutPanel } from './AboutPanel'
import { updateBadge, useAbout, versionReport } from './store'

const info: AppInfo = {
  name: 'AI Developer Studio', version: '1.1.0', isPackaged: true, platform: 'darwin', arch: 'arm64',
  versions: { electron: '44.4.5', chrome: '152.0', node: '24.21.0' }, osVersion: '26.6',
  build: { commit: '1ac4775', date: '2026-11-14T03:00:00.000Z' }
}
const base: UpdateState = { phase: 'current', release: null, progress: null, error: null, checkedAt: Date.UTC(2026, 10, 14, 2), automatic: true, blocked: null }
const release = { version: '1.2.0', name: 'AI Developer Studio 1.2.0', notes: '## 1.2.0\n\n- 新功能', publishedAt: null, url: 'https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v1.2.0' }

function installFakeStudio(state: UpdateState) {
  let emit: ((state: UpdateState) => void) | null = null
  const updates = {
    getState: vi.fn(async () => state),
    check: vi.fn(async () => state),
    restartToUpdate: vi.fn(async () => state),
    setAutomatic: vi.fn(async ({ enabled }: { enabled: boolean }) => ({ ...state, automatic: enabled })),
    onStateChanged: (listener: (state: UpdateState) => void) => { emit = listener; return () => { emit = null } },
    onAboutRequested: () => () => {}
  }
  const api = { app: { getInfo: async () => info }, updates } as unknown as StudioApi
  Object.defineProperty(window, 'studio', { value: api, configurable: true })
  return { updates, emit: (next: UpdateState) => act(() => emit?.(next)) }
}

const initial = useAbout.getState()
beforeEach(() => useAbout.setState(initial, true))
afterEach(cleanup)

async function renderPanel(state: UpdateState) {
  const fake = installFakeStudio(state)
  const unwatch = useAbout.getState().watch(() => {})
  render(<AboutPanel />)
  await screen.findByTestId('app-version')
  return { ...fake, unwatch }
}

describe('AboutPanel', () => {
  it('shows the version, build, runtime details and links', async () => {
    await renderPanel(base)
    expect(screen.getByTestId('app-version').textContent).toBe('版本 1.1.0')
    expect(screen.getByText('1ac4775 · 2026-11-14')).toBeTruthy()
    expect(screen.getByTestId('app-info').textContent).toContain('macOS 26.6 · arm64')
    expect(screen.getByText('已是最新版本')).toBeTruthy()
    expect(screen.getByRole('link', { name: '本版本更新说明' }).getAttribute('href')).toBe('https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v1.1.0')
  })

  it('checks on request and follows download progress to the restart action', async () => {
    const { updates, emit } = await renderPanel(base)
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(updates.check).toHaveBeenCalled()
    emit({ ...base, phase: 'downloading', release, progress: { received: 52428800, total: 104857600 } })
    expect(screen.getByText('正在下载 1.2.0')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
    expect((screen.getByRole('button', { name: '检查更新' }) as HTMLButtonElement).disabled).toBe(true)
    emit({ ...base, phase: 'ready', release })
    fireEvent.click(screen.getByRole('button', { name: '重启并更新' }))
    expect(updates.restartToUpdate).toHaveBeenCalled()
    expect(screen.getByText('更新说明 · AI Developer Studio 1.2.0')).toBeTruthy()
  })

  it('offers the release page when this copy cannot install it', async () => {
    await renderPanel({ ...base, phase: 'available', release, blocked: '开发版本不会自行安装更新，可在 GitHub 下载新版本。' })
    expect(screen.getByText('发现新版本 1.2.0')).toBeTruthy()
    expect(screen.getByText('开发版本不会自行安装更新，可在 GitHub 下载新版本。')).toBeTruthy()
    expect(screen.getByRole('link', { name: '前往下载' }).getAttribute('href')).toBe(release.url)
  })

  it('shows errors with a retry and saves the automatic-update choice', async () => {
    const { updates } = await renderPanel({ ...base, phase: 'error', error: '无法连接 GitHub' })
    expect(screen.getByRole('alert').textContent).toBe('无法连接 GitHub')
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /自动检查并下载更新/ }))
    expect(updates.setAutomatic).toHaveBeenCalledWith({ enabled: false })
  })
})

describe('about helpers', () => {
  it('badges known newer releases only', () => {
    expect(updateBadge(base)).toBeNull()
    expect(updateBadge({ ...base, phase: 'available', release })).toBe('available')
    expect(updateBadge({ ...base, phase: 'ready', release })).toBe('ready')
    expect(updateBadge({ ...base, phase: 'error', error: 'x' })).toBeNull()
  })

  it('formats a version report for bug reports', () => {
    expect(versionReport(info)).toBe('AI Developer Studio 1.1.0\nBuild: 1ac4775 (2026-11-14T03:00:00.000Z)\nElectron 44.4.5 · Chromium 152.0 · Node.js 24.21.0\nmacOS 26.6 (arm64)')
  })
})
