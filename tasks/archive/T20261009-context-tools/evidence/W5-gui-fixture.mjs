import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
const { _electron } = require('@playwright/test')
const appDir = fileURLToPath(new URL('../../../../apps/desktop/', import.meta.url))
const root = process.env.W5_GUI_ROOT || mkdtempSync(join(tmpdir(), 'studio-w5-runtime-'))
const projects = ['W5 Project One', 'W5 Project Two'].map(name => join(root, name))
projects.forEach(path => { if (!existsSync(path)) mkdirSync(path) })
let visit = 0
const server = createServer((request, response) => {
  if (request.url === '/redirect') { response.writeHead(302, { location: 'https://example.com/w5-redirect' }); response.end(); return }
  const count = ++visit
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(`<!doctype html><html><head><title>W5 Local Preview</title><style>body{font:18px system-ui;padding:24px;background:#eef4f1;color:#183b2d}button,a{display:block;margin:16px 0}pre{white-space:pre-wrap}</style></head><body><h1>W5 Local Preview</h1><p>Path: ${request.url}</p><p>Load: ${count}</p><pre id="probe"></pre><p id="marker"></p><button onclick="localStorage.setItem('marker','PROJECT-ONE');location.reload()">Set Project Marker</button><button onclick="location.reload()">Reload This Page</button><a href="/next">Local Next Page</a><a href="/redirect">External Redirect</a><a href="https://example.com/w5-external">External Link</a><button onclick="window.open('https://example.com/w5-window')">External New Window</button><script>document.querySelector('#probe').textContent=JSON.stringify({node:typeof require,process:typeof process,studio:typeof window.studio});document.querySelector('#marker').textContent='Marker: '+(localStorage.getItem('marker')||'EMPTY');</script></body></html>`)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const port = server.address().port
const app = await _electron.launch({
  args: [appDir, '--studio-user-data-dir=' + join(root, 'user-data'), '--remote-debugging-port=9385'],
  env: { ...process.env, STUDIO_E2E_PROVIDERS: '1' }
})
// Only the directory chooser is stubbed. Runtime actions are performed through agent-browser UI.
await app.evaluate(({ dialog }, paths) => {
  let index = 0
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths[Math.min(index++, paths.length - 1)]] })
}, projects)
console.log(JSON.stringify({ root, projects, url: 'http://127.0.0.1:' + port + '/', cdpPort: 9385, pid: app.process().pid }))
app.on('close', () => { server.close(); process.exit(0) })
process.stdin.resume()
