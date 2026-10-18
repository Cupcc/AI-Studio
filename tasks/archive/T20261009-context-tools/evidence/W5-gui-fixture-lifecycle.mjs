// W5 Part 4 复验 fixture（复制自 W5-gui-fixture-theme.mjs，不改旧文件）。仅用于 Project 关闭 / 应用退出 / Session Stop 的真实 UI 验证。
// 注入范围：目录选择器 stub（依次返回 4 个临时 Project 目录）、本机回环 HTTP 页面、STUDIO_E2E_PROVIDERS=1 的模拟 Session Provider。
// 另有一个只监听 127.0.0.1 的「控制端口」，只提供：
//   POST /menu-quit   经主进程点击真实应用菜单里 role=quit 的菜单项（Menu.getApplicationMenu() → item.click()），不使用任何全局按键；
//   POST /app-quit    诊断用：主进程直接 app.quit()（与 e2e 用例的做法相同），用来区分「菜单项」与「app.quit()」两条路径；
//   GET  /menu        列出应用菜单（只读）；GET /webcontents 列出 webContents 类型与 URL（只读，用于确认预览视图是否释放）。
// Electron 主进程的 stdout / stderr 另存为 <root>/electron.log（只读观察）。
// 所有 Project / Terminal / Browser / Session 操作仍由 agent-browser 经真实 UI 完成。应用退出（'close' 事件）后写 closed.json 并退出本进程。
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
const { _electron } = require('@playwright/test')
const appDir = fileURLToPath(new URL('../../../../apps/desktop/', import.meta.url))
const root = process.env.W5_GUI_ROOT || mkdtempSync(join(tmpdir(), 'studio-w5-life-'))
const cdpPort = Number(process.env.W5_GUI_CDP_PORT || 9390)
const names = (process.env.W5_GUI_PROJECTS || 'W5 Alpha,W5 Bravo,W5 Charlie,W5 Delta').split(',')
mkdirSync(root, { recursive: true })
const projects = names.map(name => join(root, name))
projects.forEach(path => { if (!existsSync(path)) mkdirSync(path) })
let visit = 0
const preview = createServer((request, response) => {
  const count = ++visit
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(`<!doctype html><html><head><title>W5 Fixture Preview</title></head><body style="font:18px system-ui;padding:24px;background:#eef4f1;color:#183b2d"><h1>W5 FIXTURE PREVIEW</h1><p>Path: ${request.url}</p><p>Load: ${count}</p></body></html>`)
})
await new Promise(done => preview.listen(0, '127.0.0.1', done))
const previewUrl = 'http://127.0.0.1:' + preview.address().port + '/'
const app = await _electron.launch({
  args: [appDir, '--studio-user-data-dir=' + join(root, 'user-data'), '--remote-debugging-port=' + cdpPort],
  env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' }
})
await app.evaluate(({ dialog }, paths) => {
  let index = 0
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[Math.min(index++, paths.length - 1)]] })
}, projects)
const window = await app.firstWindow()
await window.waitForLoadState('domcontentloaded')
const mediaSourceId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMediaSourceId())
let closed = false
import { createWriteStream } from 'node:fs'
const electronLog = createWriteStream(join(root, 'electron.log'), { flags: 'a' })
app.process().stdout?.on('data', chunk => electronLog.write('[stdout] ' + chunk))
app.process().stderr?.on('data', chunk => electronLog.write('[stderr] ' + chunk))
const control = createServer(async (request, response) => {
  const send = (code, body) => { response.writeHead(code, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)) }
  try {
    if (closed) return send(200, { closed: true })
    if (request.method === 'POST' && request.url === '/menu-quit') {
      const result = await app.evaluate(({ Menu }) => {
        const find = items => { for (const item of items) { if (item.role === 'quit') return item; const inner = item.submenu && find(item.submenu.items); if (inner) return inner } return null }
        const item = find(Menu.getApplicationMenu().items)
        if (!item) return { clicked: false }
        setImmediate(() => item.click())   // 真实菜单项的 click：role=quit 执行 app.quit()，进入 before-quit / QuitFlow
        return { clicked: true, label: item.label, role: item.role }
      })
      return send(200, result)
    }
    if (request.method === 'POST' && request.url === '/app-quit') {
      await app.evaluate(({ app: mainApp }) => { setImmediate(() => mainApp.quit()) })
      return send(200, { quitCalled: true })
    }
    if (request.method === 'POST' && request.url === '/probe-quit-events') {
      // 只读观察：登记 before-quit / will-quit 监听（不 preventDefault），写入 Electron stdout（电子日志）
      await app.evaluate(({ app: mainApp }) => { for (const name of ['before-quit', 'will-quit', 'quit']) mainApp.on(name, () => console.log('[probe] ' + name + ' ' + new Date().toISOString())) })
      return send(200, { registered: true })
    }
    if (request.url === '/menu') {
      return send(200, await app.evaluate(({ Menu }) => { const walk = items => items.map(i => ({ label: i.label, role: i.role || null, type: i.type, sub: i.submenu ? walk(i.submenu.items) : undefined })); return walk(Menu.getApplicationMenu().items) }))
    }
    if (request.url === '/webcontents') {
      return send(200, await app.evaluate(({ webContents }) => webContents.getAllWebContents().map(wc => ({ id: wc.id, type: wc.getType(), url: wc.getURL(), crashed: wc.isCrashed() }))))
    }
    send(404, { error: 'not found' })
  } catch (error) { send(500, { error: String(error) }) }
})
await new Promise(done => control.listen(0, '127.0.0.1', done))
const info = { root, projects, previewUrl, cdpPort, controlUrl: 'http://127.0.0.1:' + control.address().port, pid: app.process().pid, fixturePid: process.pid, mediaSourceId, windowId: Number(mediaSourceId.split(':')[1]) }
writeFileSync(join(root, 'fixture-info.json'), JSON.stringify(info, null, 2))
console.log(JSON.stringify(info))
app.on('close', () => {
  closed = true
  writeFileSync(join(root, 'closed.json'), JSON.stringify({ closedAt: new Date().toISOString(), electronPid: info.pid }))
  console.log('APP-CLOSED ' + new Date().toISOString())
  setTimeout(() => { preview.close(); control.close(); process.exit(0) }, 300)
})
process.on('SIGTERM', () => { /* 不经应用退出流程：由调用者按精确 PID 清理 */ process.exit(0) })
process.stdin.resume()
