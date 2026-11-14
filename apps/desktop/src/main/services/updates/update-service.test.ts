import { describe, expect, it, vi } from 'vitest'
import { assetName } from './release'
import { CHECK_INTERVAL_MS, createUpdateService, FIRST_CHECK_DELAY_MS, UpdateError, type UpdateSystem } from './update-service'

const SHA = 'a'.repeat(64)
const release = (version: string, overrides: Record<string, unknown> = {}) => ({
  tag_name: `v${version}`, name: `AI Developer Studio ${version}`, body: 'notes', html_url: `https://github.com/Tiancheng-ai/AI-Studio/releases/tag/v${version}`,
  assets: [{ name: assetName(version, 'arm64'), size: 10, digest: `sha256:${SHA}`, browser_download_url: 'https://example.test/app.zip' }],
  ...overrides
})

function fakeSystem(overrides: Partial<UpdateSystem> = {}) {
  const timers: { callback: () => void; ms: number }[] = []
  let automatic = true
  const system: UpdateSystem = {
    currentVersion: '1.1.0',
    arch: 'arm64',
    blocked: () => null,
    fetchLatest: vi.fn(async () => release('1.2.0')),
    download: vi.fn(async (_asset, onProgress) => { onProgress(5, 10); onProgress(10, 10); return { file: '/tmp/app.zip', sha256: SHA } }),
    stage: vi.fn(async () => '/tmp/staged/AI Developer Studio.app'),
    clean: vi.fn(async () => {}),
    takeInstallFailure: vi.fn(async () => null),
    install: vi.fn(),
    quit: vi.fn(),
    readAutomatic: () => automatic,
    writeAutomatic: vi.fn((enabled: boolean) => { automatic = enabled }),
    now: () => 1000,
    setTimeout: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer },
    clearTimeout: (handle) => { const index = timers.indexOf(handle as never); if (index >= 0) timers.splice(index, 1) },
    ...overrides
  }
  return { system, timers }
}

describe('update service', () => {
  it('downloads, verifies and stages a newer release, then installs it when the app quits', async () => {
    const { system } = fakeSystem()
    const service = createUpdateService(system)
    const phases: string[] = []
    service.subscribe(state => phases.push(state.phase))
    const state = await service.check()
    expect(state).toMatchObject({ phase: 'ready', release: { version: '1.2.0', notes: 'notes' }, error: null, checkedAt: 1000 })
    expect(phases).toEqual(expect.arrayContaining(['checking', 'available', 'downloading', 'ready']))
    expect(system.stage).toHaveBeenCalledWith('/tmp/app.zip', '1.2.0')
    service.applyOnQuit()
    expect(system.install).toHaveBeenCalledWith('/tmp/staged/AI Developer Studio.app', '1.2.0', false)
    service.applyOnQuit()
    expect(system.install).toHaveBeenCalledTimes(1)
  })

  it('restarts through the normal quit and relaunches after installing', async () => {
    const { system } = fakeSystem()
    const service = createUpdateService(system)
    expect(() => service.restartToUpdate()).toThrow(UpdateError)
    await service.check()
    service.restartToUpdate()
    expect(system.quit).toHaveBeenCalled()
    service.applyOnQuit()
    expect(system.install).toHaveBeenCalledWith(expect.any(String), '1.2.0', true)
  })

  it('does not relaunch on a later ordinary quit after the restart was cancelled', async () => {
    const { system } = fakeSystem()
    const service = createUpdateService(system)
    await service.check()
    service.restartToUpdate()
    service.cancelRestart()
    service.applyOnQuit()
    expect(system.install).toHaveBeenCalledWith(expect.any(String), '1.2.0', false)
  })

  it('reports the current version as up to date and installs nothing', async () => {
    const { system } = fakeSystem({ fetchLatest: async () => release('1.1.0') })
    const service = createUpdateService(system)
    expect(await service.check()).toMatchObject({ phase: 'current', release: null })
    expect(system.download).not.toHaveBeenCalled()
    service.applyOnQuit()
    expect(system.install).not.toHaveBeenCalled()
  })

  it('rejects a download whose checksum differs and keeps the release to download by hand', async () => {
    const { system } = fakeSystem({ download: async () => ({ file: '/tmp/app.zip', sha256: 'b'.repeat(64) }) })
    const state = await createUpdateService(system).check()
    expect(state).toMatchObject({ phase: 'error', release: { version: '1.2.0' } })
    expect(state.error).toContain('校验不一致')
    expect(system.stage).not.toHaveBeenCalled()
  })

  it('only offers the release page when this copy cannot replace itself or the release has no usable asset', async () => {
    const blocked = fakeSystem({ blocked: () => '开发版本不会自行安装更新' })
    expect(await createUpdateService(blocked.system).check()).toMatchObject({ phase: 'available', blocked: '开发版本不会自行安装更新' })
    expect(blocked.system.download).not.toHaveBeenCalled()

    const noChecksum = fakeSystem({ fetchLatest: async () => release('1.2.0', { body: '', assets: [{ ...release('1.2.0').assets[0], digest: null }] }) })
    const state = await createUpdateService(noChecksum.system).check()
    expect(state.phase).toBe('available')
    expect(state.blocked).toContain('校验值')
  })

  it('shows network failures in the user’s words', async () => {
    const { system } = fakeSystem({ fetchLatest: async () => { throw new UpdateError('无法连接 GitHub') } })
    expect(await createUpdateService(system).check()).toMatchObject({ phase: 'error', error: '无法连接 GitHub', release: null })
  })

  it('checks automatically after start and then periodically, but downloads only while automatic updates are on', async () => {
    const { system, timers } = fakeSystem()
    const service = createUpdateService(system)
    await service.start()
    expect(system.clean).toHaveBeenCalled()
    expect(timers.map(timer => timer.ms)).toEqual([FIRST_CHECK_DELAY_MS])
    service.setAutomatic(false)
    expect(timers).toEqual([])
    expect(system.writeAutomatic).toHaveBeenCalledWith(false)
    service.setAutomatic(true)
    timers.shift()!.callback()
    await vi.waitFor(() => expect(service.state().phase).toBe('ready'))
    expect(timers.map(timer => timer.ms)).toEqual([CHECK_INTERVAL_MS])
  })

  it('does not schedule checks in development builds', async () => {
    const { system, timers } = fakeSystem()
    await createUpdateService(system).start({ automaticChecks: false })
    expect(timers).toEqual([])
  })

  it('reports an installer failure left by the previous run', async () => {
    const { system } = fakeSystem({ takeInstallFailure: async () => '无法移动当前版本' })
    const service = createUpdateService(system)
    await service.start()
    expect(service.state()).toMatchObject({ phase: 'error', error: '上次更新没有安装成功：无法移动当前版本' })
  })

  it('joins a check that is already running', async () => {
    let finish!: () => void
    const { system } = fakeSystem({ fetchLatest: vi.fn(() => new Promise(resolve => { finish = () => resolve(release('1.1.0')) })) })
    const service = createUpdateService(system)
    const first = service.check(), second = service.check()
    finish()
    await Promise.all([first, second])
    expect(system.fetchLatest).toHaveBeenCalledTimes(1)
  })
})
