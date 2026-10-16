// W19 阶段 1 界面验收 fixture（参考 W5-gui-fixture-lifecycle.mjs，不修改旧文件）。
// 注入范围只有：目录选择器 stub（按顺序返回由控制端口登记的目录）、STUDIO_E2E_PROVIDERS=1 的模拟 Session Provider、
// 隔离的 --studio-user-data-dir，以及 os.tmpdir() 下的 fixture Project。所有 Files / Diff / Session 操作都由 agent-browser 经真实界面完成。
// 只监听 127.0.0.1 的控制端口，只做下列事情：
//   POST /next-folder?path=<abs>  登记下一次「打开本地目录」返回的目录（必须位于 ROOT 之下；就是目录选择器 stub）
//   POST /window-size?w=&h=       BrowserWindow.setContentSize（原生窗口缩放；与 e2e 的 setContentSize(1280,800) 相同）
//   POST /window-close            win.close()：触发应用自己的 close 处理（隐藏窗口，会话继续）
//   POST /window-show             app.emit('activate')，走应用自己的 activate 处理把窗口重新显示（等同点击 Dock 图标）
//   POST /app-quit                主进程 app.quit()（与 e2e 相同）
//   POST /observe-on              只读观察：在主进程给 fs.opendir / readdir / open / lstat（含 promises 版本）与 child_process.spawn 加「记录后原样转发」的包装，
//                                 只记录 ROOT/projects 之下的路径与 git 的参数，不改变任何返回值；GET /obs-log[?clear=1] 取出记录
//   GET  /info、/webcontents      只读
// Electron 主进程 stdout/stderr 另存为 <ROOT>/electron.log。应用退出后本进程退出。
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, createWriteStream, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const { _electron } = require('@playwright/test')
const appDir = fileURLToPath(new URL('../../../apps/desktop/', import.meta.url))
const root = process.env.W19_ROOT ? resolve(process.env.W19_ROOT) : realpathSync(mkdtempSync(join(tmpdir(), 'studio-w19-')))
const cdpPort = Number(process.env.W19_CDP_PORT || 9537)
const controlPort = Number(process.env.W19_CONTROL_PORT || 9538)
mkdirSync(root, { recursive: true })
mkdirSync(join(root, 'projects'), { recursive: true })
const queue = []
const extraArgs = (process.env.W19_APP_ARGS || '').split(' ').filter(Boolean)
const packagedApp = process.env.W19_PACKAGED_APP
const app = await _electron.launch({
  executablePath: packagedApp || undefined,
  args: [...(packagedApp ? [] : [appDir]), '--studio-user-data-dir=' + join(root, 'user-data'), '--remote-debugging-port=' + cdpPort, ...extraArgs],
  env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' }
})
// The only stub: the native directory chooser returns the next registered directory.
await app.evaluate(({ dialog }) => {
  globalThis.__w19Next = []
  dialog.showOpenDialog = async () => {
    const path = globalThis.__w19Next.shift()
    return path ? { canceled: false, filePaths: [path] } : { canceled: true, filePaths: [] }
  }
})
const window = await app.firstWindow()
await window.waitForLoadState('domcontentloaded')
const mediaSourceId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMediaSourceId())
const windowId = Number(mediaSourceId.split(':')[1])
const log = createWriteStream(join(root, 'electron.log'), { flags: 'a' })
app.process().stdout?.on('data', chunk => log.write('[stdout] ' + chunk))
app.process().stderr?.on('data', chunk => log.write('[stderr] ' + chunk))
let closed = false
const control = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const send = (code, body) => { response.writeHead(code, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)) }
  try {
    if (closed) return send(200, { closed: true })
    if (request.method === 'POST' && url.pathname === '/next-folder') {
      const path = resolve(url.searchParams.get('path') || '')
      if (!(path + sep).startsWith(root + sep)) return send(400, { error: 'outside ROOT' })
      await app.evaluate((_, p) => { globalThis.__w19Next.push(p) }, path)
      return send(200, { queued: path })
    }
    if (request.method === 'POST' && url.pathname === '/window-size') {
      const w = Number(url.searchParams.get('w')), h = Number(url.searchParams.get('h'))
      await app.evaluate(({ BrowserWindow }, [width, height]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(width, height); win.show() }, [w, h])
      return send(200, { w, h })
    }
    if (request.method === 'POST' && url.pathname === '/window-close') {
      await app.evaluate(({ BrowserWindow }) => { setImmediate(() => BrowserWindow.getAllWindows()[0].close()) })
      return send(200, { closeCalled: true })
    }
    if (request.method === 'POST' && url.pathname === '/window-show') {
      await app.evaluate(({ app: mainApp }) => { setImmediate(() => mainApp.emit('activate')) })
      return send(200, { activateEmitted: true })
    }
    if (request.method === 'POST' && url.pathname === '/app-quit') {
      await app.evaluate(({ app: mainApp }) => { setImmediate(() => mainApp.quit()) })
      return send(200, { quitCalled: true })
    }
    if (request.method === 'POST' && url.pathname === '/observe-on') {
      await app.evaluate((_, projectsRoot) => {
        if (globalThis.__w19Obs) return
        const fs = process.mainModule ? process.mainModule.require('node:fs') : require('node:fs')
        const cp = process.mainModule ? process.mainModule.require('node:child_process') : require('node:child_process')
        const log = globalThis.__w19Obs = []
        const note = (kind, target) => { const path = String(target); if (path.startsWith(projectsRoot)) log.push({ t: Date.now(), kind, path: path.slice(projectsRoot.length) }) }
        for (const name of ['opendir', 'readdir', 'open', 'lstat', 'stat', 'readlink']) {
          const sync = fs[name], promised = fs.promises[name]
          if (sync) fs[name] = function (...args) { note(name, args[0]); return sync.apply(this, args) }
          if (promised) fs.promises[name] = function (...args) { note('p.' + name, args[0]); return promised.apply(this, args) }
        }
        const spawn = cp.spawn
        cp.spawn = function (command, args, options) { if (/git$/.test(String(command))) log.push({ t: Date.now(), kind: 'spawn', path: String(command), args: (args || []).slice(0, 40), cwd: options && String(options.cwd).slice(projectsRoot.length) }); return spawn.apply(this, arguments) }
      }, join(root, 'projects'))
      return send(200, { observing: true })
    }
    if (url.pathname === '/obs-log') {
      const clear = url.searchParams.get('clear') === '1'
      return send(200, await app.evaluate((_, c) => { const l = globalThis.__w19Obs || []; const out = l.slice(); if (c) l.length = 0; return out }, clear))
    }
    if (url.pathname === '/info') {
      return send(200, await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), bounds: w.getContentBounds(), minimized: w.isMinimized() } }))
    }
    if (url.pathname === '/webcontents') {
      return send(200, await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(wc => ({ id: wc.id, type: wc.getType(), url: wc.getURL(), crashed: wc.isCrashed(), pid: wc.getOSProcessId() }))))
    }
    send(404, { error: 'not found' })
  } catch (error) { send(500, { error: String(error) }) }
})
await new Promise(done => control.listen(controlPort, '127.0.0.1', done))
const info = { root, cdpPort, controlPort, pid: app.process().pid, fixturePid: process.pid, mediaSourceId, windowId }
writeFileSync(join(root, 'fixture-info.json'), JSON.stringify(info, null, 2))
console.log(JSON.stringify(info))
app.on('close', () => { closed = true; writeFileSync(join(root, 'closed.json'), JSON.stringify({ closedAt: new Date().toISOString() })); control.close(); process.exit(0) })
process.on('SIGTERM', () => { app.close().catch(() => {}).finally(() => process.exit(0)) })
process.stdin.resume()
