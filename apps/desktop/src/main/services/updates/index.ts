// Main-process entry of the updates feature: wires the state machine to Electron's network stack (system proxy
// settings apply), the file system and the macOS tools that unpack and verify a bundle.
import { app, net } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { RELEASE_REPOSITORY } from '@shared/ipc/updates'
import type { CoreServices } from '../core'
import { getAppMeta, setAppMeta } from '../database/app-meta'
import { bundleOf, installBlock, relaunchArgs, startInstaller } from './installer'
import { createUpdateService, UpdateError, type UpdateService } from './update-service'

const run = promisify(execFile)
const AUTOMATIC_KEY = 'settings.updates.automatic'
const LATEST_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`

const services = new WeakMap<object, UpdateService>()

async function plistValue(app: string, key: string): Promise<string> {
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', join(app, 'Contents/Info.plist')])
  return stdout.trim()
}

export function updatesFor(core: Pick<CoreServices, 'database'>): UpdateService {
  let service = services.get(core)
  if (service) return service
  const userData = app.getPath('userData')
  const root = join(userData, 'updates')
  const statusFile = join(userData, 'update-status')
  service = createUpdateService({
    currentVersion: app.getVersion(),
    arch: process.arch,
    blocked: () => installBlock({ packaged: app.isPackaged, platform: process.platform, execPath: process.execPath }),
    async fetchLatest(signal) {
      let response: Response
      try {
        // Development builds may point at a local fixture feed (E2E); packaged builds always use GitHub.
        const feed = (!app.isPackaged && process.env.STUDIO_UPDATE_FEED_URL) || LATEST_URL
        response = await net.fetch(feed, { signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AI-Developer-Studio' } })
      } catch (error) {
        throw new UpdateError(`无法连接 GitHub，请检查网络后重试。（${error instanceof Error ? error.message : String(error)}）`)
      }
      if (response.status === 404) throw new UpdateError('GitHub 上没有找到已发布的版本。')
      if (response.status === 403 || response.status === 429) throw new UpdateError('GitHub 暂时限制了访问，请稍后再试。')
      if (!response.ok) throw new UpdateError(`检查更新失败：GitHub 返回 ${response.status}。`)
      return response.json()
    },
    async download(asset, onProgress, signal) {
      await mkdir(root, { recursive: true })
      const file = join(root, asset.name)
      let response: Response
      try {
        response = await net.fetch(asset.url, { signal })
      } catch (error) {
        throw new UpdateError(`下载新版本失败，请检查网络后重试。（${error instanceof Error ? error.message : String(error)}）`)
      }
      if (!response.ok || !response.body) throw new UpdateError(`下载新版本失败：服务器返回 ${response.status}。`)
      const total = Number(response.headers.get('content-length')) || asset.size
      const hash = createHash('sha256')
      let received = 0
      const measure = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk)
          received += chunk.byteLength
          onProgress(received, total)
          callback(null, chunk)
        }
      })
      // pipeline settles on any read or write error (a full disk), so a failed download never leaves the check hanging.
      try {
        await pipeline(Readable.fromWeb(response.body as never), measure, createWriteStream(file, { mode: 0o600 }), { signal })
      } catch (error) {
        if (signal.aborted) throw error
        throw new UpdateError(`下载新版本失败：${error instanceof Error ? error.message : String(error)}`)
      }
      return { file, sha256: hash.digest('hex') }
    },
    async stage(file, version) {
      const directory = join(root, `staged-${version}`)
      await rm(directory, { recursive: true, force: true })
      await mkdir(directory, { recursive: true })
      // ditto keeps the symlinks and permissions inside Electron's frameworks.
      try { await run('/usr/bin/ditto', ['-x', '-k', file, directory]) } catch { throw new UpdateError('安装包解压失败，已丢弃。请稍后重试。') }
      await rm(file, { force: true })
      const bundles = (await readdir(directory)).filter(name => name.endsWith('.app'))
      if (bundles.length !== 1) throw new UpdateError('安装包内容不正确，已丢弃。')
      const staged = join(directory, bundles[0]!)
      const current = bundleOf(process.execPath)
      const expectedId = current ? await plistValue(current, 'CFBundleIdentifier') : 'dev.aistudio.desktop'
      if (await plistValue(staged, 'CFBundleIdentifier').catch(() => '') !== expectedId) throw new UpdateError('安装包不是 AI Developer Studio，已丢弃。')
      if (await plistValue(staged, 'CFBundleShortVersionString').catch(() => '') !== version) throw new UpdateError('安装包的版本号与发布版本不一致，已丢弃。')
      try { await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged]) } catch { throw new UpdateError('安装包的代码签名校验失败，已丢弃。') }
      return staged
    },
    clean: () => rm(root, { recursive: true, force: true }),
    async takeInstallFailure() {
      const status = await readFile(statusFile, 'utf8').catch(() => null)
      if (status === null) return null
      await rm(statusFile, { force: true })
      return status.startsWith('failed ') ? status.slice(7).trim() : null
    },
    install(staged, version, relaunch) {
      const target = bundleOf(process.execPath)
      if (!target) return
      startInstaller({ directory: root, statusFile, pid: process.pid, target, staged, version, relaunch, args: relaunchArgs(process.argv) })
    },
    quit: () => app.quit(),
    readAutomatic: () => getAppMeta(core.database().db, AUTOMATIC_KEY) !== 'false',
    writeAutomatic: enabled => setAppMeta(core.database().db, AUTOMATIC_KEY, String(enabled)),
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout)
  })
  services.set(core, service)
  return service
}

export type { UpdateService } from './update-service'
