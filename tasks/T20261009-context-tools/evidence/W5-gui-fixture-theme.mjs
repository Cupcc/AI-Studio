// W5 Part 1 复验 fixture：由 W5-gui-fixture.mjs 复制而来，不修改旧文件。
// 只注入三项：目录选择器 stub、本机 HTTP 页面、STUDIO_E2E_PROVIDERS=1 的模拟 Session Provider。
// 新增只读观察：打印 BrowserWindow 的 CGWindowID，供 `screencapture -x -o -l<id>` 只截取应用自身窗口。
// 所有 Project / Terminal / Browser / 设置操作由 agent-browser 经真实 UI 完成。
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const { _electron } = require('@playwright/test')
const appDir = fileURLToPath(new URL('../../../apps/desktop/', import.meta.url))
const root = process.env.W5_GUI_ROOT || mkdtempSync(join(tmpdir(), 'studio-w5-theme-'))
const cdpPort = Number(process.env.W5_GUI_CDP_PORT || 9386)
mkdirSync(root, { recursive: true })
const projects = ['W5 Project One', 'W5 Project Two'].map(name => join(root, name))
projects.forEach(path => { if (!existsSync(path)) mkdirSync(path) })
let visit = 0
const server = createServer((request, response) => {
  if (request.url === '/redirect') { response.writeHead(302, { location: 'https://example.com/w5-redirect' }); response.end(); return }
  if (request.url === '/bare') {
    // 刻意不设置任何 CSS：用来观察 Browser 视图自身的 viewport 底色（浅色应用外观下不应是黑色）。
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<!doctype html><html><head><title>W5 Bare Page</title></head><body><p>W5 bare page without any CSS</p></body></html>')
    return
  }
  const count = ++visit
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(`<!doctype html><html><head><title>W5 Local Preview</title><style>body{font:18px system-ui;padding:24px;background:#eef4f1;color:#183b2d}button,a{display:block;margin:16px 0}pre{white-space:pre-wrap}</style></head><body><h1>W5 Local Preview</h1><p>Path: ${request.url}</p><p>Load: ${count}</p><pre id="probe"></pre><p id="marker"></p><button onclick="localStorage.setItem('marker','PROJECT-ONE');location.reload()">Set Project Marker</button><button onclick="location.reload()">Reload This Page</button><a href="/next">Local Next Page</a><a href="/redirect">External Redirect</a><a href="https://example.com/w5-external">External Link</a><button onclick="window.open('https://example.com/w5-window')">External New Window</button><script>document.querySelector('#probe').textContent=JSON.stringify({node:typeof require,process:typeof process,studio:typeof window.studio});document.querySelector('#marker').textContent='Marker: '+(localStorage.getItem('marker')||'EMPTY');</script></body></html>`)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const port = server.address().port
const app = await _electron.launch({
  args: [appDir, '--studio-user-data-dir=' + join(root, 'user-data'), '--remote-debugging-port=' + cdpPort],
  env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' }
})
// Only the directory chooser is stubbed. Runtime actions are performed through agent-browser UI.
await app.evaluate(({ dialog }, paths) => {
  let index = 0
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[Math.min(index++, paths.length - 1)]] })
}, projects)
const window = await app.firstWindow()
await window.waitForLoadState('domcontentloaded')
const mediaSourceId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getMediaSourceId())
const windowId = Number(mediaSourceId.split(':')[1])
const info = { root, projects, url: 'http://127.0.0.1:' + port + '/', cdpPort, pid: app.process().pid, fixturePid: process.pid, mediaSourceId, windowId }
writeFileSync(join(root, 'fixture-info.json'), JSON.stringify(info, null, 2))
console.log(JSON.stringify(info))
app.on('close', () => { server.close(); process.exit(0) })
process.on('SIGTERM', () => { app.close().catch(() => {}).finally(() => process.exit(0)) })
process.stdin.resume()
